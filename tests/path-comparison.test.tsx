import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import { waitForWorkspaceHydration } from './wait-for-hydration'

describe('Interactive Path Comparison Tool', () => {
  test('supports selecting two paths side-by-side and displays rich comparison metrics', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

    // 1. Switch to Code tab and inject alternative paths spec
    const codeTabBtn = screen.getByRole('tab', { name: /Code/i })
    fireEvent.click(codeTabBtn)

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const customSpecText = `system:
  name: Comparison System
  components:
    - id: start_node
      type: Gateway
      connections:
        - target: path_a_node
        - target: path_b_node
    - id: path_a_node
      type: Stage
      metadata:
        latency: 20
        throughput: 150
      connections:
        - target: end_node
    - id: path_b_node
      type: Stage
      metadata:
        latency: 80
        throughput: 400
      connections:
        - target: end_node
    - id: end_node
      type: Store
      metadata:
        latency: 50
        throughput: 500
`
    fireEvent.change(textarea, { target: { value: customSpecText } })

    // 2. Switch to Metrics tab
    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // 3. Set Trace Path Start and End
    const startSelect = screen.getByLabelText("Trace Path Start") as HTMLSelectElement
    const endSelect = screen.getByLabelText("Trace Path End") as HTMLSelectElement

    fireEvent.change(startSelect, { target: { value: 'start_node' } })
    fireEvent.change(endSelect, { target: { value: 'end_node' } })

    // Wait for the paths to be traced
    await waitFor(() => {
      expect(screen.getByText(/Found 2 Paths/i)).toBeInTheDocument()
    })

    // We should see "Path 1" and "Path 2"
    expect(screen.getByText(/Path 1/i)).toBeInTheDocument()
    expect(screen.getByText(/Path 2/i)).toBeInTheDocument()

    // 4. Verify comparison checkboxes/buttons are available
    const compareCheckboxes = screen.getAllByTestId(/compare-path-checkbox/i)
    expect(compareCheckboxes.length).toBe(2)

    // Click both checkboxes
    fireEvent.click(compareCheckboxes[0])
    fireEvent.click(compareCheckboxes[1])

    // 5. Verify the side-by-side comparison panel is displayed
    const comparisonPanel = await screen.findByTestId('path-comparison-panel')
    expect(comparisonPanel).toBeInTheDocument()

    // Verify correct comparison metrics
    // Path 1 Latency: start_node(5) + path_a_node(20) + end_node(50) = 75ms
    // Path 2 Latency: start_node(5) + path_b_node(80) + end_node(50) = 135ms
    // Difference: 60ms (Path 1 is faster)
    expect(within(comparisonPanel).getByText(/^Path 1$/)).toBeInTheDocument()
    expect(within(comparisonPanel).getByText(/^Path 2$/)).toBeInTheDocument()
    expect(within(comparisonPanel).getByText(/75 ms/i)).toBeInTheDocument()
    expect(within(comparisonPanel).getByText(/135 ms/i)).toBeInTheDocument()
    
    // Path 1 Bottleneck: min(start_node=1000, path_a_node=150, end_node=500) = 150 req/s
    // Path 2 Bottleneck: min(start_node=1000, path_b_node=400, end_node=500) = 400 req/s
    // Difference: 250 req/s (Path 2 has higher capacity)
    expect(within(comparisonPanel).getByText(/150 req\/s/i)).toBeInTheDocument()
    expect(within(comparisonPanel).getByText(/400 req\/s/i)).toBeInTheDocument()

    // Verify recommendations
    expect(within(comparisonPanel).getByText(/Low-Latency Option: Route via Path 1/i)).toBeInTheDocument()
    expect(within(comparisonPanel).getByText(/High-Throughput Option: Route via Path 2/i)).toBeInTheDocument()

    // 6. Toggle one comparison off and check that the comparison panel is hidden
    fireEvent.click(compareCheckboxes[0])
    expect(screen.queryByTestId('path-comparison-panel')).not.toBeInTheDocument()
  })
})
