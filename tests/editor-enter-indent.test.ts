import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { detectIndentContext, getAutocompleteSuggestions } from '../lib/autocomplete'
import Workspace from '../components/Workspace'
import { waitForWorkspaceHydration } from './wait-for-hydration'

describe('detectIndentContext', () => {
  const mockSpec = `system:
  name: External Brain
  components:
    - id: inbox
      type: Store
      name: inbox/
      connections:
        - target: digest_stage
    - id: digest_stage
      type: Stage
      name: digest
`

  test('classifies a component-property line: indent 6, parent "component", opens a block', () => {
    const cursor = mockSpec.indexOf('      connections:') + '      connections:'.length
    const ctx = detectIndentContext(mockSpec, cursor)
    expect(ctx.indentLevel).toBe(6)
    expect(ctx.parentBlock).toBe('component')
    expect(ctx.opensBlock).toBe(true)
  })

  test('classifies a connections list-item line: indent 8, parent "connections", opens a mapping (a sibling "label:" can follow, aligned under "target")', () => {
    const cursor = mockSpec.indexOf('        - target: digest_stage') + '        - target: digest_stage'.length
    const ctx = detectIndentContext(mockSpec, cursor)
    expect(ctx.indentLevel).toBe(8)
    expect(ctx.parentBlock).toBe('connections')
    expect(ctx.opensBlock).toBe(true)
  })

  test('a blank line falls back to indentLevel 0 with no parent block', () => {
    const ctx = detectIndentContext('', 0)
    expect(ctx.indentLevel).toBe(0)
    expect(ctx.parentBlock).toBe('')
    expect(ctx.opensBlock).toBe(false)
  })

  test('a whitespace-only line inside a block keeps its own indent instead of collapsing to 0', () => {
    const spec = 'system:\n  metadata:\n    '
    const ctx = detectIndentContext(spec, spec.length)
    expect(ctx.indentLevel).toBe(4)
    expect(ctx.opensBlock).toBe(false)
  })

  test('a block-opening key with a trailing comment still opens a block', () => {
    const line = '  metadata: # keep this comment'
    const ctx = detectIndentContext(line, line.length)
    expect(ctx.opensBlock).toBe(true)
    expect(ctx.indentLevel).toBe(2)
  })

  test('a list-item mapping entry ("- id: inbox") opens a mapping keyed under the id', () => {
    const line = '    - id: inbox'
    const ctx = detectIndentContext(line, line.length)
    expect(ctx.opensBlock).toBe(true)
    expect(ctx.indentLevel).toBe(4)
  })

  test('a "#" inside a single-quoted key is not treated as a comment', () => {
    const line = "  'a#b':"
    const ctx = detectIndentContext(line, line.length)
    expect(ctx.opensBlock).toBe(true)
  })

  test('a "#" inside a double-quoted key is not treated as a comment', () => {
    const line = '  "a#b":'
    const ctx = detectIndentContext(line, line.length)
    expect(ctx.opensBlock).toBe(true)
  })

  test('a backslash-escaped quote inside a double-quoted key does not end the quote early, so a following "#" stays quoted', () => {
    const line = '  "a\\"#b":'
    const ctx = detectIndentContext(line, line.length)
    expect(ctx.opensBlock).toBe(true)
  })
})

