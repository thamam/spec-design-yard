import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
// We will implement Workspace in pages/index.tsx or as a standalone component
import Workspace from '../components/Workspace'

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
    expect(textarea.value).toContain('api_gateway')
  })

  test('updates editor value on user input', () => {
    render(<Workspace />)
    
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'system:\n  name: New Spec' } })
    
    expect(textarea.value).toBe('system:\n  name: New Spec')
  })
})
