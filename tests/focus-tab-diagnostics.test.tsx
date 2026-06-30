import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'

describe('Focus Tab Inline Diagnostics & Quick-Fixes', () => {
  test('displays inline linter warnings inside FocusTab and supports applying single quick-fix', async () => {
    render(<Workspace />)

    // Set YAML to a spec with an unrecognized component type to trigger a warning
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const invalidSpec = `system:
  name: Invalid System
  components:
    - id: bad_component
      type: InvalidType
      name: Bad Component
`
    fireEvent.change(textarea, { target: { value: invalidSpec } })

    // Switch to Metrics tab to select the component
    const metricsTabBtn = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabBtn)

    // Select the component
    const compBtn = screen.getByRole('button', { name: /bad_component/i })
    fireEvent.click(compBtn)

    // Switch to Focus Tab
    const focusTabBtn = screen.getByRole('tab', { name: /Focus/i })
    fireEvent.click(focusTabBtn)

    // Verify Focus Tab interactive property editor displays
    expect(screen.getByTestId('focus-name-input')).toBeInTheDocument()

    // Verify inline diagnostics panel is displayed and lists the unrecognized component type
    const focusDiagnosticsContainer = screen.getByTestId('focus-diagnostics-container')
    expect(focusDiagnosticsContainer).toBeInTheDocument()
    
    expect(within(focusDiagnosticsContainer).getByText(/Unrecognized component type "InvalidType"/i)).toBeInTheDocument()

    // Verify quick fix button for unrecognized-type is present
    const fixBtn = screen.getByTestId('focus-quick-fix-unrecognized-type')
    expect(fixBtn).toBeInTheDocument()

    // Click the Quick-Fix button
    fireEvent.click(fixBtn)

    // Wait for the change to propagate
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Verify that the spec was updated (unrecognized-type quick fix converts it to "Stage" by default)
    expect(textarea.value).toContain('type: Stage')
    expect(textarea.value).not.toContain('type: InvalidType')

    // Verify that the unrecognized-type quick-fix button is now gone
    expect(screen.queryByTestId('focus-quick-fix-unrecognized-type')).not.toBeInTheDocument()
  })
})
