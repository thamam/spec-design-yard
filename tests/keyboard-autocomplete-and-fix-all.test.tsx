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

    // Press ArrowRight to move selection to "Stage"
    fireEvent.keyDown(textarea, { key: 'ArrowRight' })
    
    // Press Tab/Enter to apply selection "Stage"
    fireEvent.keyDown(textarea, { key: 'Tab' })

    // Verify textarea has the auto-completed text "Stage"
    expect(textarea.value).toContain('type: Stage')
  })
})
