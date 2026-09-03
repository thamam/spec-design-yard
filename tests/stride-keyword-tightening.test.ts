import { describe, test, expect } from "vitest"
import { lintSpec } from "../lib/linter"

const gatewayWithLabel = (label: string) => ({
  system: {
    name: "Keyword Tightening",
    components: [
      {
        id: "gw",
        type: "Gateway",
        connections: [{ target: "stage_1", label }],
      },
      { id: "stage_1", type: "Stage" },
    ],
  },
})

describe("STRIDE keyword tightening", () => {
  test("connection label 'auth' alone does not clear Spoofing or Tampering", () => {
    const diagnostics = lintSpec(gatewayWithLabel("auth"))
    expect(diagnostics.some((d) => d.code === "stride-spoofing")).toBe(true)
    expect(diagnostics.some((d) => d.code === "stride-tampering")).toBe(true)
  })

  test("node name containing auth/TLS does not clear those categories", () => {
    const diagnostics = lintSpec({
      system: {
        name: "Named Auth",
        components: [
          {
            id: "auth_tls_gw",
            name: "Public Auth TLS Gateway",
            type: "Gateway",
            connections: [{ target: "stage_1" }],
          },
          { id: "stage_1", type: "Stage" },
        ],
      },
    })
    expect(diagnostics.some((d) => d.code === "stride-spoofing")).toBe(true)
    expect(diagnostics.some((d) => d.code === "stride-tampering")).toBe(true)
  })

  test("a specific identity+channel mitigation clears both categories", () => {
    const diagnostics = lintSpec(gatewayWithLabel("authenticated TLS auth-token request"))
    expect(diagnostics.some((d) => d.code === "stride-spoofing")).toBe(false)
    expect(diagnostics.some((d) => d.code === "stride-tampering")).toBe(false)
  })

  test("a descriptive non-security label still flags Tampering", () => {
    const diagnostics = lintSpec({
      system: {
        name: "Digest Flow",
        components: [
          {
            id: "stage_1",
            type: "Stage",
            connections: [{ target: "store_1", label: "writes digest" }],
          },
          { id: "store_1", type: "Store" },
        ],
      },
    })
    expect(diagnostics.some((d) => d.code === "stride-tampering")).toBe(true)
  })
})
