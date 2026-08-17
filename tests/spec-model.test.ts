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
    expect(parseSpec("")).toEqual({ spec: null, error: null, droppedConnections: [] })
    expect(parseSpec("just a scalar")).toEqual({ spec: null, error: null, droppedConnections: [] })
  })

  it("strips string-form connections at the parse boundary but reports them", () => {
    // Mid-keystroke text inside a connections list parses as a string, so the
    // entries are still stripped — but silently dropping authored YAML is a
    // data-loss bug, so each stripped entry is reported for a diagnostic.
    const { spec, error, droppedConnections } = parseSpec(
      "system:\n  components:\n    - id: gate\n      type: Gateway\n      connections:\n        - dig\n        - target: store_a\n          label: writes\n"
    )
    expect(error).toBeNull()
    expect(spec?.system?.components?.[0]?.connections).toEqual([{ target: "store_a", label: "writes" }])
    expect(droppedConnections).toEqual([{ componentIndex: 0, connectionIndex: 0, value: "dig" }])
  })

  it("reports string connections of every surviving component, with sanitized indexes", () => {
    // Indexes are in the SANITIZED coordinate system (what consumers see): a
    // dropped entry's index is the number of surviving object entries before it.
    const { droppedConnections } = parseSpec(
      "system:\n  components:\n    - id: a\n      connections:\n        - b\n        - target: c\n        - d\n    - id: e\n      connections:\n        - f\n"
    )
    expect(droppedConnections).toEqual([
      { componentIndex: 0, connectionIndex: 0, value: "b" },
      { componentIndex: 0, connectionIndex: 1, value: "d" },
      { componentIndex: 1, connectionIndex: 0, value: "f" },
    ])
  })

  it("counts only surviving components when indexing a dropped connection", () => {
    // A bare "-" mid-keystroke parses to a null component and is stripped by the
    // sanitizer; the real component after it is components[0] for consumers.
    const { spec, droppedConnections } = parseSpec(
      "system:\n  components:\n    -\n    - id: gate\n      connections:\n        - dig\n"
    )
    expect(spec?.system?.components).toHaveLength(1)
    expect(droppedConnections).toEqual([{ componentIndex: 0, connectionIndex: 0, value: "dig" }])
  })

  it("counts only surviving connection entries when indexing a dropped connection", () => {
    // The null entry (bare "-") is stripped silently, so the string entry after
    // it sits at connections[0] in the sanitized spec.
    const { spec, droppedConnections } = parseSpec(
      "system:\n  components:\n    - id: gate\n      connections:\n        -\n        - dig\n"
    )
    expect(spec?.system?.components?.[0]?.connections).toEqual([])
    expect(droppedConnections).toEqual([{ componentIndex: 0, connectionIndex: 0, value: "dig" }])
  })

  it("reports non-string scalar connection entries too, but stays silent on null", () => {
    // The sanitizer strips numeric/boolean entries just like strings; dropping
    // "- 8080" silently would be the same data-loss bug. A bare "-" (null) is
    // the deliberate mid-keystroke case and stays silent.
    const { droppedConnections } = parseSpec(
      "system:\n  components:\n    - id: gate\n      connections:\n        - 8080\n        - true\n        -\n        - target: store_a\n"
    )
    expect(droppedConnections).toEqual([
      { componentIndex: 0, connectionIndex: 0, value: "8080" },
      { componentIndex: 0, connectionIndex: 0, value: "true" },
    ])
  })

  it("does not report entries inside a dropped (non-object) component", () => {
    // Only surviving (object) components are walked: a dropped component's inner
    // entries would point at a path that no longer exists in the sanitized spec.
    const { spec, droppedConnections } = parseSpec(
      "system:\n  components:\n    - id: a\n      connections:\n        - target: b\n    - - x\n      - \"y\"\n"
    )
    expect(spec?.system?.components).toHaveLength(1)
    expect(droppedConnections).toEqual([])
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
