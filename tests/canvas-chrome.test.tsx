import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { CanvasPanel } from '../components/workspace/canvas-panel'

const emptySpec = { system: { name: 'Test', components: [] } }

describe('Canvas chrome honesty', () => {
  test('Preview is disabled with a not-available title and still occupies the toolbar', () => {
    render(<CanvasPanel parsedSpec={emptySpec} />)
    const preview = screen.getByRole('button', { name: 'Preview' })
    expect(preview).toBeDisabled()
    expect(preview).toHaveAttribute('title', expect.stringMatching(/not available/i))
    expect(preview).toBeVisible()
  })

  test('Fullscreen covers the canvas panel and can be exited', () => {
    render(<CanvasPanel parsedSpec={emptySpec} />)
    const panel = screen.getByTestId('canvas-panel')
    expect(panel.getAttribute('data-fullscreen')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }))
    expect(panel.getAttribute('data-fullscreen')).toBe('true')
    expect(panel.className).toMatch(/fixed/)

    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(panel.getAttribute('data-fullscreen')).toBe('false')
  })

  test('security overlay turns off when leaving Security unless the user pinned it', () => {
    const { rerender } = render(<CanvasPanel parsedSpec={emptySpec} activeTab="code" />)
    const overlay = screen.getByRole('button', { name: 'Security Threats Overlay' })
    expect(overlay.getAttribute('aria-pressed')).toBe('false')

    rerender(<CanvasPanel parsedSpec={emptySpec} activeTab="security" />)
    expect(overlay.getAttribute('aria-pressed')).toBe('true')

    rerender(<CanvasPanel parsedSpec={emptySpec} activeTab="code" />)
    expect(overlay.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(overlay)
    expect(overlay.getAttribute('aria-pressed')).toBe('true')
    rerender(<CanvasPanel parsedSpec={emptySpec} activeTab="security" />)
    rerender(<CanvasPanel parsedSpec={emptySpec} activeTab="focus" />)
    expect(overlay.getAttribute('aria-pressed')).toBe('true')
  })
})
