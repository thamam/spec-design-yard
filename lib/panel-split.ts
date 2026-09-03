// Split-pane geometry. Extracted so the mouse and keyboard resize paths
// share one clamp, and so a zero-width container (jsdom, mid-layout) cannot
// produce Infinity/NaN percentages that poison the flex layout.

export const MIN_PANEL_WIDTH = 280
export const ABSOLUTE_MIN_PANEL_WIDTH = 80

export function clampSplitPercent(next: number, totalWidth: number): number | null {
  if (!Number.isFinite(totalWidth) || totalWidth <= 0) return null
  if (!Number.isFinite(next)) return null
  // On a narrow window the 280px floor would overflow; drop to half-minus-gutter,
  // but never below a still-grabbable absolute minimum.
  const minPx = Math.min(MIN_PANEL_WIDTH, Math.max(ABSOLUTE_MIN_PANEL_WIDTH, totalWidth / 2 - 8))
  const minPct = (minPx / totalWidth) * 100
  return Math.min(Math.max(next, minPct), 100 - minPct)
}
