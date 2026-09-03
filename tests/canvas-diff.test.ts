import { describe, it, expect } from "vitest"
import {
  createCanvasDiffState,
  diffScene,
  getSourceAndTargetFromArrowId,
  getSourceAndTargetFromLabelId,
  isOverlayElementId,
  pruneTracking,
  registerCompiledElements,
  resolvePendingRename,
  stagedMoveInvalidatedByCompile,
  stripDiagnosticMarkers,
  CanvasDiffState,
} from "../lib/canvas-diff"

const parsedSpec = {
  system: {
    components: [
      { id: "inbox", name: "Inbox", type: "Stage", connections: [{ target: "digest", label: "feeds" }] },
      { id: "digest", name: "Digest", type: "Stage" },
    ],
  },
}

/** Minimal stand-in for compileSpecToExcalidrawElements output. */
function compiledScene() {
  return [
    { type: "rectangle", id: "inbox", x: 60, y: 160, width: 190, height: 80, isDeleted: false },
    { type: "text", id: "text-inbox-0", containerId: "inbox", text: "Inbox\n[Stage]", isDeleted: false },
    { type: "rectangle", id: "digest", x: 310, y: 160, width: 190, height: 80, isDeleted: false },
    { type: "text", id: "text-digest-1", containerId: "digest", text: "Digest\n[Stage]", isDeleted: false },
    {
      type: "arrow",
      id: "arrow-inbox-digest",
      isDeleted: false,
      startBinding: { elementId: "inbox" },
      endBinding: { elementId: "digest" },
    },
    {
      type: "text",
      id: "arrow-label-inbox-digest",
      containerId: "arrow-inbox-digest",
      text: "feeds",
      isDeleted: false,
    },
  ]
}

/** A state that has already seen the compiler draw `elements`. */
function stateFor(elements: any[]): CanvasDiffState {
  return registerCompiledElements(createCanvasDiffState(), elements)
}

function run(
  updatedElements: any[],
  compiledElements: any[],
  state: CanvasDiffState,
  appState: any = {},
  // Coordinate sync is gated on a real pointer gesture; these cases stand in
  // for one having happened.
  gestureSeen = true,
) {
  return diffScene({ updatedElements, compiledElements, appState, parsedSpec, gestureSeen, state })
}

