import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'

/*
 * The isolated-store and processing-sink recommendations are the linter's
 * "unused-store" and "sink-stage-brick" rules, restated in the Metrics tab's
 * own wording. These lock the rendered text and quick-fix buttons in place.
 */
const SPEC_WITH_SINK_AND_ISOLATED_STORE = `system:
  name: Sink System
  components:
    - id: entry_gateway
      type: Gateway
      name: Entry Gateway
      connections:
        - target: work_stage
    - id: work_stage
      type: Stage
      name: Work Stage
    - id: orphan_store
      type: Store
      name: Orphan Store
`

async function renderMetricsFor(specText: string) {
  render(<Workspace />)

  fireEvent.click(screen.getByRole('tab', { name: /Code/i }))
  const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
  fireEvent.change(textarea, { target: { value: specText } })

  fireEvent.click(screen.getByRole('tab', { name: /Metrics/i }))
  return textarea
}

describe('Metrics tab architectural recommendations', () => {
  test('reports a processing sink with its quick-fix button', async () => {
    await renderMetricsFor(SPEC_WITH_SINK_AND_ISOLATED_STORE)

    await waitFor(() => {
      expect(
        screen.getByText(/Processing sink stage\/brick with no outbound flow: "work_stage"\./i)
      ).toBeInTheDocument()
    })
    expect(
      screen.getByText(/Connect this terminal stage to downstream data stores/i)
    ).toBeInTheDocument()
    // Clicking the fix must act on work_stage, so the recommendation that
    // produced the button goes away — that is what pins the component index
    // carried by the diagnostic path.
    fireEvent.click(screen.getByRole('button', { name: /Connect work_stage to Downstream Store/i }))

    await waitFor(() => {
      expect(screen.queryByText(/Processing sink stage\/brick/i)).not.toBeInTheDocument()
    })
  })

  test('reports an isolated data store with its quick-fix button', async () => {
    await renderMetricsFor(SPEC_WITH_SINK_AND_ISOLATED_STORE)

    await waitFor(() => {
      expect(
        screen.getByText(/Isolated Data Store with no inbound flow: "orphan_store"\./i)
      ).toBeInTheDocument()
    })
    expect(
      screen.getByText(/Ensure this store receives writes from an active processing stage/i)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Connect Stage to orphan_store/i })
    ).toBeInTheDocument()
  })

  test('drops the sink recommendation once the terminal stage routes downstream', async () => {
    await renderMetricsFor(`system:
  name: Routed System
  components:
    - id: entry_gateway
      type: Gateway
      name: Entry Gateway
      connections:
        - target: work_stage
    - id: work_stage
      type: Stage
      name: Work Stage
      connections:
        - target: orphan_store
    - id: orphan_store
      type: Store
      name: Orphan Store
`)

    await waitFor(() => {
      expect(screen.queryByText(/Processing sink stage\/brick/i)).not.toBeInTheDocument()
    })
    expect(screen.queryByText(/Isolated Data Store with no inbound flow/i)).not.toBeInTheDocument()
  })
})
