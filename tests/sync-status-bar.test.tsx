import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import { db } from '../lib/db'
import { waitForWorkspaceHydration } from './wait-for-hydration'
import { installWorkspaceFetch, projectReply } from './workspace-fetch-double'

// Review finding: a mirroring latch-off (external conflict, project switched
// in another tab) was console-only — the workspace kept looking healthy while
// edits went to browser storage only. The status bar must say where saves go.

function installFetch(opts: { fileMode: boolean; putStatus?: number; putBody?: any }) {
  installWorkspaceFetch({
    spec: { body: opts.fileMode ? { found: false, epoch: 'e1' } : { enabled: false, mode: 'standalone' } },
    project: opts.fileMode ? projectReply('/tmp/proj') : undefined,
    put: opts.putStatus === undefined ? undefined : { status: opts.putStatus, body: opts.putBody },
  })
}

describe('status bar sync visibility', () => {
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

  test('project mode shows a synced state', async () => {
    installFetch({ fileMode: true })
    render(<Workspace />)
    await waitForWorkspaceHydration()
    await waitFor(() => {
      expect(screen.getByTestId('sync-status').textContent).toMatch(/synced/i)
    })
  })

  test('standalone shows browser-storage, calmly', async () => {
    installFetch({ fileMode: false })
    render(<Workspace />)
    await waitForWorkspaceHydration()
    await waitFor(() => {
      expect(screen.getByTestId('sync-status').textContent).toMatch(/browser storage/i)
    })
  })

  test('an in-flight edit says Unsaved changes, not Synced', async () => {
    installFetch({ fileMode: true })
    render(<Workspace />)
    await waitForWorkspaceHydration()
    await waitFor(() => {
      expect(screen.getByTestId('sync-status').textContent).toMatch(/synced/i)
      expect((screen.getByTestId('spec-textarea') as HTMLTextAreaElement).disabled).toBe(false)
    })
    fireEvent.change(screen.getByTestId('spec-textarea'), {
      target: { value: 'system:\n  name: Dirty Edit\n  components: []\n' },
    })
    expect(screen.getByTestId('sync-status').textContent).toMatch(/unsaved changes/i)
    expect(screen.getByTestId('sync-status').textContent).not.toMatch(/synced/i)
  })

  test('a project-switched latch surfaces a visible reload instruction', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    installFetch({
      fileMode: true,
      putStatus: 409,
      putBody: { conflict: true, reason: 'project-switched' },
    })
    render(<Workspace />)
    await waitForWorkspaceHydration()

    await waitFor(() => {
      expect((screen.getByTestId('spec-textarea') as HTMLTextAreaElement).disabled).toBe(false)
    })
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'system:\n  name: Edited\n  components: []\n' } })
    await waitFor(() => {
      expect(screen.getByTestId('sync-status').textContent).toMatch(/unsaved/i)
    })
    // Autosave debounce (1s) then the PUT 409s and latches.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
    })

    await waitFor(() => {
      expect(screen.getByTestId('sync-status').textContent).toMatch(/reload/i)
    })
  })
})

describe('status bar on a first run', () => {
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

  test('says no project is chosen rather than claiming browser storage', async () => {
    installWorkspaceFetch({
      spec: { body: { enabled: false, mode: 'unconfigured' } },
      project: { body: { mode: 'unconfigured', suggestedDir: '/home/u/p', recents: [] } },
    })
    render(<Workspace />)
    await waitForWorkspaceHydration()
    await waitFor(() => {
      expect(screen.getByTestId('sync-status').textContent).toMatch(/no project/i)
    })
  })
})
