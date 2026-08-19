import { describe, test, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  })

  test('textarea is enabled once hydrated (and by default)', () => {
    const { unmount } = render(<EditorPanel specText={'system: {}\n'} isHydrated={true} />)
    expect((screen.getByTestId('spec-textarea') as HTMLTextAreaElement).disabled).toBe(false)
    unmount()
    render(<EditorPanel specText={'system: {}\n'} />)
    expect((screen.getByTestId('spec-textarea') as HTMLTextAreaElement).disabled).toBe(false)
  })
})
