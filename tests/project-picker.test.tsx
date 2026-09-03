import { describe, test, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { ProjectPicker } from '../components/workspace/project-picker'

function installProjectFetch(opts: {
  info: any
  putResponses?: { status: number; body: any }[]
}) {
  const puts: any[] = []
  const putResponses = opts.putResponses ?? [{ status: 200, body: { ok: true, mode: 'project', dir: '/tmp/next' } }]
  const fetchMock = vi.fn(async (input: any, init?: any) => {
    const url = String(input)
    if (url.startsWith('/api/project') && init?.method === 'PUT') {
      puts.push(JSON.parse(init.body))
      const r = putResponses[Math.min(puts.length - 1, putResponses.length - 1)]
      return { ok: r.status < 300, status: r.status, json: async () => r.body } as any
    }
    if (url.startsWith('/api/project')) {
      return { ok: true, status: 200, json: async () => opts.info } as any
    }
    return { ok: false, status: 404, json: async () => ({}) } as any
  })
  vi.stubGlobal('fetch', fetchMock)
  return { puts }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ProjectPicker — project mode (the default story)', () => {
  test('badge shows the project folder name; panel shows the full path and recents', async () => {
    installProjectFetch({
      info: {
        mode: 'project',
        dir: '/Users/dev/proj-alpha',
        exists: true,
        source: 'config',
        recents: ['/Users/dev/proj-alpha', '/Users/dev/proj-beta'],
      },
    })
    render(<ProjectPicker />)

    const badge = await screen.findByTestId('project-picker-badge')
    await waitFor(() => expect(badge.textContent).toContain('proj-alpha'))

    fireEvent.click(badge)
    const panel = screen.getByTestId('project-picker-panel')
    expect(panel.textContent).toContain('/Users/dev/proj-alpha')
    // The other recent project is offered for one-click switching.
    expect(panel.textContent).toContain('/Users/dev/proj-beta')
  })

  test('switching PUTs the new dir and reloads on success', async () => {
    const { puts } = installProjectFetch({
      info: { mode: 'project', dir: '/Users/dev/proj-alpha', exists: true, source: 'config', recents: [] },
      putResponses: [{ status: 200, body: { ok: true, mode: 'project', dir: '/tmp/proj-beta' } }],
    })
    const reload = vi.fn()
    render(<ProjectPicker reload={reload} />)

    fireEvent.click(await screen.findByTestId('project-picker-badge'))
    await waitFor(() => expect(screen.getByTestId('project-dir-input')).toBeTruthy())
    fireEvent.change(screen.getByTestId('project-dir-input'), { target: { value: '/tmp/proj-beta' } })
    fireEvent.click(screen.getByTestId('project-switch-button'))

    await waitFor(() => expect(reload).toHaveBeenCalled())
    expect(puts).toEqual([{ dir: '/tmp/proj-beta' }])
  })

  test('a recent entry switches with one click', async () => {
    const { puts } = installProjectFetch({
      info: {
        mode: 'project',
        dir: '/Users/dev/proj-alpha',
        exists: true,
        source: 'config',
        recents: ['/Users/dev/proj-alpha', '/Users/dev/proj-beta'],
      },
    })
    const reload = vi.fn()
    render(<ProjectPicker reload={reload} />)

    fireEvent.click(await screen.findByTestId('project-picker-badge'))
    fireEvent.click(screen.getByText('/Users/dev/proj-beta'))
    await waitFor(() => expect(reload).toHaveBeenCalled())
    expect(puts).toEqual([{ dir: '/Users/dev/proj-beta' }])
  })

  test('create-and-switch after a stale RECENT click targets the recent dir, not the empty input', async () => {
    const { puts } = installProjectFetch({
      info: {
        mode: 'project',
        dir: '/Users/dev/proj-alpha',
        exists: true,
        source: 'config',
        recents: ['/Users/dev/proj-alpha', '/Users/dev/proj-beta'],
      },
      putResponses: [
        { status: 400, body: { error: 'Directory does not exist', code: 'not-found' } },
        { status: 200, body: { ok: true, mode: 'project', dir: '/Users/dev/proj-beta' } },
      ],
    })
    const reload = vi.fn()
    render(<ProjectPicker reload={reload} />)

    fireEvent.click(await screen.findByTestId('project-picker-badge'))
    // The recent entry's folder was deleted on disk since it was recorded.
    fireEvent.click(screen.getByText('/Users/dev/proj-beta'))
    await waitFor(() => expect(screen.getByTestId('project-picker-error')).toBeTruthy())

    fireEvent.click(screen.getByTestId('project-create-button'))
    await waitFor(() => expect(reload).toHaveBeenCalled())
    // Must recreate the dir that failed — not resubmit the (empty) input.
    expect(puts[1]).toEqual({ dir: '/Users/dev/proj-beta', create: true })
  })

  test('a not-found error surfaces and offers create-and-switch', async () => {
    const { puts } = installProjectFetch({
      info: { mode: 'project', dir: '/Users/dev/proj-alpha', exists: true, source: 'config', recents: [] },
      putResponses: [
        { status: 400, body: { error: 'Directory does not exist', code: 'not-found' } },
        { status: 200, body: { ok: true, mode: 'project', dir: '/tmp/brand-new' } },
      ],
    })
    const reload = vi.fn()
    render(<ProjectPicker reload={reload} />)

    fireEvent.click(await screen.findByTestId('project-picker-badge'))
    fireEvent.change(screen.getByTestId('project-dir-input'), { target: { value: '/tmp/brand-new' } })
    fireEvent.click(screen.getByTestId('project-switch-button'))

    await waitFor(() => {
      expect(screen.getByTestId('project-picker-error').textContent).toMatch(/does not exist/i)
    })
    expect(reload).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('project-create-button'))
    await waitFor(() => expect(reload).toHaveBeenCalled())
    expect(puts[1]).toEqual({ dir: '/tmp/brand-new', create: true })
  })

  test('browser-storage opt-out is available but de-emphasized', async () => {
    const { puts } = installProjectFetch({
      info: { mode: 'project', dir: '/Users/dev/proj-alpha', exists: true, source: 'config', recents: [] },
      putResponses: [{ status: 200, body: { ok: true, mode: 'standalone' } }],
    })
    const reload = vi.fn()
    render(<ProjectPicker reload={reload} />)

    fireEvent.click(await screen.findByTestId('project-picker-badge'))
    fireEvent.click(screen.getByTestId('project-standalone-button'))
    await waitFor(() => expect(reload).toHaveBeenCalled())
    expect(puts).toEqual([{ mode: 'standalone' }])
  })
})

