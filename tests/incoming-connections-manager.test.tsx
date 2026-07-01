import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import yaml from 'yaml'

describe('Incoming Connections Manager in Focus Tab', () => {
  test('lists incoming connections, supports updating labels, and supports disconnecting them', async () => {
    render(<Workspace />)

    // 1. Switch to Metrics Tab to select digest_stage
    const metricsTabBtn = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabBtn)

    // 2. Select digest_stage component
    const digestBtn = screen.getByRole('button', { name: /digest_stage/i })
    fireEvent.click(digestBtn)

    // 3. Switch to Focus Tab
    const focusTabBtn = screen.getByRole('tab', { name: /Focus/i })
    fireEvent.click(focusTabBtn)

    // 4. Verify that "Incoming Connections" header is visible
    expect(screen.getByText('Incoming Connections')).toBeInTheDocument()

    // 5. Verify that inbound connection sources (inbox, b1_schema, b2_ledger) are listed
    const inboundSourceBtn = screen.getByTitle('Focus on inbox')
    expect(inboundSourceBtn).toBeInTheDocument()
    expect(screen.getByTitle('Focus on b1_schema')).toBeInTheDocument()
    expect(screen.getByTitle('Focus on b2_ledger')).toBeInTheDocument()

    // 6. Test Click-to-Focus: click inbound link to switch focus to inbox
    fireEvent.click(inboundSourceBtn)
    expect(screen.getByText('Selected Unit: inbox')).toBeInTheDocument()

    // Switch back to digest_stage
    fireEvent.click(metricsTabBtn)
    fireEvent.click(digestBtn)
    fireEvent.click(focusTabBtn)

    // 7. Verify that editing the incoming connection label updates the spec
    const labelInput = screen.getByTestId('focus-inbound-conn-label-input-inbox') as HTMLInputElement
    expect(labelInput).toBeInTheDocument()

    fireEvent.change(labelInput, { target: { value: 'reads raw data' } })

    // Wait for the debounced AST update
    await new Promise((resolve) => setTimeout(resolve, 250))

    // Verify label updated in spec textarea
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    expect(textarea.value).toContain('label: reads raw data')

    // 8. Click Disconnect button to remove the incoming connection from inbox to digest_stage
    const disconnectBtn = screen.getByTestId('disconnect-inbound-inbox')
    expect(disconnectBtn).toBeInTheDocument()

    fireEvent.click(disconnectBtn)

    // Wait for update
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Verify connection from inbox to digest_stage is removed from spec
    const parsed = yaml.parse(textarea.value)
    const inbox = parsed.system.components.find((c: any) => c.id === 'inbox')
    const hasDigestConnection = inbox?.connections?.some((conn: any) => {
      if (typeof conn === 'string') return conn === 'digest_stage'
      return conn && conn.target === 'digest_stage'
    })
    expect(hasDigestConnection || false).toBeFalsy()
  })

  test('supports adding a new incoming connection', async () => {
    render(<Workspace />)

    // 1. Switch to Metrics Tab and select kb_store
    const metricsTabBtn = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabBtn)

    const kbBtn = screen.getByRole('button', { name: /kb_store/i })
    fireEvent.click(kbBtn)

    // 2. Switch to Focus Tab
    const focusTabBtn = screen.getByRole('tab', { name: /Focus/i })
    fireEvent.click(focusTabBtn)

    // 3. Find incoming connection controls
    const targetSelect = screen.getByTestId('add-inbound-connection-select') as HTMLSelectElement
    const newLabelInput = screen.getByTestId('add-inbound-connection-label-input') as HTMLInputElement
    const addBtn = screen.getByTestId('add-inbound-connection-btn')

    expect(targetSelect).toBeInTheDocument()
    expect(newLabelInput).toBeInTheDocument()
    expect(addBtn).toBeInTheDocument()

    // 4. Select digest_stage as incoming source and input a label
    fireEvent.change(targetSelect, { target: { value: 'digest_stage' } })
    fireEvent.change(newLabelInput, { target: { value: 'archives' } })

    // 5. Click Add Incoming Connection
    fireEvent.click(addBtn)

    // Wait for update
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Verify connection added in spec from digest_stage targeting kb_store
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const parsed = yaml.parse(textarea.value)
    const digest = parsed.system.components.find((c: any) => c.id === 'digest_stage')
    const hasKbConnection = digest?.connections?.some((conn: any) => {
      return conn && conn.target === 'kb_store' && conn.label === 'archives'
    })
    expect(hasKbConnection).toBeTruthy()
  })
})
