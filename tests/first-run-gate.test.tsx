import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import { db } from '../lib/db'
import { waitForWorkspaceHydration, waitForWorkspaceInteractive } from './wait-for-hydration'
import { installWorkspaceFetch } from './workspace-fetch-double'

describe('first-run gate — editor stays inert until a decision', () => {
  beforeEach(() => {
    localStorage.clear()
    db.removeSpec('main')
  })

  afterEach(() => {
    localStorage.clear()
    db.removeSpec('main')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('textarea stays disabled and a blocking overlay is up after hydration', async () => {
    installWorkspaceFetch({
      spec: { body: { enabled: false, mode: 'unconfigured' } },
      project: { body: { mode: 'unconfigured', suggestedDir: '/tmp/suggested', recents: [] } },
    })
    render(<Workspace />)
    await waitForWorkspaceHydration()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    expect(textarea.disabled).toBe(true)
    expect(textarea).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByTestId('first-run-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-inert-gate')).toBeInTheDocument()
    expect(screen.getByTestId('project-picker-panel')).toBeInTheDocument()

    fireEvent.change(textarea, { target: { value: 'system:\n  name: Sneak Edit\n  components: []\n' } })
    expect(textarea.value).not.toContain('Sneak Edit')
  })

  test('Escape does not dismiss the first-run overlay', async () => {
    installWorkspaceFetch({
      spec: { body: { enabled: false, mode: 'unconfigured' } },
      project: { body: { mode: 'unconfigured', suggestedDir: '/tmp/suggested', recents: [] } },
    })
    render(<Workspace />)
    await waitForWorkspaceHydration()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByTestId('first-run-overlay')).toBeInTheDocument()
    expect((screen.getByTestId('spec-textarea') as HTMLTextAreaElement).disabled).toBe(true)
  })

  test('opt-out keeps the current spec, unlocks the editor, and does not reload', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    })
    installWorkspaceFetch({
      spec: { body: { enabled: false, mode: 'unconfigured' } },
      project: { body: { mode: 'unconfigured', suggestedDir: '/tmp/suggested', recents: [] } },
      put: { body: { ok: true, mode: 'standalone' } },
    })
    render(<Workspace />)
    await waitForWorkspaceHydration()
    const before = (screen.getByTestId('spec-textarea') as HTMLTextAreaElement).value

    fireEvent.click(screen.getByTestId('project-standalone-button'))
    await waitForWorkspaceInteractive()

    expect(reload).not.toHaveBeenCalled()
    expect(screen.queryByTestId('first-run-overlay')).toBeNull()
    expect(screen.queryByTestId('workspace-inert-gate')).toBeNull()
    const after = (screen.getByTestId('spec-textarea') as HTMLTextAreaElement).value
    expect(after).toBe(before)
    expect(after).not.toContain('External Brain')
    expect(screen.getByTestId('project-picker-badge').textContent).toMatch(/browser storage/i)
    expect(document.body).toBeInTheDocument()
  })
})