describe("diffScene", () => {
  it("reports a user-drawn rectangle as an add", () => {
    const compiled = compiledScene()
    const scene = [...compiled, { type: "rectangle", id: "Xk92mQ", x: 500, y: 400, isDeleted: false }]

    const { changes, nextState } = run(scene, compiled, stateFor(compiled))

    expect(changes).toEqual([
      {
        type: "add",
        payload: { id: "Xk92mQ", x: 500, y: 400, type: "Stage", name: "New Component Xk92" },
      },
    ])
    // The same rect must not be reported twice on the next onChange.
    expect(run(scene, compiled, nextState).changes).toEqual([])
  })

  it("ignores a stale compiled rect lingering in the scene while the user types", () => {
    // The compiler drew `inbox` a moment ago; the user has since typed on and
    // the current compile no longer contains it, but Excalidraw still holds the
    // stale rect. Reporting it as an add would write a ghost component back
    // into the YAML — the corruption fixed in 66a3111.
    const previousCompile = compiledScene()
    const state = stateFor(previousCompile)
    const currentCompile = previousCompile.filter((el) => el.id !== "inbox" && el.id !== "text-inbox-0")
    const scene = previousCompile // Excalidraw has not caught up yet

    const { changes } = run(scene, currentCompile, state)

    expect(changes).toEqual([])
  })

  it("reports a text edit on a compiled node as a rename", () => {
    const compiled = compiledScene()
    const scene = compiled.map((el) =>
      el.id === "text-inbox-0" ? { ...el, text: "Mailbox\n[Gateway]" } : el
    )

    const { changes } = run(scene, compiled, stateFor(compiled))

    expect(changes).toEqual([
      { type: "rename", payload: { id: "inbox", newName: "Mailbox", newType: "Gateway" } },
    ])
  })

  it("does not report a rename when only the ❌ / ⚠️ diagnostic suffix differs", () => {
    const compiled = compiledScene()
    for (const marker of [" ❌", " ⚠️"]) {
      const scene = compiled.map((el) =>
        el.id === "text-inbox-0" ? { ...el, text: `Inbox${marker}\n[Stage]` } : el
      )
      expect(run(scene, compiled, stateFor(compiled)).changes).toEqual([])
    }
  })

  it("does not report a rename for a text the compiler emitted earlier this session", () => {
    const compiled = compiledScene()
    let state = stateFor(compiled)
    // An earlier compile carried the warning marker; that text is an echo.
    state = registerCompiledElements(state, [
      { type: "text", id: "text-inbox-0", text: "Inbox\n[Unit]" },
    ])
    const scene = compiled.map((el) => (el.id === "text-inbox-0" ? { ...el, text: "Inbox\n[Unit]" } : el))

    expect(run(scene, compiled, state).changes).toEqual([])
  })

  it("reports a user-drawn arrow between two nodes as a connect", () => {
    const compiled = compiledScene()
    const scene = [
      ...compiled,
      {
        type: "arrow",
        id: "aB3zz1",
        isDeleted: false,
        startBinding: { elementId: "digest" },
        endBinding: { elementId: "inbox" },
      },
    ]

    const { changes, nextState } = run(scene, compiled, stateFor(compiled))

    expect(changes).toEqual([{ type: "connect", payload: { source: "digest", target: "inbox" } }])
    expect(run(scene, compiled, nextState).changes).toEqual([])
  })

  it("snaps a near-miss unbound arrow to the nearest compiled rects", () => {
    const compiled = compiledScene()
    // Start 20px right of inbox's right edge; end 20px left of digest.
    // inbox is at (60,160) 190×80 → right edge 250; digest at (310,160).
    const scene = [
      ...compiled,
      {
        type: "arrow",
        id: "aNearMiss",
        isDeleted: false,
        x: 270,
        y: 200,
        width: 20,
        height: 0,
        points: [
          [0, 0],
          [20, 0],
        ],
      },
    ]

    const { changes, nextState } = run(scene, compiled, stateFor(compiled))

    expect(changes).toEqual([{ type: "connect", payload: { source: "inbox", target: "digest" } }])
    expect(run(scene, compiled, nextState).changes).toEqual([])
  })

  it("does not snap a far-miss arrow, and does not resurrect a user-deleted arrow", () => {
    const compiled = compiledScene()
    const far = [
      ...compiled,
      {
        type: "arrow",
        id: "aFar",
        isDeleted: false,
        x: 2000,
        y: 2000,
        width: 10,
        height: 0,
        points: [
          [0, 0],
          [10, 0],
        ],
      },
    ]
    expect(run(far, compiled, stateFor(compiled)).changes).toEqual([])

    const deleted = [
      ...compiled,
      {
        type: "arrow",
        id: "aGone",
        isDeleted: true,
        x: 270,
        y: 200,
        points: [
          [0, 0],
          [20, 0],
        ],
      },
    ]
    expect(run(deleted, compiled, stateFor(compiled)).changes).toEqual([])
  })

  it("does not treat a threat-zone overlay rect as a connect target or a move", () => {
    const compiled = [
      ...compiledScene(),
      { type: "rectangle", id: "threat-zone-inbox-0", x: 52, y: 152, width: 206, height: 96, isDeleted: false },
    ]
    const boundToZone = [
      ...compiled,
      {
        type: "arrow",
        id: "aZone",
        isDeleted: false,
        startBinding: { elementId: "threat-zone-inbox-0" },
        endBinding: { elementId: "digest" },
      },
    ]
    expect(run(boundToZone, compiled, stateFor(compiled)).changes).toEqual([])

    const draggedZone = compiled.map((el) =>
      el.id === "threat-zone-inbox-0" ? { ...el, x: 400, y: 400 } : el
    )
    const { changes, pendingElements } = run(draggedZone, compiled, stateFor(compiled))
    expect(changes).toEqual([])
    expect(pendingElements).toBeNull()
  })

  it("does not report an arrow whose endpoints are not in the spec", () => {
    const compiled = compiledScene()
    const scene = [
      ...compiled,
      {
        type: "arrow",
        id: "aB3zz1",
        isDeleted: false,
        startBinding: { elementId: "inbox" },
        endBinding: { elementId: "some-loose-shape" },
      },
    ]

    expect(run(scene, compiled, stateFor(compiled)).changes).toEqual([])
  })

  it("reports element removal as a delete", () => {
    const compiled = compiledScene()
    const scene = compiled.map((el) => (el.id === "inbox" ? { ...el, isDeleted: true } : el))

    const { changes, nextState } = run(scene, compiled, stateFor(compiled))

    expect(changes).toEqual([{ type: "delete", payload: { ids: ["inbox"] } }])
    expect(run(scene, compiled, nextState).changes).toEqual([])
  })

  it("reports arrow removal as a disconnect", () => {
    const compiled = compiledScene()
    const scene = compiled.map((el) => (el.id === "arrow-inbox-digest" ? { ...el, isDeleted: true } : el))

    const { changes } = run(scene, compiled, stateFor(compiled))

    expect(changes).toEqual([{ type: "disconnect", payload: { source: "inbox", target: "digest" } }])
  })

  it("reports an edited arrow label as a connection-label change", () => {
    const compiled = compiledScene()
    const scene = compiled.map((el) =>
      el.id === "arrow-label-inbox-digest" ? { ...el, text: "batches" } : el
    )

    const { changes } = run(scene, compiled, stateFor(compiled))

    expect(changes).toEqual([
      { type: "connection-label", payload: { source: "inbox", target: "digest", label: "batches" } },
    ])
  })

  it("stages moved rectangles instead of emitting a change", () => {
    const compiled = compiledScene()
    const scene = compiled.map((el) => (el.id === "inbox" ? { ...el, x: 600, y: 700 } : el))

    const { changes, pendingElements } = run(scene, compiled, stateFor(compiled))

    expect(changes).toEqual([])
    // Only what moved: staging the untouched rects too would pin every
    // auto-layout coordinate into the YAML on any drag.
    expect(pendingElements?.map((r: any) => r.id)).toEqual(["inbox"])
  })

  it("stays quiet mid-gesture except for deletions", () => {
    const compiled = compiledScene()
    const drawing = [...compiled, { type: "rectangle", id: "Xk92mQ", x: 500, y: 400, isDeleted: false }]

    const dragging = run(drawing, compiled, stateFor(compiled), { draggingElement: { id: "Xk92mQ" } })
    expect(dragging.changes).toEqual([])
    expect(dragging.pendingElements).toBeNull()

    // Deletions still get through while a gesture is active.
    const deleting = compiled.map((el) => (el.id === "inbox" ? { ...el, isDeleted: true } : el))
    expect(run(deleting, compiled, stateFor(compiled), { resizingElement: {} }).changes).toEqual([
      { type: "delete", payload: { ids: ["inbox"] } },
    ])
  })

  it("suppresses a rename echoed back before parsedSpec catches up", () => {
    const compiled = compiledScene()
    const scene = compiled.map((el) =>
      el.id === "text-inbox-0" ? { ...el, text: "Mailbox\n[Stage]" } : el
    )

    const first = run(scene, compiled, stateFor(compiled))
    expect(first.changes).toHaveLength(1)
    expect(first.nextState.pendingRename).toEqual({ id: "inbox", name: "Mailbox", type: "Stage" })

    // parsedSpec has not been rewritten yet, so the same edit arrives again.
    expect(run(scene, compiled, first.nextState).changes).toEqual([])
  })
})

