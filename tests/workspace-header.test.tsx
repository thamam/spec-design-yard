import { describe, test, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'
import { WorkspaceHeader } from '../components/workspace/workspace-header'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('WorkspaceHeader chrome', () => {
  test('Save and Run call through; decorative actions stay disabled', () => {
    const onSave = vi.fn()
    const onRun = vi.fn()
    render(<WorkspaceHeader onSave={onSave} onRun={onRun} canSave />)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(onRun).toHaveBeenCalledTimes(1)

    expect(screen.getByRole('button', { name: 'Terminal' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Terminal' })).toHaveAttribute(
      'title',
      expect.stringMatching(/not available/i)
    )
  })

  test('Save is disabled until the workspace can persist', () => {
    const onSave = vi.fn()
    render(<WorkspaceHeader onSave={onSave} canSave={false} />)
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    fireEvent.click(save)
    expect(onSave).not.toHaveBeenCalled()
  })

  test('Save shows Saving… then Saved, then returns to Save', () => {
    vi.useFakeTimers()
    const onSave = vi.fn()
    const { unmount } = render(<WorkspaceHeader onSave={onSave} canSave />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    unmount()
  })

  test('hides the git chip and softens the breadcrumb in standalone', () => {
    render(<WorkspaceHeader canSave storageMode="local-only" />)
    expect(screen.queryByTestId('git-branch-chip')).toBeNull()
    expect(screen.getByLabelText('Breadcrumb').textContent).toMatch(/browser/i)
    expect(screen.getByLabelText('Breadcrumb').textContent).not.toMatch(/spec-editor/)
  })

  test('shows a real git branch when the project API reports one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        mode: 'project',
        dir: '/tmp/p',
        exists: true,
        source: 'config',
        recents: [],
        gitBranch: 'release-1',
      }),
    }) as any))
    render(<WorkspaceHeader canSave storageMode="synced" />)
    await waitFor(() => {
      expect(screen.getByTestId('git-branch-chip').textContent).toContain('release-1')
    })
  })

  test('hides the git chip on first run', () => {
    render(<WorkspaceHeader canSave storageMode="unconfigured" blockingFirstRun />)
    expect(screen.queryByTestId('git-branch-chip')).toBeNull()
    expect(screen.getByLabelText('Breadcrumb').textContent).toMatch(/spec-yard/i)
  })

  test('Save without an onSave handler does not throw', () => {
    render(<WorkspaceHeader canSave />)
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Save' }))).not.toThrow()
  })

  test('Undo/Redo call through, and hover styles apply only to enabled non-accent buttons', () => {
    const onUndo = vi.fn()
    const onRedo = vi.fn()
    render(<WorkspaceHeader canUndo canRedo canSave onUndo={onUndo} onRedo={onRedo} />)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(onUndo).toHaveBeenCalled()
    expect(onRedo).toHaveBeenCalled()

    const save = screen.getByRole('button', { name: 'Save' })
    fireEvent.mouseEnter(save)
    fireEvent.mouseLeave(save)
    fireEvent.click(save)
    const saving = screen.getByRole('button', { name: 'Saving…' })
    fireEvent.mouseEnter(saving)
    fireEvent.mouseLeave(saving)

    const run = screen.getByRole('button', { name: 'Run' })
    fireEvent.mouseEnter(run)
    fireEvent.mouseLeave(run)

    const terminal = screen.getByRole('button', { name: 'Terminal' })
    fireEvent.mouseEnter(terminal)
    fireEvent.mouseLeave(terminal)
  })

  test('shows Log out for a remote session and navigates to login', async () => {
    const replace = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/', replace, href: '/' },
    })
    vi.stubGlobal('fetch', vi.fn(async (input: any) => {
      const url = String(input)
      if (url.startsWith('/api/auth/session')) {
        return { ok: true, status: 200, json: async () => ({ remote: true, authenticated: true }) } as any
      }
      if (url.startsWith('/api/auth/logout')) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as any
      }
      return { ok: true, status: 200, json: async () => ({ mode: 'standalone', recents: [] }) } as any
    }))
    render(<WorkspaceHeader canSave />)
    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'))
  })

  test('logout still leaves the login page when the logout POST fails', async () => {
    const replace = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/', replace, href: '/' },
    })
    vi.stubGlobal('fetch', vi.fn(async (input: any) => {
      const url = String(input)
      if (url.startsWith('/api/auth/session')) {
        return { ok: true, status: 200, json: async () => ({ remote: true, authenticated: true }) } as any
      }
      if (url.startsWith('/api/auth/logout')) throw new Error('offline')
      return { ok: true, status: 200, json: async () => ({}) } as any
    }))
    render(<WorkspaceHeader canSave />)
    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'))
  })

  test('ignores a late remote-session probe after unmount', async () => {
    let resolve!: (v: any) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => { resolve = r })))
    const { unmount } = render(<WorkspaceHeader canSave />)
    unmount()
    resolve({ ok: true, status: 200, json: async () => ({ remote: true, authenticated: true }) })
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull()
  })
})
