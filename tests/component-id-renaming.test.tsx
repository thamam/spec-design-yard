import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import yaml from 'yaml'

describe('Interactive Component ID Renaming in Focus Tab', () => {
  test('supports renaming component ID, bidirectionally updating references, and retaining selection', async () => {
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

    // 4. Verify selected unit header
    expect(screen.getByText('Selected Unit: digest_stage')).toBeInTheDocument()

    // 5. Find ID input field and button
    const idInput = screen.getByTestId('focus-id-input') as HTMLInputElement
    const renameBtn = screen.getByTestId('focus-id-rename-btn')

    expect(idInput).toBeInTheDocument()
    expect(idInput.value).toBe('digest_stage')
    expect(renameBtn).toBeInTheDocument()

    // 6. Test duplicate ID error validation
    fireEvent.change(idInput, { target: { value: 'inbox' } })
    fireEvent.click(renameBtn)
    expect(screen.getByTestId('focus-id-error')).toHaveTextContent('Component ID "inbox" already exists.')

    // 7. Test invalid characters validation
    fireEvent.change(idInput, { target: { value: 'invalid id!' } })
    fireEvent.click(renameBtn)
    expect(screen.getByTestId('focus-id-error')).toHaveTextContent('ID must be alphanumeric, hyphen, or underscore.')

    // 8. Test empty ID validation
    fireEvent.change(idInput, { target: { value: '   ' } })
    fireEvent.click(renameBtn)
    expect(screen.getByTestId('focus-id-error')).toHaveTextContent('ID cannot be empty.')

    // 9. Perform a valid ID rename
    fireEvent.change(idInput, { target: { value: 'processing_engine' } })
    fireEvent.click(renameBtn)

    // 10. Verify that selection remains active with the new ID
    expect(screen.getByText('Selected Unit: processing_engine')).toBeInTheDocument()
    expect(idInput.value).toBe('processing_engine')
    expect(screen.queryByTestId('focus-id-error')).not.toBeInTheDocument()

    // 11. Verify that the spec text has been updated with the renamed ID and references
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const parsed = yaml.parse(textarea.value)

    // Check that digest_stage was renamed
    const engineComp = parsed.system.components.find((c: any) => c.id === 'processing_engine')
    expect(engineComp).toBeDefined()
    expect(parsed.system.components.find((c: any) => c.id === 'digest_stage')).toBeUndefined()

    // Check that inbox's reference to digest_stage is updated to processing_engine
    const inboxComp = parsed.system.components.find((c: any) => c.id === 'inbox')
    const hasEngineConnection = inboxComp?.connections?.some((conn: any) => {
      if (typeof conn === 'string') return conn === 'processing_engine'
      return conn && conn.target === 'processing_engine'
    })
    expect(hasEngineConnection).toBe(true)
  })
})
