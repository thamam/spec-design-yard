import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import { EditorPanel } from '../components/workspace/editor-panel'
import { waitForWorkspaceHydration } from './wait-for-hydration'

const SPEC_WITH_METADATA = `system:
  name: Disclosure System
  metadata:
    owner: architecture-team
    version: 1.0.0
    status: draft
    description: A system with metadata already present.
  components:
    - id: inbox
      type: Store
      name: inbox/
      metadata:
        owner: tom
        status: draft
        color: indigo
        version: 2.0.0
        description: Incoming mailbox
        latency: 40
        throughput: 300
      connections:
        - target: digest_stage
          label: ingest
    - id: digest_stage
      type: Stage
      name: digest
`

async function loadSpecAndSelect(componentId: string) {
  const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
  fireEvent.change(textarea, { target: { value: SPEC_WITH_METADATA } })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
  fireEvent.click(screen.getByRole('tab', { name: /Metrics/i }))
  const row = screen.getAllByRole('button').find((el) => {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
    return text.startsWith(componentId) && /Store|Stage|Brick|Gateway/i.test(text)
  })
  if (!row) throw new Error(`no metrics row for ${componentId}`)
  fireEvent.click(row)
}

describe('Focus progressive disclosure', () => {
  test('default selected view shows name and type, not the dense fields', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()
    await loadSpecAndSelect('inbox')

    expect(screen.getByTestId('focus-name-input')).toBeInTheDocument()
    expect(screen.getByTestId('focus-type-select')).toBeInTheDocument()
    expect((screen.getByTestId('focus-name-input') as HTMLInputElement).value).toBe('inbox/')
    expect((screen.getByTestId('focus-type-select') as HTMLSelectElement).value).toBe('Store')

    expect(screen.queryByTestId('focus-owner-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('focus-status-select')).not.toBeInTheDocument()
    expect(screen.queryByTestId('focus-color-select')).not.toBeInTheDocument()
    expect(screen.queryByTestId('focus-version-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('focus-description-textarea')).not.toBeInTheDocument()
    expect(screen.queryByTestId('focus-latency-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('focus-throughput-input')).not.toBeInTheDocument()
  })

  test('ID rename is not the first or primary field', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()
    await loadSpecAndSelect('inbox')

    expect(screen.queryByTestId('focus-id-input')).not.toBeInTheDocument()
    expect(screen.getByTestId('focus-name-input')).toBeInTheDocument()
    expect(screen.getByTestId('focus-duplicate-btn')).toBeInTheDocument()
  })

  test('connection chips show counts and opening Connections reveals the lists', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()
    await loadSpecAndSelect('inbox')

    const outgoingChip = screen.getByRole('button', { name: /1 outgoing/i })
    const incomingChip = screen.getByRole('button', { name: /0 incoming/i })
    expect(outgoingChip).toBeInTheDocument()
    expect(incomingChip).toBeInTheDocument()

    expect(screen.getByTitle('Focus on digest_stage')).toBeInTheDocument()
    expect(screen.getByText('ingest')).toBeInTheDocument()
    expect(screen.queryByTestId('add-connection-select')).not.toBeInTheDocument()
    expect(screen.queryByTestId('focus-conn-label-input-digest_stage')).not.toBeInTheDocument()

    const connectionsDisclosure = screen.getByRole('button', { name: /^connections$/i })
    expect(connectionsDisclosure).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(connectionsDisclosure)
    expect(connectionsDisclosure).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTitle('Focus on digest_stage')).not.toBeInTheDocument()
    fireEvent.click(incomingChip)
    expect(connectionsDisclosure).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTitle('Focus on digest_stage')).toBeInTheDocument()
  })

  test('expanding a connection row reveals disconnect and label edit', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()
    await loadSpecAndSelect('inbox')

    expect(screen.queryByTestId('focus-conn-label-input-digest_stage')).not.toBeInTheDocument()
    const editBtn = screen.getByRole('button', { name: /edit outgoing connection to digest_stage/i })
    fireEvent.click(editBtn)
    expect(screen.getByTestId('focus-conn-label-input-digest_stage')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument()
    fireEvent.click(editBtn)
    expect(screen.queryByTestId('focus-conn-label-input-digest_stage')).not.toBeInTheDocument()
  })

  test('Add connection is a compact control, not a second full form', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()
    await loadSpecAndSelect('inbox')

    expect(screen.queryByTestId('add-connection-select')).not.toBeInTheDocument()
    const addToggle = screen.getByRole('button', { name: /add outgoing connection/i })
    fireEvent.click(addToggle)
    expect(screen.getByTestId('add-connection-select')).toBeInTheDocument()
    expect(screen.getByTestId('add-connection-label-input')).toBeInTheDocument()
    fireEvent.click(addToggle)
    expect(screen.queryByTestId('add-connection-select')).not.toBeInTheDocument()
  })

  test('Live YAML dump is absent until Show compiled spec is opened', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()
    await loadSpecAndSelect('inbox')

    expect(screen.queryByTestId('focus-compiled-spec')).not.toBeInTheDocument()
    expect(screen.queryByText(/Live AST-Reconciled Spec/i)).not.toBeInTheDocument()

    const compiledBtn = screen.getByRole('button', { name: /show compiled spec/i })
    expect(compiledBtn).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(compiledBtn)

    expect(screen.getByTestId('focus-compiled-spec')).toBeInTheDocument()
    expect(screen.getByTestId('focus-compiled-spec').textContent).toMatch(/inbox/)
    expect(compiledBtn).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(compiledBtn)
    expect(screen.queryByTestId('focus-compiled-spec')).not.toBeInTheDocument()
  })

  test('activating Details by keyboard-reachable button reveals hidden fields', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()
    await loadSpecAndSelect('inbox')

    const details = screen.getByRole('button', { name: /^details$/i })
    expect(details.tagName).toBe('BUTTON')
    expect(details).toHaveAttribute('aria-expanded', 'false')
    details.focus()
    expect(document.activeElement).toBe(details)
    fireEvent.click(details)

    expect(details).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('focus-owner-input')).toBeInTheDocument()
    expect(screen.getByTestId('focus-status-select')).toBeInTheDocument()
    expect(screen.getByTestId('focus-color-select')).toBeInTheDocument()
    expect(screen.getByTestId('focus-version-input')).toBeInTheDocument()
    expect(screen.getByTestId('focus-description-textarea')).toBeInTheDocument()
    expect(screen.getByTestId('focus-latency-input')).toBeInTheDocument()
    expect(screen.getByTestId('focus-throughput-input')).toBeInTheDocument()
    expect(screen.getByTestId('focus-id-input')).toBeInTheDocument()
  })

  test('nothing-selected shows system name and keeps extra metadata collapsed', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: SPEC_WITH_METADATA } })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    fireEvent.click(screen.getByRole('tab', { name: /Focus/i }))

    expect(screen.getByText('Global System Settings')).toBeInTheDocument()
    expect(screen.getByTestId('focus-system-name-input')).toBeInTheDocument()
    expect((screen.getByTestId('focus-system-name-input') as HTMLInputElement).value).toBe('Disclosure System')

    expect(screen.queryByTestId('focus-system-version-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('focus-system-status-select')).not.toBeInTheDocument()
    expect(screen.queryByTestId('focus-system-owner-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('focus-system-description-textarea')).not.toBeInTheDocument()

    const details = screen.getByRole('button', { name: /^details$/i })
    expect(details.tagName).toBe('BUTTON')
    fireEvent.click(details)
    expect(screen.getByTestId('focus-system-version-input')).toBeInTheDocument()
    expect(screen.getByTestId('focus-system-owner-input')).toBeInTheDocument()
    fireEvent.click(details)
    expect(screen.queryByTestId('focus-system-version-input')).not.toBeInTheDocument()
  })

  test('disclosure state is session-local and resets on remount', async () => {
    const { unmount } = render(<Workspace />)
    await waitForWorkspaceHydration()
    await loadSpecAndSelect('inbox')
    fireEvent.click(screen.getByRole('button', { name: /^details$/i }))
    expect(screen.getByTestId('focus-owner-input')).toBeInTheDocument()

    unmount()
    render(<Workspace />)
    await waitForWorkspaceHydration()
    await loadSpecAndSelect('inbox')
    expect(screen.queryByTestId('focus-owner-input')).not.toBeInTheDocument()
  })
})

