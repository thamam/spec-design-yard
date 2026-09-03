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
    components: [{ id: 'inbox', name: 'Inbox', type: 'Stage', x: 100, y: 100 }],
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

async function mountCanvas() {
  const onCanvasChange = vi.fn()
  render(<ExcalidrawCanvas parsedSpec={parsedSpec} onCanvasChange={onCanvasChange} />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(captured.props).not.toBeNull()
  return { onCanvasChange }
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

  test('pressing the pointer again inside the writeback debounce does not loop React to death', async () => {
    const { onCanvasChange } = await mountCanvas()
    const scene = compileSpecToExcalidrawElements(parsedSpec)
    const inbox = scene.find((el: any) => el.id === 'inbox' && el.type === 'rectangle')
    expect(inbox).toBeTruthy()

    // A real drag: pointer down, the rect moves in place, pointer up. The move
    // is staged behind the 450ms debounce; the scene is now ahead of the spec.
    drive(scene, { cursorButton: 'down' })
    inbox.x += 40
    inbox.y += 25
    drive(scene, { cursorButton: 'up' })
    expect(onCanvasChange).not.toHaveBeenCalled()

    // Inside the debounce the user presses the pointer again (a click, the
    // start of the next drag — anything). The gesture gate re-arms, the scene
    // still differs from the compile, and the same move is staged once more.
    // With Excalidraw echoing every commit, staging a fresh object each time
    // was setState → re-render → onChange → setState until React threw
    // "Maximum update depth exceeded".
    const before = captured.onChangeCalls
    expect(() => drive(scene, { cursorButton: 'down' })).not.toThrow()
    // One report plus at most a couple of echoes — not fifty.
    expect(captured.onChangeCalls - before).toBeLessThan(6)

    // The staged move still lands, exactly once, when the debounce elapses.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(450)
    })
    expect(onCanvasChange).toHaveBeenCalledTimes(1)
    const rects = onCanvasChange.mock.calls[0][0]
    expect(Array.isArray(rects)).toBe(true)
    expect(rects.map((r: any) => r.id)).toEqual(['inbox'])
    expect(rects[0].x).toBe(inbox.x)
    expect(rects[0].y).toBe(inbox.y)
  })

  test('a move that changes while the pointer is down is re-staged and the debounce restarts', async () => {
    const { onCanvasChange } = await mountCanvas()
    const scene = compileSpecToExcalidrawElements(parsedSpec)
    const inbox = scene.find((el: any) => el.id === 'inbox' && el.type === 'rectangle')

    drive(scene, { cursorButton: 'down' })
    inbox.x += 40
    drive(scene, { cursorButton: 'up' })

    // 300ms in, the user grabs it again and moves it further.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    drive(scene, { cursorButton: 'down' })
    inbox.x += 40
    drive(scene, { cursorButton: 'down', selectedElementsAreBeingDragged: true })
    drive(scene, { cursorButton: 'up' })

    // The first debounce would have fired at 450ms; the re-stage restarted it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(onCanvasChange).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(onCanvasChange).toHaveBeenCalledTimes(1)
    expect(onCanvasChange.mock.calls[0][0][0].x).toBe(inbox.x)
  })
})
