import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { reconcileSpec } from '../lib/reconciler'
import { lintSpec } from '../lib/linter'
import Workspace from '../components/Workspace'
import yaml from 'yaml'

describe('Keyboard Autocomplete and Quick-Fix-All Feature', () => {
  test('reconcileSpec supports quick-fix-all to atomically apply multiple fixes', () => {
    const initial = `system:
  components:
    - id: node_a
      type: InvalidType
    - id: node_b
      type: Stage
      metadata:
        - invalid-array-metadata
`
    // We want to fix unrecognized type of node_a and invalid metadata of node_b
    const reconciled = reconcileSpec(initial, {
      type: 'quick-fix-all',
      payload: {
        fixes: [
          { path: 'system.components[0].type', fixType: 'unrecognized-type', extraData: { type: 'Stage' } },
          { path: 'system.components[1].metadata', fixType: 'invalid-metadata-object' }
        ]
      }
    })

    const parsed = yaml.parse(reconciled)
    expect(parsed.system.components[0].type).toBe('Stage')
    expect(parsed.system.components[1].metadata).toEqual({})
  })

  test('textarea in CodeTab supports arrow keys to navigate and Tab/Enter to apply autocomplete', () => {
    render(<Workspace />)
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement

    // Set value to trigger autocomplete for type suggestion
    fireEvent.change(textarea, { target: { value: 'system:\n  components:\n    - id: node_x\n      type: S' } })
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    
    // Trigger onSelect/onChange cursor tracking
    fireEvent.select(textarea)

    // Verify autocomplete box is visible and shows Store, Stage
    const storeBtn = screen.getByText('Store')
    const stageBtn = screen.getByText('Stage')
    expect(storeBtn).toBeInTheDocument()
    expect(stageBtn).toBeInTheDocument()

    // Press ArrowDown to move selection to "Stage"
    fireEvent.keyDown(textarea, { key: 'ArrowDown' })
    
    // Press Tab/Enter to apply selection "Stage"
    fireEvent.keyDown(textarea, { key: 'Tab' })

    // Verify textarea has the auto-completed text "Stage"
    expect(textarea.value).toContain('type: Stage')
  })

  test('reconcileSpec quick-fix-all processes index-based deletions in descending order to avoid index shift issues', () => {
    const initial = `system:
  name: Shift Test
  components:
    - id: node_a
      type: Stage
    - id: node_b
      type: Stage
    - id: node_c
      type: Stage
`
    // If we want to delete node_a (index 0) and node_b (index 1),
    // processing in original order would shift node_b to index 0,
    // and attempt to delete index 1 which is now node_c!
    // With descending sort, we delete node_b (index 1) first, and then node_a (index 0).
    const reconciled = reconcileSpec(initial, {
      type: 'quick-fix-all',
      payload: {
        fixes: [
          { path: 'system.components[0]', fixType: 'delete-component' },
          { path: 'system.components[1]', fixType: 'delete-component' }
        ]
      }
    })

    const parsed = yaml.parse(reconciled)
    expect(parsed.system.components.length).toBe(1)
    expect(parsed.system.components[0].id).toBe('node_c')
  })

  test('textarea in CodeTab does not apply autocomplete with Enter key unless navigated', () => {
    render(<Workspace />)
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement

    // Case A: No navigation, press Enter. It should NOT apply autocomplete.
    fireEvent.change(textarea, { target: { value: 'system:\n  components:\n    - id: node_x\n      type: S' } })
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    fireEvent.select(textarea)

    fireEvent.keyDown(textarea, { key: 'Enter' })
    // Value remains unchanged (Enter was not hijacked to replace "S" with "Store" or "Stage")
    expect(textarea.value).toContain('type: S')

    // Case B: Navigated, press Enter. It SHOULD apply autocomplete.
    fireEvent.keyDown(textarea, { key: 'ArrowDown' }) // selects Stage
    fireEvent.keyDown(textarea, { key: 'Enter' }) // applies Stage
    expect(textarea.value).toContain('type: Stage')
  })

  test('reconcileSpec quick-fix-all skips modifications on a sub-path of an already deleted component', () => {
    const initial = `system:
  name: Shift and Skip Test
  components:
    - id: node_a
      type: Stage
      metadata:
        invalid: array
    - id: node_b
      type: Stage
`
    // If we delete components[0] (node_a), then we shouldn't attempt to modify components[0].metadata
    // because that component is deleted!
    const reconciled = reconcileSpec(initial, {
      type: 'quick-fix-all',
      payload: {
        fixes: [
          { path: 'system.components[0]', fixType: 'delete-component' },
          { path: 'system.components[0].metadata', fixType: 'invalid-metadata-object' }
        ]
      }
    })

    const parsed = yaml.parse(reconciled)
    // node_a is deleted, so only node_b remains. Its metadata shouldn't be affected.
    expect(parsed.system.components.length).toBe(1)
    expect(parsed.system.components[0].id).toBe('node_b')
  })
})
