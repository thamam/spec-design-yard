import { describe, test, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { WorkspaceErrorBoundary } from '../components/workspace/workspace-error-boundary'
import { rememberSpecDraft, clearCrashDraft, persistSpecDraft } from '../lib/spec-draft'

function Boom(): React.ReactElement {
  throw new Error('canvas loop')
}

function Ok() {
  return <div data-testid="ok">ok</div>
}

beforeEach(() => {
  clearCrashDraft()
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  clearCrashDraft()
  localStorage.clear()
})

describe('WorkspaceErrorBoundary', () => {
  test('renders children when nothing throws', () => {
    render(
      <WorkspaceErrorBoundary>
        <Ok />
      </WorkspaceErrorBoundary>
    )
    expect(screen.getByTestId('ok')).toBeInTheDocument()
  })

  test('persists the last rendered spec and offers download before reload', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    rememberSpecDraft('system:\n  name: Unsaved\n')
    const onReload = vi.fn()
    const onDownload = vi.fn()
    render(
      <WorkspaceErrorBoundary onReload={onReload} onDownload={onDownload}>
        <Boom />
      </WorkspaceErrorBoundary>
    )
    expect(screen.getByTestId('workspace-crash').textContent).toMatch(/download it before reloading/i)
    expect(persistSpecDraft()).toBe('system:\n  name: Unsaved\n')
    fireEvent.click(screen.getByTestId('workspace-crash-download'))
    expect(onDownload).toHaveBeenCalledWith('system:\n  name: Unsaved\n')
    fireEvent.click(screen.getByTestId('workspace-crash-reload'))
    expect(onReload).toHaveBeenCalled()
  })

  test('without a draft, does not claim edits are safe', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <WorkspaceErrorBoundary>
        <Boom />
      </WorkspaceErrorBoundary>
    )
    expect(screen.getByTestId('workspace-crash').textContent).toMatch(/may be unrecoverable/i)
    expect(screen.queryByTestId('workspace-crash-download')).toBeNull()
  })

  test('falls back to window.location.reload and triggerDownload when no handlers are given', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    rememberSpecDraft('yaml: 1\n')
    persistSpecDraft()
    const reload = vi.fn()
    const prev = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...prev, reload },
    })
    const click = vi.fn()
    const createSpy = vi.spyOn(document, 'createElement')
    try {
      render(
        <WorkspaceErrorBoundary>
          <Boom />
        </WorkspaceErrorBoundary>
      )
      fireEvent.click(screen.getByTestId('workspace-crash-download'))
      const created = createSpy.mock.results
        .map((r) => r.value)
        .find((el) => el && el.tagName === 'A' && String(el.getAttribute('download')).includes('main.spec.yaml'))
      expect(created).toBeTruthy()
      if (created) {
        created.click = click
      }
      fireEvent.click(screen.getByTestId('workspace-crash-reload'))
      expect(reload).toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: prev })
    }
  })
})
