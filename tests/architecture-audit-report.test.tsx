import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'

describe('System Architecture Visual Report Card / Blueprint Audit', () => {
  let writeTextMock = vi.fn().mockImplementation(() => Promise.resolve())
  let createElementSpy: any

  beforeEach(() => {
    vi.restoreAllMocks()
    writeTextMock.mockClear()
    
    // Mock navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: writeTextMock
      },
      writable: true,
      configurable: true
    })

    // Spy on document.createElement to capture markdown downloads
    createElementSpy = vi.spyOn(document, 'createElement')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('renders the Export Markdown Report button in the Metrics Tab and triggers clipboard copy and download', async () => {
    render(<Workspace />)

    // 1. Switch to Metrics Tab
    const metricsTabButton = screen.getByRole('tab', { name: /Metrics/i })
    fireEvent.click(metricsTabButton)

    // 2. Find the "Export Markdown Report" button
    const exportBtn = screen.getByTestId('export-markdown-report-btn')
    expect(exportBtn).toBeInTheDocument()
    expect(exportBtn).toHaveTextContent(/Export Markdown Report/i)

    // 3. Click the button to trigger export
    fireEvent.click(exportBtn)

    // 4. Assert clipboard writeText was called with high-quality markdown
    expect(writeTextMock).toHaveBeenCalled()
    const copiedText = writeTextMock.mock.calls[0][0]
    expect(copiedText).toContain('# System Architecture Audit & Blueprint Report')
    expect(copiedText).toContain('## 1. System Overview')
    expect(copiedText).toContain('## 2. Component Inventory')
    expect(copiedText).toContain('## 3. Real-Time Linting Diagnostics')
    expect(copiedText).toContain('## 4. STRIDE Threat Modeling & Recommendations')

    // 5. Assert anchor download link was created with proper filename and content
    expect(createElementSpy).toHaveBeenCalledWith('a')
    const callIndex = createElementSpy.mock.calls.findIndex(args => args[0] === 'a')
    expect(callIndex).toBeGreaterThanOrEqual(0)
    const createdLink = createElementSpy.mock.results[callIndex].value as HTMLAnchorElement
    expect(createdLink.href).toContain('data:text/markdown;charset=utf-8')
    expect(createdLink.download).toContain('architecture-audit-')
    expect(createdLink.download).toContain('.md')
  })
})
