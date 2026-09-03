import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import yaml from 'yaml'
import { applyIndent } from '../lib/editor-indent'
import { EditorPanel } from '../components/workspace/editor-panel'
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

describe('CodeTab Tab/Shift+Tab caret restore (layout effect)', () => {
  // Named for the mechanism that exists. This suite used to say "setTimeout
  // flush" and drove fake timers to flush a timer 7e92d1d deleted when the
  // restore moved into a layout effect (editor-panel.tsx, the dependency-less
  // useIsomorphicLayoutEffect) — the same rot FIX Z fixed in
  // tests/keyboard-autocomplete-and-fix-all.test.tsx and
  // tests/editor-enter-indent.test.ts, missed here. The layout effect runs
  // inside the act() that dispatches the key, so the assertion needs no flush.
  test('Tab restores the caret after the value round-trips through the parent store', async () => {
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()

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

    expect(textarea.selectionStart).toBe(caret + 2)
    expect(textarea.selectionEnd).toBe(caret + 2)
  })

  test('Shift+Tab restores the caret to the outdented position', async () => {
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()

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
  // The popup goes live on a typed key prefix at a 4-space indent inside
  // `components:` (`c` → `connections:`). An empty query no longer opens
  // the popup (focus-progressive-disclosure); these fixtures keep a real
  // prefix so the autocomplete branch still competes with indent.
  const VALUE = 'system:\n  components:\n    - id: alpha\n      c\n      type: Stage\n'
  const AFTER_C = VALUE.indexOf('      c') + '      c'.length
  const INTO_TYPE = VALUE.indexOf('      type: Stage') + '      type'.length

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
    const textarea = await setup(AFTER_C, INTO_TYPE)

    fireEvent.keyDown(textarea, { key: 'Tab' })

    expect(textarea.value).toBe(
      'system:\n  components:\n    - id: alpha\n        c\n        type: Stage\n'
    )
  })

  test('Shift+Tab over a multi-line selection outdents instead of accepting a suggestion', async () => {
    const textarea = await setup(AFTER_C, INTO_TYPE)

    fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true })

    expect(textarea.value).toBe(
      'system:\n  components:\n    - id: alpha\n    c\n    type: Stage\n'
    )
  })

  test('Shift+Tab at a collapsed caret outdents instead of accepting a suggestion', async () => {
    const textarea = await setup(AFTER_C, AFTER_C)

    fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true })

    expect(textarea.value).toBe(
      'system:\n  components:\n    - id: alpha\n    c\n      type: Stage\n'
    )
  })

  // The other half of the contract: routing indent first must not take the
  // popup's Tab away from the ordinary single-caret case. This fixture puts
  // the caret at the end of a partial token on its own line, so accepting
  // produces YAML that parses.
  //
  // Empty-prefix popup on a blank indented line is now closed (see
  // getAutocompleteSuggestions + tests/autocomplete.test.ts). The old wart
  // of accepting `id:` at column 0 is gone with it.
  test('Tab at a collapsed caret still accepts the highlighted suggestion', async () => {
    const partial = 'system:\n  components:\n    - id: alpha\n      ty\n'
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: partial } })
    textarea.focus()
    const caret = partial.indexOf('      ty') + '      ty'.length
    textarea.setSelectionRange(caret, caret)
    fireEvent.select(textarea)
    expect(screen.getByText('type:')).toBeInTheDocument()

    fireEvent.keyDown(textarea, { key: 'Tab' })

    const completed = 'system:\n  components:\n    - id: alpha\n      type:\n'
    expect(textarea.value).toBe(completed)
    // "Structurally valid" as an assertion, not a claim in a comment.
    expect(yaml.parse(completed)).toEqual({
      system: { components: [{ id: 'alpha', type: null }] },
    })
  })
})

