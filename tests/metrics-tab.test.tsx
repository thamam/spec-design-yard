import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
})
