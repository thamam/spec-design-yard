import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'

describe('STRIDE Security Dashboard Tab', () => {
  test('supports switching to the Security tab and viewing threat audits with quick-fixes', async () => {
    render(<Workspace />)

    // 1. Verify "Security" tab button is visible in the tab list
    const securityTabBtn = screen.getByRole('tab', { name: /Security/i })
    expect(securityTabBtn).toBeInTheDocument()

    // 2. Click the Security tab
    fireEvent.click(securityTabBtn)

    // 3. Verify the security tab panel is visible and active
    const securityTitle = screen.getByText(/STRIDE Threat Modeling Dashboard/i)
    expect(securityTitle).toBeInTheDocument()

    // 4. Verify that we show a security score and a list of threat statuses
    expect(screen.getByText(/Security Compliance Score/i)).toBeInTheDocument()
    expect(screen.getByText(/^Spoofing \(S\)$/i)).toBeInTheDocument()
    expect(screen.getByText(/^Tampering \(T\)$/i)).toBeInTheDocument()
    expect(screen.getByText(/^Repudiation \(R\)$/i)).toBeInTheDocument()
    expect(screen.getByText(/^Information Disclosure \(I\)$/i)).toBeInTheDocument()
    expect(screen.getByText(/^Elevation of Privilege \(E\)$/i)).toBeInTheDocument()
    expect(screen.getByText(/^Denial of Service \(DoS\)$/i)).toBeInTheDocument()
    expect(screen.getByText(/^Hardcoded Secrets Leakage$/i)).toBeInTheDocument()

    // 5. Switch back to Code tab and inject a vulnerable spec to verify dynamic updates
    const codeTabBtn = screen.getByRole('tab', { name: /Code/i })
    fireEvent.click(codeTabBtn)

    const textarea = screen.getByTestId('spec-textarea') as HTMLTextAreaElement
    const customVulnerableSpec = `system:
  name: Vulnerable Security System
  components:
    - id: web_gateway
      type: Gateway
      connections:
        - target: user_store
    - id: user_store
      type: Store
      metadata:
        api_key: "sk_live_vulnerable_123"
`
    fireEvent.change(textarea, { target: { value: customVulnerableSpec } })

    // 6. Go back to Security tab
    fireEvent.click(securityTabBtn)

    // 7. Verify we detect Spoofing threat (Gateway with unlabeled connection)
    // and Information Disclosure threat (Gateway connecting directly to Store)
    // and Hardcoded Secrets threat (api_key with real value)
    await waitFor(() => {
      // Spoofing Status should be VULNERABLE
      expect(screen.getByTestId('threat-status-spoofing')).toHaveTextContent(/VULNERABLE/i)
      // Information Disclosure Status should be VULNERABLE
      expect(screen.getByTestId('threat-status-information-disclosure')).toHaveTextContent(/VULNERABLE/i)
      // Hardcoded Secrets Status should be VULNERABLE
      expect(screen.getByTestId('threat-status-secrets')).toHaveTextContent(/VULNERABLE/i)
    })

    // 8. Verify individual quick-fix button is available for Hardcoded Secrets
    const fixSecretBtn = screen.getByTestId('fix-threat-btn-secrets')
    expect(fixSecretBtn).toBeInTheDocument()

    // 9. Click the quick-fix and verify threat is mitigated
    fireEvent.click(fixSecretBtn)

    await waitFor(() => {
      expect(screen.getByTestId('threat-status-secrets')).toHaveTextContent(/MITIGATED|SECURE/i)
    })
  })

  test('renders the Export Security Report button in the Security Tab and triggers export on click', async () => {
    const writeTextMock = vi.fn().mockImplementation(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true
    })
    const canvasElement = document.createElement('canvas')
    const drawMock = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      return {} as any
    })

    const createElementSpy = vi.spyOn(document, 'createElement')

    render(<Workspace />)

    const securityTabBtn = screen.getByRole('tab', { name: /Security/i })
    fireEvent.click(securityTabBtn)

    const exportBtn = screen.getByTestId('export-security-report-btn')
    expect(exportBtn).toBeInTheDocument()

    fireEvent.click(exportBtn)

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled()
      expect(createElementSpy).toHaveBeenCalledWith('a')
    })
    vi.restoreAllMocks()
  })
})