describe('CodeTab Enter auto-indent', () => {
  test('Enter after a block-opening line indents one level deeper', async () => {
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement

    const value = 'system:\n  metadata:'
    fireEvent.change(textarea, { target: { value } })
    textarea.focus()
    const caret = value.length
    textarea.setSelectionRange(caret, caret)
    fireEvent.select(textarea)

    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(textarea.value).toBe('system:\n  metadata:\n    ')
    expect(textarea.selectionStart).toBe(value.length + 1 + 4)
  })

  test('Enter on an indented blank line continues at that line\'s indent instead of dropping to column 0', async () => {
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement

    const value = 'system:\n  metadata:\n    '
    fireEvent.change(textarea, { target: { value } })
    textarea.focus()
    const caret = value.length
    textarea.setSelectionRange(caret, caret)
    fireEvent.select(textarea)

    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(textarea.value).toBe(value + '\n    ')
  })

  test('Enter inside a connections list item aligns under the key, so a sibling "label:" can follow', async () => {
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement

    const value = 'connections:\n      - target: digest_stage'
    fireEvent.change(textarea, { target: { value } })
    textarea.focus()
    const caret = value.length
    textarea.setSelectionRange(caret, caret)
    fireEvent.select(textarea)

    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(textarea.value).toBe('connections:\n      - target: digest_stage\n        ')
  })

  test('Enter on a top-level line with no trailing colon stays at column 0', async () => {
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement

    const value = 'name: My System'
    fireEvent.change(textarea, { target: { value } })
    textarea.focus()
    const caret = value.length
    textarea.setSelectionRange(caret, caret)
    fireEvent.select(textarea)

    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(textarea.value).toBe('name: My System\n')
  })

  test('a navigated suggestion still applies on Enter instead of a bare newline', async () => {
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement

    const value = 'system:\n  components:\n    - id: node_x\n      type: S'
    fireEvent.change(textarea, { target: { value } })
    textarea.focus()
    textarea.setSelectionRange(value.length, value.length)
    fireEvent.select(textarea)

    fireEvent.keyDown(textarea, { key: 'ArrowDown' })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(textarea.value).toContain('type: Stage')
    expect(textarea.value).not.toContain('\n      type: S\n')
  })
})

describe('CodeTab Enter caret restore (layout effect)', () => {
  // Named for the mechanism that exists. This suite used to say "setTimeout
  // flush" and drove fake timers to flush a timer 7e92d1d deleted when the
  // restore moved into a layout effect — the same rot FIX Z fixed in
  // tests/keyboard-autocomplete-and-fix-all.test.tsx, missed here.
  test('Enter restores the caret to right after the inserted indent', async () => {
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const value = 'system:\n  metadata:'
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
      fireEvent.keyDown(textarea, { key: 'Enter' })
    })

    const expectedCaret = 'system:\n  metadata:\n    '.length
    expect(textarea.selectionStart).toBe(expectedCaret)
    expect(textarea.selectionEnd).toBe(expectedCaret)
  })
})

describe('the shared detector does not change autocomplete on a blank line', () => {
  // The detector was EXTRACTED from lib/autocomplete.ts so Enter could reuse
  // it — not reimplemented. Enter needs a whitespace-only line to report its
  // literal indent (so the next line continues the block); main's inline
  // autocomplete detector reported 0. Sharing the literal behaviour silently
  // changed what the popup offers.
  test('autocomplete offers nothing at the end of a whitespace-only line', () => {
    const spec = 'system:\n    '
    const result = getAutocompleteSuggestions(spec, spec.length)
    expect(result.suggestions).toEqual([])
    expect(result.type).toBeNull()
  })

  test('the detector still reports the literal indent for Enter', () => {
    const spec = 'system:\n    '
    expect(detectIndentContext(spec, spec.length).indentLevel).toBe(4)
    expect(detectIndentContext(spec, spec.length, { blankLine: 'literal' }).indentLevel).toBe(4)
    expect(detectIndentContext(spec, spec.length, { blankLine: 'zero' }).indentLevel).toBe(0)
  })

  test('Enter on a whitespace-only line inside a block keeps that indent', () => {
    const spec = 'system:\n  metadata:\n    '
    const ctx = detectIndentContext(spec, spec.length)
    expect(ctx.indentLevel).toBe(4)
    expect(ctx.opensBlock).toBe(false)
  })
})

describe('IME composition owns Enter and Tab', () => {
  // A Japanese or Chinese user presses Enter to COMMIT an in-flight
  // composition candidate. Intercepting it inserts an indented newline (or
  // accepts a suggestion) and throws the composition away.
  async function editor() {
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'system:\n  metadata:' } })
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    fireEvent.select(textarea)
    return textarea
  }

  test('Enter while composing is left to the IME', async () => {
    const textarea = await editor()
    const notPrevented = fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true })
    expect(notPrevented).toBe(true) // nothing called preventDefault
    expect(textarea.value).toBe('system:\n  metadata:')
  })

  test('Tab while composing is left to the IME', async () => {
    const textarea = await editor()
    const notPrevented = fireEvent.keyDown(textarea, { key: 'Tab', isComposing: true })
    expect(notPrevented).toBe(true)
    expect(textarea.value).toBe('system:\n  metadata:')
  })

  test('keyCode 229 — the legacy IME signal — is left alone too', async () => {
    const textarea = await editor()
    const notPrevented = fireEvent.keyDown(textarea, { key: 'Enter', keyCode: 229 })
    expect(notPrevented).toBe(true)
    expect(textarea.value).toBe('system:\n  metadata:')
  })

  test('a plain Enter still indents', async () => {
    const textarea = await editor()
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(textarea.value).toBe('system:\n  metadata:\n    ')
  })
})

