import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import { waitForWorkspaceHydration } from './wait-for-hydration'

describe('Workspace Undo/Redo Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('integrates useUndoRedo with the workspace UI', async () => {
    render(<Workspace />)
    // waitFor polls on real timers; the fake-timer regime starts after hydration
    vi.useRealTimers()
    await waitForWorkspaceHydration()
    vi.useFakeTimers()

    // Verify initial textarea state
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const initialValue = textarea.value
    expect(initialValue).toContain('system:')

    // Query Undo and Redo buttons in the header
    const undoButton = screen.getByRole('button', { name: /^Undo$/i }) as HTMLButtonElement
    const redoButton = screen.getByRole('button', { name: /^Redo$/i }) as HTMLButtonElement

    expect(undoButton).toBeInTheDocument()
    expect(redoButton).toBeInTheDocument()

    // Initially, both should be disabled
    expect(undoButton.disabled).toBe(true)
    expect(redoButton.disabled).toBe(true)

    // Simulate user typing in the spec editor (this triggers onChange with isTyping: true)
    act(() => {
      fireEvent.change(textarea, { target: { value: 'system:\n  name: Edited Spec' } })
    })

    // At this point, the text is updated visually, but debounce timer hasn't fired yet
    expect(textarea.value).toBe('system:\n  name: Edited Spec')
    expect(undoButton.disabled).toBe(true)

    // Fast-forward time so the debounce commit triggers
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Now, Undo should be enabled
    expect(undoButton.disabled).toBe(false)
    expect(redoButton.disabled).toBe(true)

    // Click Undo
    act(() => {
      fireEvent.click(undoButton)
    })

    // Text should revert to initial value, and Redo should become enabled
    expect(textarea.value).toBe(initialValue)
    expect(undoButton.disabled).toBe(true)
    expect(redoButton.disabled).toBe(false)

    // Click Redo
    act(() => {
      fireEvent.click(redoButton)
    })

    // Text should return to edited value, and Undo should become enabled
    expect(textarea.value).toBe('system:\n  name: Edited Spec')
    expect(undoButton.disabled).toBe(false)
    expect(redoButton.disabled).toBe(true)
  })
})
