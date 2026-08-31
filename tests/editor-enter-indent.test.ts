import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { detectIndentContext } from '../lib/autocomplete'
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

  test('classifies a connections list-item line: indent 8, parent "connections", does not open a block', () => {
    const cursor = mockSpec.indexOf('        - target: digest_stage') + '        - target: digest_stage'.length
    const ctx = detectIndentContext(mockSpec, cursor)
    expect(ctx.indentLevel).toBe(8)
    expect(ctx.parentBlock).toBe('connections')
    expect(ctx.opensBlock).toBe(false)
  })

  test('a blank line falls back to indentLevel 0 with no parent block', () => {
    const ctx = detectIndentContext('', 0)
    expect(ctx.indentLevel).toBe(0)
    expect(ctx.parentBlock).toBe('')
    expect(ctx.opensBlock).toBe(false)
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

  test('Enter inside a connections list item matches the sibling indent', async () => {
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

    expect(textarea.value).toBe('connections:\n      - target: digest_stage\n      ')
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

describe('CodeTab Enter caret restore (setTimeout flush)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('Enter restores the caret to right after the inserted indent', async () => {
    render(React.createElement(Workspace))
    vi.useRealTimers()
    await waitForWorkspaceHydration()
    vi.useFakeTimers()

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

    act(() => {
      vi.advanceTimersByTime(0)
    })

    const expectedCaret = 'system:\n  metadata:\n    '.length
    expect(textarea.selectionStart).toBe(expectedCaret)
    expect(textarea.selectionEnd).toBe(expectedCaret)
  })
})
