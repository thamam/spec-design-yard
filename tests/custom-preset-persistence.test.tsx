import { describe, test, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'

// Custom presets were plain useState until the SpecStore seam landed; they
// looked saved in the UI but vanished on reload. These tests prove the full
// loop through localStorage: create -> remount -> still there, and
// delete -> remount -> gone.

const PRESETS_KEY = 'custom_simulation_presets'

function openMetricsTab() {
  fireEvent.click(screen.getByRole('tab', { name: /Metrics/i }))
}

function createPreset(name: string) {
  const packetSelect = screen.getByTestId('sim-packet-select') as HTMLSelectElement
  const lossSlider = screen.getByTestId('sim-loss-slider') as HTMLInputElement
  fireEvent.change(packetSelect, { target: { value: '200' } })
  fireEvent.change(lossSlider, { target: { value: '15' } })
  fireEvent.change(screen.getByTestId('custom-preset-name-input'), { target: { value: name } })
  fireEvent.click(screen.getByTestId('save-custom-preset-btn'))
}

describe('Custom simulation presets persist across remounts', () => {
  beforeEach(() => {
    localStorage.removeItem(PRESETS_KEY)
  })

  test('a created preset survives a full unmount/remount and keeps its values', () => {
    render(<Workspace />)
    openMetricsTab()
    createPreset('Persisted Preset')

    // The write must actually land in storage, not only in component state.
    expect(localStorage.getItem(PRESETS_KEY) || '').toContain('Persisted Preset')

    cleanup()
    render(<Workspace />)
    openMetricsTab()

    const presetSelect = screen.getByTestId('sim-preset-select') as HTMLSelectElement
    expect(within(presetSelect).getByText('Persisted Preset (Custom)')).toBeInTheDocument()

    // Selecting the rehydrated preset restores the values it was saved with.
    fireEvent.change(presetSelect, { target: { value: 'Persisted Preset' } })
    expect((screen.getByTestId('sim-packet-select') as HTMLSelectElement).value).toBe('200')
    expect((screen.getByTestId('sim-loss-slider') as HTMLInputElement).value).toBe('15')
  })

  test('a deleted preset stays gone after remount', () => {
    render(<Workspace />)
    openMetricsTab()
    createPreset('Doomed Preset')
    expect(localStorage.getItem(PRESETS_KEY) || '').toContain('Doomed Preset')

    fireEvent.click(screen.getByTestId('delete-custom-preset-Doomed Preset'))
    expect(localStorage.getItem(PRESETS_KEY) || '').not.toContain('Doomed Preset')

    cleanup()
    render(<Workspace />)
    openMetricsTab()

    const presetSelect = screen.getByTestId('sim-preset-select') as HTMLSelectElement
    expect(within(presetSelect).queryByText('Doomed Preset (Custom)')).not.toBeInTheDocument()
  })
})
