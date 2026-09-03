import { describe, it, expect } from "vitest"
import {
  createCanvasDiffState,
  diffScene,
  registerCompiledElements,
  CanvasDiffState,
} from "../lib/canvas-diff"
import { compileSpecToExcalidrawElements } from "../components/workspace/excalidraw-canvas"
import { parseSpec } from "../lib/spec-model"

/**
 * Regression cover for the position flicker: a component's coordinates
 * ping-ponged between the canvas and the YAML, retargeting the editor caret
 * on every round and making the spec impossible to type in.
 */

const parsedSpec = {
  system: {
    components: [
      { id: "inbox", name: "Inbox", type: "Stage" },
      { id: "digest", name: "Digest", type: "Stage" },
    ],
  },
}

function rects(x1: number, y1: number, x2: number, y2: number) {
  return [
    { type: "rectangle", id: "inbox", x: x1, y: y1, isDeleted: false },
    { type: "rectangle", id: "digest", x: x2, y: y2, isDeleted: false },
  ]
}

function run(
  updatedElements: any[],
  compiledElements: any[],
  state: CanvasDiffState,
  appState: any = {},
  gestureSeen = true,
) {
  return diffScene({ updatedElements, compiledElements, appState, parsedSpec, gestureSeen, state })
}

const specWith = (thirdExtra: string) => `system:
  name: Demo
  components:
    - id: a
      type: Stage
    - id: b
      type: Stage
    - id: stage-01
      type: Stage${thirdExtra}
    - id: c
      type: Stage
    - id: d
      type: Stage
`

function positionsOf(text: string): Record<string, { x: number; y: number }> {
  const { spec } = parseSpec(text)
  const out: Record<string, { x: number; y: number }> = {}
  compileSpecToExcalidrawElements(spec)
    .filter((el: any) => el.type === "rectangle")
    .forEach((el: any) => {
      out[el.id] = { x: el.x, y: el.y }
    })
  return out
}

describe("auto-layout slots are independent of which siblings are pinned", () => {
  it("keeps unpinned siblings put when one component gains explicit x/y", () => {
    const before = positionsOf(specWith(""))
    const after = positionsOf(specWith("\n      x: 700\n      y: 400"))

    expect(after["stage-01"]).toEqual({ x: 700, y: 400 })
    // Everything the user did not touch must not move.
    expect(after["a"]).toEqual(before["a"])
    expect(after["b"]).toEqual(before["b"])
    expect(after["c"]).toEqual(before["c"])
    expect(after["d"]).toEqual(before["d"])
  })
})

describe("a hand-written coordinate is honoured one axis at a time", () => {
  it("places the component at an explicit y and keeps the auto-layout x", () => {
    const at = positionsOf(specWith("\n      y: 200"))
    expect(at["stage-01"].y).toBe(200)
    expect(at["stage-01"].x).toBe(positionsOf(specWith(""))["stage-01"].x)
  })

  it("places the component at an explicit x and keeps the auto-layout y", () => {
    const at = positionsOf(specWith("\n      x: 700"))
    expect(at["stage-01"].x).toBe(700)
    expect(at["stage-01"].y).toBe(positionsOf(specWith(""))["stage-01"].y)
  })

  it("ignores a non-finite coordinate rather than emitting NaN geometry", () => {
    const at = positionsOf(specWith("\n      y: not-a-number"))
    expect(Number.isFinite(at["stage-01"].y)).toBe(true)
  })
})

describe("diffScene mid-gesture guard on Excalidraw 0.18 appState", () => {
  it("stays quiet while an existing selection is being dragged", () => {
    const compiled = rects(60, 160, 310, 160)
    const state = registerCompiledElements(createCanvasDiffState(), compiled)
    const scene = rects(500, 500, 310, 160)

    const result = run(scene, compiled, state, { selectedElementsAreBeingDragged: true })
    expect(result.pendingElements).toBeNull()
  })

  it("stays quiet while a label is being text-edited", () => {
    const compiled = rects(60, 160, 310, 160)
    const state = registerCompiledElements(createCanvasDiffState(), compiled)
    const scene = rects(500, 500, 310, 160)

    const result = run(scene, compiled, state, { editingTextElement: { id: "text-inbox-0" } })
    expect(result.pendingElements).toBeNull()
  })

  it("stays quiet while a brand new element is being drawn", () => {
    const compiled = rects(60, 160, 310, 160)
    const state = registerCompiledElements(createCanvasDiffState(), compiled)
    const scene = rects(500, 500, 310, 160)

    const result = run(scene, compiled, state, { newElement: { id: "Xk92mQ" } })
    expect(result.pendingElements).toBeNull()
  })
})

describe("coordinates only travel canvas -> YAML behind a real gesture", () => {
  it("ignores a scene lagging behind a YAML coordinate edit when nothing was touched", () => {
    // The user typed `y: 200`; the compile is already there but Excalidraw
    // still reports the pre-edit scene. No gesture happened, so this is lag.
    const oldCompiled = rects(60, 160, 310, 160)
    const newCompiled = rects(60, 400, 310, 160)
    const state = registerCompiledElements(createCanvasDiffState(), newCompiled)

    const result = run(oldCompiled, newCompiled, state, {}, false)
    expect(result.pendingElements).toBeNull()
  })

  it("still reports a drag once a pointer gesture has been seen", () => {
    const compiled = rects(60, 160, 310, 160)
    const state = registerCompiledElements(createCanvasDiffState(), compiled)

    const dragged = rects(600, 700, 310, 160)
    const result = run(dragged, compiled, state, {}, true)
    expect(result.pendingElements?.map((r: any) => r.id)).toEqual(["inbox"])
  })

  it("lets the user drag a component back to a position it previously held", () => {
    const first = rects(60, 160, 310, 160)
    const second = rects(600, 700, 310, 160)
    let state = registerCompiledElements(createCanvasDiffState(), first)
    state = registerCompiledElements(state, second)

    const result = run(first, second, state, {}, true)
    expect(result.pendingElements?.map((r: any) => r.id)).toEqual(["inbox"])
  })
})

describe("coordinate writeback is scoped to what actually moved", () => {
  it("stages only the moved rect, leaving untouched components unpinned", () => {
    const compiled = rects(60, 160, 310, 160)
    const state = registerCompiledElements(createCanvasDiffState(), compiled)
    const scene = rects(600, 700, 310, 160)

    const result = run(scene, compiled, state)
    expect(result.pendingElements?.map((r: any) => r.id)).toEqual(["inbox"])
  })
})
