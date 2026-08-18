import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import { db } from '../lib/db'

// Regression guard: the debounced auto-save hardcoded the document title
// ("External Brain v0.2") instead of deriving it from the spec's system.name.
describe('Auto-save derives document title from the spec', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      localStorage.clear()
    }
    vi.restoreAllMocks()
  })

  afterEach(() => {
    if (typeof window !== 'undefined') {
      localStorage.clear()
    }
    vi.restoreAllMocks()
  })

  test('saving a spec whose system.name is "My Yard" persists title "My Yard"', async () => {
    render(<Workspace />)

    const myYardSpec = `system:
  name: My Yard
  components:
    - id: yard_node
      type: Stage
`
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: myYardSpec } })

    // Wait past the 1000ms debounce
    await waitFor(() => {
      expect(db.getSpec("main")?.title).toBe("My Yard")
    }, { timeout: 3000 })
    expect(db.getSpec("main")?.yamlContent).toContain('yard_node')
  })

  test('falls back to the previously stored title when the spec has no system.name', async () => {
    db.saveSpec("main", "Previously Stored Title", `system:
  name: Previously Stored Title
  components:
    - id: seed_node
      type: Stage
`)

    render(<Workspace />)

    // Wait for hydration of the seeded spec
    await waitFor(() => {
      const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
      expect(textarea.value).toContain('seed_node')
    })

    const namelessSpec = `system:
  components:
    - id: nameless_node
      type: Stage
`
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: namelessSpec } })

    await waitFor(() => {
      expect(db.getSpec("main")?.yamlContent).toContain('nameless_node')
    }, { timeout: 3000 })
    expect(db.getSpec("main")?.title).toBe("Previously Stored Title")
  })
})
