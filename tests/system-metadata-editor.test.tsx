import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import { reconcileSpec } from '../lib/reconciler'
import yaml from 'yaml'

describe('Global System Specification Settings in Focus Tab', () => {
  test('direct reconcileSpec test for system properties', () => {
    const initialSpec = `system:
  name: External Brain v0.2
  metadata:
    owner: architecture-team
    version: 1.0.0
    status: draft
    description: System architecture design and component specifications.
  components: []
`
    const updated = reconcileSpec(initialSpec, {
      type: "update-property",
      payload: { id: "system", path: "system.metadata.owner", value: "Tomer & Sentinel" }
    })
    console.log("UPDATED SPEC FROM DIRECT RECONCILER TEST:", updated)
    const parsed = yaml.parse(updated)
    expect(parsed.system.metadata.owner).toBe('Tomer & Sentinel')
  })

  test('displays system name and supports initializing and editing system-level metadata when no component is selected', async () => {
    render(<Workspace />)

    // 1. Switch to Focus Tab
    const focusTabBtn = screen.getByRole('tab', { name: /Focus/i })
    fireEvent.click(focusTabBtn)

    // 2. Since no component is selected, it should show the Global System Settings header
    expect(screen.getByText('Global System Settings')).toBeInTheDocument()

    // 3. Verify System Name input is present and has correct value
    const nameInput = screen.getByTestId('focus-system-name-input') as HTMLInputElement
    expect(nameInput).toBeInTheDocument()
    expect(nameInput.value).toBe('External Brain v0.2')

    // 4. Since initial spec does not have system metadata, it should show missing metadata prompt and button
    expect(screen.getByText(/System metadata is not initialized/i)).toBeInTheDocument()
    const initBtn = screen.getByTestId('focus-system-init-metadata-btn')
    expect(initBtn).toBeInTheDocument()

    // 5. Initialize metadata by clicking the button
    fireEvent.click(initBtn)

    // Wait for the AST update to apply and render the interactive fields
    await waitFor(() => {
      expect(screen.queryByTestId('focus-system-init-metadata-btn')).not.toBeInTheDocument()
    })

    // 6. Verify that interactive metadata editor fields are now displayed
    const versionInput = screen.getByTestId('focus-system-version-input') as HTMLInputElement
    const statusSelect = screen.getByTestId('focus-system-status-select') as HTMLSelectElement
    const ownerInput = screen.getByTestId('focus-system-owner-input') as HTMLInputElement
    const descriptionTextarea = screen.getByTestId('focus-system-description-textarea') as HTMLTextAreaElement

    expect(versionInput).toBeInTheDocument()
    expect(statusSelect).toBeInTheDocument()
    expect(ownerInput).toBeInTheDocument()
    expect(descriptionTextarea).toBeInTheDocument()

    // Check their default initialized values
    expect(versionInput.value).toBe('1.0.0')
    expect(statusSelect.value).toBe('draft')
    expect(ownerInput.value).toBe('architecture-team')
    expect(descriptionTextarea.value).toBe('System architecture design and component specifications.')

    // 7. Edit System Name and verify spec updates
    fireEvent.change(nameInput, { target: { value: 'Sentinel Intelligent System' } })
    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 250))

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    let parsed = yaml.parse(textarea.value)
    expect(parsed.system.name).toBe('Sentinel Intelligent System')

    // 8. Edit System Owner and status, and verify spec updates
    fireEvent.change(ownerInput, { target: { value: 'Tomer & Sentinel' } })
    fireEvent.change(statusSelect, { target: { value: 'active' } })
    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 250))

    parsed = yaml.parse(textarea.value)
    expect(parsed.system.metadata.owner).toBe('Tomer & Sentinel')
    expect(parsed.system.metadata.status).toBe('active')
  })
})
