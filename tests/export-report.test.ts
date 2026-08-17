import { describe, it, expect } from "vitest"
import {
  generateArchitectureAuditReport,
  architectureAuditReportFilename,
} from "../lib/export-report"
import type { Diagnostic } from "../lib/linter"

const DATE = "1/1/2026, 12:00:00 PM"

const parsedSpec = {
  system: {
    name: "External Brain",
    components: [
      { id: "gateway", name: "Gateway", type: "Gateway", connections: [{ target: "stage", label: "feeds" }] },
      { id: "stage", name: "Stage", type: "Stage", connections: ["store"] },
      { id: "store", name: "Store", type: "Store" },
    ],
  },
}

describe("generateArchitectureAuditReport", () => {
  it("pins the report title and section headers", () => {
    const md = generateArchitectureAuditReport(parsedSpec, [], DATE)
    expect(md).toContain("# System Architecture Audit & Blueprint Report")
    expect(md).toContain(`Generated automatically by Sentinel (Hermes agent, Spec-Design Yard) on ${DATE}.`)
    expect(md).toContain("## 1. System Overview")
    expect(md).toContain("## 2. Component Inventory")
    expect(md).toContain("## 3. Real-Time Linting Diagnostics")
    expect(md).toContain("## 4. STRIDE Threat Modeling & Recommendations")
  })

  it("computes overview metrics from the parsed spec", () => {
    const md = generateArchitectureAuditReport(parsedSpec, [], DATE)
    expect(md).toContain("- **System Name:** External Brain")
    // 2 connections / 3 components = 0.67, which lands in the "Loose" band
    expect(md).toContain("- **Coupling Rating:** Loose")
    expect(md).toContain("- **Connection Density:** 0.67")
    expect(md).toContain("- **Subgraphs Count:** 1")
    expect(md).toContain("- **Gateways (Ingestion points):** 1")
    expect(md).toContain("- **Stages (Processing units):** 1")
    expect(md).toContain("- **Stores (Data persistence):** 1")
    expect(md).toContain("- **Total Components:** 3")
    expect(md).toContain("- **Total Connections:** 2")
  })

  it("counts disconnected islands as separate subgraphs", () => {
    const md = generateArchitectureAuditReport(
      {
        system: {
          name: "Islands",
          components: [
            { id: "a", type: "Stage", connections: ["b"] },
            { id: "b", type: "Stage" },
            { id: "lonely", type: "Brick" },
          ],
        },
      },
      [],
      DATE
    )
    expect(md).toContain("- **Subgraphs Count:** 2")
    expect(md).toContain("- **Bricks (Auxiliary sidecars):** 1")
  })

  it("applies the health formula: 100 - 15 per error - 5 per warning, floored at 0", () => {
    const diagnostics: Diagnostic[] = [
      { severity: "error", message: "boom", code: "some-error", path: "system.name" },
      { severity: "error", message: "boom2" },
      { severity: "warning", message: "warn" },
      { severity: "info", message: "note" },
    ]
    const md = generateArchitectureAuditReport(parsedSpec, diagnostics, DATE)
    // 100 - 2*15 - 1*5 = 65
    expect(md).toContain("- **System Health:** 65%")
    expect(md).toContain("- **Errors Count:** 2")
    expect(md).toContain("- **Warnings Count:** 1")
    expect(md).toContain("- **Info Count:** 1")
    expect(md).toContain("1. [ERROR] (some-error): boom (Path: system.name)")
    expect(md).toContain("3. [WARNING] (unknown): warn (Path: N/A)")

    const flooded: Diagnostic[] = Array.from({ length: 8 }, () => ({ severity: "error", message: "x" }))
    expect(generateArchitectureAuditReport(parsedSpec, flooded, DATE)).toContain("- **System Health:** 0%")
  })

  it("emits the clean-diagnostics message when there are none", () => {
    const md = generateArchitectureAuditReport(parsedSpec, [], DATE)
    expect(md).toContain("✅ No architectural violations or lint warnings detected! Perfect design standard.")
  })

  it("flags each STRIDE section as vulnerable only when its diagnostic code is present", () => {
    const clean = generateArchitectureAuditReport(parsedSpec, [], DATE)
    expect(clean.match(/⚠️ VULNERABLE/g)).toBeNull()
    expect(clean.match(/✅ MITIGATED/g)).toHaveLength(6)

    const threatened: Diagnostic[] = [
      { severity: "warning", message: "s", code: "stride-spoofing" },
      { severity: "warning", message: "d", code: "stride-denial-of-service" },
    ]
    const md = generateArchitectureAuditReport(parsedSpec, threatened, DATE)
    expect(md.match(/⚠️ VULNERABLE/g)).toHaveLength(2)
    expect(md.match(/✅ MITIGATED/g)).toHaveLength(4)
  })

  it("falls back to 'Unnamed System' and an Empty coupling rating without a system", () => {
    const md = generateArchitectureAuditReport(null, [], DATE)
    expect(md).toContain("- **System Name:** Unnamed System")
    expect(md).toContain("- **Coupling Rating:** Empty")
    expect(md).toContain("- **Total Components:** 0")
  })
})

describe("architectureAuditReportFilename", () => {
  it("sanitizes the system name and keeps the pinned prefix", () => {
    const name = architectureAuditReportFilename("External Brain v0.2")
    expect(name.startsWith("architecture-audit-")).toBe(true)
    expect(name).toContain("external-brain-v0-2-")
    expect(name.endsWith(".md")).toBe(true)
  })

  it("handles the unnamed fallback", () => {
    expect(architectureAuditReportFilename("Unnamed System")).toMatch(/^architecture-audit-unnamed-system-\d+\.md$/)
  })
})