describe('Enter mid-line decides the block from the text before the caret', () => {
  // The text AFTER the caret moves to the new line, so it cannot be what
  // decides whether the current line opens a block.
  test('Enter after a block-opening colon nests what follows', async () => {
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement

    const value = 'system:\n  metadata:owner: Tomer'
    fireEvent.change(textarea, { target: { value } })
    textarea.focus()
    const caret = value.indexOf('  metadata:') + '  metadata:'.length
    textarea.setSelectionRange(caret, caret)
    fireEvent.select(textarea)

    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(textarea.value).toBe('system:\n  metadata:\n    owner: Tomer')
  })

  test('Enter at the end of a line is unchanged', async () => {
    render(React.createElement(Workspace))
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement

    const value = 'system:\n  metadata:'
    fireEvent.change(textarea, { target: { value } })
    textarea.focus()
    textarea.setSelectionRange(value.length, value.length)
    fireEvent.select(textarea)

    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(textarea.value).toBe('system:\n  metadata:\n    ')
  })

  test('the detector can be asked to look only at the text before the caret', () => {
    const line = '  metadata:owner: Tomer'
    const spec = 'system:\n' + line
    const caret = spec.indexOf('  metadata:') + '  metadata:'.length
    expect(detectIndentContext(spec, caret).opensBlock).toBe(false)
    expect(detectIndentContext(spec, caret, { upToCursor: true }).opensBlock).toBe(true)
  })
})

describe('YAML shapes the block detector was getting wrong', () => {
  // All three are reachable in this app's own specs, and all three are about
  // the same question: does this line open a block the next line belongs in?

  test('a block-scalar opener nests what follows', () => {
    // `description: |` is how a multi-line description is written, and the
    // next line belongs INSIDE it. Ending in "|" rather than ":" is what the
    // endsWith(":") test missed.
    for (const opener of ['      description: |', '      description: >']) {
      const spec = 'system:\n' + opener
      expect(detectIndentContext(spec, spec.length).opensBlock).toBe(true)
    }
  })

  test('the block-scalar chomping and indent indicators are opener syntax too', () => {
    for (const opener of ['  d: |-', '  d: |+', '  d: >-', '  d: |2', '  d: |2-']) {
      const spec = 'system:\n' + opener
      expect(detectIndentContext(spec, spec.length).opensBlock).toBe(true)
    }
  })

  test('a "#" inside a key is not a comment', () => {
    // YAML starts a comment at "#" only at the start of a line or after
    // whitespace. Cutting at any unquoted "#" truncated the line to "a" and
    // hid the colon, so the key never opened its block.
    const line = '  a#b:'
    const spec = 'system:\n' + line
    expect(detectIndentContext(spec, spec.length).opensBlock).toBe(true)
  })

  test('a real trailing comment is still stripped', () => {
    const line = '  metadata: # keep this comment'
    expect(detectIndentContext(line, line.length).opensBlock).toBe(true)
    const notAnOpener = '  name: x # trailing'
    expect(detectIndentContext(notAnOpener, notAnOpener.length).opensBlock).toBe(false)
  })

  test('a quoted list scalar is not a mapping entry', () => {
    // `- "key: value"` is one string in a sequence, not a mapping that opens
    // a block; indenting under it puts the next line nowhere useful.
    for (const item of ['    - "key: value"', "    - 'key: value'"]) {
      const spec = 'system:\n' + item
      expect(detectIndentContext(spec, spec.length).opensBlock).toBe(false)
    }
  })

  test('an unquoted list mapping entry still opens a block', () => {
    // Decision 2's case, unchanged: "- id: inbox" opens a mapping whose
    // sibling keys align under "id".
    const line = '    - id: inbox'
    expect(detectIndentContext(line, line.length).opensBlock).toBe(true)
  })
})
