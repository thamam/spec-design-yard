import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import { db } from '../lib/db'

describe('Database Hydration Resilience & Auto-Save Checks', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      localStorage.clear()
    }
    // The app-wide store singleton keeps an in-memory fallback that survives
    // localStorage.clear() — remove the spec explicitly or tests leak state.
    db.removeSpec("main")
    vi.restoreAllMocks()
  })

  afterEach(() => {
    if (typeof window !== 'undefined') {
      localStorage.clear()
    }
    db.removeSpec("main")
    vi.restoreAllMocks()
  })

  test('hydrates stored spec on mount and does NOT overwrite it with default template', async () => {
    const customUserSpecText = `system:
  name: Tomers Perfect Custom System
  components:
    - id: custom_node
      type: Stage
      name: custom_name
`
    // Seed database before mount
    db.saveSpec("main", "External Brain v0.2", customUserSpecText)

    render(<Workspace />)

    // Wait for state updates to settle and verify that the textarea value has successfully loaded the custom spec
    await waitFor(() => {
      const textareaAfter = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
      expect(textareaAfter.value).toContain('Tomers Perfect Custom System')
    })

    // Now check if the database was safe from being overwritten during the hydration phase.
    const dbDoc = db.getSpec("main")
    expect(dbDoc?.yamlContent).toContain('Tomers Perfect Custom System')
  })

  test('does NOT save spec text back to the database if it has not changed from loaded version', async () => {
    const customUserSpecText = `system:
  name: Stored Unchanged System
  components:
    - id: stored_node
      type: Stage
`
    db.saveSpec("main", "External Brain v0.2", customUserSpecText)

    // Spy on saveSpec
    const saveSpecSpy = vi.spyOn(db, 'saveSpec')

    render(<Workspace />)

    // Wait for hydration
    await waitFor(() => {
      const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
      expect(textarea.value).toContain('Stored Unchanged System')
    })

    // Wait through the full autosave debounce: hydration must not trigger a
    // save-back of the unchanged text — zero calls, not "at most one".
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1200))
    })
    const saveCallsAfterMount = saveSpecSpy.mock.calls.filter(call => call[2] === customUserSpecText)
    expect(saveCallsAfterMount.length).toBe(0)
  })

  test('successfully saves to database on user edit', async () => {
    const customUserSpecText = `system:
  name: Editable System
  components:
    - id: editable_node
      type: Stage
`
    db.saveSpec("main", "External Brain v0.2", customUserSpecText)

    const saveSpecSpy = vi.spyOn(db, 'saveSpec')

    render(<Workspace />)

    // Wait for load
    await waitFor(() => {
      const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
      expect(textarea.value).toContain('Editable System')
    })

    // Clear calls so we only track post-load saves
    saveSpecSpy.mockClear()

    // Trigger edit
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: textarea.value + '\n# Added comment' } })

    // Wait for the debouncer (1000ms) to fire if present
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1100))
    })

    // Verify it saved the new edited content
    await waitFor(() => {
      expect(saveSpecSpy).toHaveBeenCalled()
      const lastCall = saveSpecSpy.mock.calls[saveSpecSpy.mock.calls.length - 1]
      expect(lastCall[2]).toContain('# Added comment')
    })
  })

  test('saves edits from a fresh mount with no prior stored spec (always-on persistence)', async () => {
    render(<Workspace />)

    const saveSpecSpy = vi.spyOn(db, 'saveSpec')

    // Hydration is async now (server round-trip attempt); let it settle before
    // typing so the autosave debounce arms inside this test's act window.
    await act(async () => {})

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: textarea.value + '\n# First-session edit' } })

    // Wait past the 1000ms debounce
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1100))
    })

    await waitFor(() => {
      expect(saveSpecSpy).toHaveBeenCalled()
      const lastCall = saveSpecSpy.mock.calls[saveSpecSpy.mock.calls.length - 1]
      expect(lastCall[2]).toContain('# First-session edit')
    })
  })
})
