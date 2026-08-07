import { describe, it, expect } from "vitest"
import { parseSpec, normalizeConnections } from "../lib/spec-model"

describe("parseSpec", () => {
  it("parses a well-formed spec", () => {
    const { spec, error } = parseSpec(`
system:
  name: Yard
  components:
    - id: inbox
      type: Stage
      connections:
        - target: digest
          label: feeds
`)
    expect(error).toBeNull()
    expect(spec?.system?.name).toBe("Yard")
    expect(spec?.system?.components?.[0].connections).toEqual([{ target: "digest", label: "feeds" }])
  })

  it("strips the null list entries a half-typed spec produces", () => {
    // A bare "- " mid-keystroke parses to a null entry; consumers assume
    // objects, and a render throw would unmount the whole workspace.
    const { spec, error } = parseSpec(`
system:
  components:
    - id: inbox
      connections:
        - target: digest
        -
    -
`)
    expect(error).toBeNull()
    expect(spec?.system?.components).toHaveLength(1)
    expect(spec?.system?.components?.[0].connections).toEqual([{ target: "digest" }])
  })

  it("reports a syntax error and no spec", () => {
    const { spec, error } = parseSpec("system:\n  components:\n   - id: a\n  \tbad")
    expect(spec).toBeNull()
    expect(error).toBeTruthy()
  })

  it("returns neither spec nor error for a non-object document", () => {
    expect(parseSpec("")).toEqual({ spec: null, error: null })
    expect(parseSpec("just a scalar")).toEqual({ spec: null, error: null })
  })
})

describe("normalizeConnections", () => {
  it("accepts both the bare-string and { target, label } forms", () => {
    expect(
      normalizeConnections({ connections: ["digest", { target: "store", label: "writes" }, { target: "sink" }] })
    ).toEqual([
      { target: "digest", label: "", originalIdx: 0 },
      { target: "store", label: "writes", originalIdx: 1 },
      { target: "sink", label: "", originalIdx: 2 },
    ])
  })

  it("drops unusable entries but keeps the raw index of the survivors", () => {
    expect(normalizeConnections({ connections: [null, { label: "no target" }, { target: 42 }, "digest"] })).toEqual([
      { target: "digest", label: "", originalIdx: 3 },
    ])
  })

  it("tolerates a missing or non-array connections field", () => {
    expect(normalizeConnections({ id: "inbox" })).toEqual([])
    expect(normalizeConnections({ connections: "digest" })).toEqual([])
    expect(normalizeConnections(null)).toEqual([])
  })
})
