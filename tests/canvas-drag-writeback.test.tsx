import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
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
        // The zoom-to-fit path calls this; the real API has it and the stub
        // must too, or the adapter throws on mount.
        getSceneElements: vi.fn(() => []),
      })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return null
  }
  // Excalidraw renders <Footer>'s children into its own footer region; a
  // passthrough keeps the stub's shape honest even though this Excalidraw
  // stub renders nothing.
  const Footer = (props: any) => props.children
  return { Excalidraw, Footer, WelcomeScreen: undefined, default: Excalidraw }
})

import Workspace from '../components/Workspace'
import { compileSpecToExcalidrawElements } from '../components/workspace/excalidraw-canvas'
import { parseSpec } from '../lib/spec-model'
import { seedDemoSpec } from './demo-spec'

/** Flush hydration + the next/dynamic import until the stub has captured Excalidraw's props. */
async function flushUntilCanvasMounted() {
  for (let i = 0; i < 40 && !captured.props; i++) {
    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(10)
    })
  }
  expect(captured.props).not.toBeNull()
}

describe('canvas drag → YAML writeback (end-to-end through WorkspaceLayout)', () => {
  beforeEach(() => {
    captured.props = null
    vi.useFakeTimers()
    seedDemoSpec()
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

  test('a staged drag still writes back after a YAML edit that did not move those ids', async () => {
    render(<Workspace />)
    await flushUntilCanvasMounted()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const { spec } = parseSpec(textarea.value)
    const compiled = compileSpecToExcalidrawElements(spec)
    const inboxRect = compiled.find((el: any) => el.id === 'inbox' && el.type === 'rectangle')
    const scene = captured.props.initialData.elements
    const sceneInbox = scene.find((el: any) => el.id === 'inbox' && el.type === 'rectangle')

    const dragX = inboxRect.x + 40
    const dragY = inboxRect.y + 25
    act(() => {
      captured.props.onChange(scene, { cursorButton: 'down' })
    })
    sceneInbox.x = dragX
    sceneInbox.y = dragY
    act(() => {
      captured.props.onChange(scene, { cursorButton: 'up' })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    // Type a comment — recompiles the spec without changing inbox coords.
    fireEvent.change(textarea, {
      target: { value: textarea.value.replace('# Attaching Bricks', '# Attaching Bricks\n    # typed during debounce') },
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    const { spec: updated } = parseSpec(textarea.value)
    const inbox = updated?.system?.components?.find((c: any) => c.id === 'inbox')
    expect(inbox!.x).toBe(Math.round(dragX))
    expect(inbox!.y).toBe(Math.round(dragY))
    expect(textarea.value).toContain('typed during debounce')
  })

  test('drag writeback keeps the YAML caret where the user was typing', async () => {
    render(<Workspace />)
    await flushUntilCanvasMounted()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const { spec } = parseSpec(textarea.value)
    const compiled = compileSpecToExcalidrawElements(spec)
    const inboxRect = compiled.find((el: any) => el.id === 'inbox' && el.type === 'rectangle')
    const scene = captured.props.initialData.elements
    const sceneInbox = scene.find((el: any) => el.id === 'inbox' && el.type === 'rectangle')

    const caret = textarea.value.indexOf('# Attaching Bricks')
    expect(caret).toBeGreaterThan(0)
    textarea.focus()
    textarea.setSelectionRange(caret, caret)
    fireEvent.select(textarea)
    expect(textarea.selectionStart).toBe(caret)

    const dragX = inboxRect.x + 40
    const dragY = inboxRect.y + 25
    act(() => {
      captured.props.onChange(scene, { cursorButton: 'down' })
    })
    sceneInbox.x = dragX
    sceneInbox.y = dragY
    act(() => {
      captured.props.onChange(scene, { cursorButton: 'up' })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    // Type a comment at the caret during the 450ms debounce — the live
    // report: position holds and the comment survives, then writeback
    // jumped the caret to EOF so further keystrokes appended at the bottom.
    const insertion = '\n    # typed during debounce'
    const nextValue = textarea.value.slice(0, caret) + insertion + textarea.value.slice(caret)
    const afterType = caret + insertion.length
    fireEvent.change(textarea, {
      target: { value: nextValue, selectionStart: afterType, selectionEnd: afterType },
    })
    textarea.setSelectionRange(afterType, afterType)
    fireEvent.select(textarea)
    expect(textarea.selectionStart).toBe(afterType)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    const { spec: updated } = parseSpec(textarea.value)
    const inbox = updated?.system?.components?.find((c: any) => c.id === 'inbox')
    expect(inbox!.x).toBe(Math.round(dragX))
    expect(inbox!.y).toBe(Math.round(dragY))
    expect(textarea.value).toContain('typed during debounce')
    expect(textarea.selectionStart).toBe(afterType)
    expect(textarea.selectionEnd).toBe(afterType)
    expect(textarea.selectionStart).not.toBe(textarea.value.length)
  })

  test('drag writeback does not steal focus back into the YAML editor', async () => {
    render(<Workspace />)
    await flushUntilCanvasMounted()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const { spec } = parseSpec(textarea.value)
    const compiled = compileSpecToExcalidrawElements(spec)
    const inboxRect = compiled.find((el: any) => el.id === 'inbox' && el.type === 'rectangle')
    const scene = captured.props.initialData.elements
    const sceneInbox = scene.find((el: any) => el.id === 'inbox' && el.type === 'rectangle')

    textarea.focus()
    textarea.setSelectionRange(32, 32)
    fireEvent.select(textarea)
    textarea.blur()
    expect(document.activeElement).not.toBe(textarea)

    act(() => {
      captured.props.onChange(scene, { cursorButton: 'down' })
    })
    sceneInbox.x = inboxRect.x + 40
    sceneInbox.y = inboxRect.y + 25
    act(() => {
      captured.props.onChange(scene, { cursorButton: 'up' })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(document.activeElement).not.toBe(textarea)
  })

  test('a far-miss leftover arrow does not starve a later good bind from writing YAML', async () => {
    render(<Workspace />)
    await flushUntilCanvasMounted()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const simple = `system:
  name: Beta
  components:
    - id: orphan
      type: Stage
      name: Orphan
    - id: vault
      type: Store
      name: Vault
`
    fireEvent.change(textarea, { target: { value: simple } })
    await act(async () => {
      await Promise.resolve()
    })

    const { spec } = parseSpec(textarea.value)
    const compiled = compileSpecToExcalidrawElements(spec)
    const far = {
      type: 'arrow',
      id: 'aFar',
      isDeleted: false,
      x: 2000,
      y: 2000,
      width: 10,
      height: 0,
      points: [
        [0, 0],
        [10, 0],
      ],
    }
    const good = {
      type: 'arrow',
      id: 'aGood',
      isDeleted: false,
      startBinding: { elementId: 'orphan' },
      endBinding: { elementId: 'vault' },
    }

    act(() => {
      captured.props.onChange([...compiled, far], { cursorButton: 'up' })
    })
    expect(textarea.value).not.toMatch(/target:\s*vault/)

    act(() => {
      captured.props.onChange([...compiled, far, good], { cursorButton: 'up' })
    })

    const { spec: updated } = parseSpec(textarea.value)
    const orphan = updated?.system?.components?.find((c: any) => c.id === 'orphan')
    const targets = (orphan?.connections || []).map((c: any) => (typeof c === 'string' ? c : c.target))
    expect(targets).toContain('vault')
    // The far-miss itself must not invent a connection.
    expect(textarea.value.match(/target:/g)?.length).toBe(1)
  })
})
