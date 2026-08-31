import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { EditorPanel } from '../components/workspace/editor-panel'

// Five components with no metadata at all: well past the 5-issue mark where the
// old fixed 128px body scrolled and the per-issue action rows (ADD DESCRIPTION
// among them) fell below the cut.
const NOISY_SPEC = `system:
  name: Noisy System
  components:
    - id: alpha
      type: Gateway
    - id: bravo
      type: Stage
      connections:
        - target: charlie
    - id: charlie
      type: Store
    - id: delta
      type: Stage
    - id: echo
      type: Store
`

function renderPanel() {
  render(<EditorPanel specText={NOISY_SPEC} setSpecText={() => {}} isHydrated />)
  return {
    handle: () => screen.getByTestId('diagnostics-resize-handle'),
    body: () => screen.getByTestId('diagnostics-body'),
  }
}

/** One complete mouse drag on the handle, from `from` to `to` on the Y axis. */
function dragMouse(handle: HTMLElement, from: number, to: number) {
  fireEvent.mouseDown(handle, { clientY: from })
  fireEvent.mouseMove(window, { clientY: to })
  fireEvent.mouseUp(window, { clientY: to })
}

describe('diagnostics panel resize', () => {
  test('the spec under test really does produce 5+ diagnostics with clipped action rows', () => {
    renderPanel()
    expect(screen.getByText(/\d+ issues/)).toBeInTheDocument()
    const count = Number(/(\d+) issues/.exec(screen.getByText(/\d+ issues/).textContent || '')![1])
    expect(count).toBeGreaterThanOrEqual(5)
    expect(screen.getAllByRole('button', { name: /add description/i }).length).toBeGreaterThan(0)
  })

  test('the body opens at the default height instead of a fixed max-height cap', () => {
    const { body } = renderPanel()
    expect(body().style.height).toBe('128px')
    expect(body().className).not.toMatch(/max-h-32/)
  })

  test('the handle is a horizontal separator outside the header click target', () => {
    const { handle } = renderPanel()
    expect(handle()).toHaveAttribute('role', 'separator')
    expect(handle()).toHaveAttribute('aria-orientation', 'horizontal')
    expect(handle()).toHaveAccessibleName(/resize diagnostics/i)
    // The collapse toggle is the entire header div's onClick; a handle inside it
    // would collapse the panel on mouseup.
    expect(screen.getByTestId('diagnostics-header').contains(handle())).toBe(false)
  })

  test('dragging the handle up grows the panel — the delta sign is inverted', () => {
    const { handle, body } = renderPanel()
    dragMouse(handle(), 600, 500)
    expect(body().style.height).toBe('228px')
  })

  test('dragging the handle down shrinks the panel', () => {
    const { handle, body } = renderPanel()
    dragMouse(handle(), 600, 640)
    expect(body().style.height).toBe('88px')
  })

  test('height clamps at the maximum when dragged far past the top of the pane', () => {
    const { handle, body } = renderPanel()
    dragMouse(handle(), 600, -5000)
    expect(body().style.height).toBe('480px')
  })

  test('height clamps at the minimum when dragged far past the bottom of the pane', () => {
    const { handle, body } = renderPanel()
    dragMouse(handle(), 600, 5000)
    expect(body().style.height).toBe('72px')
  })

  test('movement after mouseup no longer resizes', () => {
    const { handle, body } = renderPanel()
    dragMouse(handle(), 600, 500)
    fireEvent.mouseMove(window, { clientY: 100 })
    expect(body().style.height).toBe('228px')
  })

  test('a touch drag resizes the panel too', () => {
    const { handle, body } = renderPanel()
    fireEvent.touchStart(handle(), { touches: [{ clientY: 600 }] })
    fireEvent.touchMove(window, { touches: [{ clientY: 520 }] })
    fireEvent.touchEnd(window, { touches: [] })
    expect(body().style.height).toBe('208px')
  })

  test('a drag on the handle does not collapse the panel', () => {
    const { handle, body } = renderPanel()
    dragMouse(handle(), 600, 500)
    expect(body()).toBeInTheDocument()
    expect(screen.getByText('Collapse')).toBeInTheDocument()
  })

  test('the header click still collapses and re-expands at the dragged height', () => {
    const { handle, body } = renderPanel()
    dragMouse(handle(), 600, 500)

    fireEvent.click(screen.getByTestId('diagnostics-header'))
    expect(screen.queryByTestId('diagnostics-body')).not.toBeInTheDocument()
    expect(screen.getByText('Expand')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('diagnostics-header'))
    expect(body().style.height).toBe('228px')
  })

  test('Auto-Fix All stays reachable by role inside the resized panel', () => {
    const { handle } = renderPanel()
    dragMouse(handle(), 600, 500)
    expect(screen.getByRole('button', { name: /Auto-Fix All/i })).toBeInTheDocument()
  })
})
