import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'

describe('Custom Simulation Presets Management UI', () => {
  test('supports creating, selecting, and deleting custom simulation presets', () => {
    render(<Workspace />)

    // Switch to Metrics Tab
    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    const presetSelect = screen.getByTestId('sim-preset-select') as HTMLSelectElement
    const packetSelect = screen.getByTestId('sim-packet-select') as HTMLSelectElement
    const lossSlider = screen.getByTestId('sim-loss-slider') as HTMLInputElement

    // 1. Initially, no custom option except 'custom' should exist
    expect(within(presetSelect).queryByText('My Custom Preset')).not.toBeInTheDocument()

    // 2. Set some values (using 200 packets, which is a valid option in the dropdown)
    fireEvent.change(packetSelect, { target: { value: '200' } })
    fireEvent.change(lossSlider, { target: { value: '15' } })
    expect(presetSelect.value).toBe('custom')

    // Verify saving section is visible or input exists
    const nameInput = screen.getByTestId('custom-preset-name-input') as HTMLInputElement
    expect(nameInput).toBeInTheDocument()

    // Type name
    fireEvent.change(nameInput, { target: { value: 'My Custom Preset' } })
    expect(nameInput.value).toBe('My Custom Preset')

    // Click Save Button
    const saveBtn = screen.getByTestId('save-custom-preset-btn')
    fireEvent.click(saveBtn)

    // 3. Verify it is saved and appears in the dropdown options
    expect(within(presetSelect).getByText('My Custom Preset (Custom)')).toBeInTheDocument()

    // Verify it automatically gets selected
    expect(presetSelect.value).toBe('My Custom Preset')

    // 4. Change to default preset first, and verify values change
    fireEvent.change(presetSelect, { target: { value: 'default' } })
    expect(packetSelect.value).toBe('100')
    expect(lossSlider.value).toBe('0')

    // 5. Select our custom preset again
    fireEvent.change(presetSelect, { target: { value: 'My Custom Preset' } })
    expect(packetSelect.value).toBe('200')
    expect(lossSlider.value).toBe('15')

    // 6. Delete the custom preset
    const deleteBtn = screen.getByTestId('delete-custom-preset-My Custom Preset')
    fireEvent.click(deleteBtn)

    // Verify it is removed from dropdown
    expect(within(presetSelect).queryByText('My Custom Preset (Custom)')).not.toBeInTheDocument()
  })

  test('prevents shadowing built-in simulation preset names', () => {
    render(<Workspace />)

    // Switch to Metrics Tab
    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    const presetSelect = screen.getByTestId('sim-preset-select') as HTMLSelectElement
    const packetSelect = screen.getByTestId('sim-packet-select') as HTMLSelectElement
    const lossSlider = screen.getByTestId('sim-loss-slider') as HTMLInputElement

    // Set custom values so custom input is ready
    fireEvent.change(packetSelect, { target: { value: '200' } })
    fireEvent.change(lossSlider, { target: { value: '15' } })

    const nameInput = screen.getByTestId('custom-preset-name-input') as HTMLInputElement
    const saveBtn = screen.getByTestId('save-custom-preset-btn')

    // Try to save with name "default" (case-insensitive)
    fireEvent.change(nameInput, { target: { value: 'DEFAULT' } })
    fireEvent.click(saveBtn)

    // Verify that NO option "DEFAULT (Custom)" was added to the dropdown
    expect(within(presetSelect).queryByText('DEFAULT (Custom)')).not.toBeInTheDocument()

    // Try to save with name "flaky"
    fireEvent.change(nameInput, { target: { value: 'flaky' } })
    fireEvent.click(saveBtn)

    // Verify that NO option "flaky (Custom)" was added to the dropdown
    // Note: The standard "Flaky Wireless Link" option should be there, but not "flaky (Custom)"
    expect(within(presetSelect).queryByText('flaky (Custom)')).not.toBeInTheDocument()
  })
})