describe("overlay / staged-move helpers", () => {
  it("recognises STRIDE overlay ids and not component ids", () => {
    expect(isOverlayElementId("threat-zone-inbox-0")).toBe(true)
    expect(isOverlayElementId("threat-text-inbox-0")).toBe(true)
    expect(isOverlayElementId("inbox")).toBe(false)
    expect(isOverlayElementId(null)).toBe(false)
  })

  it("invalidates a staged move only when those ids' compiled coords changed", () => {
    const compile = compiledScene()
    const staged = [{ id: "inbox", x: 200, y: 300 }]
    expect(stagedMoveInvalidatedByCompile(staged, compile, compile)).toBe(false)

    const renamedOnly = compile.map((el) => (el.id === "inbox" ? { ...el } : el))
    expect(stagedMoveInvalidatedByCompile(staged, compile, renamedOnly)).toBe(false)

    const moved = compile.map((el) => (el.id === "inbox" ? { ...el, x: 400, y: 500 } : el))
    expect(stagedMoveInvalidatedByCompile(staged, compile, moved)).toBe(true)

    const gone = compile.filter((el) => el.id !== "inbox")
    expect(stagedMoveInvalidatedByCompile(staged, compile, gone)).toBe(true)
  })
})

describe("state helpers", () => {
  it("clears a pending rename once parsedSpec reflects it", () => {
    const state: CanvasDiffState = {
      ...createCanvasDiffState(),
      pendingRename: { id: "inbox", name: "Inbox", type: "Stage" },
    }
    expect(resolvePendingRename(state, parsedSpec).pendingRename).toBeNull()

    const stale: CanvasDiffState = {
      ...createCanvasDiffState(),
      pendingRename: { id: "inbox", name: "Mailbox", type: "Stage" },
    }
    expect(resolvePendingRename(stale, parsedSpec).pendingRename).not.toBeNull()
  })

  it("prunes tracking for ids that left the compiled scene, but keeps compiled ids", () => {
    const compiled = compiledScene()
    let state = stateFor(compiled)
    state = { ...state, deletedIds: new Set(["inbox", "gone"]), addedIds: new Set(["gone"]) }

    const pruned = pruneTracking(state, compiled)

    expect(Array.from(pruned.deletedIds)).toEqual(["inbox"])
    expect(Array.from(pruned.addedIds)).toEqual([])
    // compiledIds is a session-lifetime registry and must survive pruning.
    expect(pruned.compiledIds.has("inbox")).toBe(true)
  })

  it("strips only the exact diagnostic suffixes", () => {
    expect(stripDiagnosticMarkers("Inbox ❌")).toBe("Inbox")
    expect(stripDiagnosticMarkers("Inbox ⚠️")).toBe("Inbox")
    expect(stripDiagnosticMarkers("Inbox ❌ queue")).toBe("Inbox ❌ queue")
  })
})

