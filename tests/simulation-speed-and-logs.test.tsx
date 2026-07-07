import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'

describe('Simulation Speed Controls & Tracing Logs', () => {
  test('supports pausing, speed adjustment, single stepping, and displays dynamic terminal logs', async () => {
    render(<Workspace />)

    // 1. Switch to Metrics Tab
    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // 2. Select start and end nodes to trace a path
    const startSelect = screen.getByLabelText("Trace Path Start") as HTMLSelectElement
    const endSelect = screen.getByLabelText("Trace Path End") as HTMLSelectElement

    fireEvent.change(startSelect, { target: { value: 'inbox' } })
    fireEvent.change(endSelect, { target: { value: 'digest_stage' } })

    // Wait for the path tracing view to render
    const pathText = await screen.findByText(/Path 1/i)
    expect(pathText).toBeInTheDocument()

    // Use 50 packets to make stepping predictable
    const packetSelect = screen.getByTestId('sim-packet-select') as HTMLSelectElement
    fireEvent.change(packetSelect, { target: { value: '50' } })

    // 3. Click Run Performance Simulation
    const simulateBtn = screen.getByRole('button', { name: /Run Performance Simulation/i })
    fireEvent.click(simulateBtn)

    // Verify simulation starts and speed controls are present
    expect(screen.getByText(/Simulation Active/i)).toBeInTheDocument()
    
    const speed1x = screen.getByTestId('sim-speed-btn-1x')
    const speedPaused = screen.getByTestId('sim-speed-btn-paused')
    expect(speed1x).toBeInTheDocument()
    expect(speedPaused).toBeInTheDocument()

    // 4. Click Pause
    fireEvent.click(speedPaused)
    
    // Check logs terminal
    const logsConsole = screen.getByTestId('simulation-logs-console')
    expect(logsConsole).toBeInTheDocument()
    expect(logsConsole.textContent).toContain('[Pause] Simulation paused')

    // 5. Test Single Step
    const stepBtn = screen.getByTestId('sim-speed-btn-step')
    expect(stepBtn).toBeInTheDocument()
    fireEvent.click(stepBtn)
    
    expect(logsConsole.textContent).toContain('[Step] Stepped to')

    // 6. Change speed to 2x
    const speed2x = screen.getByTestId('sim-speed-btn-2x')
    fireEvent.click(speed2x)
    expect(logsConsole.textContent).toContain('[Speed] Set speed to 2x')

    // 7. Wait for completion
    await waitFor(() => {
      expect(screen.getByText(/Simulation Completed/i)).toBeInTheDocument()
    }, { timeout: 10000 })

    expect(logsConsole.textContent).toContain('[Complete]')
  })
})
