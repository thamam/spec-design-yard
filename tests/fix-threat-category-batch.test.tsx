import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import { waitForWorkspaceHydration } from './wait-for-hydration'

// Regression guard: the Security tab's per-category "Fix" button looped
// onQuickFix per diagnostic, and each call reconciled against the same stale
// render-snapshot specText — with 2+ diagnostics in a category only the LAST
// fix survived. This drives the real rendered button and asserts ALL fixes in
// the category are applied.
const TWO_SECRETS_SPEC = `system:
  name: "Two Secrets Fixture"
  components:
    - id: store_a
      type: Store
      metadata:
        api_key: "sk_live_aaa_123"
    - id: store_b
      type: Store
      metadata:
        api_key: "sk_live_bbb_456"
`

describe('Security tab category fix applies ALL fixes in the category', () => {
  test('clicking the secrets category fix redacts every leaked secret, not just the last one', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement

    fireEvent.change(textarea, { target: { value: TWO_SECRETS_SPEC } })

    fireEvent.click(screen.getByRole('tab', { name: /Security/i }))

    // Both leaked secrets must be flagged before fixing
    await waitFor(() => {
      expect(screen.getByTestId('threat-status-secrets')).toHaveTextContent(/VULNERABLE/i)
    })

    fireEvent.click(screen.getByTestId('fix-threat-btn-secrets'))
    fireEvent.click(await screen.findByTestId('secret-redact-confirm-confirm'))

    await waitFor(() => {
      const updated = (screen.getByTestId('spec-textarea') as HTMLTextAreaElement).value
      const placeholders = updated.match(/\$\{SENSITIVE_VALUE_PLACEHOLDER\}/g) || []
      expect(placeholders.length).toBe(2)
      expect(updated).not.toContain('sk_live_aaa_123')
      expect(updated).not.toContain('sk_live_bbb_456')
    })

    // And the category is fully mitigated — no diagnostic survives
    await waitFor(() => {
      expect(screen.getByTestId('threat-status-secrets')).toHaveTextContent(/MITIGATED|SECURE/i)
    })
  })
})
