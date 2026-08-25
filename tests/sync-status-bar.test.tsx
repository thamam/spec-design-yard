import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import { db } from '../lib/db'
import { waitForWorkspaceHydration } from './wait-for-hydration'

// Review finding: a mirroring latch-off (external conflict, project switched
// in another tab) was console-only — the workspace kept looking healthy while
// edits went to browser storage only. The status bar must say where saves go.

function installFetch(opts: { fileMode: boolean; putStatus?: number; putBody?: any }) {
  const fetchMock = vi.fn(async (input: any, init?: any) => {
    const url = String(input)
    if (init?.method === 'PUT') {
      const status = opts.putStatus ?? 200
      return {
        ok: status < 300,
        status,
        json: async () => opts.putBody ?? { ok: true, rev: 'r1' },
      } as any
    }
    if (url.startsWith('/api/store/spec/main')) {
      return {
        ok: true,
        status: 200,
        json: async () => (opts.fileMode ? { found: false, epoch: 'e1' } : { enabled: false }),
      } as any
    }
    if (url.startsWith('/api/store/meta/')) {
      return { ok: true, status: 200, json: async () => null } as any
    }
    if (url.startsWith('/api/project')) {
      return {
        ok: true,
        status: 200,
        json: async () =>
          opts.fileMode
            ? { mode: 'project', dir: '/tmp/proj', exists: true, source: 'config', recents: [] }
            : { mode: 'standalone', recents: [] },
      } as any
    }
    return { ok: false, status: 404, json: async () => ({}) } as any
  })
  vi.stubGlobal('fetch', fetchMock)
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

  test('a project-switched latch surfaces a visible reload instruction', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    installFetch({
      fileMode: true,
      putStatus: 409,
      putBody: { conflict: true, reason: 'project-switched' },
    })
    render(<Workspace />)
    await waitForWorkspaceHydration()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'system:\n  name: Edited\n  components: []\n' } })
    // Autosave debounce (1s) then the PUT 409s and latches.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
    })

    await waitFor(() => {
      expect(screen.getByTestId('sync-status').textContent).toMatch(/reload/i)
    })
  })
})
