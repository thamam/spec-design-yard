import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import React from 'react'

// Same stub strategy as canvas-adapter-integration.test.tsx: mocking the
// specifier intercepts both the static and the dynamic import(). This stub
// additionally renders its children (so the <Footer> child is reachable),
// exposes `Footer` as a passthrough, and implements `getSceneElements` — the
// call the fit path makes and the other two stubs do not have.
const captured = vi.hoisted(() => ({
  api: null as any,
  scene: [] as any[],
}))

vi.mock('@excalidraw/excalidraw', () => {
  const Excalidraw = (props: any) => {
    React.useEffect(() => {
      const api = {
        updateScene: vi.fn((payload: any) => {
          if (payload?.elements) captured.scene = payload.elements
        }),
        scrollToContent: vi.fn(),
        getSceneElements: vi.fn(() => captured.scene),
        getAppState: vi.fn(() => ({ zoom: { value: 1 }, scrollX: 0, scrollY: 0 })),
      }
      captured.api = api
      props.excalidrawAPI?.(api)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return React.createElement('div', { 'data-testid': 'excalidraw-stub' }, props.children)
  }
  // The real Footer tunnels its children into Excalidraw's .footer-center —
  // the same footer strip as the zoom widget, not adjacent to it. A
  // passthrough is enough to prove the fit button is mounted as a Footer
  // child, which is the part this suite can check.
  const Footer = (props: any) =>
    React.createElement('div', { 'data-testid': 'excalidraw-footer' }, props.children)
  return { Excalidraw, Footer, WelcomeScreen: undefined, default: Excalidraw }
})

import Workspace from '../components/Workspace'
import { parseSpec } from '../lib/spec-model'
import { installWorkspaceFetch } from './workspace-fetch-double'
import { seedDemoSpec } from './demo-spec'
import {
  ExcalidrawCanvas,
  compileSpecToExcalidrawElements,
} from '../components/workspace/excalidraw-canvas'

const FIT_OPTIONS = { fitToViewport: true, viewportZoomFactor: 0.85 }

async function flushUntilCanvasMounted() {
  for (let i = 0; i < 40 && !captured.api; i++) {
    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(10)
    })
  }
  expect(captured.api).not.toBeNull()
}

/** The initial fit sits behind a 300ms setTimeout. */
async function flushInitialFit() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400)
  })
}

async function mountWorkspace() {
  seedDemoSpec()
  render(<Workspace />)
  await flushUntilCanvasMounted()
  await flushInitialFit()
  captured.api.scrollToContent.mockClear()
}

