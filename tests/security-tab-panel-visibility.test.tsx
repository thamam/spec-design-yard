import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import Workspace from '../components/Workspace'

// Regression guard: the security tab panel carried an unconditional `flex`
// class alongside the HTML `hidden` attribute, and author-level
// `.flex{display:flex}` beats UA `[hidden]{display:none}` — so the STRIDE
// dashboard rendered under every tab. Sibling panels hide via a conditional
// `hidden` Tailwind class; the security panel must match that pattern.
describe('Security tab panel visibility', () => {
  const securityPanel = () => document.getElementById('tabpanel-security') as HTMLElement

  test('security dashboard panel is hidden unless the Security tab is active', () => {
    render(<Workspace />)

    // Default tab is Code — security dashboard must be hidden
    expect(securityPanel()).toBeTruthy()
    expect(securityPanel().classList.contains('hidden')).toBe(true)

    // Switching to Metrics keeps it hidden
    fireEvent.click(screen.getByRole('tab', { name: /Metrics/i }))
    expect(securityPanel().classList.contains('hidden')).toBe(true)

    // Switching to Security reveals it
    fireEvent.click(screen.getByRole('tab', { name: /Security/i }))
    expect(securityPanel().classList.contains('hidden')).toBe(false)
    expect(screen.getByText(/STRIDE Threat Modeling Dashboard/i)).toBeInTheDocument()

    // Switching back to Code hides it again
    fireEvent.click(screen.getByRole('tab', { name: /Code/i }))
    expect(securityPanel().classList.contains('hidden')).toBe(true)
  })
})
