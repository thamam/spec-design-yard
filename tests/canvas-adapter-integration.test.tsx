import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import React from 'react'

// `vi.hoisted` lets the mock factory below (which vitest hoists above this
// file's imports) close over a mutable object we can also read from tests.
const captured = vi.hoisted(() => ({
  props: null as any,
  // Set by a test to fire during the stub's commit, standing in for the real
  // Excalidraw calling `onChange` from `componentDidUpdate`.
  onCommitUpdate: null as null | ((props: any) => void),
}))

// The adapter dynamically `import("@excalidraw/excalidraw")`s the real
// package so the canvas never mounts in jsdom. Mocking the specifier
// intercepts both the static and the dynamic import with the same stub.
vi.mock('@excalidraw/excalidraw', () => {
  const Excalidraw = (props: any) => {
    captured.props = props
    const mounted = React.useRef(false)
    React.useEffect(() => {
      props.excalidrawAPI?.({
        updateScene: vi.fn(),
        scrollToContent: vi.fn(),
        // The zoom-to-fit path calls this; the real API has it and the stub
        // must too, or the adapter throws on mount.
        getSceneElements: vi.fn(() => []),
      })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    // The real Excalidraw is a class component that reports scene changes from
    // `componentDidUpdate` — during the commit, before any parent passive
    // effect runs. A layout effect is the hook equivalent of that ordering.
    React.useLayoutEffect(() => {
      if (!mounted.current) {
        mounted.current = true
        return
      }
      const fire = captured.onCommitUpdate
      if (fire) {
        captured.onCommitUpdate = null
        fire(props)
      }
    })
    return null
  }
  // Excalidraw renders <Footer>'s children into its own footer region; a
  // passthrough keeps the stub's shape honest even though this Excalidraw
  // stub renders nothing.
  const Footer = (props: any) => props.children
  return { Excalidraw, Footer, WelcomeScreen: undefined, default: Excalidraw }
})

import { ExcalidrawCanvas, compileSpecToExcalidrawElements } from '../components/workspace/excalidraw-canvas'

const parsedSpec = {
  system: {
    name: 'Test System',
    components: [{ id: 'inbox', name: 'Inbox', type: 'Stage', x: 100, y: 100 }],
  },
}

/** Mount the adapter and flush the dynamic import + mount effects so the stub has captured its props. */
async function mountCanvas(spec: any = parsedSpec) {
  const onCanvasChange = vi.fn()
  const view = render(<ExcalidrawCanvas parsedSpec={spec} onCanvasChange={onCanvasChange} />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(captured.props).not.toBeNull()
  /** Stand in for the user editing the YAML: the spec moves, the scene does not. */
  const rerenderWith = async (next: any) => {
    view.rerender(<ExcalidrawCanvas parsedSpec={next} onCanvasChange={onCanvasChange} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
  }
  return { onCanvasChange, rerenderWith, container: view.container }
}

function moveInboxRect(scene: any[], x: number, y: number) {
  return scene.map((el) => (el.id === 'inbox' && el.type === 'rectangle' ? { ...el, x, y } : el))
}

describe('ExcalidrawCanvas adapter (react wrapper around lib/canvas-diff)', () => {
  beforeEach(() => {
    captured.props = null
    captured.onCommitUpdate = null
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  test('a compiled scene echoed back verbatim produces no onCanvasChange call', async () => {
    const { onCanvasChange } = await mountCanvas()
    const compiled = compileSpecToExcalidrawElements(parsedSpec)

    act(() => {
      captured.props.onChange(compiled, {})
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(onCanvasChange).not.toHaveBeenCalled()
  })

  test('a dragged compiled rect fires one coords change after the 450ms debounce', async () => {
    const { onCanvasChange } = await mountCanvas()
    const compiled = compileSpecToExcalidrawElements(parsedSpec)
    const dragged = moveInboxRect(compiled, 140, 125)

    act(() => {
      captured.props.onChange(dragged, { cursorButton: 'down' })
    })
    // Not yet — the adapter stages the move behind a 450ms idle debounce.
    expect(onCanvasChange).not.toHaveBeenCalled()
    // A drag ends with a release, and the writeback waits for it: while the
    // pointer is still down the gesture is live, and landing coordinates
    // under it would resnap the scene mid-drag.
    act(() => {
      captured.props.onChange(dragged, { cursorButton: 'up' })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(450)
    })

    // NOTE: at this adapter layer, a coords change is delivered as the raw
    // array of moved rectangle elements — not a `{type: "coords", ...}`
    // envelope. workspace-layout.tsx's handleCanvasChange wraps arrays into
    // `{type: "coords", payload: change}` one level up before calling
    // reconcileSpec; the adapter itself only knows how to stage/debounce.
    expect(onCanvasChange).toHaveBeenCalledTimes(1)
    const payload = onCanvasChange.mock.calls[0][0]
    expect(Array.isArray(payload)).toBe(true)
    expect(payload.find((el: any) => el.id === 'inbox')).toMatchObject({ x: 140, y: 125 })
  })

  test('a gesture that moved nothing is retired by the next compile', async () => {
    const { onCanvasChange, rerenderWith } = await mountCanvas()
    const compiled = compileSpecToExcalidrawElements(parsedSpec)

    // A click that only selects a component: pointer goes down, nothing moves.
    act(() => {
      captured.props.onChange(compiled, { cursorButton: 'down' })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(onCanvasChange).not.toHaveBeenCalled()

    // The user now types a new y in the YAML. The spec moves to 300; the scene
    // Excalidraw is still holding says 100 until the next updateScene lands.
    await rerenderWith({
      system: {
        name: 'Test System',
        components: [{ id: 'inbox', name: 'Inbox', type: 'Stage', x: 100, y: 300 }],
      },
    })

    act(() => {
      captured.props.onChange(compiled, {})
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    // The click never reached the staging branch that clears the gesture flag,
    // so without retiring it on compile the stale y:100 scene is written back
    // over the y:300 the user just typed - the flicker, by way of a stray click.
    expect(onCanvasChange).not.toHaveBeenCalled()
  })

  test('a stale gesture cannot outlive its compile, even reported during the commit', async () => {
    const { onCanvasChange, rerenderWith } = await mountCanvas()
    const compiled = compileSpecToExcalidrawElements(parsedSpec)

    // A click that only selects: the gesture flag goes up, nothing moves.
    act(() => {
      captured.props.onChange(compiled, { cursorButton: 'down' })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(onCanvasChange).not.toHaveBeenCalled()

    // The user types y: 300. Excalidraw reports the still-old scene from its
    // own update lifecycle, so this lands mid-commit — before any passive
    // effect of the adapter's could have retired the flag. Retiring the
    // gesture in a `useEffect` is therefore too late to help.
    captured.onCommitUpdate = (props: any) => {
      props.onChange(compiled, {})
    }
    await rerenderWith({
      system: {
        name: 'Test System',
        components: [{ id: 'inbox', name: 'Inbox', type: 'Stage', x: 100, y: 300 }],
      },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(captured.onCommitUpdate).toBeNull() // the commit hook really did fire
    expect(onCanvasChange).not.toHaveBeenCalled()
  })

  test('a staged drag is dropped when a newer compile lands inside its debounce', async () => {
    const { onCanvasChange, rerenderWith } = await mountCanvas()
    const compiled = compileSpecToExcalidrawElements(parsedSpec)
    const dragged = moveInboxRect(compiled, 140, 125)

    act(() => {
      captured.props.onChange(dragged, { cursorButton: 'down' })
    })
    // Still inside the 450ms window: the move is staged, not yet delivered.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(onCanvasChange).not.toHaveBeenCalled()

    // Before the debounce fires, the spec moves on under it — the user types a
    // new y, or asks for a re-layout.
    await rerenderWith({
      system: {
        name: 'Test System',
        components: [{ id: 'inbox', name: 'Inbox', type: 'Stage', x: 100, y: 300 }],
      },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    // Flushing the older drag now would put y:125 back over the y:300 that was
    // typed after it. The stale payload has to be dropped, not merely delayed.
    expect(onCanvasChange).not.toHaveBeenCalled()
  })

  test('a re-render that changes nothing does not retire a gesture in flight', async () => {
    const { onCanvasChange, rerenderWith } = await mountCanvas()
    const compiled = compileSpecToExcalidrawElements(parsedSpec)

    // The pointer goes down. No move has been reported yet.
    act(() => {
      captured.props.onChange(compiled, { cursorButton: 'down' })
    })

    // The parent re-renders mid-drag for reasons of its own, same spec.
    await rerenderWith(parsedSpec)

    // The drag is reported now. It is still the same gesture on the same
    // compile, so it has to reach the YAML.
    const dragged = moveInboxRect(compiled, 140, 125)
    act(() => {
      captured.props.onChange(dragged, {})
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(450)
    })

    expect(onCanvasChange).toHaveBeenCalledTimes(1)
    expect(onCanvasChange.mock.calls[0][0].find((el: any) => el.id === 'inbox')).toMatchObject({
      x: 140,
      y: 125,
    })
  })

  test('an arrow-key nudge counts as a gesture, so the move still reaches the YAML', async () => {
    const { onCanvasChange, container } = await mountCanvas()
    const compiled = compileSpecToExcalidrawElements(parsedSpec)
    const nudged = moveInboxRect(compiled, 110, 100)

    // Excalidraw moves the selection with the arrow keys and reports no pointer
    // gesture for it, so the writeback gate would drop the move on the floor.
    fireEvent.keyDown(container.firstChild as Element, { key: 'ArrowRight' })
    act(() => {
      captured.props.onChange(nudged, {})
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(450)
    })

    expect(onCanvasChange).toHaveBeenCalledTimes(1)
    const payload = onCanvasChange.mock.calls[0][0]
    expect(payload.find((el: any) => el.id === 'inbox')).toMatchObject({ x: 110, y: 100 })
  })

  test('a genuinely new user rectangle produces an add change immediately', async () => {
    const { onCanvasChange } = await mountCanvas()
    const compiled = compileSpecToExcalidrawElements(parsedSpec)
    const withNewRect = [
      ...compiled,
      { type: 'rectangle', id: 'userDrawn123', x: 500, y: 500, isDeleted: false },
    ]

    act(() => {
      captured.props.onChange(withNewRect, {})
    })

    expect(onCanvasChange).toHaveBeenCalledTimes(1)
    expect(onCanvasChange).toHaveBeenCalledWith({
      type: 'add',
      payload: { id: 'userDrawn123', x: 500, y: 500, type: 'Stage', name: 'New Component user' },
    })
  })

  test('a deleted element produces a delete change immediately', async () => {
    const { onCanvasChange } = await mountCanvas()
    const compiled = compileSpecToExcalidrawElements(parsedSpec)
    const withDeletion = compiled.map((el) =>
      el.id === 'inbox' ? { ...el, isDeleted: true } : el
    )

    act(() => {
      captured.props.onChange(withDeletion, {})
    })

    expect(onCanvasChange).toHaveBeenCalledTimes(1)
    expect(onCanvasChange).toHaveBeenCalledWith({
      type: 'delete',
      payload: { ids: ['inbox'] },
    })
  })

  test('rapid successive drags within the debounce window coalesce into one coords change', async () => {
    const { onCanvasChange } = await mountCanvas()
    const compiled = compileSpecToExcalidrawElements(parsedSpec)
    const drag1 = moveInboxRect(compiled, 130, 110)
    const drag2 = moveInboxRect(compiled, 200, 175)

    act(() => {
      captured.props.onChange(drag1, { cursorButton: 'down' })
    })
    act(() => {
      captured.props.onChange(drag1, { cursorButton: 'up' })
    })
    // Still inside the debounce window — the first drag has not flushed yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(onCanvasChange).not.toHaveBeenCalled()

    // A second drag arrives before the first one's timer fires; it must reset the debounce.
    act(() => {
      captured.props.onChange(drag2, { cursorButton: 'down' })
    })
    // Released: the debounce runs from here, not from under a live gesture.
    act(() => {
      captured.props.onChange(drag2, { cursorButton: 'up' })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(450)
    })

    expect(onCanvasChange).toHaveBeenCalledTimes(1)
    const payload = onCanvasChange.mock.calls[0][0]
    expect(payload.find((el: any) => el.id === 'inbox')).toMatchObject({ x: 200, y: 175 })
  })
})
