import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import { db } from '../lib/db'
import { waitForWorkspaceHydration } from './wait-for-hydration'
import { installWorkspaceFetch, projectReply } from './workspace-fetch-double'
import { persistSpecDraft, rememberSpecDraft, clearCrashDraft } from '../lib/spec-draft'

describe('workspace hardening and honest chrome', () => {
  beforeEach(() => {
    localStorage.clear()
    db.removeSpec('main')
    clearCrashDraft()
  })

  afterEach(() => {
    localStorage.clear()
    db.removeSpec('main')
    clearCrashDraft()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('status bar says the workspace is loading until hydration finishes', async () => {
    vi.spyOn(db, 'loadFromServer').mockImplementation(() => new Promise(() => {}))
    render(<Workspace />)
    expect(screen.getByTestId('sync-status').textContent).toMatch(/loading/i)
  })

  test('pre-hydration seed is the unconfigured slate, not the demo, and the canvas is not compiled', async () => {
    vi.spyOn(db, 'loadFromServer').mockImplementation(() => new Promise(() => {}))
    render(<Workspace />)
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    expect(textarea.value).toContain('Pick a project folder')
    expect(textarea.value).not.toContain('External Brain')
    expect(textarea.value).not.toContain('inbox')
    expect(screen.getByLabelText('Loading canvas')).toBeInTheDocument()
  })

  test('unmounting mid-hydration does not unlock a dead workspace', async () => {
    let resolveLoad: (value: boolean) => void = () => {}
    let rejectLoad: (reason: Error) => void = () => {}
    vi.spyOn(db, 'loadFromServer').mockImplementation(
      () => new Promise<boolean>((resolve, reject) => {
        resolveLoad = resolve
        rejectLoad = reject
      })
    )
    const { unmount } = render(<Workspace />)
    expect(screen.getByTestId('sync-status').textContent).toMatch(/loading/i)
    unmount()
    resolveLoad(false)

    const { unmount: unmount2 } = render(<Workspace />)
    unmount2()
    rejectLoad(new Error('gone'))
  })

  test('a hydration throw still unlocks the editor on a safe fallback spec', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(db, 'loadFromServer').mockRejectedValue(new Error('hydrate boom'))
    render(<Workspace />)
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    expect(textarea.disabled).toBe(false)
    expect(textarea.value).toMatch(/Pick a project folder/i)
  })

  test('Save persists immediately without waiting for the autosave debounce', async () => {
    installWorkspaceFetch({
      spec: { body: { enabled: false, mode: 'standalone' } },
      project: { body: { mode: 'standalone', recents: [] } },
    })
    const saveSpy = vi.spyOn(db, 'saveSpec')
    render(<Workspace />)
    await waitForWorkspaceHydration()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'system:\n  name: Immediate Save\n  components: []\n' } })
    saveSpy.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(saveSpy).toHaveBeenCalled()
    expect(saveSpy.mock.calls[saveSpy.mock.calls.length - 1][2]).toContain('Immediate Save')
  })

  test('Run opens the Metrics tab', async () => {
    installWorkspaceFetch({
      spec: { body: { enabled: false, mode: 'standalone' } },
      project: { body: { mode: 'standalone', recents: [] } },
    })
    render(<Workspace />)
    await waitForWorkspaceHydration()
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(screen.getByRole('tab', { name: /metrics/i })).toHaveAttribute('aria-selected', 'true')
  })

  test('status bar reports issue count and drops the fake cursor position', async () => {
    installWorkspaceFetch({
      spec: { body: { enabled: false, mode: 'standalone' } },
      project: { body: { mode: 'standalone', recents: [] } },
    })
    render(<Workspace />)
    await waitForWorkspaceHydration()
    expect(screen.getByTestId('issue-count').textContent).toMatch(/issue/i)
    expect(screen.queryByText('Ln 1, Col 1')).toBeNull()
    const textarea = screen.getByTestId('spec-textarea')
    textarea.blur()
    fireEvent.click(screen.getByTestId('skip-to-editor'))
    expect(textarea).toHaveFocus()
  })

  test('a project-switched halt offers download plus an explicit discard-reload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    installWorkspaceFetch({
      spec: { body: { found: false, epoch: 'e1' } },
      project: projectReply('/tmp/proj'),
      put: { status: 409, body: { conflict: true, reason: 'project-switched' } },
    })
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    })
    render(<Workspace />)
    await waitForWorkspaceHydration()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'system:\n  name: Halted\n  components: []\n' } })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
    })

    await waitFor(() => {
      expect(screen.getByTestId('sync-download')).toBeInTheDocument()
      expect(screen.getByTestId('sync-reload')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('sync-retry')).toBeNull()
    fireEvent.click(screen.getByTestId('sync-download'))
    fireEvent.click(screen.getByTestId('sync-reload'))
    expect(reload).toHaveBeenCalled()
  })

  test('a transient save failure offers retry, not a discard-reload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const saveSpy = vi.spyOn(db, 'saveSpec')
    installWorkspaceFetch({
      spec: { body: { found: false, epoch: 'e1' } },
      project: projectReply('/tmp/proj'),
      put: { status: 500, body: {} },
    })
    render(<Workspace />)
    await waitForWorkspaceHydration()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'system:\n  name: Retry Me\n  components: []\n' } })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
    })

    await waitFor(() => {
      expect(screen.getByTestId('sync-retry')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('sync-reload')).toBeNull()
    saveSpy.mockClear()
    fireEvent.click(screen.getByTestId('sync-retry'))
    expect(saveSpy).toHaveBeenCalled()
  })

  test('hydration prefers a crash draft over the project file', async () => {
    rememberSpecDraft('system:\n  name: Recovered Crash Draft\n  components: []\n')
    persistSpecDraft()
    installWorkspaceFetch({
      spec: { body: { id: 'main', title: 'Disk', yamlContent: 'system:\n  name: On Disk\n  components: []\n', epoch: 'e1' } },
      project: projectReply('/tmp/proj'),
    })
    render(<Workspace />)
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    expect(textarea.value).toContain('Recovered Crash Draft')
    expect(textarea.value).not.toContain('On Disk')
  })

  test('arrow keys resize the split, and a zero-width container is ignored', async () => {
    installWorkspaceFetch({
      spec: { body: { enabled: false, mode: 'standalone' } },
      project: { body: { mode: 'standalone', recents: [] } },
    })
    render(<Workspace />)
    await waitForWorkspaceHydration()
    const separator = screen.getByRole('separator', { name: 'Resize panels' })
    const left = separator.previousElementSibling as HTMLElement
    const before = left.style.width

    const zero = vi.spyOn(left.parentElement as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON() { return {} },
    } as DOMRect)
    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(left.style.width).toBe(before)
    zero.mockRestore()

    vi.spyOn(left.parentElement as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      width: 1000,
      height: 600,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON() { return {} },
    } as DOMRect)
    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(left.style.width).not.toBe(before)
    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    fireEvent.keyDown(separator, { key: 'Home' })
    fireEvent.keyDown(separator, { key: 'End' })
    fireEvent.keyDown(separator, { key: 'ArrowRight', shiftKey: true })
    fireEvent.keyDown(separator, { key: 'a' })

    const afterKeys = left.style.width
    vi.spyOn(left.parentElement as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON() { return {} },
    } as DOMRect)
    fireEvent.mouseDown(separator)
    fireEvent.mouseMove(window, { clientX: 400 })
    expect(left.style.width).toBe(afterKeys)
    fireEvent.mouseUp(window)
  })
})
