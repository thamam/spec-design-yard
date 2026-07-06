import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'

describe('Simulation History Log & JSON/CSV Report Exports', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('runs simulation to completion, saves record to history, and supports CSV/JSON exports', async () => {
    // Spy on document.createElement to catch CSV/JSON download triggers
    const createElementSpy = vi.spyOn(document, 'createElement')
    
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

    // Use 50 packets to keep it quick
    const packetSelect = screen.getByTestId('sim-packet-select') as HTMLSelectElement
    fireEvent.change(packetSelect, { target: { value: '50' } })

    // 3. Click Run Performance Simulation
    const simulateBtn = screen.getByRole('button', { name: /Run Performance Simulation/i })
    fireEvent.click(simulateBtn)

    // Wait for completion (simulation completed)
    await waitFor(() => {
      expect(screen.getByText(/Simulation Completed/i)).toBeInTheDocument()
    }, { timeout: 1500 })

    // 4. Verify that the Simulation History Panel is now rendered
    const historyPanel = screen.getByTestId('simulation-history-panel')
    expect(historyPanel).toBeInTheDocument()

    // Verify history lists the past run
    expect(screen.getByText(/inbox ➔ digest_stage/i)).toBeInTheDocument()

    // 5. Test Export Run JSON button
    const jsonBtn = screen.getAllByRole('button', { name: /^JSON$/i })[0]
    expect(jsonBtn).toBeInTheDocument()
    
    // Clear spy calls to isolate the test click
    createElementSpy.mockClear()
    fireEvent.click(jsonBtn)

    // Assert that a download link was dynamically created and clicked
    expect(createElementSpy).toHaveBeenCalledWith('a')
    const createdLink = createElementSpy.mock.results[0].value as HTMLAnchorElement
    expect(createdLink.href).toContain('data:text/json;charset=utf-8')
    expect(createdLink.download).toContain('simulation-run-')

    // 6. Test Export Run CSV button
    const csvBtn = screen.getAllByRole('button', { name: /^CSV$/i })[0]
    expect(csvBtn).toBeInTheDocument()
    
    createElementSpy.mockClear()
    fireEvent.click(csvBtn)

    // Assert that a CSV download link was dynamically created and clicked
    expect(createElementSpy).toHaveBeenCalledWith('a')
    const createdCSVLink = createElementSpy.mock.results[0].value as HTMLAnchorElement
    expect(createdCSVLink.href).toContain('data:text/csv;charset=utf-8')
    expect(createdCSVLink.download).toContain('simulation-run-')

    // 7. Test Export All JSON button
    const exportAllJsonBtn = screen.getByTestId('export-all-json-btn')
    expect(exportAllJsonBtn).toBeInTheDocument()

    createElementSpy.mockClear()
    fireEvent.click(exportAllJsonBtn)

    expect(createElementSpy).toHaveBeenCalledWith('a')
    const allJsonLink = createElementSpy.mock.results[0].value as HTMLAnchorElement
    expect(allJsonLink.href).toContain('data:text/json;charset=utf-8')
    expect(allJsonLink.download).toContain('simulation-history-')

    // 8. Test Export All CSV button
    const exportAllCsvBtn = screen.getByTestId('export-all-csv-btn')
    expect(exportAllCsvBtn).toBeInTheDocument()

    createElementSpy.mockClear()
    fireEvent.click(exportAllCsvBtn)

    expect(createElementSpy).toHaveBeenCalledWith('a')
    const allCsvLink = createElementSpy.mock.results[0].value as HTMLAnchorElement
    expect(allCsvLink.href).toContain('data:text/csv;charset=utf-8')
    expect(allCsvLink.download).toContain('simulation-history-')

    // 9. Test Clear History button
    const clearBtn = screen.getByTestId('clear-history-btn')
    expect(clearBtn).toBeInTheDocument()
    fireEvent.click(clearBtn)

    // Panel should now be hidden/removed as history is empty
    expect(screen.queryByTestId('simulation-history-panel')).not.toBeInTheDocument()
  })

  test('restores simulation history from localStorage on mount, updates localStorage on new runs, and clears localStorage on clear', async () => {
    // 1. Setup mock data in localStorage
    const mockRun = {
      id: 'sim-run-stored-1234',
      timestamp: '7/6/2026, 10:00:00 AM',
      path: 'inbox ➔ digest_stage',
      packetCount: 100,
      successful: 95,
      dropped: 5,
      lossRatio: 0,
      latency: 75,
      bottleneck: 150
    }
    localStorage.setItem('simulation_history', JSON.stringify([mockRun]))

    render(<Workspace />)

    // 2. Switch to Metrics Tab
    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // 3. Verify that the saved history is loaded and displayed
    expect(screen.getByTestId('simulation-history-panel')).toBeInTheDocument()
    expect(screen.getByText('inbox ➔ digest_stage')).toBeInTheDocument()

    // 4. Clear the history and verify localStorage is cleared
    const clearBtn = screen.getByTestId('clear-history-btn')
    fireEvent.click(clearBtn)

    expect(screen.queryByTestId('simulation-history-panel')).not.toBeInTheDocument()
    expect(localStorage.getItem('simulation_history')).toBe('[]')
  })
})
