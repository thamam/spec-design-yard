import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'

// The real Excalidraw is a class component that calls `onChange` from
// `componentDidUpdate` on EVERY update — including the re-render our own
// setState causes, because the JSX children the adapter passes fail its memo
// comparator. This stub models that echo faithfully: every commit after mount
// re-reports the last scene it was driven with, from a layout effect (the hook
// equivalent of componentDidUpdate's timing). The previous stubs only fired a
// single scripted update per commit, which is exactly why they never saw the
// loop this file pins down.
const captured = vi.hoisted(() => ({
  props: null as any,
  last: null as null | { elements: any[]; appState: any },
  onChangeCalls: 0,
}))

vi.mock('@excalidraw/excalidraw', () => {
  const Excalidraw = (props: any) => {
    captured.props = props
    const mounted = React.useRef(false)
    React.useEffect(() => {
      props.excalidrawAPI?.({
        updateScene: vi.fn(),
        scrollToContent: vi.fn(),
        getSceneElements: vi.fn(() => []),
      })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    React.useLayoutEffect(() => {
      if (!mounted.current) {
        mounted.current = true
        return
      }
      if (captured.last) {
        captured.onChangeCalls++
        props.onChange(captured.last.elements, captured.last.appState)
      }
    })
    return null
  }
  const Footer = (props: any) => props.children
  return { Excalidraw, Footer, WelcomeScreen: undefined, default: Excalidraw }
})

import { ExcalidrawCanvas, compileSpecToExcalidrawElements } from '../components/workspace/excalidraw-canvas'

const parsedSpec = {
  system: {
    name: 'Test System',
    components: [
      { id: 'inbox', name: 'Inbox', type: 'Stage', x: 100, y: 100 },
      { id: 'outbox', name: 'Outbox', type: 'Stage', x: 400, y: 100 },
    ],
  },
}

/** Drive the adapter the way a real pointer event does: Excalidraw reports the scene, and every later commit echoes it. */
function drive(elements: any[], appState: any) {
  captured.last = { elements, appState }
  captured.onChangeCalls++
  act(() => {
    captured.props.onChange(elements, appState)
  })
}

async function elapse(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function mountCanvas() {
  const onCanvasChange = vi.fn()
  render(<ExcalidrawCanvas parsedSpec={parsedSpec} onCanvasChange={onCanvasChange} />)
  await elapse(0)
  expect(captured.props).not.toBeNull()
  const scene = compileSpecToExcalidrawElements(parsedSpec)
  const rect = (id: string) => scene.find((el: any) => el.id === id && el.type === 'rectangle')
  return { onCanvasChange, scene, rect }
}

/** A real drag: pointer down, the rect moves in place, pointer up. */
function dragBy(scene: any[], el: any, dx: number, dy: number) {
  drive(scene, { cursorButton: 'down' })
  drive(scene, { cursorButton: 'down', selectedElementsAreBeingDragged: true })
  el.x += dx
  el.y += dy
  drive(scene, { cursorButton: 'up' })
}

describe('a staged move must not be re-staged by its own onChange echo', () => {
  beforeEach(() => {
    captured.props = null
    captured.last = null
    captured.onChangeCalls = 0
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  test('a click inside the writeback debounce does not loop React to death', async () => {
    const { onCanvasChange, scene, rect } = await mountCanvas()
    const inbox = rect('inbox')
    expect(inbox).toBeTruthy()

    // The move is staged behind the 450ms debounce; the scene is now ahead
    // of the spec.
    dragBy(scene, inbox, 40, 25)
    expect(onCanvasChange).not.toHaveBeenCalled()

    // Inside the debounce the user clicks the canvas. The gesture gate
    // re-arms on the pointer-down, the scene still differs from the compile,
    // and the same move is staged once more. With Excalidraw echoing every
    // commit, staging a fresh object each time was setState → re-render →
    // onChange → setState until React threw "Maximum update depth exceeded".
    await elapse(200)
    const before = captured.onChangeCalls
    expect(() => drive(scene, { cursorButton: 'down' })).not.toThrow()
    // The report itself, plus at most one echo should React render the
    // parent once before bailing out of the same-state update — not fifty.
    expect(captured.onChangeCalls - before).toBeLessThanOrEqual(2)
    drive(scene, { cursorButton: 'up' })

    // The staged move still lands, exactly once, when the debounce elapses.
    await elapse(250)
    expect(onCanvasChange).toHaveBeenCalledTimes(1)
    const rects = onCanvasChange.mock.calls[0][0]
    expect(Array.isArray(rects)).toBe(true)
    expect(rects.map((r: any) => r.id)).toEqual(['inbox'])
    // Literal coordinates: `rects[0]` is the live scene object the test
    // mutated, so comparing it with `inbox` would prove nothing.
    expect(rects[0]).toMatchObject({ x: 140, y: 125 })
  })

  test('a move that changes while the pointer is down is re-staged and the debounce restarts', async () => {
    const { onCanvasChange, scene, rect } = await mountCanvas()
    const inbox = rect('inbox')

    dragBy(scene, inbox, 40, 0)

    // 300ms in, the user grabs it again and moves it further.
    await elapse(300)
    dragBy(scene, inbox, 40, 0)

    // The first debounce would have fired at 450ms; the re-stage restarted it.
    await elapse(200)
    expect(onCanvasChange).not.toHaveBeenCalled()

    await elapse(300)
    expect(onCanvasChange).toHaveBeenCalledTimes(1)
    expect(onCanvasChange.mock.calls[0][0][0]).toMatchObject({ id: 'inbox', x: 180 })
  })

  test('a drag that starts inside the debounce holds the writeback until it ends', async () => {
    const { onCanvasChange, scene, rect } = await mountCanvas()
    const inbox = rect('inbox')

    dragBy(scene, inbox, 40, 0)

    // 300ms later the user grabs the rect again, from where the first drag
    // left it, and keeps dragging past the first debounce's deadline. That
    // pointer-down stages nothing new (same move), so the first timer keeps
    // running — it must not fire under the live drag: the writeback would
    // recompile the spec, resnap the scene under the cursor, and retire this
    // drag as stale.
    await elapse(300)
    drive(scene, { cursorButton: 'down' })
    drive(scene, { cursorButton: 'down', selectedElementsAreBeingDragged: true })
    await elapse(200) // past the first deadline at 450ms
    expect(onCanvasChange).not.toHaveBeenCalled()
    await elapse(600) // still dragging
    expect(onCanvasChange).not.toHaveBeenCalled()

    // Release: the final position is a new move, staged behind a fresh
    // debounce, and it is the only writeback that lands.
    inbox.x += 40
    drive(scene, { cursorButton: 'up' })
    await elapse(200)
    expect(onCanvasChange).not.toHaveBeenCalled()
    await elapse(250)
    expect(onCanvasChange).toHaveBeenCalledTimes(1)
    expect(onCanvasChange.mock.calls[0][0][0]).toMatchObject({ id: 'inbox', x: 180 })
  })

  test('the same move reported with its rects in another order is not restaged', async () => {
    const { onCanvasChange, scene, rect } = await mountCanvas()
    const inbox = rect('inbox')
    const outbox = rect('outbox')

    // Move both (multi-select drag).
    drive(scene, { cursorButton: 'down' })
    inbox.x += 30
    outbox.x += 30
    drive(scene, { cursorButton: 'up' })

    // A pointer-down inside the debounce reports the scene with the two rects
    // swapped. Same move: the debounce must not restart.
    await elapse(300)
    const swapped = [...scene].reverse()
    drive(swapped, { cursorButton: 'down' })
    drive(swapped, { cursorButton: 'up' })
    await elapse(150)
    expect(onCanvasChange).toHaveBeenCalledTimes(1)
    expect(onCanvasChange.mock.calls[0][0].map((r: any) => r.id).sort()).toEqual(['inbox', 'outbox'])
  })
})
