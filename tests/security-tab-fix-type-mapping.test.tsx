import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const reconcileSpy = vi.hoisted(() => vi.fn())

// Capture the reconcile payload instead of applying it; everything else stays real.
vi.mock('../lib/reconciler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/reconciler')>()
  return {
    ...actual,
    reconcileSpec: (...args: any[]) => reconcileSpy(...args),
  }
})

// 'stride-secret-leak' has no entry in CODE_TO_FIX_TYPE; giving it a sentinel
// mapping proves the batch path consults fixTypeForCode instead of casting the
// raw diagnostic code to FixType.
vi.mock('../lib/quick-fixes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/quick-fixes')>()
  return {
    ...actual,
    fixTypeForCode: (code: string) =>
      code === 'stride-secret-leak' ? ('redact-secret-sentinel' as any) : actual.fixTypeForCode(code),
  }
})

import { EditorPanel } from '../components/workspace/editor-panel'

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

describe('Security tab batch fix routes codes through fixTypeForCode', () => {
  test('handleQuickFixAll maps each diagnostic code instead of casting it raw', async () => {
    reconcileSpy.mockImplementation((text: string) => text)
    render(<EditorPanel specText={TWO_SECRETS_SPEC} setSpecText={() => {}} />)

    fireEvent.click(screen.getByRole('tab', { name: /Security/i }))
    await waitFor(() => {
      expect(screen.getByTestId('threat-status-secrets')).toHaveTextContent(/VULNERABLE/i)
    })

    fireEvent.click(screen.getByTestId('fix-threat-btn-secrets'))
    fireEvent.click(await screen.findByTestId('secret-redact-confirm-confirm'))

    await waitFor(() => expect(reconcileSpy).toHaveBeenCalled())
    const call = reconcileSpy.mock.calls.find((c) => c[1]?.type === 'quick-fix-all')
    expect(call).toBeTruthy()
    const fixes = call![1].payload.fixes
    expect(fixes).toHaveLength(2)
    expect(fixes.every((f: any) => f.fixType === 'redact-secret-sentinel')).toBe(true)
  })
})
