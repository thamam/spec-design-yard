import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import { db } from '../lib/db'
import { waitForWorkspaceHydration } from './wait-for-hydration'

// File mode with NO spec file yet ({found:false}) must open a clearly-labeled
// blank spec — never the built-in "External Brain" demo, and never autosave
// anything into the fresh repo until the user actually edits.

function installFetchMock(opts: { fileMode: boolean }) {
  const puts: { url: string; body: any }[] = []
  const fetchMock = vi.fn(async (input: any, init?: any) => {
    const url = String(input)
    if (init?.method === 'PUT') {
      puts.push({ url, body: JSON.parse(init.body) })
      return { ok: true, status: 200, json: async () => ({ ok: true, rev: 'r1' }) } as any
    }
    if (url.startsWith('/api/store/spec/main')) {
      return {
        ok: true,
        status: 200,
        json: async () =>
          opts.fileMode ? { found: false, epoch: 'epoch-1' } : { enabled: false },
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
            ? { mode: 'project', dir: '/tmp/fresh-project', exists: true, source: 'config', recents: [] }
            : { mode: 'standalone', recents: [] },
      } as any
    }
    return { ok: false, status: 404, json: async () => ({}) } as any
  })
  vi.stubGlobal('fetch', fetchMock)
  return { puts }
}

describe('fresh project blank slate (file mode, no spec file)', () => {
  beforeEach(() => {
    localStorage.clear()
    // The app-wide store is a module singleton with an in-memory fallback;
    // evict the spec so a previous test's edit can't leak into this one.
    db.removeSpec('main')
  })

  afterEach(() => {
    localStorage.clear()
    db.removeSpec('main')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('opens a labeled blank spec instead of the demo', async () => {
    installFetchMock({ fileMode: true })
    render(<Workspace />)
    await waitForWorkspaceHydration()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    expect(textarea.value).toContain('New System')
    expect(textarea.value).toContain('# New project')
    expect(textarea.value).not.toContain('External Brain')
  })

  test('the blank slate is never autosaved into the repo', async () => {
    const { puts } = installFetchMock({ fileMode: true })
    render(<Workspace />)
    await waitForWorkspaceHydration()

    // Give the debounced autosave a full window to (wrongly) fire.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
    })
    expect(puts.filter((p) => p.url.startsWith('/api/store/spec/main'))).toHaveLength(0)
  })

  test('the first user edit autosaves the user content, not the demo', async () => {
    const { puts } = installFetchMock({ fileMode: true })
    render(<Workspace />)
    await waitForWorkspaceHydration()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, {
      target: { value: 'system:\n  name: My Real Project\n  components: []\n' },
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
    })

    await waitFor(() => {
      const specPuts = puts.filter((p) => p.url.startsWith('/api/store/spec/main'))
      expect(specPuts.length).toBeGreaterThan(0)
      expect(specPuts[specPuts.length - 1].body.yamlContent).toContain('My Real Project')
      expect(specPuts[specPuts.length - 1].body.yamlContent).not.toContain('External Brain')
    })
  })

  test('a standalone sketch is adopted into the first project instead of blanked', async () => {
    localStorage.setItem('spec_main', JSON.stringify({
      id: 'main',
      title: 'My Sketch',
      yamlContent: 'system:\n  name: My Sketch\n  components: []\n',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }))
    localStorage.setItem('spec_main_origin', 'standalone')
    installFetchMock({ fileMode: true })

    render(<Workspace />)
    await waitForWorkspaceHydration()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    expect(textarea.value).toContain('My Sketch')
    expect(textarea.value).not.toContain('# New project')
  })

  test('standalone mode keeps the built-in demo spec', async () => {
    installFetchMock({ fileMode: false })
    render(<Workspace />)
    await waitForWorkspaceHydration()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    expect(textarea.value).toContain('External Brain')
  })
})
