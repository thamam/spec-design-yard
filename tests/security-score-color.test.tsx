import { describe, test, expect } from 'vitest'
import { render, within } from '@testing-library/react'
import React from 'react'
import { EditorPanel } from '../components/workspace/editor-panel'
import { parseSpec } from '../lib/spec-model'

// SecurityTab's getScoreColor thresholds (editor-panel.tsx): >= 90 emerald,
// >= 70 amber, otherwise red. The score is derived from STRIDE diagnostics in
// steps of 15 (and one 5 for repudiation), so the exact integers 90, 89, and
// 69 can never occur — the achievable scores bracketing the boundaries are
// 95/85 around 90 and 70/65 around 70. getScoreColor itself is module-private,
// so the boundaries are pinned at the closest reachable scores through the
// real diagnostics pipeline.

function renderSecurityTab(specText: string) {
  const { spec } = parseSpec(specText)
  if (!spec) throw new Error(`test spec did not parse: ${specText}`)
  render(<EditorPanel specText={specText} parsedSpec={spec} activeTab="security" />)
}

function scoreBadge(score: number): HTMLElement {
  // Other (hidden) tab panels can render the same "<n>%" text, so scope to
  // the security tabpanel.
  const panel = document.getElementById('tabpanel-security')
  if (!panel) throw new Error('security tabpanel not found')
  const el = within(panel as HTMLElement).getByText(`${score}%`)
  const badge = el.parentElement
  if (!badge) throw new Error('score badge container not found')
  return badge
}

describe('SecurityTab compliance score color thresholds', () => {
  test('a fully mitigated spec scores 100 and renders emerald', () => {
    renderSecurityTab(`system:
  name: Secure System
  components:
    - id: worker
      type: Stage
`)
    expect(scoreBadge(100)).toHaveClass('text-emerald-400')
  })

  test('score 95 (closest reachable above the 90 threshold) renders emerald', () => {
    // Only repudiation fires (-5): a lone Store without an audit neighbor.
    renderSecurityTab(`system:
  name: Nearly Secure System
  components:
    - id: vault
      type: Store
`)
    expect(scoreBadge(95)).toHaveClass('text-emerald-400')
  })

  test('score 85 (closest reachable below the 90 threshold) renders amber', () => {
    // Only tampering fires (-15): one unlabeled Stage-to-Stage connection.
    renderSecurityTab(`system:
  name: One Gap System
  components:
    - id: a
      type: Stage
      connections:
        - target: b
    - id: b
      type: Stage
`)
    expect(scoreBadge(85)).toHaveClass('text-amber-400')
  })

  test('score exactly 70 (the amber/red threshold) still renders amber', () => {
    // Spoofing + tampering (-30): Gateway with an unlabeled outbound
    // connection to a Stage (a Store target would also trip info-disclosure).
    renderSecurityTab(`system:
  name: Boundary System
  components:
    - id: gw
      type: Gateway
      connections:
        - target: b
    - id: b
      type: Stage
`)
    expect(scoreBadge(70)).toHaveClass('text-amber-400')
  })

  test('score 65 (closest reachable below the 70 threshold) renders red', () => {
    // Spoofing + tampering + repudiation (-35).
    renderSecurityTab(`system:
  name: Below Boundary System
  components:
    - id: gw
      type: Gateway
      connections:
        - target: b
    - id: b
      type: Stage
    - id: vault
      type: Store
`)
    expect(scoreBadge(65)).toHaveClass('text-red-400')
  })
})
