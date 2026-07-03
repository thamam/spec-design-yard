import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'

describe('Simulation Performance Report & Diagnostic Analysis', () => {
  test('displays performance diagnostic report when simulation completes', async () => {
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

    // 3. Set custom packet settings
    const packetSelect = screen.getByTestId('sim-packet-select') as HTMLSelectElement
    fireEvent.change(packetSelect, { target: { value: '50' } })

    // 4. Click Run Performance Simulation
    const simulateBtn = screen.getByRole('button', { name: /Run Performance Simulation/i })
    fireEvent.click(simulateBtn)

    // Verify simulation starts
    expect(screen.getByText(/Simulation Active/i)).toBeInTheDocument()

    // 5. Wait for simulation to complete fully (approx 600ms)
    await new Promise((resolve) => setTimeout(resolve, 800))

    // Verify simulation is completed
    await waitFor(() => {
      expect(screen.getByText(/Simulation Completed/i)).toBeInTheDocument()
    })

    // 6. Verify that our new Performance Report card is displayed with bottleneck and latency diagnosis
    const reportTitle = screen.getByText(/Path Performance Diagnostic Report/i)
    expect(reportTitle).toBeInTheDocument()

    // Verify detailed metrics are listed
    expect(screen.getByText("Transmitted:")).toBeInTheDocument()
    expect(screen.getByText("Successful Delivery:")).toBeInTheDocument()
    expect(screen.getByText("Dropped/Lost:")).toBeInTheDocument()

    // Verify diagnostic analysis
    expect(screen.getByText(/Analysis & Recommendations:/i)).toBeInTheDocument()
    expect(screen.getByText(/System capacity throttled to/i)).toBeInTheDocument()
    expect(screen.getByText(/Highest latency node is/i)).toBeInTheDocument()
  })
})
