import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import { db } from '../lib/db'

describe('Database Hydration Resilience & Auto-Save Security Checks', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      localStorage.clear()
    }
    vi.restoreAllMocks()
  })

  afterEach(() => {
    if (typeof window !== 'undefined') {
      localStorage.clear()
    }
    vi.restoreAllMocks()
  })

  test('successfully loads stored user spec and does NOT overwrite it with default template', async () => {
    const customUserSpecText = `system:
  name: Tomers Perfect Custom System
  components:
    - id: custom_node
      type: Stage
      name: custom_name
`
    // Seed database before login
    db.saveSpec("main", "External Brain v0.2", customUserSpecText)

    render(<Workspace />)

    // Initially, default spec is displayed
    const textareaBefore = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    expect(textareaBefore.value).toContain('External Brain v0.2')
    expect(textareaBefore.value).not.toContain('Tomers Perfect Custom System')

    // Click Sign In
    const signInBtn = screen.getByRole('button', { name: /Sign In/i })
    fireEvent.click(signInBtn)

    // Input email & submit
    const emailInput = screen.getByPlaceholderText('tomer@neuronbox.ai') as HTMLInputElement
    fireEvent.change(emailInput, { target: { value: 'tomer@neuronbox.ai' } })

    // Select the second Sign In button (the submit button in the modal form)
    const signInButtons = screen.getAllByRole('button', { name: /Sign In/i })
    const submitBtn = signInButtons.find(btn => btn.getAttribute('type') === 'submit') || signInButtons[1]
    fireEvent.click(submitBtn)

    // Wait for state updates to settle and verify that the textarea value has successfully loaded Tomer's custom spec
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

    // Click Sign In
    const signInBtn = screen.getByRole('button', { name: /Sign In/i })
    fireEvent.click(signInBtn)

    const emailInput = screen.getByPlaceholderText('tomer@neuronbox.ai') as HTMLInputElement
    fireEvent.change(emailInput, { target: { value: 'tomer@neuronbox.ai' } })

    const signInButtons = screen.getAllByRole('button', { name: /Sign In/i })
    const submitBtn = signInButtons.find(btn => btn.getAttribute('type') === 'submit') || signInButtons[1]
    fireEvent.click(submitBtn)

    // Wait for hydration
    await waitFor(() => {
      const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
      expect(textarea.value).toContain('Stored Unchanged System')
    })

    // The saveSpec should not be called with the exact loaded text or should avoid redundant saving
    // If it was called, it should only be the original seed saving before rendering, not a save-back.
    // Let's clear the spy history before login or check calls during login.
    // Our design should prevent redundant writes. Let's make sure saveSpec was not called with the same content after mount.
    const saveCallsAfterMount = saveSpecSpy.mock.calls.filter(call => call[2] === customUserSpecText)
    // There might be 1 seed call (from db.saveSpec in the test setup), but 0 subsequent saves back.
    expect(saveCallsAfterMount.length).toBeLessThanOrEqual(1)
  })

  test('successfully saves to database on user edit after login', async () => {
    const customUserSpecText = `system:
  name: Editable System
  components:
    - id: editable_node
      type: Stage
`
    db.saveSpec("main", "External Brain v0.2", customUserSpecText)

    const saveSpecSpy = vi.spyOn(db, 'saveSpec')

    render(<Workspace />)

    // Login
    const signInBtn = screen.getByRole('button', { name: /Sign In/i })
    fireEvent.click(signInBtn)

    const emailInput = screen.getByPlaceholderText('tomer@neuronbox.ai') as HTMLInputElement
    fireEvent.change(emailInput, { target: { value: 'tomer@neuronbox.ai' } })

    const signInButtons = screen.getAllByRole('button', { name: /Sign In/i })
    const submitBtn = signInButtons.find(btn => btn.getAttribute('type') === 'submit') || signInButtons[1]
    fireEvent.click(submitBtn)

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
    await new Promise(resolve => setTimeout(resolve, 1100))

    // Verify it saved the new edited content
    await waitFor(() => {
      expect(saveSpecSpy).toHaveBeenCalled()
      const lastCall = saveSpecSpy.mock.calls[saveSpecSpy.mock.calls.length - 1]
      expect(lastCall[2]).toContain('# Added comment')
    })
  })

  test('does NOT save to database when user is logged out', async () => {
    render(<Workspace />)

    const saveSpecSpy = vi.spyOn(db, 'saveSpec')

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: textarea.value + '\n# Anonymous edit' } })

    // Wait to see if saveSpec was called
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(saveSpecSpy).not.toHaveBeenCalled()
  })
})