describe('FocusTab disclosure via EditorPanel (no Workspace hydration)', () => {
  test('selected unit starts with Details collapsed', () => {
    const specText = SPEC_WITH_METADATA
    render(
      <EditorPanel
        specText={specText}
        setSpecText={() => {}}
        parsedSpec={{
          system: {
            name: 'Disclosure System',
            components: [
              {
                id: 'inbox',
                type: 'Store',
                name: 'inbox/',
                metadata: { owner: 'tom', latency: 40, throughput: 300 },
                connections: [{ target: 'digest_stage', label: 'ingest' }],
              },
              { id: 'digest_stage', type: 'Stage', name: 'digest' },
            ],
          },
        }}
        selectedUnit="inbox"
        setSelectedUnit={() => {}}
        activeTab="focus"
        setActiveTab={() => {}}
      />
    )

    expect(screen.getByTestId('focus-name-input')).toBeInTheDocument()
    expect(screen.queryByTestId('focus-owner-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('focus-latency-input')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /1 outgoing/i })).toBeInTheDocument()
  })

  test('incoming compact rows and add control follow the same disclosure', () => {
    render(
      <EditorPanel
        specText={SPEC_WITH_METADATA}
        setSpecText={() => {}}
        parsedSpec={{
          system: {
            name: 'Disclosure System',
            components: [
              {
                id: 'inbox',
                type: 'Store',
                name: 'inbox/',
                connections: [{ target: 'digest_stage', label: 'ingest' }],
              },
              { id: 'digest_stage', type: 'Stage', name: 'digest' },
            ],
          },
        }}
        selectedUnit="digest_stage"
        setSelectedUnit={() => {}}
        activeTab="focus"
        setActiveTab={() => {}}
      />
    )

    expect(screen.getByRole('button', { name: /1 incoming/i })).toBeInTheDocument()
    expect(screen.queryByTestId('focus-inbound-conn-label-input-inbox')).not.toBeInTheDocument()
    expect(screen.queryByTestId('add-inbound-connection-select')).not.toBeInTheDocument()

    const editIncoming = screen.getByRole('button', { name: /edit incoming connection from inbox/i })
    fireEvent.click(editIncoming)
    expect(screen.getByTestId('focus-inbound-conn-label-input-inbox')).toBeInTheDocument()
    fireEvent.click(editIncoming)
    expect(screen.queryByTestId('focus-inbound-conn-label-input-inbox')).not.toBeInTheDocument()

    const addIncoming = screen.getByRole('button', { name: /add incoming connection/i })
    fireEvent.click(addIncoming)
    expect(screen.getByTestId('add-inbound-connection-select')).toBeInTheDocument()
    fireEvent.click(addIncoming)
    expect(screen.queryByTestId('add-inbound-connection-select')).not.toBeInTheDocument()
  })
})
