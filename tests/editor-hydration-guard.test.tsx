import { describe, test, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { EditorPanel } from '../components/workspace/editor-panel'

// Hydration guard (PR #10 adversarial review): the editor must refuse input
// until hydration resolves — a keystroke during the hydration window must
// never end up overwriting the canonical project file.
describe('EditorPanel hydration guard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('textarea is disabled while isHydrated is false', () => {
    render(<EditorPanel specText={'system: {}\n'} isHydrated={false} />)
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    expect(textarea.disabled).toBe(true)
    expect(textarea).toHaveAttribute('aria-busy', 'true')
    expect(textarea).toHaveAttribute('aria-label', 'Loading spec')
  })

  test('Find is disabled with a truthful not-available title', () => {
    render(<EditorPanel specText={'system: {}\n'} isHydrated />)
    const find = screen.getByRole('button', { name: 'Find in file' })
    expect(find).toBeDisabled()
    expect(find).toHaveAttribute('title', expect.stringMatching(/not available/i))
  })

  test('Word wrap actually changes the textarea white-space', () => {
    render(<EditorPanel specText={'system: {}\n'} isHydrated />)
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const overlay = screen.getByTestId('yaml-highlight-overlay')
    expect(textarea.className).toMatch(/whitespace-pre(?!-wrap)/)
    expect(overlay.className).toMatch(/whitespace-pre(?!-wrap)/)

    fireEvent.click(screen.getByRole('button', { name: 'Toggle word wrap' }))
    expect(textarea.className).toMatch(/whitespace-pre-wrap/)
    expect(overlay.className).toMatch(/whitespace-pre-wrap/)
  })

  test('textarea is enabled once hydrated (and by default)', () => {
    const { unmount } = render(<EditorPanel specText={'system: {}\n'} isHydrated={true} />)
    expect((screen.getByTestId('spec-textarea') as HTMLTextAreaElement).disabled).toBe(false)
    unmount()
    render(<EditorPanel specText={'system: {}\n'} />)
    expect((screen.getByTestId('spec-textarea') as HTMLTextAreaElement).disabled).toBe(false)
  })
})
