import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'

describe('Dynamic Simulation Configuration Settings', () => {
  test('renders Simulation Configuration controls with correct initial states', () => {
    render(<Workspace />)

    // Switch to Metrics Tab
    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // Verify Simulated Packets select is rendered with default 100
    const packetSelect = screen.getByTestId('sim-packet-select') as HTMLSelectElement
    expect(packetSelect).toBeInTheDocument()
    expect(packetSelect.value).toBe('100')

    // Verify Additional Packet Loss slider is rendered with default 0
    const lossSlider = screen.getByTestId('sim-loss-slider') as HTMLInputElement
    expect(lossSlider).toBeInTheDocument()
    expect(lossSlider.value).toBe('0')
    expect(screen.getByTestId('sim-loss-val').textContent).toBe('0%')
  })

  test('allows changing simulated packet count and packet loss', async () => {
    render(<Workspace />)

    // Switch to Metrics Tab
    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // Select 200 packets
    const packetSelect = screen.getByTestId('sim-packet-select') as HTMLSelectElement
    fireEvent.change(packetSelect, { target: { value: '200' } })
    expect(packetSelect.value).toBe('200')

    // Move packet loss slider to 20%
    const lossSlider = screen.getByTestId('sim-loss-slider') as HTMLInputElement
    fireEvent.change(lossSlider, { target: { value: '20' } })
    expect(lossSlider.value).toBe('20')
    expect(screen.getByTestId('sim-loss-val').textContent).toBe('20%')
  })

  test('resets simulation state when config changes', async () => {
    render(<Workspace />)

    // Switch to Metrics Tab
    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // Select start and end nodes to trace a path
    const startSelect = screen.getByLabelText("Trace Path Start") as HTMLSelectElement
    const endSelect = screen.getByLabelText("Trace Path End") as HTMLSelectElement

    fireEvent.change(startSelect, { target: { value: 'inbox' } })
    fireEvent.change(endSelect, { target: { value: 'digest_stage' } })

    // Wait for trace results
    const pathText = await screen.findByText(/Path 1/i)
    expect(pathText).toBeInTheDocument()

    // Click Run Performance Simulation
    const simulateBtn = screen.getByRole('button', { name: /Run Performance Simulation/i })
    fireEvent.click(simulateBtn)

    // Verify simulation is running
    expect(screen.getByText(/Simulation Active/i)).toBeInTheDocument()

    // Change packet count configuration during simulation
    const packetSelect = screen.getByTestId('sim-packet-select') as HTMLSelectElement
    fireEvent.change(packetSelect, { target: { value: '50' } })

    // Check that simulation has been reset to idle (meaning "Simulation Active" is gone, "Run Performance Simulation" is back)
    await waitFor(() => {
      expect(screen.queryByText(/Simulation Active/i)).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Run Performance Simulation/i })).toBeInTheDocument()
  })

  test('applies packet count and packet loss to running and completing the simulation', async () => {
    render(<Workspace />)

    // Switch to Metrics Tab
    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // Set configuration: 50 packets, 50% loss
    const packetSelect = screen.getByTestId('sim-packet-select') as HTMLSelectElement
    const lossSlider = screen.getByTestId('sim-loss-slider') as HTMLInputElement
    
    fireEvent.change(packetSelect, { target: { value: '50' } })
    fireEvent.change(lossSlider, { target: { value: '50' } })

    // Select start and end nodes to trace a path
    const startSelect = screen.getByLabelText("Trace Path Start") as HTMLSelectElement
    const endSelect = screen.getByLabelText("Trace Path End") as HTMLSelectElement

    fireEvent.change(startSelect, { target: { value: 'inbox' } })
    fireEvent.change(endSelect, { target: { value: 'digest_stage' } })

    // Wait for path
    const pathText = await screen.findByText(/Path 1/i)
    expect(pathText).toBeInTheDocument()

    // Click Run Performance Simulation
    const simulateBtn = screen.getByRole('button', { name: /Run Performance Simulation/i })
    fireEvent.click(simulateBtn)

    // Verify simulation starts
    expect(screen.getByText(/Simulation Active/i)).toBeInTheDocument()
    
    // Step size is max(1, round(50/10)) = 5. Interval runs every 50ms.
    // Let's wait 120ms to allow some packets to be transmitted
    await new Promise((resolve) => setTimeout(resolve, 120))

    // Check transmission progress is active and has transmitted some packets
    expect(screen.getByText(/Packets Transmitted:/i)).toBeInTheDocument()

    // Let's wait another 600ms for it to complete fully
    await new Promise((resolve) => setTimeout(resolve, 600))

    // Verify simulation is completed
    await waitFor(() => {
      expect(screen.getByText(/Simulation Completed/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Packets Transmitted: 50 \/ 50/i)).toBeInTheDocument()
    
    // Success rate of inbox to digest_stage (both have no diagnostics) should be 1.0 (100%)
    // But with 50% additional packet loss, the final success probability is 1.0 * (1 - 0.5) = 0.5 (50%).
    // 50 packets * 50% success probability = 25 successful.
    // Let's verify Simulated Success Rate is around 50%
    expect(screen.getByText(/Simulated Success Rate:/i)).toBeInTheDocument()
    expect(screen.getByText(/50%/i)).toBeInTheDocument()
  })
})
