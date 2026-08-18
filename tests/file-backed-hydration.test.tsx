import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'

// File-backed mode (SPEC_YARD_PROJECT_DIR set server-side): the repo file is
// canonical. These tests mock the /api/store endpoints the RemoteSyncSpecStore
// talks to.

const SERVER_SPEC = `system:
  name: Server Canonical System
  components:
    - id: srv_node
      type: Stage
`

function installFetchMock() {
  const puts: { url: string; body: any }[] = []
  const fetchMock = vi.fn(async (input: any, init?: any) => {
    const url = String(input)
    if (init?.method === 'PUT') {
      puts.push({ url, body: JSON.parse(init.body) })
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as any
    }
    if (url === '/api/store/spec/main') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'main', title: 'Server Canonical System', yamlContent: SERVER_SPEC, updatedAt: '2026-08-18T00:00:00.000Z' }),
      } as any
    }
    // meta endpoints: nothing stored yet
    return { ok: false, status: 404, json: async () => ({ found: false }) } as any
  })
  vi.stubGlobal('fetch', fetchMock)
  return { puts, fetchMock }
}

describe('File-backed hydration (server canonical)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('server spec wins over stale localStorage cache on mount', async () => {
    localStorage.setItem('spec_main', JSON.stringify({
      id: 'main',
      title: 'Stale Local System',
      yamlContent: 'system:\n  name: Stale Local System\n',
      updatedAt: '2020-01-01T00:00:00.000Z',
    }))
    installFetchMock()

    render(<Workspace />)

    await waitFor(() => {
      const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
      expect(textarea.value).toContain('Server Canonical System')
    })
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    expect(textarea.value).not.toContain('Stale Local System')
  })

  test('autosave after hydration mirrors the edit to the server via PUT', async () => {
    const { puts } = installFetchMock()

    render(<Workspace />)

    await waitFor(() => {
      const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
      expect(textarea.value).toContain('Server Canonical System')
    })

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: textarea.value + '\n# server-mode edit' } })

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1100))
    })

    await waitFor(() => {
      const specPuts = puts.filter(p => p.url === '/api/store/spec/main')
      expect(specPuts.length).toBeGreaterThan(0)
      expect(specPuts[specPuts.length - 1].body.yamlContent).toContain('# server-mode edit')
    })
  })

  test('no stale-cache PUT is fired during hydration', async () => {
    localStorage.setItem('spec_main', JSON.stringify({
      id: 'main',
      title: 'Stale Local System',
      yamlContent: 'system:\n  name: Stale Local System\n',
      updatedAt: '2020-01-01T00:00:00.000Z',
    }))
    const { puts } = installFetchMock()

    render(<Workspace />)

    await waitFor(() => {
      const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
      expect(textarea.value).toContain('Server Canonical System')
    })

    // Give the debounced autosave a full window to (wrongly) fire
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1100))
    })

    const stalePuts = puts.filter(p => p.url === '/api/store/spec/main' && typeof p.body.yamlContent === 'string' && p.body.yamlContent.includes('Stale Local System'))
    expect(stalePuts).toHaveLength(0)
  })
})
