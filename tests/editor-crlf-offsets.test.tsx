import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { EditorPanel } from '../components/workspace/editor-panel'

// A textarea's `value`, `selectionStart` and `selectionEnd` speak the DOM's
// API value, in which every line break is a single LF. The controlled prop
// keeps whatever the project file had — CRLF included. jsdom implements that
// normalisation, so these tests reproduce the real coordinate mismatch: the
// offsets below are LF offsets, the prop is CRLF, and every assertion is on
// the string the editor hands back to the store — and thence to autosave.

const CRLF_SPEC = 'system:\r\n  name: X'
/** The same text as the textarea reports it — one char shorter per CRLF. */
const LF_VIEW = 'system:\n  name: X'

/** A panel whose spec text really updates, so the caret lands in a live value. */
function ControlledPanel({ initial, onWrite }: { initial: string; onWrite: (v: string) => void }) {
  const [text, setText] = React.useState(initial)
  return (
    <EditorPanel
      specText={text}
      setSpecText={(val: any) => {
        const next = typeof val === 'function' ? val(text) : val
        onWrite(next)
        setText(next)
      }}
      isHydrated
    />
  )
}

function renderWithSpec(specText: string) {
  const setSpecText = vi.fn()
  render(<EditorPanel specText={specText} setSpecText={setSpecText} isHydrated />)
  const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
  return { textarea, setSpecText }
}

function lastWrite(setSpecText: { mock: { calls: any[][] } }): string {
  expect(setSpecText.mock.calls.length).toBeGreaterThan(0)
  return setSpecText.mock.calls.at(-1)![0] as string
}

function placeCaret(textarea: HTMLTextAreaElement, start: number, end = start) {
  textarea.focus()
  textarea.setSelectionRange(start, end)
  fireEvent.select(textarea)
}

describe('a CRLF spec survives the editor keyboard handlers', () => {
  test('the textarea really does report an LF-normalised view of a CRLF prop', () => {
    const { textarea } = renderWithSpec(CRLF_SPEC)
    expect(textarea.value).toBe(LF_VIEW)
    expect(textarea.value.length).toBe(CRLF_SPEC.length - 1)
  })

  test('Tab at the end of a CRLF spec indents at the end, not inside the last line', () => {
    const { textarea, setSpecText } = renderWithSpec(CRLF_SPEC)
    placeCaret(textarea, LF_VIEW.length)

    fireEvent.keyDown(textarea, { key: 'Tab' })

    // The defect spliced an LF offset into the CRLF string and landed two
    // spaces before "X": 'system:\r\n  name:   X'.
    expect(lastWrite(setSpecText)).toBe('system:\r\n  name: X  ')
  })

  test('Shift+Tab on a CRLF spec outdents the line the caret is actually on', () => {
    // Four CRLF lines: an LF offset on the last line resolves, in raw
    // coordinates, to a position on the line above it.
    const spec = '  a\r\n  b\r\n  c\r\n  d'
    const { textarea, setSpecText } = renderWithSpec(spec)
    placeCaret(textarea, 12) // start of "  d" in the LF view

    fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true })

    // The defect outdented "  c" and left "  d" alone.
    expect(lastWrite(setSpecText)).toBe('  a\r\n  b\r\n  c\r\nd')
  })

  test('Enter on a CRLF spec breaks at the caret and inserts a CRLF, not a bare LF', () => {
    const spec = 'system:\r\n  metadata:'
    const { textarea, setSpecText } = renderWithSpec(spec)
    placeCaret(textarea, textarea.value.length)

    fireEvent.keyDown(textarea, { key: 'Enter' })

    // Block-opening key at indent 2 -> the new line starts at indent 4. The
    // defect broke the line one character early, between "metadata" and ":".
    expect(lastWrite(setSpecText)).toBe('system:\r\n  metadata:\r\n    ')
  })

  test('Enter on an LF spec still inserts a bare LF', () => {
    const spec = 'system:\n  metadata:'
    const { textarea, setSpecText } = renderWithSpec(spec)
    placeCaret(textarea, textarea.value.length)

    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(lastWrite(setSpecText)).toBe('system:\n  metadata:\n    ')
  })

  test('the suggestion popup on a CRLF spec reads the caret the user sees', () => {
    const spec = 'system:\r\n  components:\r\n    - id: node_x\r\n      type: S'
    const { textarea, setSpecText } = renderWithSpec(spec)
    placeCaret(textarea, textarea.value.length)

    // Three CRLFs of drift put the raw cursor inside "type", so the defect
    // offered component-field keys ("type:") instead of type values.
    expect(screen.getByText('Store')).toBeInTheDocument()

    fireEvent.keyDown(textarea, { key: 'Tab' })

    expect(lastWrite(setSpecText)).toBe(
      'system:\r\n  components:\r\n    - id: node_x\r\n      type: Store'
    )
  })
})

describe('a CRLF spec keeps the caret in the textarea coordinate space', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('the caret restored after Shift+Tab is a DOM offset, not a raw-string one', () => {
    const writes: string[] = []
    render(<ControlledPanel initial={'  a\r\n  b\r\n  c\r\n  d'} onWrite={(v) => writes.push(v)} />)
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    placeCaret(textarea, 12)

    act(() => {
      fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true })
    })
    act(() => {
      vi.advanceTimersByTime(0)
    })

    expect(writes.at(-1)).toBe('  a\r\n  b\r\n  c\r\nd')
    // Raw offset 15 in '  a\r\n  b\r\n  c\r\nd'; the LF view is 13 chars long,
    // so handing the raw offset to setSelectionRange clamps it to 13.
    expect(textarea.value).toBe('  a\n  b\n  c\nd')
    expect(textarea.selectionStart).toBe(12)
    expect(textarea.selectionEnd).toBe(12)
  })
})
