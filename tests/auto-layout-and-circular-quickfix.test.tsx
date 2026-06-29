import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import { lintSpec } from '../lib/linter'
import { reconcileSpec } from '../lib/reconciler'
import yaml from 'yaml'

describe('Auto-Layout and Circular Dependency Quick-Fix Features', () => {
  test('circular-dependency has a quick-fix button "Remove Connection" rendered in diagnostics panel', () => {
    const specWithCycle = `system:
  name: Cycle Test
  components:
    - id: node_a
      type: Stage
      connections:
        - target: node_b
    - id: node_b
      type: Stage
      connections:
        - target: node_a
`
    // Render workspace with the cycle
    render(<Workspace />)
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: specWithCycle } })

    // Verify circular-dependency is detected in diagnostics
    const cycleDiagMessage = screen.getByText(/Circular dependency loop detected/)
    expect(cycleDiagMessage).toBeInTheDocument()

    // Find the quick fix button for the cycle
    // Note: Since each diagnostic is rendered in a separate block, we can find the button near it
    const quickFixButton = screen.getByRole('button', { name: /Remove Connection/i })
    expect(quickFixButton).toBeInTheDocument()

    // Click quick-fix
    fireEvent.click(quickFixButton)

    // The cycle-closing connection target: node_a (or node_b) should be deleted
    // The spec should be updated to resolve the cycle
    const parsed = yaml.parse(textarea.value)
    const diagnostics = lintSpec(parsed)
    const cycleDiagAfter = diagnostics.find(d => d.code === 'circular-dependency')
    expect(cycleDiagAfter).toBeUndefined()
  })

  test('autoLayoutDiagram calculates clean layered positions for components', () => {
    // We will test the layout utility directly or indirectly.
    // Let's verify that when Workspace is rendered, there is a Re-layout Diagram button in the canvas panel.
    render(<Workspace />)
    const relayoutBtn = screen.getByRole('button', { name: /Re-layout Diagram/i })
    expect(relayoutBtn).toBeInTheDocument()

    // Let's trigger the re-layout and verify that coordinates in textarea are updated.
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const initialSpec = `system:
  name: Layout Test
  components:
    - id: gateway_in
      type: Gateway
      connections:
        - target: stage_mid
    - id: stage_mid
      type: Stage
      connections:
        - target: store_out
    - id: store_out
      type: Store
`
    fireEvent.change(textarea, { target: { value: initialSpec } })

    // Click Re-layout Diagram
    fireEvent.click(relayoutBtn)

    // The layout coordinates (x, y) should be added to the spec document
    expect(textarea.value).toContain('x:')
    expect(textarea.value).toContain('y:')

    // Parse reconciled and check that Gateway is placed upstream (smaller x)
    // compared to Stage and Store (larger x)
    const parsed = yaml.parse(textarea.value)
    const gateway = parsed.system.components.find((c: any) => c.id === 'gateway_in')
    const stage = parsed.system.components.find((c: any) => c.id === 'stage_mid')
    const store = parsed.system.components.find((c: any) => c.id === 'store_out')

    expect(gateway.x).toBeLessThan(stage.x)
    expect(stage.x).toBeLessThan(store.x)
  })
})
