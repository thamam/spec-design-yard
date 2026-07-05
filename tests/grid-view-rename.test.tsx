import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import yaml from 'yaml'

describe('Grid View Interactive Double-Click Renaming', () => {
  test('supports entering renaming mode, validation error feedback, canceling, and successful ID renaming', async () => {
    render(<Workspace />)

    // 1. Switch to Grid View
    const gridViewBtn = screen.getByRole('tab', { name: /Grid/i })
    fireEvent.click(gridViewBtn)

    // 2. Select inbox card element
    const inboxCard = screen.getByRole('button', { name: /Select component inbox/i })
    expect(inboxCard).toBeInTheDocument()

    // 3. Double-click inbox card to enter renaming mode
    fireEvent.doubleClick(inboxCard)

    // Verify input is rendered
    const renameInput = screen.getByTestId('grid-rename-input-inbox') as HTMLInputElement
    expect(renameInput).toBeInTheDocument()
    expect(renameInput.value).toBe('inbox')

    const saveBtn = screen.getByTestId('grid-rename-save-inbox')
    const cancelBtn = screen.getByTestId('grid-rename-cancel-inbox')
    expect(saveBtn).toBeInTheDocument()
    expect(cancelBtn).toBeInTheDocument()

    // 4. Test empty ID validation
    fireEvent.change(renameInput, { target: { value: '   ' } })
    fireEvent.click(saveBtn)
    expect(screen.getByTestId('grid-rename-error')).toHaveTextContent('ID cannot be empty.')

    // 5. Test invalid characters validation
    fireEvent.change(renameInput, { target: { value: 'inbox node!' } })
    fireEvent.click(saveBtn)
    expect(screen.getByTestId('grid-rename-error')).toHaveTextContent('ID must be alphanumeric, hyphen, or underscore.')

    // 6. Test duplicate ID validation
    fireEvent.change(renameInput, { target: { value: 'digest_stage' } })
    fireEvent.click(saveBtn)
    expect(screen.getByTestId('grid-rename-error')).toHaveTextContent('Component ID "digest_stage" already exists.')

    // 7. Test Cancel discarding changes
    fireEvent.click(cancelBtn)
    expect(screen.queryByTestId('grid-rename-input-inbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Select component inbox/i })).toBeInTheDocument()

    // 8. Re-enter renaming mode on inbox card
    fireEvent.doubleClick(inboxCard)
    const renameInput2 = screen.getByTestId('grid-rename-input-inbox') as HTMLInputElement
    const saveBtn2 = screen.getByTestId('grid-rename-save-inbox')

    // 9. Successfully rename to incoming_mailbox
    fireEvent.change(renameInput2, { target: { value: 'incoming_mailbox' } })
    fireEvent.click(saveBtn2)

    // Verify renaming mode exits and spec textarea is updated
    expect(screen.queryByTestId('grid-rename-input-inbox')).not.toBeInTheDocument()
    
    // Expect the card now represents the renamed component ID
    expect(screen.getByRole('button', { name: /Select component incoming_mailbox/i })).toBeInTheDocument()

    // Verify that the spec text has been updated with the renamed ID and references
    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const parsed = yaml.parse(textarea.value)

    const mailboxComp = parsed.system.components.find((c: any) => c.id === 'incoming_mailbox')
    expect(mailboxComp).toBeDefined()
    expect(parsed.system.components.find((c: any) => c.id === 'inbox')).toBeUndefined()

    // Verify reference update (rename digest_stage to processed_digest, and check incoming_mailbox's target updates)
    const digestCard = screen.getByRole('button', { name: /Select component digest_stage/i })
    expect(digestCard).toBeInTheDocument()
    fireEvent.doubleClick(digestCard)

    const renameInput3 = screen.getByTestId('grid-rename-input-digest_stage') as HTMLInputElement
    const saveBtn3 = screen.getByTestId('grid-rename-save-digest_stage')

    fireEvent.change(renameInput3, { target: { value: 'processed_digest' } })
    fireEvent.click(saveBtn3)

    // Verify renaming mode exits
    expect(screen.queryByTestId('grid-rename-input-digest_stage')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Select component processed_digest/i })).toBeInTheDocument()

    // Parse the updated spec textarea again
    const textarea2 = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const parsed2 = yaml.parse(textarea2.value)

    // Verify digest_stage is renamed to processed_digest
    const processedComp = parsed2.system.components.find((c: any) => c.id === 'processed_digest')
    expect(processedComp).toBeDefined()
    expect(parsed2.system.components.find((c: any) => c.id === 'digest_stage')).toBeUndefined()

    // Verify that incoming_mailbox's connection target has been updated to processed_digest
    const mailboxCompUpdated = parsed2.system.components.find((c: any) => c.id === 'incoming_mailbox')
    expect(mailboxCompUpdated.connections[0].target).toBe('processed_digest')
  })
})
