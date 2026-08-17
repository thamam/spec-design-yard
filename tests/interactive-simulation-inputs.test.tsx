import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import yaml from 'yaml'

describe('Interactive Simulation Configuration & Performance Tuning', () => {
  test('allows editing component latency and throughput in FocusTab and updates YAML correctly as integers', async () => {
    render(<Workspace />)

    // 1. Switch to Metrics tab to select digest_stage
    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    const digestBtn = screen.getByRole('button', { name: /digest_stage/i })
    expect(digestBtn).toBeInTheDocument()
    fireEvent.click(digestBtn)

    // 2. Switch to Focus tab
    const focusTabButton = screen.getByRole('tab', { name: /Focus/i })
    fireEvent.click(focusTabButton)

    // 3. Verify latency and throughput inputs are in the document
    const latencyInput = screen.getByTestId('focus-latency-input') as HTMLInputElement
    const throughputInput = screen.getByTestId('focus-throughput-input') as HTMLInputElement

    expect(latencyInput).toBeInTheDocument()
    expect(throughputInput).toBeInTheDocument()

    // Initially they should be empty as they aren't declared in the initial spec
    expect(latencyInput.value).toBe('')
    expect(throughputInput.value).toBe('')

    // 4. Input custom performance values
    fireEvent.change(latencyInput, { target: { value: '120' } })
    fireEvent.change(throughputInput, { target: { value: '550' } })

    // Wait for the debouncer (250ms) to update the parent YAML state
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    // 5. Verify the YAML text in the textarea is updated with the integer performance metadata
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const parsed = yaml.parse(textarea.value)
    const digestComp = parsed.system.components.find((c: any) => c.id === 'digest_stage')

    expect(digestComp.metadata.latency).toBe(120)
    expect(digestComp.metadata.throughput).toBe(550)
  })

  test('custom performance values are correctly utilized in the flow simulation path metrics', async () => {
    render(<Workspace />)

    // 1. Select digest_stage and set its custom latency to 120 and throughput to 15 (bottleneck!)
    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    const digestBtn = screen.getByRole('button', { name: /digest_stage/i })
    fireEvent.click(digestBtn)

    const focusTabButton = screen.getByRole('tab', { name: /Focus/i })
    fireEvent.click(focusTabButton)

    const latencyInput = screen.getByTestId('focus-latency-input') as HTMLInputElement
    const throughputInput = screen.getByTestId('focus-throughput-input') as HTMLInputElement

    fireEvent.change(latencyInput, { target: { value: '120' } })
    fireEvent.change(throughputInput, { target: { value: '15' } })

    // Wait for debounce
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    // 2. Switch back to Metrics Tab to run simulation
    fireEvent.click(metricsTabButton)

    // Select start and end nodes to trace a path through digest_stage
    const startSelect = screen.getByLabelText("Trace Path Start") as HTMLSelectElement
    const endSelect = screen.getByLabelText("Trace Path End") as HTMLSelectElement

    fireEvent.change(startSelect, { target: { value: 'inbox' } })
    fireEvent.change(endSelect, { target: { value: 'digest_stage' } })

    // Wait for the path tracing view to render
    await waitFor(() => {
      expect(screen.getByText(/Path 1/i)).toBeInTheDocument()
    })

    // 3. Verify that the pre-calculated path metrics reflect the custom latency and bottleneck capacity!
    // inbox is a Store (default latency 80). digest_stage (custom latency 120).
    // Total path latency should be 80 + 120 = 200 ms.
    // Capacity bottleneck should be 15 req/s (our custom throughput on digest_stage).
    expect(screen.getByText(/200 ms/i)).toBeInTheDocument()
    expect(screen.getByText(/15 req\/s/i)).toBeInTheDocument()

    // 4. Click Run Performance Simulation
    const simulateBtn = screen.getByRole('button', { name: /Run Performance Simulation/i })
    fireEvent.click(simulateBtn)

    console.log("DOM BODY STATE:")
    screen.debug(undefined, 50000)

    // Verify simulation starts and shows our custom bottleneck and latency
    expect(screen.getByText(/Cumulative Latency/i)).toBeInTheDocument()
    expect(screen.getByText(/Bottleneck Capacity/i)).toBeInTheDocument()
    expect(screen.getByText(/15 req\/s/i)).toBeInTheDocument()
    expect(screen.getByText(/Simulation Active/i)).toBeInTheDocument()

    // Let the running simulation finish inside act() so the interval's state
    // updates don't land outside act after the assertions.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700))
    })
  })
})
