import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React, { useState, useEffect } from 'react'
import { EditorPanel } from '../components/workspace/editor-panel'

function makeSpec(owner: string) {
  return {
    system: {
      name: 'Test System',
      components: [
        {
          id: 'svc',
          type: 'Stage',
          name: 'Service',
          metadata: { owner, status: 'draft' },
        },
      ],
    },
  }
}

// Harness controls parsedSpec independently of the field's own onChange, so we
// can simulate an "external" spec update (e.g. a remote sync) landing while the
// owner field is focused with unsaved keystrokes, without ever moving DOM focus.
function Harness() {
  const [specText, setSpecText] = useState('system:\n  name: Test System\n')
  const [parsedSpec, setParsedSpec] = useState<any>(makeSpec('tom'))
  const [selectedUnit, setSelectedUnit] = useState<string | null>('svc')

  useEffect(() => {
    ;(window as any).__testSetParsedSpec = setParsedSpec
    return () => {
      delete (window as any).__testSetParsedSpec
    }
  }, [])

  return (
    <EditorPanel
      specText={specText}
      setSpecText={setSpecText as any}
      parsedSpec={parsedSpec}
      selectedUnit={selectedUnit}
      setSelectedUnit={setSelectedUnit}
    />
  )
}

describe('FocusTab focus-guard reads data-focus-field, not data-testid', () => {
  test('external spec change does not clobber a focused field mid-edit, but syncs once unfocused', () => {
    render(<Harness />)

    const ownerInput = screen.getByTestId('focus-owner-input') as HTMLInputElement
    expect(ownerInput.value).toBe('tom')
    expect(ownerInput.getAttribute('data-focus-field')).toBe('focus-owner-input')

    // Focus the field and simulate in-progress typing that hasn't been persisted yet.
    act(() => {
      ownerInput.focus()
    })
    expect(document.activeElement).toBe(ownerInput)

    fireEvent.change(ownerInput, { target: { value: 'in-progress-edit' } })
    expect(ownerInput.value).toBe('in-progress-edit')

    // Simulate an external update to parsedSpec (e.g. a remote/canvas sync) while focused.
    act(() => {
      ;(window as any).__testSetParsedSpec(makeSpec('external-remote-value'))
    })

    // The focused field's in-progress value must survive the external update.
    expect(ownerInput.value).toBe('in-progress-edit')
    expect(ownerInput.value).not.toBe('external-remote-value')

    // Once the field loses focus, the next external update is free to sync in.
    act(() => {
      ownerInput.blur()
    })
    act(() => {
      ;(window as any).__testSetParsedSpec(makeSpec('after-blur-value'))
    })
    expect(ownerInput.value).toBe('after-blur-value')
  })
})

describe('production code does not read data-testid for runtime logic', () => {
  test('components/ contains no getAttribute("data-testid") calls', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')

    const root = path.join(process.cwd(), 'components')
    const entries = await fs.readdir(root, { recursive: true, withFileTypes: true })

    const offenders: string[] = []
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!/\.(ts|tsx)$/.test(entry.name)) continue
      const parentPath = (entry as any).parentPath ?? (entry as any).path ?? root
      const filePath = path.join(parentPath, entry.name)
      const source = await fs.readFile(filePath, 'utf-8')
      if (/getAttribute\(\s*["']data-testid["']\s*\)/.test(source)) {
        offenders.push(filePath)
      }
    }

    expect(offenders).toEqual([])
  })
})