describe('ProjectPicker — first run (unconfigured)', () => {
  test('panel opens by itself with the suggested dir prefilled; one click creates', async () => {
    const { puts } = installProjectFetch({
      info: { mode: 'unconfigured', suggestedDir: '/Users/dev/spec-yard-projects/my-system', recents: [] },
      putResponses: [{ status: 200, body: { ok: true, mode: 'project', dir: '/Users/dev/spec-yard-projects/my-system' } }],
    })
    const reload = vi.fn()
    render(<ProjectPicker reload={reload} />)

    // No click needed — the first-run prompt opens itself.
    const panel = await screen.findByTestId('project-picker-panel')
    expect(panel).toBeTruthy()
    const input = screen.getByTestId('project-dir-input') as HTMLInputElement
    expect(input.value).toBe('/Users/dev/spec-yard-projects/my-system')

    fireEvent.click(screen.getByTestId('project-switch-button'))
    await waitFor(() => expect(reload).toHaveBeenCalled())
    // First-run create goes straight through — no exists-check round-trip.
    expect(puts).toEqual([{ dir: '/Users/dev/spec-yard-projects/my-system', create: true }])
  })

  test('Escape closes the first-run panel; the input is focused when it opens', async () => {
    installProjectFetch({
      info: { mode: 'unconfigured', suggestedDir: '/tmp/suggested', recents: [] },
    })
    render(<ProjectPicker />)
    const panel = await screen.findByTestId('project-picker-panel')
    expect(panel.getAttribute('role')).toBe('dialog')
    await waitFor(() => expect(screen.getByTestId('project-dir-input')).toHaveFocus())
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('project-picker-panel')).toBeNull())
  })
})

describe('ProjectPicker — standalone mode (secondary)', () => {
  test('badge shows browser storage; panel leads with getting into a project', async () => {
    const { puts } = installProjectFetch({
      info: { mode: 'standalone', recents: ['/Users/dev/proj-alpha'] },
      putResponses: [{ status: 200, body: { ok: true, mode: 'project', dir: '/Users/dev/proj-alpha' } }],
    })
    const reload = vi.fn()
    render(<ProjectPicker reload={reload} />)

    const badge = await screen.findByTestId('project-picker-badge')
    await waitFor(() => expect(badge.textContent).toMatch(/browser storage/i))

    fireEvent.click(badge)
    // The main story is still the project flow: input + recents are right there.
    expect(screen.getByTestId('project-dir-input')).toBeTruthy()
    fireEvent.click(screen.getByText('/Users/dev/proj-alpha'))
    await waitFor(() => expect(reload).toHaveBeenCalled())
    expect(puts).toEqual([{ dir: '/Users/dev/proj-alpha' }])
  })
})

describe('ProjectPicker — degraded', () => {
  test('an unreachable project API degrades to a browser-storage badge', async () => {
    // Server gone => the store fetch fails too and the app runs local-only,
    // so "Browser storage" is the truthful label.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    render(<ProjectPicker />)
    const badge = await screen.findByTestId('project-picker-badge')
    await waitFor(() => expect(badge.textContent).toMatch(/browser storage/i))
  })

  test('a non-OK project API response shows an unknown badge, never a false Browser storage', async () => {
    // e.g. the workspace was opened via a non-loopback address: /api/project
    // 403s while the store route may still be writing files — claiming
    // "Browser storage" would be the opposite of the truth.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: 'loopback only' }) }) as any))
    render(<ProjectPicker />)
    const badge = await screen.findByTestId('project-picker-badge')
    await waitFor(() => expect(badge.textContent).toMatch(/unknown/i))
    expect(badge.textContent).not.toMatch(/browser storage/i)
  })
})
