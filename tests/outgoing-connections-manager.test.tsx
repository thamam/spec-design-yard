import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import yaml from 'yaml'

describe('Outgoing Connections Manager in Focus Tab', () => {
  test('lists existing outgoing connections, supports updating labels, and supports disconnecting them', async () => {
    render(<Workspace />)

    // 1. Switch to Metrics Tab to select the component from the list
    const metricsTabBtn = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabBtn)

    // 2. Select inbox component via clicking its button in the directory
    const inboxBtn = screen.getByRole('button', { name: /inbox/i })
    fireEvent.click(inboxBtn)

    // 3. Switch to Focus Tab
    const focusTabBtn = screen.getByRole('tab', { name: /Focus/i })
    fireEvent.click(focusTabBtn)

    // 4. Verify that connection header is visible
    expect(screen.getByText('Outgoing Connections')).toBeInTheDocument()

    // 5. Verify that "digest_stage" connection is listed
    const targetLabel = screen.getByTitle('Focus on digest_stage')
    expect(targetLabel).toBeInTheDocument()

    // 6. Verify that editing the connection label updates the spec
    const labelInput = screen.getByPlaceholderText('Add connection label...') as HTMLInputElement
    expect(labelInput).toBeInTheDocument()

    fireEvent.change(labelInput, { target: { value: 'process data' } })

    // Wait for the debounced AST update
    await new Promise((resolve) => setTimeout(resolve, 250))

    // Verify label updated in spec textarea
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    expect(textarea.value).toContain('label: process data')

    // 7. Click Disconnect button to remove the connection
    const disconnectBtn = screen.getByRole('button', { name: /disconnect/i })
    expect(disconnectBtn).toBeInTheDocument()

    fireEvent.click(disconnectBtn)

    // Wait for update
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Verify connection is removed from spec
    const parsed = yaml.parse(textarea.value)
    const inbox = parsed.system.components.find((c: any) => c.id === 'inbox')
    const hasDigestConnection = inbox?.connections?.some((conn: any) => {
      if (typeof conn === 'string') return conn === 'digest_stage'
      return conn && conn.target === 'digest_stage'
    })
    expect(hasDigestConnection || false).toBeFalsy()
  })

  test('supports adding a new outgoing connection', async () => {
    render(<Workspace />)

    // 1. Switch to Metrics Tab and select digest_stage
    const metricsTabBtn = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabBtn)

    const digestBtn = screen.getByRole('button', { name: /digest_stage/i })
    fireEvent.click(digestBtn)

    // 2. Switch to Focus Tab
    const focusTabBtn = screen.getByRole('tab', { name: /Focus/i })
    fireEvent.click(focusTabBtn)

    // 3. Find connection target select dropdown and input for label
    const targetSelect = screen.getByTestId('add-connection-select') as HTMLSelectElement
    const newLabelInput = screen.getByTestId('add-connection-label-input') as HTMLInputElement
    const addBtn = screen.getByRole('button', { name: /add connection/i })

    expect(targetSelect).toBeInTheDocument()
    expect(newLabelInput).toBeInTheDocument()
    expect(addBtn).toBeInTheDocument()

    // 4. Select inbox as target and input a label
    fireEvent.change(targetSelect, { target: { value: 'inbox' } })
    fireEvent.change(newLabelInput, { target: { value: 'backflow' } })

    // 5. Click Add Connection
    fireEvent.click(addBtn)

    // Wait for update
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Verify connection added in spec
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    expect(textarea.value).toContain('target: inbox')
    expect(textarea.value).toContain('label: backflow')
  })
})
