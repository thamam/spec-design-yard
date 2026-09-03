import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import { waitForWorkspaceHydration } from './wait-for-hydration'

// Regression guard for the editor/canvas quick-fix divergence: the editor's
// "Auto-Fix All" once filtered on strict Set membership and silently skipped
// the stride- fixes the canvas offered. This drives the real rendered button,
// not reconcileSpec directly, so dropping stride- codes from the editor's
// fixable filter fails this test.
const STRIDE_SPEC = `system:
  name: "Stride Fixture"
  metadata:
    owner: "Security Team"
    description: "Fixture for STRIDE fix-all integration."
  components:
    - id: edge_gateway
      type: Gateway
      x: 100
      y: 100
      metadata:
        owner: "Team A"
        description: "Public entry point."
      connections:
        - target: digest_stage
    - id: digest_stage
      type: Stage
      x: 400
      y: 100
      metadata:
        owner: "Team A"
        description: "Processes payloads."
      connections:
        - target: main_store
          label: "writes digest"
    - id: main_store
      type: Store
      x: 700
      y: 100
      metadata:
        owner: "Team A"
        description: "Primary storage."
`

describe('Editor Auto-Fix All includes STRIDE fixes', () => {
  test('clicking Auto-Fix All on a spec with STRIDE diagnostics rewrites the YAML with the secure labels', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement

    fireEvent.change(textarea, { target: { value: STRIDE_SPEC } })

    // The unlabeled gateway connection produces stride-spoofing + stride-tampering,
    // so the fix banner must appear — it only renders when fixableDiagnostics
    // is non-empty, which already requires the editor to treat stride- as fixable.
    const fixAllButton = await waitFor(() => screen.getByRole('button', { name: /Auto-Fix All/i }))
    fireEvent.click(fixAllButton)

    await waitFor(() => {
      const updated = (screen.getByTestId('spec-textarea') as HTMLTextAreaElement).value
      // stride-spoofing relabels to "authenticated TLS auth-token request";
      // stride-tampering to "encrypted TLS auth-token flow". Application order
      // decides which wins on the shared connection — either proves the stride
      // fix ran in the editor.
      expect(updated).toMatch(/authenticated TLS auth-token request|encrypted TLS auth-token flow/)
    })
  })
})
