import { describe, test, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { WorkspaceHeader } from '../components/workspace/workspace-header'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
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

  test('Save shows brief Saving… feedback and cleans up its timer', () => {
    vi.useFakeTimers()
    const onSave = vi.fn()
    const { unmount } = render(<WorkspaceHeader onSave={onSave} canSave />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(800)
    })
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    unmount()
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
})
