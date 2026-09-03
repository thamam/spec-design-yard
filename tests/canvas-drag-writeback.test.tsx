import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'

// Same stub strategy as canvas-adapter-integration.test.tsx: intercept the
// real (dynamically imported) Excalidraw package so the canvas "mounts" in
// jsdom and we can drive its onChange like a user gesture.
const captured = vi.hoisted(() => ({
  props: null as any,
}))

vi.mock('@excalidraw/excalidraw', () => {
  const Excalidraw = (props: any) => {
    captured.props = props
    React.useEffect(() => {
      props.excalidrawAPI?.({
        updateScene: vi.fn(),
        scrollToContent: vi.fn(),
      })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return null
  }
  return { Excalidraw, WelcomeScreen: undefined, default: Excalidraw }
})

import Workspace from '../components/Workspace'
import { compileSpecToExcalidrawElements } from '../components/workspace/excalidraw-canvas'
import { parseSpec } from '../lib/spec-model'

/** Flush the next/dynamic import and mount effects until the stub has captured Excalidraw's props. */
async function flushUntilCanvasMounted() {
  for (let i = 0; i < 20 && !captured.props; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
  }
  expect(captured.props).not.toBeNull()
}

describe('canvas drag → YAML writeback (end-to-end through WorkspaceLayout)', () => {
  beforeEach(() => {
    captured.props = null
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  test('dragging a compiled rect updates the component x/y in the YAML after the debounce', async () => {
    render(<Workspace />)
    await flushUntilCanvasMounted()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const { spec } = parseSpec(textarea.value)
    expect(spec).toBeTruthy()

    // Compile the same scene the adapter is holding, then simulate the user
    // dragging the `inbox` rect to a new position.
    const compiled = compileSpecToExcalidrawElements(spec)
    const inboxRect = compiled.find((el: any) => el.id === 'inbox' && el.type === 'rectangle')
    expect(inboxRect).toBeTruthy()

    const dragX = inboxRect.x + 40
    const dragY = inboxRect.y + 25

    // Drive it the way Excalidraw really does: it takes ownership of the
    // elements it is handed and MUTATES them in place during a drag. Building a
    // fresh array here instead hid a bug for a long time — the adapter used to
    // hand over its own compile baseline, so a real drag moved the baseline too
    // and the move was invisible to the differ.
    const scene = captured.props.initialData.elements
    const sceneInbox = scene.find((el: any) => el.id === 'inbox' && el.type === 'rectangle')
    expect(sceneInbox).toBeTruthy()
    expect(sceneInbox).not.toBe(inboxRect)

    act(() => {
      // pointer down on the canvas: the gesture the writeback requires
      captured.props.onChange(scene, { cursorButton: 'down' })
    })
    sceneInbox.x = dragX
    sceneInbox.y = dragY

    act(() => {
      captured.props.onChange(scene, { cursorButton: 'up' })
    })

    // The adapter stages rect moves behind a 450ms idle debounce; the YAML
    // must not change mid-gesture.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(textarea.value).not.toContain('x:')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    // handleCanvasChange wrapped the moved rects into a "coords" change and
    // reconcileSpec wrote rounded x/y back into the spec.
    const { spec: updated } = parseSpec(textarea.value)
    const inbox = updated?.system?.components?.find((c: any) => c.id === 'inbox')
    expect(inbox).toBeTruthy()
    expect(inbox!.x).toBe(Math.round(dragX))
    expect(inbox!.y).toBe(Math.round(dragY))

    // Comment preservation is a product invariant of the YAML write path.
    expect(textarea.value).toContain('# Attaching Bricks')

    // A drag persists only the component that moved. Pinning the whole scene
    // rewrote the document under the user's caret and, because auto-layout
    // slots then shifted, made the remaining components twitch.
    const digest = updated?.system?.components?.find((c: any) => c.id === 'digest_stage')
    expect(digest).toBeTruthy()
    expect(digest!.x).toBeUndefined()
    expect(digest!.y).toBeUndefined()
  })
})
