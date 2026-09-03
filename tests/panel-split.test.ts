import { describe, test, expect } from 'vitest'
import { ABSOLUTE_MIN_PANEL_WIDTH, MIN_PANEL_WIDTH, clampSplitPercent } from '../lib/panel-split'

describe('clampSplitPercent', () => {
  test('keeps a mid-range split on a wide container', () => {
    expect(clampSplitPercent(42, 1200)).toBe(42)
  })

  test('clamps to the 280px floor on a wide container', () => {
    const minPct = (MIN_PANEL_WIDTH / 1200) * 100
    expect(clampSplitPercent(0, 1200)).toBe(minPct)
    expect(clampSplitPercent(100, 1200)).toBe(100 - minPct)
  })

  test('lowers the floor on a narrow container so panels still fit', () => {
    const total = 400
    const minPx = Math.min(MIN_PANEL_WIDTH, Math.max(ABSOLUTE_MIN_PANEL_WIDTH, total / 2 - 8))
    expect(minPx).toBeLessThan(MIN_PANEL_WIDTH)
    expect(clampSplitPercent(0, total)).toBe((minPx / total) * 100)
  })

  test('refuses a zero or non-finite container width (no Infinity/NaN split)', () => {
    expect(clampSplitPercent(42, 0)).toBeNull()
    expect(clampSplitPercent(42, -10)).toBeNull()
    expect(clampSplitPercent(42, Number.NaN)).toBeNull()
    expect(clampSplitPercent(Number.NaN, 1000)).toBeNull()
    expect(clampSplitPercent(42, Number.POSITIVE_INFINITY)).toBeNull()
  })
})
