import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import yaml from 'yaml'
import { waitForWorkspaceHydration } from './wait-for-hydration'

describe('Workspace Metrics Tab Feature', () => {
  test('renders Metrics tab in the Editor Panel and shows component counts', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

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
    
    // Scoped to the stat card: a bare /11/ also matches the wall-clock stamp
    // rendered elsewhere on the page (it failed for two hours every day).
    const totalCard = screen.getByText(/Total Components:/i).closest('div')!
    expect(within(totalCard).getByText('11')).toBeInTheDocument()

    // Verify type counts
    expect(screen.getByText(/3 Stages/i)).toBeInTheDocument()
    expect(screen.getByText(/2 Stores/i)).toBeInTheDocument()
    expect(screen.getByText(/6 Bricks/i)).toBeInTheDocument()
    expect(screen.getByText(/0 Gateways/i)).toBeInTheDocument()
  })

  test('clicking on a component in the metrics list selects it', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

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

  test('displays diagnostics summary, health status and component warning badges', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

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

  test('searching for components by text filters the component directory', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

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

  test('filtering components by type filters the component directory', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

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

  test('filtering components by issue severity filters the component directory', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

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

  test('displays system metadata block and handles initializing system metadata', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

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
    await waitForWorkspaceHydration()

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
    const hotspotCard = screen.getByLabelText("Select hotspot digest_stage")
    expect(hotspotCard).toBeInTheDocument()
    expect(within(hotspotCard).getByText("Degree: 6")).toBeInTheDocument()

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

  test('displays Single Points of Failure (SPOFs) list and supports selecting them', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // Check that SPOFs section is rendered
    expect(screen.getByText(/Single Points of Failure \(SPOFs\)/i)).toBeInTheDocument()

    // Since digest_stage is a bridge component, verify it is listed as a SPOF
    const spofCard = screen.getByLabelText("Select SPOF digest_stage")
    expect(spofCard).toBeInTheDocument()
    expect(within(spofCard).getByText(/Critical SPOF/i)).toBeInTheDocument()

    // Click on digest_stage in SPOFs list
    fireEvent.click(spofCard)

    // Switch to Focus tab to verify that 'digest_stage' is selected
    const focusTabButton = screen.getByRole('tab', { name: /Focus/i })
    fireEvent.click(focusTabButton)
    expect(screen.getByText(/Selected:/i).textContent).toContain('digest_stage')
  })

  test('Interactive Flow and Path Tracer calculates paths, displays connection labels, and handles clicks', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // Check that Interactive Flow and Path Tracer is rendered
    expect(screen.getByText(/Interactive Flow & Path Tracer/i)).toBeInTheDocument()

    // Find the select elements
    const startSelect = screen.getByLabelText("Trace Path Start") as HTMLSelectElement
    const endSelect = screen.getByLabelText("Trace Path End") as HTMLSelectElement

    expect(startSelect).toBeInTheDocument()
    expect(endSelect).toBeInTheDocument()

    // Select start and end nodes
    // Let's use 'inbox' as start, and 'review_stage' as end
    fireEvent.change(startSelect, { target: { value: 'inbox' } })
    fireEvent.change(endSelect, { target: { value: 'review_stage' } })

    // Check that paths list is displayed
    // One path is: inbox -> digest_stage -> review_stage
    // Wait for the path container/elements to show up
    await waitFor(() => {
      expect(screen.getByText(/Path 1/i)).toBeInTheDocument()
    })

    // Verify connection nodes are rendered along the path
    expect(screen.getAllByText("inbox").length).toBeGreaterThan(0)
    expect(screen.getAllByText("digest_stage").length).toBeGreaterThan(0)
    expect(screen.getAllByText("review_stage").length).toBeGreaterThan(0)

    // Click on 'digest_stage' in the path display to select it in workspace
    const pathNodeBtn = screen.getByLabelText("Trace Path Node digest_stage")
    fireEvent.click(pathNodeBtn)

    // Switch to Focus tab to verify that 'digest_stage' is now the selected unit in workspace
    const focusTabButton = screen.getByRole('tab', { name: /Focus/i })
    fireEvent.click(focusTabButton)
    expect(screen.getByText(/Selected:/i).textContent).toContain('digest_stage')
  })

  test('displays actionable architectural recommendations based on system metrics', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // Check that the recommendations section is rendered
    expect(screen.getByText(/Architectural Recommendations/i)).toBeInTheDocument()

    // Since digest_stage is a SPOF, we expect a SPOF recommendation to be visible
    expect(screen.getByText(/Critical single point of failure \(SPOF\) detected:/i)).toBeInTheDocument()
    expect(screen.getByText(/Introduce parallel execution stages, fallback channels/i)).toBeInTheDocument()
  })

  test('displays interactive quick-fix action buttons inside architectural recommendations and applies them', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

    // First go to Code tab to inject a direct Gateway-to-Store connection (which has a quick-fix recommendation)
    const codeTabBtn = screen.getByRole('tab', { name: /Code/i })
    fireEvent.click(codeTabBtn)

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const customSpecText = `system:
  name: Bypass System
  components:
    - id: my_gateway
      type: Gateway
      name: Ingest Gateway
      connections:
        - target: my_store
    - id: my_store
      type: Store
      name: Persistent Store
`
    fireEvent.change(textarea, { target: { value: customSpecText } })

    // Switch to Metrics Tab
    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // We expect the Gateway-to-Store bypass recommendation to be visible, along with its action button!
    await waitFor(() => {
      expect(screen.getByText(/Direct Gateway-to-Store bypass connection detected/i)).toBeInTheDocument()
    })

    const fixButton = screen.getByRole('button', { name: /Insert Validation Stage/i })
    expect(fixButton).toBeInTheDocument()

    // Click the fix button
    fireEvent.click(fixButton)

    // Switch back to Code Tab to verify that the spec has been updated with the inserted stage
    fireEvent.click(codeTabBtn)
    await waitFor(() => {
      expect(textarea.value).toContain('id: my_gateway_to_my_store')
      expect(textarea.value).toContain('type: Stage')
    })
  })

  test('Interactive Flow Simulation simulates path performance and displays cumulative latency, throughput bottlenecks, and success rate', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // Select start and end nodes
    const startSelect = screen.getByLabelText("Trace Path Start") as HTMLSelectElement
    const endSelect = screen.getByLabelText("Trace Path End") as HTMLSelectElement

    fireEvent.change(startSelect, { target: { value: 'inbox' } })
    fireEvent.change(endSelect, { target: { value: 'review_stage' } })

    // Wait for the path to trace
    await waitFor(() => {
      expect(screen.getByText(/Path 1/i)).toBeInTheDocument()
    })

    // Check that there is a simulation section or button "Run Performance Simulation"
    const simulateBtn = screen.getByRole('button', { name: /Run Performance Simulation/i })
    expect(simulateBtn).toBeInTheDocument()

    // Click "Run Performance Simulation"
    fireEvent.click(simulateBtn)

    // The HUD should display simulation results
    expect(screen.getByText(/Cumulative Latency/i)).toBeInTheDocument()
    expect(screen.getByText(/Bottleneck Capacity/i)).toBeInTheDocument()
    expect(screen.getByText(/Simulation Active/i)).toBeInTheDocument()

    // Wait for simulation to finish
    await waitFor(() => {
      expect(screen.getByText(/Simulation Completed/i)).toBeInTheDocument()
    }, { timeout: 10000 })

    expect(screen.getByText(/Packets Transmitted/i)).toBeInTheDocument()
    expect(screen.getByText(/Simulated Success Rate/i)).toBeInTheDocument()
  })
})

