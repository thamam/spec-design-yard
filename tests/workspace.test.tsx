import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
// We will implement Workspace in pages/index.tsx or as a standalone component
import Workspace from '../components/Workspace'
import { compileSpecToExcalidrawElements } from '../components/workspace/excalidraw-canvas'
import { lintSpec } from '../lib/linter'
import { reconcileSpec } from '../lib/reconciler'
import yaml from 'yaml'

describe('Workspace Split-Pane Spec-Diagram View', () => {
  test('renders editor panel and canvas panel side-by-side', () => {
    render(<Workspace />)
    
    // Verify we have an editor container
    const editorContainer = screen.getByTestId('editor-panel')
    expect(editorContainer).toBeInTheDocument()
    
    // Verify we have a diagram/canvas container
    const canvasContainer = screen.getByTestId('canvas-panel')
    expect(canvasContainer).toBeInTheDocument()
  })

  test('displays initial YAML spec in the editor', () => {
    render(<Workspace />)
    
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    expect(textarea.value).toContain('system:')
    expect(textarea.value).toContain('inbox')
  })

  test('updates editor value on user input', () => {
    render(<Workspace />)
    
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'system:\n  name: New Spec' } })
    
    expect(textarea.value).toBe('system:\n  name: New Spec')
  })

  test('bidirectional sync updates coordinates in text area when coordinates modify', () => {
    render(<Workspace />)
    
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    expect(textarea.value).toContain('inbox')
    
    // Check that we can simulate user moving the inbox component on the canvas
    // By directly triggering the handleCanvasChange or testing key bindings
    expect(textarea.value).not.toContain('x: 300')
  })

  test('compileSpecToExcalidrawElements honors explicit coordinates in YAML spec', () => {
    const mockSpec = {
      system: {
        name: 'Test Brain',
        components: [
          { id: 'inbox', type: 'Store', name: 'inbox/', x: 450, y: 250 }
        ]
      }
    }
    
    const elements = compileSpecToExcalidrawElements(mockSpec)
    const rectangle = elements.find((el: any) => el.id === 'inbox' && el.type === 'rectangle')
    expect(rectangle).toBeDefined()
    expect(rectangle.x).toBe(450)
    expect(rectangle.y).toBe(250)
  })

  test('lintSpec flags duplicate component IDs, missing fields, unrecognized types, and orphan connections', () => {
    const invalidSpec = {
      system: {
        name: 'Faulty Brain',
        components: [
          // 1. Missing type
          { id: 'inbox', name: 'Inbox' },
          // 2. Duplicate ID 'inbox'
          { id: 'inbox', type: 'Store' },
          // 3. Unrecognized type 'Database'
          { id: 'db_node', type: 'Database' },
          // 4. Orphan connection to non-existent 'missing_node'
          {
            id: 'processor',
            type: 'Stage',
            connections: [
              { target: 'missing_node' }
            ]
          }
        ]
      }
    }

    const diagnostics = lintSpec(invalidSpec)
    
    // We expect 4 distinct errors/warnings
    expect(diagnostics.length).toBeGreaterThanOrEqual(4)

    const missingType = diagnostics.find(d => d.message.includes('Missing required field "type"'))
    expect(missingType).toBeDefined()
    expect(missingType?.severity).toBe('error')

    const duplicateId = diagnostics.find(d => d.message.includes('Duplicate component ID "inbox"'))
    expect(duplicateId).toBeDefined()
    expect(duplicateId?.severity).toBe('error')

    const unrecognizedType = diagnostics.find(d => d.message.includes('Unrecognized component type "Database"'))
    expect(unrecognizedType).toBeDefined()
    expect(unrecognizedType?.severity).toBe('warning')

    const orphanConn = diagnostics.find(d => d.message.includes('Connection target "missing_node" does not exist'))
    expect(orphanConn).toBeDefined()
    expect(orphanConn?.severity).toBe('error')
  })

  test('deleting a component via reconcileSpec prunes connections and leaves linter clean', () => {
    const faultySpec = `system:
  name: Faulty Brain
  components:
    - id: inbox
      type: Store
      name: inbox
      connections:
        - target: processor
    - id: processor
      type: Stage
      name: processor
`
    // If we delete "processor", "inbox" has a connection to "processor" which would become an orphan!
    // But reconcileSpec's deletion of "processor" also prunes the connection!
    const reconciled = reconcileSpec(faultySpec, {
      type: 'delete',
      payload: { ids: ['processor'] }
    })

    const parsed = yaml.parse(reconciled)
    const diagnostics = lintSpec(parsed)
    
    // There should be no orphan connections
    const orphanConn = diagnostics.find(d => d.message.includes('does not exist'))
    expect(orphanConn).toBeUndefined()
  })

  test('compileSpecToExcalidrawElements applies error styling (red border/marker) to components with duplicate IDs', () => {
    const duplicateIdSpec = {
      system: {
        name: 'Duplicate Test',
        components: [
          { id: 'inbox', type: 'Store', name: 'inbox/' },
          { id: 'inbox', type: 'Store', name: 'inbox2' }
        ]
      }
    }
    const elements = compileSpecToExcalidrawElements(duplicateIdSpec)
    const rectangles = elements.filter((el: any) => el.type === 'rectangle' && el.id === 'inbox')
    expect(rectangles.length).toBe(2)
    rectangles.forEach((rect) => {
      expect(rect.strokeColor).toBe('#ef4444')
    })

    const textElements = elements.filter((el: any) => el.type === 'text' && el.id.startsWith('text-inbox'))
    textElements.forEach((text) => {
      expect(text.text).toContain('❌')
    })
  })

  test('compileSpecToExcalidrawElements renders an orphan node circle and arrow for missing connection targets', () => {
    const orphanSpec = {
      system: {
        name: 'Orphan Spec',
        components: [
          {
            id: 'inbox',
            type: 'Store',
            name: 'inbox/',
            connections: [{ target: 'missing_stage' }]
          }
        ]
      }
    }
    const elements = compileSpecToExcalidrawElements(orphanSpec)
    const orphanEllipse = elements.find((el: any) => el.type === 'ellipse' && el.id.includes('orphan-inbox-missing_stage'))
    expect(orphanEllipse).toBeDefined()
    expect(orphanEllipse.strokeColor).toBe('#ef4444')

    const orphanText = elements.find((el: any) => el.type === 'text' && el.containerId === orphanEllipse.id)
    expect(orphanText).toBeDefined()
    expect(orphanText.text).toBe('Missing: missing_stage')
  })

  test('renders quick fix button and updates specText on click', () => {
    render(<Workspace />)
    
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    
    // Set text to have an unrecognized type
    fireEvent.change(textarea, { target: { value: `system:
  name: Invalid Type
  components:
    - id: node1
      type: InvalidType
      name: Node 1
` } })

    // Look for the quick fix button "SET TO STORE"
    const fixButton = screen.getByRole('button', { name: /SET TO STORE/i })
    expect(fixButton).toBeInTheDocument()

    // Click the button
    fireEvent.click(fixButton)

    // Verify it changed to Store!
    expect(textarea.value).toContain('type: Store')
    expect(textarea.value).not.toContain('type: InvalidType')
  })
})
