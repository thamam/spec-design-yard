import { describe, test, expect, vi } from "vitest"
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react"
import React from "react"
import { EditorPanel } from "../components/workspace/editor-panel"
import { parseSpec } from "../lib/spec-model"

function renderSecurityTab(specText: string, extras: Partial<React.ComponentProps<typeof EditorPanel>> = {}) {
  const { spec } = parseSpec(specText)
  if (!spec) throw new Error(`test spec did not parse: ${specText}`)
  render(<EditorPanel specText={specText} parsedSpec={spec} activeTab="security" {...extras} />)
  const panel = document.getElementById("tabpanel-security")
  if (!panel) throw new Error("security tabpanel not found")
  return panel as HTMLElement
}

const EMPTY_SPEC = `system:
  name: New System
  components: []
`

describe("Security tab honesty", () => {
  test("empty spec is unscored and does not claim Excellent 100% / all Secured", () => {
    const panel = renderSecurityTab(EMPTY_SPEC)

    expect(within(panel).queryByText("100%")).not.toBeInTheDocument()
    expect(within(panel).queryByText(/Excellent!/i)).not.toBeInTheDocument()
    expect(within(panel).queryByText(/fully mitigates all analyzed STRIDE/i)).not.toBeInTheDocument()

    expect(within(panel).getByTestId("stride-compliance-score")).toHaveTextContent("—")
    expect(within(panel).getByText(/add components to (the diagram|analyze)/i)).toBeInTheDocument()

    expect(within(panel).getAllByText(/Not analyzed/i).length).toBeGreaterThanOrEqual(6)
    expect(within(panel).queryByText(/^Secured$/)).not.toBeInTheDocument()

    const fixAll = within(panel).getByTestId("fix-all-stride-gaps-btn")
    expect(fixAll).toBeDisabled()
    expect(fixAll).toHaveAttribute("title", expect.stringMatching(/add components/i))
  })

  test("a modeled spec with no STRIDE findings scores 100 without claiming Excellent / fully mitigates", () => {
    const panel = renderSecurityTab(`system:
  name: Secure System
  components:
    - id: worker
      type: Stage
`)
    expect(within(panel).getByText("100%")).toBeInTheDocument()
    expect(within(panel).queryByText(/Excellent!/i)).not.toBeInTheDocument()
    expect(within(panel).getByText(/diagram review, not proof the system is secure/i)).toBeInTheDocument()
    expect(within(panel).getByTestId("fix-all-stride-gaps-btn")).toBeDisabled()
  })

  test("subtitle describes static STRIDE review, not vulnerability scanning", () => {
    const panel = renderSecurityTab(EMPTY_SPEC)
    const subtitle = within(panel).getByTestId("stride-dashboard-subtitle")
    expect(subtitle).toHaveTextContent(/STRIDE review of the drawn architecture/i)
    expect(subtitle).toHaveTextContent(/not CVE, dependency, or runtime/i)
    expect(subtitle.textContent).not.toMatch(/vulnerability scanning/i)
    expect(subtitle.textContent).not.toMatch(/Continuous automated security/i)
  })

  test("Export Report asks for confirm and warns that the report can contain secrets", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    })
    const createElementSpy = vi.spyOn(document, "createElement")

    const panel = renderSecurityTab(EMPTY_SPEC)
    fireEvent.click(within(panel).getByTestId("export-security-report-btn"))

    const dialog = await screen.findByTestId("export-report-confirm")
    expect(dialog).toHaveTextContent(/secrets/i)
    expect(writeTextMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId("export-report-confirm-cancel"))
    expect(screen.queryByTestId("export-report-confirm")).not.toBeInTheDocument()
    expect(writeTextMock).not.toHaveBeenCalled()

    fireEvent.click(within(panel).getByTestId("export-security-report-btn"))
    fireEvent.click(await screen.findByTestId("export-report-confirm-confirm"))

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled()
      expect(createElementSpy).toHaveBeenCalledWith("a")
    })
    createElementSpy.mockRestore()
  })

  test("Fix All Gaps applies non-secret STRIDE fixes without a redact confirm", async () => {
    const spec = `system:
  name: Gateway Gap
  components:
    - id: gw
      type: Gateway
      connections:
        - target: worker
    - id: worker
      type: Stage
`
    const setSpecText = vi.fn()
    const panel = renderSecurityTab(spec, { setSpecText })
    const fixAll = within(panel).getByTestId("fix-all-stride-gaps-btn")
    expect(fixAll).not.toBeDisabled()
    fireEvent.click(fixAll)
    expect(screen.queryByTestId("secret-redact-confirm")).not.toBeInTheDocument()
    await waitFor(() => expect(setSpecText).toHaveBeenCalled())
    expect(String(setSpecText.mock.calls[0][0])).toMatch(
      /authenticated TLS auth-token request|encrypted TLS auth-token flow/
    )
  })

  test("Use Environment Variable does not replace a secret until the user confirms", async () => {
    const spec = `system:
  name: Secret Leak System
  components:
    - id: auth_service
      type: Stage
      metadata:
        password: my-hardcoded-secret-password
`
    const setSpecText = vi.fn()
    render(
      <EditorPanel specText={spec} parsedSpec={parseSpec(spec).spec} setSpecText={setSpecText} activeTab="code" />
    )

    const redactBtn = screen.getByRole("button", { name: /Use Environment Variable/i })
    fireEvent.click(redactBtn)

    const dialog = await screen.findByTestId("secret-redact-confirm")
    expect(dialog).toHaveTextContent(/previous value/i)
    expect(dialog).toHaveTextContent(/comment/i)
    expect(setSpecText).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId("secret-redact-confirm-cancel"))
    expect(screen.queryByTestId("secret-redact-confirm")).not.toBeInTheDocument()
    expect(setSpecText).not.toHaveBeenCalled()

    fireEvent.click(redactBtn)
    fireEvent.click(await screen.findByTestId("secret-redact-confirm-confirm"))

    await waitFor(() => expect(setSpecText).toHaveBeenCalled())
    const updated = setSpecText.mock.calls[0][0] as string
    expect(updated).toContain("${SENSITIVE_VALUE_PLACEHOLDER}")
    expect(updated).toContain("previous value preserved: my-hardcoded-secret-password")
  })
})
