import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'
import { waitForWorkspaceHydration } from './wait-for-hydration'

describe('Tree Tab Interactive Component Search and Filtering', () => {
  test('renders tree search input and type filter dropdown inside Tree tab', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

    // Switch to Tree Tab
    const treeTabButton = screen.getByRole('tab', { name: /Tree/i })
    fireEvent.click(treeTabButton)

    const container = screen.getByTestId('tree-tab-container')

    // Verify search input is present
    const searchInput = within(container).getByTestId('tree-search-input')
    expect(searchInput).toBeInTheDocument()
    expect(searchInput).toHaveAttribute('placeholder', 'Search directory...')

    // Verify type filter select is present
    const typeSelect = within(container).getByTestId('tree-type-select') as HTMLSelectElement
    expect(typeSelect).toBeInTheDocument()
    expect(typeSelect.value).toBe('all')
  })

  test('filters components list by search term query (case-insensitive)', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

    // Switch to Tree Tab
    const treeTabButton = screen.getByRole('tab', { name: /Tree/i })
    fireEvent.click(treeTabButton)

    const container = screen.getByTestId('tree-tab-container')

    // Initially, multiple elements should be present inside Tree Tab
    expect(within(container).getByText('inbox')).toBeInTheDocument()
    expect(within(container).getByText('digest_stage')).toBeInTheDocument()

    // Filter by "inbox"
    const searchInput = within(container).getByTestId('tree-search-input')
    fireEvent.change(searchInput, { target: { value: 'inbox' } })

    // "inbox" should remain but "digest_stage" should be hidden inside Tree Tab
    expect(within(container).getByText('inbox')).toBeInTheDocument()
    expect(within(container).queryByText('digest_stage')).not.toBeInTheDocument()

    // Test case-insensitivity: filter by "DIGEST"
    fireEvent.change(searchInput, { target: { value: 'DIGEST' } })
    expect(within(container).getByText('digest_stage')).toBeInTheDocument()
    expect(within(container).queryByText('inbox')).not.toBeInTheDocument()
  })

  test('filters components list by component type dropdown', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

    // Switch to Tree Tab
    const treeTabButton = screen.getByRole('tab', { name: /Tree/i })
    fireEvent.click(treeTabButton)

    const container = screen.getByTestId('tree-tab-container')

    // Switch type filter to "Store"
    const typeSelect = within(container).getByTestId('tree-type-select') as HTMLSelectElement
    fireEvent.change(typeSelect, { target: { value: 'store' } })

    // Only Store nodes should be rendered (like "inbox" and "kb_store")
    expect(within(container).getByText('inbox')).toBeInTheDocument()
    expect(within(container).getByText('kb_store')).toBeInTheDocument()
    
    // Stage nodes like "digest_stage" or Brick nodes like "b1_schema" should be hidden
    expect(within(container).queryByText('digest_stage')).not.toBeInTheDocument()
    expect(within(container).queryByText('b1_schema')).not.toBeInTheDocument()
  })

  test('combines search term and type filter together', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

    // Switch to Tree Tab
    const treeTabButton = screen.getByRole('tab', { name: /Tree/i })
    fireEvent.click(treeTabButton)

    const container = screen.getByTestId('tree-tab-container')
    const searchInput = within(container).getByTestId('tree-search-input')
    const typeSelect = within(container).getByTestId('tree-type-select') as HTMLSelectElement

    // Filter search term: "stage"
    fireEvent.change(searchInput, { target: { value: 'stage' } })
    // All stages like "digest_stage", "review_stage", etc. are present, but "inbox" is hidden
    expect(within(container).getByText('digest_stage')).toBeInTheDocument()
    expect(within(container).queryByText('inbox')).not.toBeInTheDocument()

    // Filter type to "Store"
    fireEvent.change(typeSelect, { target: { value: 'store' } })
    // No components match both "stage" search term AND "Store" type, so all are hidden
    expect(within(container).queryByText('digest_stage')).not.toBeInTheDocument()
    expect(within(container).queryByText('inbox')).not.toBeInTheDocument()
    expect(within(container).getByText(/No components match search criteria/i)).toBeInTheDocument()

    // Reset filters
    fireEvent.change(searchInput, { target: { value: '' } })
    fireEvent.change(typeSelect, { target: { value: 'all' } })
    expect(within(container).getByText('inbox')).toBeInTheDocument()
    expect(within(container).getByText('digest_stage')).toBeInTheDocument()
  })

  test('renders matching statistics when search or filter is active', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()

    // Switch to Tree Tab
    const treeTabButton = screen.getByRole('tab', { name: /Tree/i })
    fireEvent.click(treeTabButton)

    const container = screen.getByTestId('tree-tab-container')

    // Filter search term: "inbox"
    const searchInput = within(container).getByTestId('tree-search-input')
    fireEvent.change(searchInput, { target: { value: 'inbox' } })

    // Match stat should show matched count (e.g. "Matched: 1 of 11" or "Matched 2 of 11")
    expect(within(container).getByTestId('tree-match-stats')).toBeInTheDocument()
    expect(within(container).getByTestId('tree-match-stats').textContent).toContain('Matched:')
  })

  test('tree expand and select rows are keyboard-reachable buttons', async () => {
    render(<Workspace />)
    await waitForWorkspaceHydration()
    fireEvent.click(screen.getByRole('tab', { name: /Tree/i }))
    const container = screen.getByTestId('tree-tab-container')

    const systemRow = within(container).getByRole('button', { name: /system root|external brain/i })
    expect(systemRow).toHaveAttribute('tabindex', '0')
    fireEvent.keyDown(systemRow, { key: 'Enter' })
    expect(within(container).queryByText('components')).toBeNull()

    fireEvent.keyDown(systemRow, { key: ' ' })
    const componentsRow = within(container).getByRole('button', { name: /components/i })
    fireEvent.keyDown(componentsRow, { key: 'Enter' })
    expect(within(container).queryByText('inbox')).toBeNull()

    fireEvent.keyDown(componentsRow, { key: ' ' })
    const inboxRow = within(container).getByRole('button', { name: /select component inbox/i })
    fireEvent.keyDown(inboxRow, { key: 'Enter' })
    expect(screen.getByRole('tab', { name: /Focus/i })).toHaveAttribute('aria-selected', 'true')
  })
})
