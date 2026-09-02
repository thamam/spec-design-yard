import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { applyIndent } from '../lib/editor-indent'
import Workspace from '../components/Workspace'
import { waitForWorkspaceHydration } from './wait-for-hydration'

describe('applyIndent', () => {
  test('Tab at a bare caret inserts 2 spaces at the caret position', () => {
    const text = 'id: inbox'
    const caret = 3
    const result = applyIndent(text, caret, caret)
    expect(result.text).toBe('id:   inbox')
    expect(result.selStart).toBe(5)
    expect(result.selEnd).toBe(5)
  })

  test('Tab over an in-line selection replaces it with 2 spaces', () => {
    const text = 'id: inbox'
    const result = applyIndent(text, 4, 9)
    expect(result.text).toBe('id:   ')
    expect(result.selStart).toBe(6)
    expect(result.selEnd).toBe(6)
  })

  test('Shift+Tab removes up to 2 leading spaces from the current line regardless of caret column', () => {
    const text = '    id: inbox'
    const caret = 8
    const result = applyIndent(text, caret, caret, { outdent: true })
    expect(result.text).toBe('  id: inbox')
    expect(result.selStart).toBe(6)
    expect(result.selEnd).toBe(6)
  })

  test('Shift+Tab removes only 1 space when the line has just 1 leading space', () => {
    const text = ' id: inbox'
    const result = applyIndent(text, 0, 0, { outdent: true })
    expect(result.text).toBe('id: inbox')
  })

  test('Shift+Tab is a no-op on a line with no leading whitespace', () => {
    const text = 'id: inbox'
    const result = applyIndent(text, 3, 3, { outdent: true })
    expect(result.text).toBe('id: inbox')
    expect(result.selStart).toBe(3)
  })

  test('Tab over a multi-line selection indents every touched line and preserves the selection span', () => {
    const text = 'a\nb\nc\nd'
    // selection spans lines "b" and "c" (indices 2..5)
    const result = applyIndent(text, 2, 5)
    expect(result.text).toBe('a\n  b\n  c\nd')
    expect(result.selStart).toBe(4)
    expect(result.selEnd).toBe(9)
  })

  test('Shift+Tab outdents every line touched by a 3-line selection, each indented at least 2 spaces', () => {
    const text = '  a\n  b\n  c\n  d'
    // selection spans the first three lines
    const selStart = 0
    const selEnd = text.indexOf('  c') + '  c'.length
    const result = applyIndent(text, selStart, selEnd, { outdent: true })
    expect(result.text).toBe('a\nb\nc\n  d')
    expect(result.selStart).toBe(0)
    expect(result.selEnd).toBe('a\nb\nc'.length)
  })

  test('multi-line indent does not touch a trailing line only reached via a boundary-ending selection', () => {
    const text = 'a\nb\nc'
    // selection ends exactly at the newline after "b" (index 4), so "c" is untouched
    const result = applyIndent(text, 0, 4)
    expect(result.text).toBe('  a\n  b\nc')
  })

  test('multi-line outdent maps selEnd using only its own line\'s removed indentation, not every touched line\'s', () => {
    const text = '  a\n  b'
    // selEnd (5) sits on the second space of line two's indent; after that
    // line's 2 spaces are removed it should land at index 2, the start of "b" —
    // not have line one's removal subtracted again.
    const result = applyIndent(text, 0, 5, { outdent: true })
    expect(result.text).toBe('a\nb')
    expect(result.selEnd).toBe(2)
  })
})

describe('CodeTab Tab/Shift+Tab wiring', () => {
  test('Tab inserts a 2-space indent at the caret when the suggestion popup is closed', async () => {
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement

    const value = 'system:\n  name: hello'
    fireEvent.change(textarea, { target: { value } })
    textarea.focus()
    const caret = value.length
    textarea.setSelectionRange(caret, caret)
    fireEvent.select(textarea)

    fireEvent.keyDown(textarea, { key: 'Tab' })

    expect(textarea.value).toBe('system:\n  name: hello  ')
  })

  test('Shift+Tab outdents every line of a multi-line selection', async () => {
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement

    const value = 'system:\n  name: hi\n  desc: yo\n'
    fireEvent.change(textarea, { target: { value } })
    textarea.focus()
    const selStart = value.indexOf('  name')
    const selEnd = value.indexOf('  desc: yo') + '  desc: yo'.length
    textarea.setSelectionRange(selStart, selEnd)
    fireEvent.select(textarea)

    fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true })

    expect(textarea.value).toBe('system:\nname: hi\ndesc: yo\n')
  })

  test('Esc then Tab does not insert an indent; a later Tab indents again', async () => {
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement

    const value = 'system:\n  name: hello'
    fireEvent.change(textarea, { target: { value } })
    textarea.focus()
    const caret = value.length
    textarea.setSelectionRange(caret, caret)
    fireEvent.select(textarea)

    fireEvent.keyDown(textarea, { key: 'Escape' })
    // jsdom won't actually move focus on Tab, so the observable proxy for
    // "the browser default will run" is that the handler did not call
    // preventDefault — fireEvent's return value reflects that.
    const notPrevented = fireEvent.keyDown(textarea, { key: 'Tab' })
    expect(notPrevented).toBe(true)
    expect(textarea.value).toBe(value)

    fireEvent.keyDown(textarea, { key: 'Tab' })
    expect(textarea.value).toBe('system:\n  name: hello  ')
  })
})