// The compiler (excalidraw-canvas.tsx) names arrows `arrow-${source}-${target}`
// and their labels `arrow-label-${source}-${target}`. Since `-` is legal inside
// component ids, extraction works by longest-prefix match against the spec's
// component ids (sorted by descending length).
describe("arrow/label id parsing", () => {
  const prefixSpec = {
    system: {
      components: [
        { id: "api", name: "API", type: "Gateway" },
        { id: "api-gateway", name: "API Gateway", type: "Gateway" },
        { id: "db", name: "DB", type: "Store" },
      ],
    },
  }

  describe("getSourceAndTargetFromArrowId", () => {
    it("extracts source and target from a well-formed arrow id", () => {
      expect(getSourceAndTargetFromArrowId("arrow-inbox-digest", parsedSpec)).toEqual({
        source: "inbox",
        target: "digest",
      })
    })

    it("prefers the longest matching component id as the source", () => {
      // Naive first-match on "api" would yield target "gateway-db".
      expect(getSourceAndTargetFromArrowId("arrow-api-gateway-db", prefixSpec)).toEqual({
        source: "api-gateway",
        target: "db",
      })
    })

    it("still matches the shorter id when it is the real source", () => {
      expect(getSourceAndTargetFromArrowId("arrow-api-db", prefixSpec)).toEqual({
        source: "api",
        target: "db",
      })
    })

    it("keeps separator characters inside the target id intact", () => {
      expect(getSourceAndTargetFromArrowId("arrow-api-gateway-db", prefixSpec).target).toBe("db")
      const dashTargets = {
        system: { components: [{ id: "inbox" }, { id: "digest-stage" }] },
      }
      expect(getSourceAndTargetFromArrowId("arrow-inbox-digest-stage", dashTargets)).toEqual({
        source: "inbox",
        target: "digest-stage",
      })
    })

    it("returns empty strings when no known component id prefixes the arrow id", () => {
      expect(getSourceAndTargetFromArrowId("arrow-stranger-digest", parsedSpec)).toEqual({
        source: "",
        target: "",
      })
    })

    it("returns empty strings for malformed ids and empty input", () => {
      expect(getSourceAndTargetFromArrowId("not-an-arrow", parsedSpec)).toEqual({ source: "", target: "" })
      expect(getSourceAndTargetFromArrowId("arrow-", parsedSpec)).toEqual({ source: "", target: "" })
      expect(getSourceAndTargetFromArrowId("", parsedSpec)).toEqual({ source: "", target: "" })
    })

    it("yields an empty target when the id ends right after the source prefix", () => {
      expect(getSourceAndTargetFromArrowId("arrow-inbox-", parsedSpec)).toEqual({
        source: "inbox",
        target: "",
      })
    })

    it("does not mistake a label id for an arrow id", () => {
      expect(getSourceAndTargetFromArrowId("arrow-label-inbox-digest", parsedSpec)).toEqual({
        source: "",
        target: "",
      })
    })

    it("returns empty strings without a parsed spec", () => {
      expect(getSourceAndTargetFromArrowId("arrow-inbox-digest", undefined)).toEqual({ source: "", target: "" })
      expect(getSourceAndTargetFromArrowId("arrow-inbox-digest", null)).toEqual({ source: "", target: "" })
      expect(getSourceAndTargetFromArrowId("arrow-inbox-digest", {})).toEqual({ source: "", target: "" })
    })
  })

  describe("getSourceAndTargetFromLabelId", () => {
    it("extracts source and target from a well-formed label id", () => {
      expect(getSourceAndTargetFromLabelId("arrow-label-inbox-digest", parsedSpec)).toEqual({
        source: "inbox",
        target: "digest",
      })
    })

    it("prefers the longest matching component id as the source", () => {
      expect(getSourceAndTargetFromLabelId("arrow-label-api-gateway-db", prefixSpec)).toEqual({
        source: "api-gateway",
        target: "db",
      })
      expect(getSourceAndTargetFromLabelId("arrow-label-api-db", prefixSpec)).toEqual({
        source: "api",
        target: "db",
      })
    })

    it("keeps separator characters inside the target id intact", () => {
      const dashTargets = {
        system: { components: [{ id: "inbox" }, { id: "digest-stage" }] },
      }
      expect(getSourceAndTargetFromLabelId("arrow-label-inbox-digest-stage", dashTargets)).toEqual({
        source: "inbox",
        target: "digest-stage",
      })
    })

    it("returns empty strings for unknown sources, malformed ids, and empty input", () => {
      expect(getSourceAndTargetFromLabelId("arrow-label-stranger-digest", parsedSpec)).toEqual({
        source: "",
        target: "",
      })
      expect(getSourceAndTargetFromLabelId("arrow-inbox-digest", parsedSpec)).toEqual({ source: "", target: "" })
      expect(getSourceAndTargetFromLabelId("", parsedSpec)).toEqual({ source: "", target: "" })
    })

    it("returns empty strings without a parsed spec", () => {
      expect(getSourceAndTargetFromLabelId("arrow-label-inbox-digest", undefined)).toEqual({ source: "", target: "" })
      expect(getSourceAndTargetFromLabelId("arrow-label-inbox-digest", {})).toEqual({ source: "", target: "" })
    })
  })
})
