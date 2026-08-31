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
  // The real Footer renders its children into Excalidraw's own footer region,
  // beside the − 100% + zoom widget. A passthrough is enough to prove the fit
  // button is mounted as a Footer child.
  const Footer = (props: any) =>
    React.createElement('div', { 'data-testid': 'excalidraw-footer' }, props.children)
  return { Excalidraw, Footer, WelcomeScreen: undefined, default: Excalidraw }
})

import Workspace from '../components/Workspace'
import {
  ExcalidrawCanvas,
  compileSpecToExcalidrawElements,
} from '../components/workspace/excalidraw-canvas'

const FIT_OPTIONS = { fitToViewport: true, viewportZoomFactor: 0.85 }

async function flushUntilCanvasMounted() {
  for (let i = 0; i < 20 && !captured.api; i++) {
    await act(async () => {
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
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  test('a fit button rides in Excalidraw own footer, beside its zoom widget', async () => {
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
})

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

  test('the elements handed to scrollToContent are all finite', async () => {
    vi.useFakeTimers()
    try {
      captured.api = null
      captured.scene = []
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