describe('CodeTab Tab/Shift+Tab caret restore (setTimeout flush)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('Tab restores the caret after the value round-trips through the parent store', async () => {
    render(React.createElement(Workspace))
    // waitFor polls on real timers; switch to fake only after hydration
    vi.useRealTimers()
    await waitForWorkspaceHydration()
    vi.useFakeTimers()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const value = 'system:\n  name: hello'
    act(() => {
      fireEvent.change(textarea, { target: { value } })
    })
    textarea.focus()
    const caret = value.length
    textarea.setSelectionRange(caret, caret)
    act(() => {
      fireEvent.select(textarea)
    })

    act(() => {
      fireEvent.keyDown(textarea, { key: 'Tab' })
    })

    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(textarea.selectionStart).toBe(caret + 2)
    expect(textarea.selectionEnd).toBe(caret + 2)
  })

  test('Shift+Tab restores the caret to the outdented position', async () => {
    render(React.createElement(Workspace))
    vi.useRealTimers()
    await waitForWorkspaceHydration()
    vi.useFakeTimers()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const value = '    id: inbox'
    act(() => {
      fireEvent.change(textarea, { target: { value } })
    })
    textarea.focus()
    textarea.setSelectionRange(8, 8)
    act(() => {
      fireEvent.select(textarea)
    })

    act(() => {
      fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true })
    })
    act(() => {
      vi.advanceTimersByTime(0)
    })

    expect(textarea.value).toBe('  id: inbox')
    expect(textarea.selectionStart).toBe(6)
    expect(textarea.selectionEnd).toBe(6)
  })
})

describe('CodeTab Tab indent + undo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('Tab indent, then Cmd+Z, restores the pre-indent text exactly once', async () => {
    render(React.createElement(Workspace))
    vi.useRealTimers()
    await waitForWorkspaceHydration()
    vi.useFakeTimers()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const baseline = 'system:\n  name: hello'
    act(() => {
      fireEvent.change(textarea, { target: { value: baseline } })
    })
    // Let the baseline commit to undo history before the indent edit — the
    // history debounce is 800ms, so this must be explicit or the two edits
    // coalesce into a single checkpoint.
    act(() => {
      vi.advanceTimersByTime(800)
    })

    textarea.focus()
    const caret = baseline.length
    textarea.setSelectionRange(caret, caret)
    act(() => {
      fireEvent.select(textarea)
    })

    act(() => {
      fireEvent.keyDown(textarea, { key: 'Tab' })
    })
    expect(textarea.value).toBe(baseline + '  ')

    act(() => {
      vi.advanceTimersByTime(800)
    })

    act(() => {
      fireEvent.keyDown(textarea, { key: 'z', metaKey: true })
    })

    expect(textarea.value).toBe(baseline)
  })
})

describe('Tab routing when the suggestion popup is open', () => {
  // The popup goes live at a 4-space indent inside `components:`, where the
  // component-field vocabulary applies. Earlier fixtures dodged this by
  // selecting indent-2 or non-YAML text, so the autocomplete branch never
  // competed with a real indent gesture.
  const VALUE = 'system:\n  components:\n    - id: alpha\n      type: Stage\n'
  const LINE_3 = VALUE.indexOf('    - id: alpha')
  const INTO_LINE_4 = VALUE.indexOf('      type: Stage') + '      type'.length

  async function setup(selStart: number, selEnd: number) {
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: VALUE } })
    textarea.focus()
    textarea.setSelectionRange(selStart, selEnd)
    fireEvent.select(textarea)
    // The popup really is claiming the keyboard for these fixtures.
    expect(screen.getByText('connections:')).toBeInTheDocument()
    return textarea
  }

  test('Tab over a multi-line selection indents instead of accepting a suggestion', async () => {
    const textarea = await setup(LINE_3, INTO_LINE_4)

    fireEvent.keyDown(textarea, { key: 'Tab' })

    expect(textarea.value).toBe(
      'system:\n  components:\n      - id: alpha\n        type: Stage\n'
    )
  })

  test('Shift+Tab over a multi-line selection outdents instead of accepting a suggestion', async () => {
    const textarea = await setup(LINE_3, INTO_LINE_4)

    fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true })

    expect(textarea.value).toBe(
      'system:\n  components:\n  - id: alpha\n    type: Stage\n'
    )
  })

  test('Shift+Tab at a collapsed caret outdents instead of accepting a suggestion', async () => {
    const textarea = await setup(LINE_3, LINE_3)

    fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true })

    expect(textarea.value).toBe(
      'system:\n  components:\n  - id: alpha\n      type: Stage\n'
    )
  })

  test('Tab at a collapsed caret still accepts the highlighted suggestion', async () => {
    // The other half of the contract: routing indent first must not take the
    // popup's Tab away from the ordinary single-caret case.
    const textarea = await setup(LINE_3, LINE_3)

    fireEvent.keyDown(textarea, { key: 'Tab' })

    expect(textarea.value).toBe(
      'system:\n  components:\nid:    - id: alpha\n      type: Stage\n'
    )
  })
})
