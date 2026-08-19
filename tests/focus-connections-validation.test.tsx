import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import yaml from 'yaml'
import { waitForWorkspaceHydration } from './wait-for-hydration'

describe('Focus Tab Connections Inline Validation', () => {
  test('displays warning badges and styles for architecture violations and missing targets in connections list', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

    // 1. Switch to Code Tab and set a spec text with multiple violations
    const codeTabBtn = screen.getByRole('tab', { name: /Code/i })
    fireEvent.click(codeTabBtn)

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const invalidSpec = `system:
  name: Architectural Violation System
  components:
    - id: gate_1
      type: Gateway
      connections:
        - target: store_1 # Gateway to Store violation!
        - target: non_existent_node # Orphan connection violation!
    - id: store_1
      type: Store
      connections:
        - target: store_2 # Store to Store violation!
    - id: store_2
      type: Store
`
    fireEvent.change(textarea, { target: { value: invalidSpec } })

    // Wait for YAML parsing & state update
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    // 2. Switch to Metrics tab to select gate_1
    const metricsTabBtn = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabBtn)

    const gate1Btn = screen.getByRole('button', { name: /gate_1/i })
    expect(gate1Btn).toBeInTheDocument()
    fireEvent.click(gate1Btn)

    // 3. Switch to Focus tab
    const focusTabBtn = screen.getByRole('tab', { name: /Focus/i })
    fireEvent.click(focusTabBtn)

    // 4. Check for validation badges in outgoing connections of gate_1
    // It should have:
    // - store_1 with a "Gateway to Store" or "warning" or "architectural violation" indicator
    // - non_existent_node with "Orphan Target" or "Target Missing" or "error" indicator
    const store1Connection = screen.getByTitle('Focus on store_1')
    expect(store1Connection).toBeInTheDocument()

    const gatewayToStoreBadge = screen.getByText("Gateway to Store")
    expect(gatewayToStoreBadge).toBeInTheDocument()

    const missingTargetBadge = screen.getByText("Target Missing")
    expect(missingTargetBadge).toBeInTheDocument()

    // 5. Select store_1 and verify Store to Store violation
    fireEvent.click(store1Connection)
    const storeToStoreBadge = screen.getByText("Store to Store")
    expect(storeToStoreBadge).toBeInTheDocument()
  })

  test('displays warning badges for brick-to-brick and gateway-to-gateway connections in FocusTab', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

    // 1. Switch to Code Tab and set spec
    const codeTabBtn = screen.getByRole('tab', { name: /Code/i })
    fireEvent.click(codeTabBtn)

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const specText = `system:
  name: Custom Guardrails Test System
  components:
    - id: b1_schema
      type: Brick
      connections:
        - target: b2_ledger
    - id: b2_ledger
      type: Brick
    - id: gate_1
      type: Gateway
      connections:
        - target: gate_2
    - id: gate_2
      type: Gateway
`
    fireEvent.change(textarea, { target: { value: specText } })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    // 2. Select b1_schema
    const metricsTabBtn = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabBtn)

    const b1Btn = screen.getByRole('button', { name: /b1_schema/i })
    fireEvent.click(b1Btn)

    // 3. Switch to Focus tab
    const focusTabBtn = screen.getByRole('tab', { name: /Focus/i })
    fireEvent.click(focusTabBtn)

    // 4. Verify Brick to Brick badge is displayed
    expect(screen.getByText("Brick to Brick")).toBeInTheDocument()

    // 5. Select gate_1
    fireEvent.click(metricsTabBtn)
    const gate1Btn = screen.getByRole('button', { name: /gate_1/i })
    fireEvent.click(gate1Btn)
    fireEvent.click(focusTabBtn)

    // 6. Verify Gateway to Gateway badge is displayed
    expect(screen.getByText("Gateway to Gateway")).toBeInTheDocument()
  })
})