describe('zoom to fit — three routes, one implementation', () => {
  beforeEach(() => {
    captured.api = null
    captured.scene = []
    vi.useFakeTimers()
    seedDemoSpec()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  test('a fit button rides in Excalidraw own footer strip', async () => {
    await mountWorkspace()

    const footer = screen.getByTestId('excalidraw-footer')
    const button = screen.getByTestId('canvas-footer-zoom-to-fit')
    expect(footer.contains(button)).toBe(true)
    expect(button).toHaveAccessibleName(/zoom to fit/i)

    fireEvent.click(button)
    expect(captured.api.scrollToContent).toHaveBeenCalledWith(captured.scene, FIT_OPTIONS)
  })

  test('the toolbar control is named "Zoom to fit", not "Reset view"', async () => {
    await mountWorkspace()

    expect(screen.queryByRole('button', { name: /reset view/i })).toBeNull()
    const button = screen.getByTestId('canvas-zoom-to-fit')
    expect(button).toHaveAccessibleName(/zoom to fit/i)

    fireEvent.click(button)
    expect(captured.api.scrollToContent).toHaveBeenCalledWith(captured.scene, FIT_OPTIONS)
  })

  test('the controls reach the API by prop, not through window.excalidrawAPI', async () => {
    await mountWorkspace()

    // The window mirror stays for its existing consumers, but nothing added
    // here may depend on it.
    expect((window as any).excalidrawAPI).toBeTruthy()
    delete (window as any).excalidrawAPI

    fireEvent.click(screen.getByTestId('canvas-zoom-to-fit'))
    fireEvent.click(screen.getByTestId('canvas-footer-zoom-to-fit'))
    expect(captured.api.scrollToContent).toHaveBeenCalledTimes(2)
  })

  test('Shift+1 fits the diagram when focus is outside any field', async () => {
    await mountWorkspace()

    fireEvent.keyDown(document.body, { key: '!', code: 'Digit1', shiftKey: true })
    expect(captured.api.scrollToContent).toHaveBeenCalledWith(captured.scene, FIT_OPTIONS)
  })

  test('Shift+1 is claimed in the capture phase, ahead of Excalidraw own binding', async () => {
    await mountWorkspace()

    // Excalidraw binds Shift+1 to its own zoomToFit action, on a listener that
    // runs after the target. Standing in for it: if this ever fires, the real
    // one fires too and re-frames with its own options instead of the shared
    // fit — exactly when focus is on the canvas, the normal case.
    const excalidrawBinding = vi.fn()
    document.addEventListener('keydown', excalidrawBinding)
    const event = new KeyboardEvent('keydown', {
      key: '!',
      code: 'Digit1',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    screen.getByTestId('excalidraw-stub').dispatchEvent(event)
    document.removeEventListener('keydown', excalidrawBinding)

    expect(captured.api.scrollToContent).toHaveBeenCalledWith(captured.scene, FIT_OPTIONS)
    expect(excalidrawBinding).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })

  test('typing ! in the YAML textarea never yanks the canvas', async () => {
    await mountWorkspace()

    const textarea = screen.getByTestId('spec-textarea')
    fireEvent.keyDown(textarea, { key: '!', code: 'Digit1', shiftKey: true })
    expect(captured.api.scrollToContent).not.toHaveBeenCalled()
  })

  test('the shortcut also stays out of ordinary inputs', async () => {
    await mountWorkspace()

    const input = document.createElement('input')
    document.body.appendChild(input)
    fireEvent.keyDown(input, { key: '!', code: 'Digit1', shiftKey: true })
    expect(captured.api.scrollToContent).not.toHaveBeenCalled()
    input.remove()
  })

  test('undo still reaches the spec textarea — the pass-through is untouched', async () => {
    await mountWorkspace()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'system:\n  name: Edited\n' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(textarea.value).toContain('Edited')

    fireEvent.keyDown(textarea, { key: 'z', code: 'KeyZ', metaKey: true })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(textarea.value).not.toContain('Edited')
  })

  test('an unmounting canvas hands the parent a null fit callback', async () => {
    // Without this the parent keeps a fit bound to a canvas it no longer
    // renders — clicking "Zoom to fit" from the Grid view, or after a
    // remount, would drive a dead API.
    const registrations: (((() => void) | null))[] = []
    const onZoomToFitReady = (fit: (() => void) | null) => {
      registrations.push(fit)
    }
    const spec = { system: { name: 'Unmount', components: [{ id: 'u1', type: 'Stage', x: 0, y: 0 }] } }

    const { unmount } = render(
      <ExcalidrawCanvas parsedSpec={spec} onZoomToFitReady={onZoomToFitReady} />
    )
    await flushUntilCanvasMounted()
    await flushInitialFit()
    expect(typeof registrations.at(-1)).toBe('function')

    unmount()
    expect(registrations.at(-1)).toBeNull()
  })
})

describe('zoom to fit — a failing fit is reported, never thrown', () => {
  const spec = { system: { name: 'Boom', components: [{ id: 'b1', type: 'Stage', x: 0, y: 0 }] } }

  beforeEach(() => {
    captured.api = null
    captured.scene = []
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  test('a control-driven fit that throws is logged, and the click still returns', async () => {
    await mountWorkspace()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    captured.api.scrollToContent.mockImplementation(() => {
      throw new Error('scene bounds unavailable')
    })

    expect(() => fireEvent.click(screen.getByTestId('canvas-zoom-to-fit'))).not.toThrow()
    expect(errors).toHaveBeenCalledWith('Failed to zoom to fit: ', expect.any(Error))
    errors.mockRestore()
  })

  test('an automatic fit that throws is logged, and the canvas survives', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ExcalidrawCanvas parsedSpec={spec} />)
    await flushUntilCanvasMounted()
    // The automatic fit sits behind a 300ms timer, so the throwing
    // implementation is installed after mount but before the fit runs.
    captured.api.scrollToContent.mockImplementation(() => {
      throw new Error('scene bounds unavailable')
    })
    await flushInitialFit()

    expect(errors).toHaveBeenCalledWith('Failed to scroll to content: ', expect.any(Error))
    expect(screen.getByTestId('excalidraw-stub')).toBeInTheDocument()
    errors.mockRestore()
  })
})

describe('zoom to fit — an empty scene is never fitted', () => {
  // The automatic path gained this guard in round 4; the three MANUAL routes
  // did not. getCommonBounds([]) is non-finite, so a spec with no components
  // plus any fit control set a non-finite scroll and zoom: a blank canvas,
  // with no error anywhere.
  const emptySpec = { system: { name: 'Empty', components: [] } }
  const oneComponent = {
    system: { name: 'One', components: [{ id: 'solo', type: 'Stage', x: 10, y: 20 }] },
  }

  beforeEach(() => {
    captured.api = null
    captured.scene = []
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  test('none of the three routes fits an empty scene', async () => {
    render(<Workspace />)
    await flushUntilCanvasMounted()
    await flushInitialFit()
    captured.scene = []
    captured.api.scrollToContent.mockClear()

    fireEvent.click(screen.getByTestId('canvas-zoom-to-fit'))
    fireEvent.click(screen.getByTestId('canvas-footer-zoom-to-fit'))
    // `code: 'Digit1'` matters: workspace-layout's handler returns early
    // without it, so a dispatch that omits it never reaches the fit at all
    // and this assertion would pass with the keyboard route absent entirely.
    // The positive control is "Shift+1 fits the diagram when focus is outside
    // any field" in this same file: it renders the full Workspace (the
    // handler lives in workspace-layout, not in the canvas) and asserts the
    // identical dispatch DOES fit a non-empty scene. If the dispatch ever
    // stopped reaching the handler, that test fails while this one would keep
    // passing for the wrong reason — which is why they are cited together.
    fireEvent.keyDown(document.body, { key: '!', code: 'Digit1', shiftKey: true })

    expect(captured.api.scrollToContent).not.toHaveBeenCalled()
  })


  test('a scene with one element still fits, with finite bounds', async () => {
    render(<ExcalidrawCanvas parsedSpec={oneComponent} specIdentity="one" />)
    await flushUntilCanvasMounted()
    await flushInitialFit()
    captured.api.scrollToContent.mockClear()

    fireEvent.click(screen.getByTestId('canvas-footer-zoom-to-fit'))

    expect(captured.api.scrollToContent).toHaveBeenCalledTimes(1)
    const [elements, options] = captured.api.scrollToContent.mock.calls.at(-1)
    expect(options).toEqual(FIT_OPTIONS)
    expect(elements.length).toBeGreaterThan(0)
    for (const el of elements) {
      expect(Number.isFinite(el.x + el.y + el.width + el.height)).toBe(true)
    }
  })

  test('an empty spec plus a fit control is a no-op, not a blank canvas', async () => {
    render(<ExcalidrawCanvas parsedSpec={emptySpec} specIdentity="empty" />)
    await flushUntilCanvasMounted()
    await flushInitialFit()

    fireEvent.click(screen.getByTestId('canvas-footer-zoom-to-fit'))
    expect(captured.api.scrollToContent).not.toHaveBeenCalled()
  })
})

describe('zoom to fit — a failed fit still counts as handled', () => {
  const specA = { system: { name: 'A', components: [{ id: 'a1', type: 'Stage', x: 0, y: 0 }] } }
  const specAEdited = {
    system: { name: 'A', components: [{ id: 'a1', type: 'Stage', x: 40, y: 0 }] },
  }

  beforeEach(() => {
    captured.api = null
    captured.scene = []
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  test('a throwing fit does not re-fit on the next ordinary edit', async () => {
    // The latch used to advance only after scrollToContent SUCCEEDED, so a
    // throw left the identity unhandled and the user's next keystroke yanked
    // the viewport — "an edit to the same spec does not re-fit", violated.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(<ExcalidrawCanvas parsedSpec={specA} specIdentity="spec-a" />)
    await flushUntilCanvasMounted()
    captured.api.scrollToContent.mockImplementationOnce(() => {
      throw new Error('fit refused')
    })
    await flushInitialFit()
    expect(captured.api.scrollToContent).toHaveBeenCalledTimes(1)

    rerender(<ExcalidrawCanvas parsedSpec={specAEdited} specIdentity="spec-a" />)
    await flushInitialFit()

    expect(captured.api.scrollToContent).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })
})

describe('zoom to fit — one fit per loaded spec', () => {
  const specA = { system: { name: 'A', components: [{ id: 'a1', type: 'Stage', x: 0, y: 0 }] } }
  const specAEdited = { system: { name: 'A', components: [{ id: 'a1', type: 'Stage', x: 40, y: 0 }] } }
  const specB = { system: { name: 'B', components: [{ id: 'b1', type: 'Store', x: 0, y: 0 }] } }

  beforeEach(() => {
    captured.api = null
    captured.scene = []
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  test('a newly loaded spec re-fits; an edit to the same spec does not', async () => {
    const { rerender } = render(<ExcalidrawCanvas parsedSpec={specA} specIdentity="spec-1" />)
    await flushUntilCanvasMounted()
    await flushInitialFit()
    expect(captured.api.scrollToContent).toHaveBeenCalledTimes(1)

    rerender(<ExcalidrawCanvas parsedSpec={specAEdited} specIdentity="spec-1" />)
    await flushInitialFit()
    expect(captured.api.scrollToContent).toHaveBeenCalledTimes(1)

    rerender(<ExcalidrawCanvas parsedSpec={specB} specIdentity="spec-2" />)
    await flushInitialFit()
    expect(captured.api.scrollToContent).toHaveBeenCalledTimes(2)
  })

  test('elements changing inside the 300ms window still yields exactly one fit', async () => {
    // Workspace hydration replaces the compiled elements shortly after a spec
    // identity first appears. The latch must not read as "already fitted"
    // until a fit has actually run, or that spec never gets framed at all.
    const { rerender } = render(<ExcalidrawCanvas parsedSpec={specA} specIdentity="spec-1" />)
    await flushUntilCanvasMounted()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(captured.api.scrollToContent).not.toHaveBeenCalled()

    rerender(<ExcalidrawCanvas parsedSpec={specAEdited} specIdentity="spec-1" />)
    await flushInitialFit()
    expect(captured.api.scrollToContent).toHaveBeenCalledTimes(1)

    // ...and the churn must not queue a second fit for the same spec either.
    await flushInitialFit()
    expect(captured.api.scrollToContent).toHaveBeenCalledTimes(1)
  })

  test('an empty spec is handled without fitting, so its first component is an ordinary edit', async () => {
    // The latch has to distinguish "handled" from "fitted". An empty spec has
    // nothing to frame, but it is still this identity's load: if it leaves the
    // latch reading "not yet fitted", the first component the user adds — an
    // ordinary edit, same identity — schedules a fit and throws away their pan.
    const emptySpec = { system: { name: 'Empty', components: [] } }
    const firstComponent = {
      system: { name: 'Empty', components: [{ id: 'c1', type: 'Stage', x: 0, y: 0 }] },
    }

    const { rerender } = render(<ExcalidrawCanvas parsedSpec={emptySpec} specIdentity="spec-empty" />)
    await flushUntilCanvasMounted()
    await flushInitialFit()
    expect(captured.api.scrollToContent).not.toHaveBeenCalled()

    rerender(<ExcalidrawCanvas parsedSpec={firstComponent} specIdentity="spec-empty" />)
    await flushInitialFit()
    expect(captured.api.scrollToContent).not.toHaveBeenCalled()
  })

  test('a fit scheduled for the previous identity does not resurrect it', async () => {
    // A non-empty spec schedules a fit 300ms out. If an empty spec loads
    // inside that window, the old timer used to survive: it fired, framed a
    // spec that was no longer loaded, and rewound the handled latch to it —
    // so adding the new spec's first component read as a fresh load and threw
    // away the user's pan.
    const emptyB = { system: { name: 'B', components: [] } }
    const bWithOne = { system: { name: 'B', components: [{ id: 'b1', type: 'Store', x: 0, y: 0 }] } }

    const { rerender } = render(<ExcalidrawCanvas parsedSpec={specA} specIdentity="spec-a" />)
    await flushUntilCanvasMounted()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(captured.api.scrollToContent).not.toHaveBeenCalled()

    rerender(<ExcalidrawCanvas parsedSpec={emptyB} specIdentity="spec-b" />)
    await flushInitialFit()
    expect(captured.api.scrollToContent).not.toHaveBeenCalled()

    rerender(<ExcalidrawCanvas parsedSpec={bWithOne} specIdentity="spec-b" />)
    await flushInitialFit()
    expect(captured.api.scrollToContent).not.toHaveBeenCalled()
  })

  test('a spec emptied under the SAME identity never fits an empty scene', async () => {
    // The cancel block only clears a timer scheduled for a DIFFERENT identity.
    // Load a non-empty spec (timer armed for A), empty it within the 300ms
    // window under the same identity: the empty branch marked A handled and
    // returned with the timer alive, which then called scrollToContent([]).
    // getCommonBounds([]) is non-finite — the blank canvas this change names
    // as its top regression risk.
    const emptyA = { system: { name: 'A', components: [] } }
    const backWithOne = {
      system: { name: 'A', components: [{ id: 'a2', type: 'Store', x: 0, y: 0 }] },
    }

    const { rerender } = render(<ExcalidrawCanvas parsedSpec={specA} specIdentity="spec-a" />)
    await flushUntilCanvasMounted()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(captured.api.scrollToContent).not.toHaveBeenCalled()

    rerender(<ExcalidrawCanvas parsedSpec={emptyA} specIdentity="spec-a" />)
    await flushInitialFit()
    expect(captured.api.scrollToContent).not.toHaveBeenCalled()

    // ...and the identity is handled, so adding a component back is an
    // ordinary edit, not a fresh load.
    rerender(<ExcalidrawCanvas parsedSpec={backWithOne} specIdentity="spec-a" />)
    await flushInitialFit()
    expect(captured.api.scrollToContent).not.toHaveBeenCalled()
  })

  test('an emptied spec clears the canvas instead of leaving the old diagram drawn', async () => {
    const emptyB = { system: { name: 'B', components: [] } }

    const { rerender } = render(<ExcalidrawCanvas parsedSpec={specA} specIdentity="spec-a" />)
    await flushUntilCanvasMounted()
    await flushInitialFit()
    expect(captured.scene.length).toBeGreaterThan(0)

    captured.api.updateScene.mockClear()
    rerender(<ExcalidrawCanvas parsedSpec={emptyB} specIdentity="spec-b" />)
    await flushInitialFit()

    expect(captured.api.updateScene).toHaveBeenCalledWith({ elements: [] })
    expect(captured.scene).toEqual([])
  })

  test('an updateScene failure is logged instead of tearing the canvas down', async () => {
    const { rerender } = render(<ExcalidrawCanvas parsedSpec={specA} specIdentity="spec-a" />)
    await flushUntilCanvasMounted()
    await flushInitialFit()

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    captured.api.updateScene.mockImplementationOnce(() => {
      throw new Error('scene rejected')
    })
    rerender(<ExcalidrawCanvas parsedSpec={specB} specIdentity="spec-b" />)
    await flushInitialFit()

    expect(consoleError).toHaveBeenCalledWith(
      'Failed to update Excalidraw scene: ',
      expect.any(Error)
    )
    expect(screen.getByTestId('excalidraw-stub')).toBeInTheDocument()
    consoleError.mockRestore()
  })

  test('a spec loaded after an empty one still gets its own fit', async () => {
    // The guard above must not become a blanket "never fit again": a real
    // project loading in after an empty one is a fresh load and is owed a fit.
    const emptySpec = { system: { name: 'Empty', components: [] } }

    const { rerender } = render(<ExcalidrawCanvas parsedSpec={emptySpec} specIdentity="spec-empty" />)
    await flushUntilCanvasMounted()
    await flushInitialFit()
    expect(captured.api.scrollToContent).not.toHaveBeenCalled()

    rerender(<ExcalidrawCanvas parsedSpec={specB} specIdentity="spec-2" />)
    await flushInitialFit()
    expect(captured.api.scrollToContent).toHaveBeenCalledTimes(1)
  })
})

// YAML spells NaN and the infinities as `.nan` / `.inf`, so a hand-edited spec
// reaches the compiler with coordinates that are `typeof number` yet not
// finite. They poison getCommonBounds and leave scrollToContent writing a
// non-finite scroll/zoom — the silently blank canvas, with no error anywhere.
const POISONED_YAML = `system:
  name: Poisoned Fixture
  components:
    - id: gate
      type: Gateway
      name: Gate
      x: .nan
      y: 40
      connections:
        - target: store
    - id: store
      type: Store
      name: Store
      x: 400
      y: .inf
    - id: sink
      type: Stage
      name: Sink
      x: -.inf
      y: .nan
`

describe('zoom to fit — the NaN-bounds invariant', () => {
  const SPEC = {
    system: {
      name: 'Fit Fixture',
      components: [
        { id: 'gate', type: 'Gateway', name: 'Gate', x: 0, y: 0, connections: [{ target: 'store' }] },
        { id: 'store', type: 'Store', name: 'Store', x: 400, y: 120 },
      ],
    },
  }

  test('the poisoned fixture really does parse to non-finite numbers', () => {
    const { spec } = parseSpec(POISONED_YAML)
    const [gate, store, sink] = spec.system.components
    expect(typeof gate.x).toBe('number')
    expect(Number.isFinite(gate.x)).toBe(false)
    expect(Number.isFinite(store.y)).toBe(false)
    expect(Number.isFinite(sink.x)).toBe(false)
    expect(Number.isFinite(sink.y)).toBe(false)
  })

  test('non-finite coordinates fall back to the computed layout, like missing ones', () => {
    const { spec } = parseSpec(POISONED_YAML)
    const elements = compileSpecToExcalidrawElements(spec)
    expect(elements.length).toBeGreaterThan(0)
    for (const el of elements) {
      for (const key of ['x', 'y', 'width', 'height']) {
        expect(Number.isFinite(el[key])).toBe(true)
      }
    }
    // Each axis falls back on its own — main's rule since PR #15, where
    // `y: 200` with no `x` keeps its y — so a poisoned axis takes the layout
    // slot while the authored one survives. Every component still consumes
    // its lane slot, pinned or not, so sink (third core) sits at 60 + 2 * 250.
    const gateRect = elements.find((el) => el.id === 'gate')
    expect(gateRect.x).toBe(60)
    expect(gateRect.y).toBe(40)
    const storeRect = elements.find((el) => el.id === 'store')
    expect(storeRect.x).toBe(400)
    expect(storeRect.y).toBe(160)
    const sinkRect = elements.find((el) => el.id === 'sink')
    expect(sinkRect.x).toBe(560)
    expect(sinkRect.y).toBe(160)
  })

  // Red/green record: this test was already GREEN against origin/main — the
  // base compiler already injected the normalizer fields. It is kept as a
  // regression guard, not claimed as evidence for a fix.
  test('every compiled element carries the normalizer fields and finite geometry', () => {
    const elements = compileSpecToExcalidrawElements(SPEC)
    expect(elements.length).toBeGreaterThan(0)

    for (const el of elements) {
      // Excalidraw 0.18 bounds go through Math.cos(element.angle); a missing
      // angle yields NaN, poisons getCommonBounds, and blanks the canvas.
      expect(el.angle).toBe(0)
      expect(Number.isNaN(Math.cos(el.angle))).toBe(false)
      expect(el.opacity).toBe(100)
      expect(el.strokeStyle).toBe('solid')
      if (el.type === 'text') expect(el.lineHeight).toBe(1.25)
      for (const key of ['x', 'y', 'width', 'height']) {
        expect(Number.isFinite(el[key])).toBe(true)
      }
    }
  })

  test('a poisoned spec still fits with finite bounds', async () => {
    vi.useFakeTimers()
    try {
      captured.api = null
      captured.scene = []
      const { spec } = parseSpec(POISONED_YAML)
      render(<ExcalidrawCanvas parsedSpec={spec} specIdentity="poisoned" />)
      await flushUntilCanvasMounted()
      await flushInitialFit()

      const [elements, options] = captured.api.scrollToContent.mock.calls.at(-1)
      expect(options).toEqual(FIT_OPTIONS)
      expect(elements.length).toBeGreaterThan(0)
      for (const el of elements) {
        expect(Number.isFinite(el.x + el.y + el.width + el.height)).toBe(true)
      }
    } finally {
      vi.useRealTimers()
      vi.clearAllMocks()
    }
  })

  test('coordinates far beyond any canvas fall back to the layout', () => {
    // 1e308 and -1e308 are both finite, so the isFinite guard admits them —
    // but the arrow between them has a dx of -Infinity, and its width and
    // points poison getCommonBounds exactly as a NaN would.
    const absurd = {
      system: {
        name: 'Absurd Fixture',
        components: [
          { id: 'a', type: 'Gateway', name: 'A', x: 1e308, y: 0, connections: [{ target: 'b' }] },
          { id: 'b', type: 'Store', name: 'B', x: -1e308, y: 0 },
        ],
      },
    }
    const elements = compileSpecToExcalidrawElements(absurd)
    expect(elements.length).toBeGreaterThan(0)
    for (const el of elements) {
      for (const key of ['x', 'y', 'width', 'height']) {
        expect(Number.isFinite(el[key])).toBe(true)
      }
      if (Array.isArray(el.points)) {
        for (const [px, py] of el.points) {
          expect(Number.isFinite(px)).toBe(true)
          expect(Number.isFinite(py)).toBe(true)
        }
      }
    }
  })

  test('an ordinary large coordinate is still honoured', () => {
    const big = {
      system: {
        name: 'Big Fixture',
        components: [{ id: 'far', type: 'Stage', name: 'Far', x: 1e6, y: 1e6 }],
      },
    }
    const rect = compileSpecToExcalidrawElements(big).find((el) => el.id === 'far')
    expect(rect.x).toBe(1e6)
    expect(rect.y).toBe(1e6)
  })

  test('the normalizer defaults strokeStyle without overriding a deliberate one', () => {
    // The normalizer spreads `...el` over its defaults, so an element that
    // sets its own strokeStyle keeps it. The STRIDE threat zones are dashed on
    // purpose; only `angle` and finite geometry matter for bounds, so the
    // invariant must not be stated as "everything is solid".
    const threatened = {
      system: {
        name: 'Threat Fixture',
        components: [
          {
            id: 'leaky',
            type: 'Store',
            name: 'Leaky',
            x: 0,
            y: 0,
            // A sensitive metadata KEY with any non-placeholder value is what
            // the STRIDE rule flags; the value is deliberately short and
            // low-entropy so no secret scanner mistakes the fixture for one.
            metadata: { api_key: 'x' },
          },
        ],
      },
    }
    const elements = compileSpecToExcalidrawElements(
      threatened,
      undefined,
      undefined,
      [],
      true // showSecurityOverlay — this is what emits the dashed threat zone
    )
    const dashed = elements.filter((el) => el.strokeStyle === 'dashed')
    expect(dashed.length).toBeGreaterThan(0)
    for (const el of dashed) {
      expect(el.angle).toBe(0)
      expect(Number.isFinite(el.x + el.y + el.width + el.height)).toBe(true)
    }
    // And an element that expresses no preference still gets the default.
    const solid = elements.filter((el) => el.strokeStyle === 'solid')
    expect(solid.length).toBeGreaterThan(0)
  })

  test('the elements handed to scrollToContent are all finite', async () => {
    vi.useFakeTimers()
    try {
      captured.api = null
      captured.scene = []
      seedDemoSpec()
      render(<Workspace />)
      await flushUntilCanvasMounted()
      await flushInitialFit()
      captured.api.scrollToContent.mockClear()

      fireEvent.click(screen.getByTestId('canvas-zoom-to-fit'))

      const [elements, options] = captured.api.scrollToContent.mock.calls.at(-1)
      expect(options).toEqual(FIT_OPTIONS)
      expect(elements.length).toBeGreaterThan(0)
      for (const el of elements) {
        expect(Number.isNaN(Math.cos(el.angle))).toBe(false)
        expect(Number.isFinite(el.x + el.y + el.width + el.height)).toBe(true)
      }
    } finally {
      vi.useRealTimers()
      vi.clearAllMocks()
    }
  })
})

describe('the production loadedSpecId → specIdentity wiring', () => {
  // Every other fit test hands ExcalidrawCanvas a FABRICATED specIdentity, so
  // deleting the derivation in workspace-layout.tsx broke nothing. This drives
  // the real thing: WorkspaceLayout renders, the canvas mounts on the template
  // spec and fits it, and hydration then lands a different spec whose
  // components sit far away. Only the identity bump makes the canvas re-fit.
  beforeEach(() => {
    captured.api = null
    captured.scene = []
    localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  const FAR_SPEC = `system:
  name: Far Away System
  components:
    - id: far_gate
      type: Gateway
      name: far-gate
      x: 4200
      y: 3100
    - id: far_store
      type: Store
      name: far-store
      x: 4600
      y: 3400
`

  /**
   * A fetch double whose /api/store/spec/main answer is released by hand, so
   * hydration can be made to land AFTER the canvas has mounted and run its
   * first fit. With the ordinary double the spec is already there by the time
   * the canvas mounts and there is only ever one fit to count.
   */
  function deferredSpecFetch(yamlContent: string) {
    let release: (() => void) | null = null
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        const reply = (body: any, status = 200) => ({
          ok: status < 300,
          status,
          json: async () => body,
        })
        if (init?.method === 'PUT') return reply({ ok: true, rev: 'r1' })
        if (url.startsWith('/api/store/spec/main')) {
          await gate
          return reply({
            id: 'main',
            title: 'Far Away System',
            yamlContent,
            updatedAt: '2026-09-01T00:00:00.000Z',
          })
        }
        if (url.startsWith('/api/store/meta/')) return reply({ found: false }, 404)
        if (url.startsWith('/api/project')) return reply({ mode: 'standalone', recents: [] })
        return reply({}, 404)
      })
    )
    return { release: () => release?.() }
  }

  test('the canvas stays uncompiled until hydration, then fits the loaded spec', async () => {
    const { release } = deferredSpecFetch(FAR_SPEC)

    render(<Workspace />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    // Gating the compile on isHydrated: no Excalidraw, no first-fit of the
    // seed template — that flash is what first-run was losing positions to.
    expect(captured.api).toBeNull()
    expect(screen.getByLabelText('Loading canvas')).toBeInTheDocument()
    expect(
      ((screen.queryByTestId('spec-textarea') as HTMLTextAreaElement).value || '')
    ).not.toContain('Far Away System')

    release()
    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(1000)
    })
    await flushUntilCanvasMounted()
    await flushInitialFit()

    expect(
      ((screen.queryByTestId('spec-textarea') as HTMLTextAreaElement).value || '')
    ).toContain('Far Away System')
    expect(captured.api.scrollToContent).toHaveBeenCalled()
    const [elements] = captured.api.scrollToContent.mock.calls.at(-1)
    expect(elements.some((el: any) => el.id === 'far_gate')).toBe(true)
    for (const el of elements) {
      expect(Number.isFinite(el.x + el.y + el.width + el.height)).toBe(true)
    }
  })
})