describe('a no-op indent must not arm the pending selection', () => {
  // Regression introduced by round-3 FIX M and caught in round 4. The layout
  // effect that restores the selection consumes a ref armed by the handler.
  // When applyIndent returns the text UNCHANGED (Shift+Tab on a line already
  // at indent 0) there is nothing for React to commit, so the effect never
  // runs and the ref stays armed — until some later, unrelated commit fires
  // it, at which point it steals focus back into the textarea and re-selects
  // a block the user has moved on from.
  // Green on base: in jsdom the intervening `select` event commits state and
  // the layout effect consumes the ref before this assertion can see it. Kept
  // as a guard on the user-visible property, not claimed as evidence.
  test('a stale range does not reclaim the caret the user has moved', async () => {
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement

    const value = 'aaa\nbbb\nccc'
    fireEvent.change(textarea, { target: { value } })
    textarea.focus()
    textarea.setSelectionRange(0, value.length)
    fireEvent.select(textarea)

    fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true })
    expect(textarea.value).toBe(value) // nothing to outdent at indent 0

    // The user collapses the selection somewhere else and carries on typing.
    textarea.setSelectionRange(5, 5)
    fireEvent.select(textarea)
    fireEvent.change(textarea, { target: { value: 'aaa\nbXbb\nccc' } })

    // The armed range (0..11) must not be reapplied over that caret.
    expect(textarea.selectionStart).not.toBe(0)
    expect(textarea.selectionEnd).not.toBe(11)
  })

  test('a no-op Shift+Tab does not steal focus on a later unrelated commit', async () => {
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement

    const value = 'aaa\nbbb\nccc'
    fireEvent.change(textarea, { target: { value } })
    textarea.focus()
    textarea.setSelectionRange(0, value.length)
    fireEvent.select(textarea)

    fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true })
    expect(textarea.value).toBe(value)

    // The user leaves the editor; something else commits (a diagnostics
    // recompute, an autosave tick) — here, an edit driven from outside.
    textarea.blur()
    expect(document.activeElement).not.toBe(textarea)

    fireEvent.change(textarea, { target: { value: value + '\nddd' } })

    expect(document.activeElement).not.toBe(textarea)
  })
})

describe('the Esc escape hatch is disarmed by any edit, not just a typed one', () => {
  test('a PROP-driven value change disarms it, so the next Tab indents', async () => {
    // The spec says any intervening edit disarms the one-shot escape. A typed
    // edit already did — handleTextareaChange clears the flag — so driving
    // the textarea's own change event proves nothing about the effect that
    // handles the OTHER case: Auto-Fix All, a canvas drag, a quick fix, all
    // of which arrive as a new `value` prop with no event on this element.
    const setSpecText = vi.fn()
    const { rerender } = render(
      React.createElement(EditorPanel, {
        specText: 'system:\n  name: hello',
        setSpecText,
        isHydrated: true,
      })
    )
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    fireEvent.select(textarea)

    fireEvent.keyDown(textarea, { key: 'Escape' })

    // An edit arrives from elsewhere in the app: a new prop, no change event.
    rerender(
      React.createElement(EditorPanel, {
        specText: 'system:\n  name: hello!',
        setSpecText,
        isHydrated: true,
      })
    )
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    fireEvent.select(textarea)

    // The escape is spent: Tab indents rather than moving focus out.
    const prevented = fireEvent.keyDown(textarea, { key: 'Tab' })
    expect(prevented).toBe(false)
    expect(setSpecText).toHaveBeenCalled()
    expect(setSpecText.mock.calls.at(-1)![0]).toBe('system:\n  name: hello!  ')
  })

  test('Esc then Tab with no intervening edit still releases focus', async () => {
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement

    const value = 'system:\n  name: hello'
    fireEvent.change(textarea, { target: { value } })
    textarea.focus()
    textarea.setSelectionRange(value.length, value.length)
    fireEvent.select(textarea)

    fireEvent.keyDown(textarea, { key: 'Escape' })
    const notPrevented = fireEvent.keyDown(textarea, { key: 'Tab' })
    expect(notPrevented).toBe(true)
    expect(textarea.value).toBe(value)
  })
})

describe('the Esc escape hatch survives a bare modifier keydown', () => {
  // Esc then Shift+Tab is the backwards escape. Pressing Shift dispatches a
  // keydown of its own before Tab arrives, and spending the one-shot latch on
  // it sent the Shift+Tab that followed to handleIndent, which prevented the
  // browser default and outdented the YAML instead of moving focus. Only the
  // forward escape worked. Found by the Codex PR review on 0d20105.
  test('Esc, Shift, then Shift+Tab leaves the browser default to move focus backwards', async () => {
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const value = '    id: inbox'
    fireEvent.change(textarea, { target: { value } })
    textarea.focus()
    textarea.setSelectionRange(8, 8)
    fireEvent.select(textarea)

    fireEvent.keyDown(textarea, { key: 'Escape' })
    fireEvent.keyDown(textarea, { key: 'Shift', shiftKey: true })
    const notPrevented = fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true })
    expect(notPrevented).toBe(true)
    expect(textarea.value).toBe(value)
  })

  // Already GREEN before the fix: a regression guard on the disarm path the
  // fix narrows, not evidence for it.
  test('a real keystroke between Esc and Tab still disarms the escape', async () => {
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const value = 'system:\n  name: hello'
    fireEvent.change(textarea, { target: { value } })
    textarea.focus()
    textarea.setSelectionRange(value.length, value.length)
    fireEvent.select(textarea)

    fireEvent.keyDown(textarea, { key: 'Escape' })
    fireEvent.keyDown(textarea, { key: 'ArrowLeft' })
    const prevented = fireEvent.keyDown(textarea, { key: 'Tab' })
    expect(prevented).toBe(false)
    expect(textarea.value).toBe(value + '  ')
  })
})
