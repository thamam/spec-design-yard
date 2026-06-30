import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import yaml from 'yaml'

describe('Interactive Component Duplication UI Integration', () => {
  test('supports duplicating a component via UI button and auto-selects the clone', async () => {
    render(<Workspace />)

    // 1. Switch to Metrics Tab and select the inbox component
    const metricsTabBtn = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabBtn)

    const inboxBtn = screen.getByRole('button', { name: /inbox/i })
    fireEvent.click(inboxBtn)

    // 2. Switch to Focus Tab
    const focusTabBtn = screen.getByRole('tab', { name: /Focus/i })
    fireEvent.click(focusTabBtn)

    // 3. Verify Selected label is "inbox"
    expect(screen.getByText(/Selected:/)).toBeInTheDocument()
    expect(screen.getByText('inbox', { selector: '.font-bold' })).toBeInTheDocument()

    // 4. Find and click the Duplicate button
    const duplicateBtn = screen.getByTestId('focus-duplicate-btn')
    expect(duplicateBtn).toBeInTheDocument()
    fireEvent.click(duplicateBtn)

    // 5. Wait for the state update to propagate
    await new Promise((resolve) => setTimeout(resolve, 50))

    // 6. Verify that the selected component is now "inbox_copy_1"
    expect(screen.getByText('inbox_copy_1', { selector: '.font-bold' })).toBeInTheDocument()

    // 7. Verify spec contains the duplicated component info
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    expect(textarea.value).toContain('id: inbox_copy_1')
    expect(textarea.value).toContain('name: inbox/ Copy')

    // 8. Verify it preserves other properties like type and connections of original
    const parsed = yaml.parse(textarea.value)
    const clone = parsed.system.components.find((c: any) => c.id === 'inbox_copy_1')
    expect(clone).toBeDefined()
    expect(clone.type).toBe('Store')
    expect(clone.connections).toBeDefined()
    expect(clone.connections[0].target).toBe('digest_stage')
  })
})
