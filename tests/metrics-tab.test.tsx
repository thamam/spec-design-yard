import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import yaml from 'yaml'

describe('Workspace Metrics Tab Feature', () => {
  test('renders Metrics tab in the Editor Panel and shows component counts', () => {
    render(<Workspace />)

    // Locate the Metrics tab button
    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    expect(metricsTabButton).toBeInTheDocument()

    // Click the Metrics tab to switch to it
    fireEvent.click(metricsTabButton)

    // Check that we see the metrics header or text
    const metricsHeader = screen.getByText(/System Architecture Metrics/i)
    expect(metricsHeader).toBeInTheDocument()

    // Since our initial spec contains several stages, stores, and bricks, let's verify their counts
    // Initial spec has:
    // Stages: digest_stage, review_stage, commit_stage (3 stages)
    // Stores: inbox, kb_store (2 stores)
    // Bricks: b1_schema, b2_ledger, b4_context, b5_prompt, b6_verify, b7_consolidate (6 bricks)
    // Total: 11 components
    
    expect(screen.getByText(/Total Components:/i)).toBeInTheDocument()
    expect(screen.getByText(/11/i)).toBeInTheDocument()

    // Verify type counts
    expect(screen.getByText(/3 Stages/i)).toBeInTheDocument()
    expect(screen.getByText(/2 Stores/i)).toBeInTheDocument()
    expect(screen.getByText(/6 Bricks/i)).toBeInTheDocument()
    expect(screen.getByText(/0 Gateways/i)).toBeInTheDocument()
  })

  test('clicking on a component in the metrics list selects it', () => {
    render(<Workspace />)

    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // Find the link or button for 'inbox' in the metrics list and click it
    const inboxItem = screen.getByRole('button', { name: /inbox/i })
    expect(inboxItem).toBeInTheDocument()
    fireEvent.click(inboxItem)

    // Switch to Focus tab to verify that 'inbox' is the selected component
    const focusTabButton = screen.getByRole('tab', { name: /Focus/i })
    fireEvent.click(focusTabButton)

    // Focus tab should show 'inbox'
    expect(screen.getByText(/Selected:/i).textContent).toContain('inbox')
  })

  test('displays diagnostics summary, health status and component warning badges', () => {
    render(<Workspace />)

    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // Should display System Health card
    expect(screen.getByText(/System Health:/i)).toBeInTheDocument()

    // Should show count of diagnostics (e.g., info diagnostics for missing metadata)
    // Let's verify we see info count
    expect(screen.getByText(/Info:/i)).toBeInTheDocument()

    // Should show component list with warning badges if components have issues
    // The initial spec has missing descriptions which are info-level diagnostics.
    // Let's check for info or warning indicators next to component list items
    const infoIndicator = screen.getAllByText(/Info/i)
    expect(infoIndicator.length).toBeGreaterThan(0)
  })

  test('searching for components by text filters the component directory', () => {
    render(<Workspace />)

    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // Initially, inbox and digest_stage are in the list
    expect(screen.getByRole('button', { name: /inbox/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /digest_stage/i })).toBeInTheDocument()

    // Find search input
    const searchInput = screen.getByPlaceholderText(/Search components.../i)
    expect(searchInput).toBeInTheDocument()

    // Type "inbox" in search input
    fireEvent.change(searchInput, { target: { value: 'inbox' } })

    // Only inbox should be shown now
    expect(screen.getByRole('button', { name: /inbox/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /digest_stage/i })).not.toBeInTheDocument()
  })

  test('filtering components by type filters the component directory', () => {
    render(<Workspace />)

    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // Initially, inbox (Store) and digest_stage (Stage) are visible
    expect(screen.getByRole('button', { name: /inbox/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /digest_stage/i })).toBeInTheDocument()

    // Find type filter select
    const typeSelect = screen.getByRole('combobox', { name: /Filter by Type/i })
    expect(typeSelect).toBeInTheDocument()

    // Select "Store" type
    fireEvent.change(typeSelect, { target: { value: 'store' } })

    // Store should be visible, stage should be hidden
    expect(screen.getByRole('button', { name: /inbox/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /digest_stage/i })).not.toBeInTheDocument()
  })

  test('filtering components by issue severity filters the component directory', () => {
    render(<Workspace />)

    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // Find severity filter select
    const severitySelect = screen.getByRole('combobox', { name: /Filter by Issue/i })
    expect(severitySelect).toBeInTheDocument()

    // Initially there are info-level issues for missing descriptions (e.g., in inbox)
    // Select "Info" severity
    fireEvent.change(severitySelect, { target: { value: 'info' } })

    // Inbox has missing-metadata-description which is an Info issue
    expect(screen.getByRole('button', { name: /inbox/i })).toBeInTheDocument()
    
    // Check for "Error" selection. Since there are no errors in the initial spec,
    // selecting "error" should result in an empty or nearly empty list (excluding components with no error)
    fireEvent.change(severitySelect, { target: { value: 'error' } })
    expect(screen.queryByRole('button', { name: /inbox/i })).not.toBeInTheDocument()
  })

  test('displays system metadata block and handles initializing system metadata', () => {
    render(<Workspace />)

    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // Should display System Specification Metadata header
    expect(screen.getByText(/System Specification Metadata/i)).toBeInTheDocument()

    // Since initial spec does not have system metadata, it should show the missing metadata message
    expect(screen.getByText(/System architecture metadata/i)).toBeInTheDocument()

    // Click on "Initialize System Metadata" button
    const initBtn = screen.getByRole('button', { name: /Initialize System Metadata/i })
    expect(initBtn).toBeInTheDocument()
    fireEvent.click(initBtn)

    // After clicking, system metadata should be initialized and displayed
    expect(screen.getByText(/System Version:/i)).toBeInTheDocument()
    expect(screen.getByText(/System Status:/i)).toBeInTheDocument()
    expect(screen.getByText(/System Owner:/i)).toBeInTheDocument()
    expect(screen.getByText(/System Description:/i)).toBeInTheDocument()

    // It should show default initialized values inside the metadata card
    const card = screen.getByTestId("system-metadata-card")
    expect(within(card).getByText(/architecture-team/i)).toBeInTheDocument()
    expect(within(card).getByText(/1.0.0/i)).toBeInTheDocument()
  })

  test('displays connection density index, coupling rating, and hotspot/subgraph metrics', async () => {
    render(<Workspace />)

    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // 1. Verify Connection Density Index is displayed (15 connections / 11 components = 1.36)
    expect(screen.getByText(/Connection Density/i)).toBeInTheDocument()
    expect(screen.getByText("1.36")).toBeInTheDocument()

    // 2. Verify Coupling Rating is displayed ("Balanced")
    expect(screen.getByText("Balanced")).toBeInTheDocument()

    // 3. Verify Hotspot / Hub Components is displayed and lists top components
    expect(screen.getByText(/Architectural Hotspots/i)).toBeInTheDocument()
    // digest_stage has 1 outgoing + 5 incoming connections = 6 total degree (highest in system)
    expect(screen.getByText("digest_stage (Degree: 6)")).toBeInTheDocument()

    // 4. Verify Independent Subgraphs count is displayed
    expect(screen.getByText(/Independent Subgraphs/i)).toBeInTheDocument()
    expect(screen.getByText("1 Subgraph")).toBeInTheDocument()

    // 5. Test with an additional disconnected component
    const codeTabBtn = screen.getByRole('tab', { name: /Code/i })
    fireEvent.click(codeTabBtn)

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const specWithDisconnected = `${textarea.value}
    - id: disconnected_island
      type: Stage
      name: Disconnected Island
`
    fireEvent.change(textarea, { target: { value: specWithDisconnected } })

    // Switch back to Metrics Tab
    fireEvent.click(metricsTabButton)

    // Verify Independent Subgraphs count has updated to 2 Subgraphs
    await waitFor(() => {
      expect(screen.getByText("2 Subgraphs")).toBeInTheDocument()
    })
  })
})

