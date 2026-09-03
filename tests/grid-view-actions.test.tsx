import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import yaml from 'yaml'
import { waitForWorkspaceHydration } from './wait-for-hydration'

describe('Grid View Interactive Actions & Inline Quick-Fixes', () => {
  test('supports deleting a component directly from its card in Grid View', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

    // 1. Switch to Grid View
    const gridViewBtn = screen.getByRole('tab', { name: /Grid/i })
    fireEvent.click(gridViewBtn)

    // 2. Locate b4_context card and delete button
    const cardBefore = screen.getByRole('button', { name: /Select component b4_context/i })
    expect(cardBefore).toBeInTheDocument()

    const deleteBtn = screen.getByTestId('grid-delete-b4_context')
    expect(deleteBtn).toBeInTheDocument()

    // 3. Click delete button
    fireEvent.click(deleteBtn)

    // 4. Verify card is gone
    expect(screen.queryByRole('button', { name: /Select component b4_context/i })).not.toBeInTheDocument()

    // 5. Verify the spec text has deleted the component and references
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const parsed = yaml.parse(textarea.value)
    const b4Comp = parsed.system.components.find((c: any) => c.id === 'b4_context')
    expect(b4Comp).toBeUndefined()
  })

  test('supports duplicating a component directly from its card in Grid View', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

    // 1. Switch to Grid View
    const gridViewBtn = screen.getByRole('tab', { name: /Grid/i })
    fireEvent.click(gridViewBtn)

    // 2. Locate b4_context card and duplicate button
    const cardBefore = screen.getByRole('button', { name: /Select component b4_context/i })
    expect(cardBefore).toBeInTheDocument()

    const duplicateBtn = screen.getByTestId('grid-duplicate-b4_context')
    expect(duplicateBtn).toBeInTheDocument()

    // 3. Click duplicate button
    fireEvent.click(duplicateBtn)

    // 4. Verify card copy exists
    expect(screen.getByRole('button', { name: /Select component b4_context_1/i })).toBeInTheDocument()

    // 5. Verify the spec text has duplicated the component
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const parsed = yaml.parse(textarea.value)
    const b4CompCopy = parsed.system.components.find((c: any) => c.id === 'b4_context_1')
    expect(b4CompCopy).toBeDefined()
    expect(b4CompCopy.name).toBe('B4: Context Copy')
  })

  test('supports duplicating a component multiple times resolving suffixes sequentially without infinite loops', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

    // Switch to Grid View
    const gridViewBtn = screen.getByRole('tab', { name: /Grid/i })
    fireEvent.click(gridViewBtn)

    // First duplication of b4_context -> creates b4_context_1
    const duplicateBtn = screen.getByTestId('grid-duplicate-b4_context')
    fireEvent.click(duplicateBtn)
    expect(screen.getByRole('button', { name: /Select component b4_context_1/i })).toBeInTheDocument()

    // Second duplication of b4_context -> should create b4_context_2 (resolving existing b4_context_1)
    fireEvent.click(duplicateBtn)
    expect(screen.getByRole('button', { name: /Select component b4_context_2/i })).toBeInTheDocument()

    // Verify both exist in spec
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const parsed = yaml.parse(textarea.value)
    expect(parsed.system.components.find((c: any) => c.id === 'b4_context_1')).toBeDefined()
    expect(parsed.system.components.find((c: any) => c.id === 'b4_context_2')).toBeDefined()
  })

  test('supports resolving a diagnostic with inline quick-fix button on the card', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

    // 1. Switch to Grid View
    const gridViewBtn = screen.getByRole('tab', { name: /Grid/i })
    fireEvent.click(gridViewBtn)

    // 2. Select inbox card, which has "stride-tampering" because of unlabeled connection
    const inboxCard = screen.getByRole('button', { name: /Select component inbox/i })
    expect(inboxCard).toBeInTheDocument()

    // Verify there is an inline fix button for stride-tampering
    const fixBtn = screen.getByTestId('grid-quick-fix-stride-tampering-inbox')
    expect(fixBtn).toBeInTheDocument()
    expect(fixBtn).toHaveTextContent(/Fix/i)

    // 3. Click quick-fix button
    fireEvent.click(fixBtn)

    // 4. Verify the connection label has been updated to secure channel in the spec
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const parsed = yaml.parse(textarea.value)
    const inboxComp = parsed.system.components.find((c: any) => c.id === 'inbox')
    expect(inboxComp.connections[0].label).toBe('encrypted TLS auth-token flow')
  })
})
