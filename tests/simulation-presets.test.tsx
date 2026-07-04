import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'

describe('Simulation Configuration Presets', () => {
  test('renders Simulation Presets select with correct choices', () => {
    render(<Workspace />)

    // Switch to Metrics Tab
    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // Verify Simulation Presets select is in the document with default "custom" or "default"
    const presetSelect = screen.getByTestId('sim-preset-select') as HTMLSelectElement
    expect(presetSelect).toBeInTheDocument()
    expect(presetSelect.value).toBe('default')

    // Verify various preset options are available
    expect(screen.getByText('Standard Dev (Default)')).toBeInTheDocument()
    expect(screen.getByText('High Traffic / Load Test')).toBeInTheDocument()
    expect(screen.getByText('Flaky Wireless Link')).toBeInTheDocument()
    expect(screen.getByText('Extreme Stress Test')).toBeInTheDocument()
    expect(screen.getByText('Sanity Check')).toBeInTheDocument()
  })

  test('selecting a preset automatically updates packets and loss values', () => {
    render(<Workspace />)

    // Switch to Metrics Tab
    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    const presetSelect = screen.getByTestId('sim-preset-select') as HTMLSelectElement
    const packetSelect = screen.getByTestId('sim-packet-select') as HTMLSelectElement
    const lossSlider = screen.getByTestId('sim-loss-slider') as HTMLInputElement

    // 1. Choose "Flaky Wireless Link" (Packets: 200, Loss: 20%)
    fireEvent.change(presetSelect, { target: { value: 'flaky' } })
    expect(presetSelect.value).toBe('flaky')
    expect(packetSelect.value).toBe('200')
    expect(lossSlider.value).toBe('20')
    expect(screen.getByTestId('sim-loss-val').textContent).toBe('20%')

    // 2. Choose "Extreme Stress Test" (Packets: 500, Loss: 50%)
    fireEvent.change(presetSelect, { target: { value: 'stress' } })
    expect(presetSelect.value).toBe('stress')
    expect(packetSelect.value).toBe('500')
    expect(lossSlider.value).toBe('50')
    expect(screen.getByTestId('sim-loss-val').textContent).toBe('50%')

    // 3. Choose "Sanity Check" (Packets: 50, Loss: 0%)
    fireEvent.change(presetSelect, { target: { value: 'sanity' } })
    expect(presetSelect.value).toBe('sanity')
    expect(packetSelect.value).toBe('50')
    expect(lossSlider.value).toBe('0')
    expect(screen.getByTestId('sim-loss-val').textContent).toBe('0%')
  })

  test('manually modifying values changes the selected preset to custom', () => {
    render(<Workspace />)

    // Switch to Metrics Tab
    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    const presetSelect = screen.getByTestId('sim-preset-select') as HTMLSelectElement
    const packetSelect = screen.getByTestId('sim-packet-select') as HTMLSelectElement
    const lossSlider = screen.getByTestId('sim-loss-slider') as HTMLInputElement

    // Start by selecting "Flaky Wireless Link"
    fireEvent.change(presetSelect, { target: { value: 'flaky' } })
    expect(presetSelect.value).toBe('flaky')

    // Manually change simulated packets to 100
    fireEvent.change(packetSelect, { target: { value: '100' } })
    // The preset dropdown should reset to "custom" since values no longer match "flaky"
    expect(presetSelect.value).toBe('custom')

    // Select "Flaky Wireless Link" again
    fireEvent.change(presetSelect, { target: { value: 'flaky' } })
    expect(presetSelect.value).toBe('flaky')

    // Manually change simulated packet loss to 30%
    fireEvent.change(lossSlider, { target: { value: '30' } })
    // The preset dropdown should reset to "custom" again
    expect(presetSelect.value).toBe('custom')
  })
})
