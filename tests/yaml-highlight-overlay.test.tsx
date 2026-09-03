import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { YamlHighlightOverlay } from '../components/workspace/yaml-highlight-overlay'
import Workspace from '../components/Workspace'
import { waitForWorkspaceHydration } from './wait-for-hydration'

describe('YamlHighlightOverlay', () => {
  const spec = `system:
  components:
    - id: inbox
      connections:
        - target: digest_stage
      metadata:
        status: active
`

  test('renders distinct computed classes for an id, a target, and a metadata key', () => {
    render(<YamlHighlightOverlay value={spec} />)
    const idSpan = screen.getByText('inbox')
    const targetSpan = screen.getByText('digest_stage')
    const keySpan = screen.getByText('status')
    expect(idSpan.className).not.toBe('')
    expect(targetSpan.className).not.toBe('')
    expect(keySpan.className).not.toBe('')
    expect(new Set([idSpan.className, targetSpan.className, keySpan.className]).size).toBe(3)
  })

  test('overlay text content preserves every non-newline character of the input value', () => {
    render(<YamlHighlightOverlay value={spec} />)
    const overlay = screen.getByTestId('yaml-highlight-overlay')
    // spec ends with a trailing newline, i.e. one trailing blank line, which
    // renders as a single placeholder space to keep that line's height
    expect(overlay.textContent).toBe(spec.replace(/\n/g, '') + ' ')
  })

  test('invalid / mid-edit YAML still renders fully, uncoloured where unclassifiable', () => {
    const garbled = 'not: valid: yaml: at: all\n  [[[ broken'
    render(<YamlHighlightOverlay value={garbled} />)
    const overlay = screen.getByTestId('yaml-highlight-overlay')
    expect(overlay.textContent).toBe(garbled.replace(/\n/g, ''))
  })
})

describe('CodeTab syntax overlay integration', () => {
  test('the overlay renders alongside the textarea and mirrors its content', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const overlay = screen.getByTestId('yaml-highlight-overlay')

    fireEvent.change(textarea, { target: { value: 'system:\n  components:\n    - id: inbox\n' } })

    expect(overlay.textContent).toContain('inbox')
  })

  test('scrolling the textarea mirrors scrollTop/scrollLeft onto the overlay', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const overlay = screen.getByTestId('yaml-highlight-overlay') as HTMLDivElement

    Object.defineProperty(textarea, 'scrollTop', { value: 120, configurable: true })
    Object.defineProperty(textarea, 'scrollLeft', { value: 40, configurable: true })
    fireEvent.scroll(textarea)

    expect(overlay.scrollTop).toBe(120)
    expect(overlay.scrollLeft).toBe(40)
  })
})
