import { describe, test, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { WorkspaceErrorBoundary } from '../components/workspace/workspace-error-boundary'

function Boom(): React.ReactElement {
  throw new Error('canvas loop')
}

function Ok() {
  return <div data-testid="ok">ok</div>
}

afterEach(() => {
  vi.restoreAllMocks()
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

  test('shows a recovery alert and calls onReload', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onReload = vi.fn()
    render(
      <WorkspaceErrorBoundary onReload={onReload}>
        <Boom />
      </WorkspaceErrorBoundary>
    )
    expect(screen.getByTestId('workspace-crash')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-crash').textContent).toMatch(/hit an error/i)
    fireEvent.click(screen.getByTestId('workspace-crash-reload'))
    expect(onReload).toHaveBeenCalled()
  })

  test('falls back to window.location.reload when no onReload is given', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = vi.fn()
    const prev = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...prev, reload },
    })
    try {
      render(
        <WorkspaceErrorBoundary>
          <Boom />
        </WorkspaceErrorBoundary>
      )
      fireEvent.click(screen.getByTestId('workspace-crash-reload'))
      expect(reload).toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: prev })
    }
  })
})
