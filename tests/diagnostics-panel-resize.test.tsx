import { describe, test, expect, afterEach, vi } from 'vitest'
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
  // Named for what jsdom can actually check. Clipping is geometry — every rect
  // here is zero — so the "previously clipped button is now reachable" claim is
  // made in scripts/e2e-editor-ergonomics.py, which records the clipped set
  // before the resize and clicks a button out of it afterwards.
  test('the spec under test really does produce 5+ diagnostics, each with an action row', () => {
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

  test('a cancelled touch gesture ends the resize, like a touchend', () => {
    // The browser cancels a touch on its own (a system gesture takes over, the
    // finger leaves the surface). Without a touchcancel handler the resize
    // stays armed and the next, unrelated touch drags the panel.
    const { handle, body } = renderPanel()
    fireEvent.touchStart(handle(), { touches: [{ clientY: 600 }] })
    fireEvent.touchMove(window, { touches: [{ clientY: 520 }] })
    fireEvent.touchCancel(window, { touches: [] })
    expect(body().style.height).toBe('208px')

    fireEvent.touchMove(window, { touches: [{ clientY: 200 }] })
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

/** Make every measured rect report `height`, standing in for a real layout. */
function stubPaneHeight(height: number) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: 0, bottom: height, width: 800, height,
    toJSON: () => ({}),
  } as DOMRect)
}

describe('diagnostics maximum height respects the pane it lives in', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('a short editor pane clamps the panel below the 480px constant', () => {
    // 700px of pane − 261px reserved (101 of fixed chrome + a 160px floor for
    // the textarea). Taking the flat 480 here collapses the YAML pane.
    stubPaneHeight(700)
    const { handle, body } = renderPanel()
    dragMouse(handle(), 600, -5000)
    expect(body().style.height).toBe('439px')
  })

  test('a tall editor pane still stops at the 480px constant', () => {
    stubPaneHeight(1200)
    const { handle, body } = renderPanel()
    dragMouse(handle(), 600, -5000)
    expect(body().style.height).toBe('480px')
  })

  test('a pane too short for both floors gives the space to the editor', () => {
    // 200px of pane, 101px of fixed chrome. Holding the 72px diagnostics floor
    // left the textarea a 27px box carrying 40px of its own padding — no
    // visible editing line at all. When the two floors cannot both be paid,
    // diagnostics collapses rather than the editor.
    stubPaneHeight(200)
    const { handle, body } = renderPanel()
    dragMouse(handle(), 600, -5000)
    expect(body().style.height).toBe('0px')
  })

  test('a pane that misses the floors only just collapses rather than clip', () => {
    // 300 − 261 reserved = 39, below the 72px one-row floor. 39px is neither
    // one usable issue row nor a collapse — just a clipped sliver of the
    // first row. The panel is one or the other, never in between.
    stubPaneHeight(300)
    const { handle, body } = renderPanel()
    dragMouse(handle(), 600, -5000)
    expect(body().style.height).toBe('0px')
  })

  test('a pane one pixel above the floor keeps a real one-row panel', () => {
    // 333 − 261 = 72 exactly: the boundary the collapse rule must not eat.
    stubPaneHeight(333)
    const { handle, body } = renderPanel()
    dragMouse(handle(), 600, -5000)
    expect(body().style.height).toBe('72px')
  })

  test('a short pane clamps the INITIAL height, before any drag happens', () => {
    // The 128px default is an ask, not a measurement. On a ~200px pane it plus
    // the fixed chrome exceeds the pane and the YAML editor collapses to
    // nothing on first paint — the exact failure the clamp exists to prevent.
    stubPaneHeight(200)
    const { body } = renderPanel()
    expect(body().style.height).toBe('0px')
  })

  test('a mid-height pane clamps the initial height to what the pane leaves', () => {
    // 340 − 261 reserved = 79, which is below the 128px default and above the
    // 72px minimum: neither boundary can produce this number by accident.
    stubPaneHeight(340)
    const { body } = renderPanel()
    expect(body().style.height).toBe('79px')
  })

  test('a pane taller than the default leaves the initial height alone', () => {
    stubPaneHeight(1200)
    const { body } = renderPanel()
    expect(body().style.height).toBe('128px')
  })

  test('a zero measurement leaves the initial height at the constant default', () => {
    // jsdom, or a first render before layout: the fallback keeps 128px rather
    // than clamping against a meaningless 0.
    const { body } = renderPanel()
    expect(screen.getByTestId('editor-panel').getBoundingClientRect().height).toBe(0)
    expect(body().style.height).toBe('128px')
  })

  test('a zero measurement — jsdom, or a pre-layout render — falls back to the constant', () => {
    // No stub: jsdom reports every rect as zeros, which is also what a first
    // render before layout sees. The behaviour has to stay deterministic.
    const { handle, body } = renderPanel()
    expect(screen.getByTestId('editor-panel').getBoundingClientRect().height).toBe(0)
    dragMouse(handle(), 600, -5000)
    expect(body().style.height).toBe('480px')
  })

  test('shrinking the window pulls an over-tall panel back under the new cap', () => {
    const { handle, body } = renderPanel()
    dragMouse(handle(), 600, -5000)
    expect(body().style.height).toBe('480px')

    stubPaneHeight(700)
    fireEvent(window, new Event('resize'))
    expect(body().style.height).toBe('439px')
  })
})
