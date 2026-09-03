import { describe, it, expect } from "vitest"
import { compileSpecToExcalidrawElements } from "../components/workspace/excalidraw-canvas"

/**
 * Arrows anchor to fixed N/E/S/W edge ports, not the shape centre.
 *
 * Excalidraw recomputes a bound arrow endpoint from the binding's
 * `fixedPoint` ratio (x + fixedPoint[0]*width, y + fixedPoint[1]*height)
 * and keeps it pinned there as shapes move. The compiler used to emit
 * [0.5, 0.5] — literally "the centre" — so arrows started and ended
 * mid-shape and the arrowhead disappeared under the target rect.
 */

const TOL = 1e-6

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function compileWith(components: any[]) {
  return compileSpecToExcalidrawElements({ system: { name: "Ports", components } })
}

function getArrow(elements: any[], source: string, target: string) {
  return elements.find((el: any) => el.id === `arrow-${source}-${target}` && el.type === "arrow")
}

function getRect(elements: any[], id: string) {
  const el: any = elements.find((el: any) => el.id === id && el.type === "rectangle")
  return { x: el.x, y: el.y, width: el.width, height: el.height }
}

function absoluteEndpoints(arrow: any) {
  const last = arrow.points[arrow.points.length - 1]
  return {
    start: { x: arrow.x + arrow.points[0][0], y: arrow.y + arrow.points[0][1] },
    end: { x: arrow.x + last[0], y: arrow.y + last[1] },
  }
}

/** True when the point sits exactly on the rect's boundary (an edge port). */
function onBoundary(p: { x: number; y: number }, rect: Rect): boolean {
  const withinX = p.x >= rect.x - TOL && p.x <= rect.x + rect.width + TOL
  const withinY = p.y >= rect.y - TOL && p.y <= rect.y + rect.height + TOL
  const onVerticalEdge =
    withinY && (Math.abs(p.x - rect.x) <= TOL || Math.abs(p.x - (rect.x + rect.width)) <= TOL)
  const onHorizontalEdge =
    withinX && (Math.abs(p.y - rect.y) <= TOL || Math.abs(p.y - (rect.y + rect.height)) <= TOL)
  return onVerticalEdge || onHorizontalEdge
}

function distanceFromCentre(p: { x: number; y: number }, rect: Rect): number {
  return Math.hypot(p.x - (rect.x + rect.width / 2), p.y - (rect.y + rect.height / 2))
}

function expectClose(a: number[], b: number[]) {
  expect(Math.abs(a[0] - b[0])).toBeLessThanOrEqual(TOL)
  expect(Math.abs(a[1] - b[1])).toBeLessThanOrEqual(TOL)
}

describe("arrow edge anchoring (compileSpecToExcalidrawElements)", () => {
  it("pins a rightward connection to the source's E port and the target's W port", () => {
    const elements = compileWith([
      { id: "a", type: "Stage", x: 100, y: 100, connections: [{ target: "b" }] },
      { id: "b", type: "Stage", x: 500, y: 100 },
    ])
    const arrow = getArrow(elements, "a", "b")
    expect(arrow).toBeDefined()

    expectClose(arrow.startBinding.fixedPoint, [1, 0.5])
    expectClose(arrow.endBinding.fixedPoint, [0, 0.5])

    const { start, end } = absoluteEndpoints(arrow)
    expect(start).toEqual({ x: 290, y: 140 }) // a's right-edge midpoint (100+190, 100+40)
    expect(end).toEqual({ x: 500, y: 140 }) // b's left-edge midpoint
  })

  it("pins a leftward connection to W and E instead", () => {
    const elements = compileWith([
      { id: "a", type: "Stage", x: 500, y: 100, connections: [{ target: "b" }] },
      { id: "b", type: "Stage", x: 100, y: 100 },
    ])
    const arrow = getArrow(elements, "a", "b")

    expectClose(arrow.startBinding.fixedPoint, [0, 0.5])
    expectClose(arrow.endBinding.fixedPoint, [1, 0.5])
    const { start, end } = absoluteEndpoints(arrow)
    expect(start).toEqual({ x: 500, y: 140 })
    expect(end).toEqual({ x: 290, y: 140 })
  })

  it("pins a downward connection to S and N when the vertical axis dominates", () => {
    // Centres (195,140) -> (235,440): dy=300 dwarfs dx=40, so the ports are
    // chosen vertically even though the shapes are not exactly aligned.
    const elements = compileWith([
      { id: "a", type: "Stage", x: 100, y: 100, connections: [{ target: "b" }] },
      { id: "b", type: "Stage", x: 140, y: 400 },
    ])
    const arrow = getArrow(elements, "a", "b")

    expectClose(arrow.startBinding.fixedPoint, [0.5, 1])
    expectClose(arrow.endBinding.fixedPoint, [0.5, 0])
    const { start, end } = absoluteEndpoints(arrow)
    expect(start).toEqual({ x: 195, y: 180 }) // a's bottom-edge midpoint
    expect(end).toEqual({ x: 235, y: 400 }) // b's top-edge midpoint
  })

  it("pins an upward connection to N and S", () => {
    const elements = compileWith([
      { id: "a", type: "Stage", x: 100, y: 400, connections: [{ target: "b" }] },
      { id: "b", type: "Stage", x: 140, y: 100 },
    ])
    const arrow = getArrow(elements, "a", "b")

    expectClose(arrow.startBinding.fixedPoint, [0.5, 0])
    expectClose(arrow.endBinding.fixedPoint, [0.5, 1])
    const { start, end } = absoluteEndpoints(arrow)
    expect(start).toEqual({ x: 195, y: 400 })
    expect(end).toEqual({ x: 235, y: 180 })
  })

  it("uses the horizontal ports when the diagonal is dominated by dx", () => {
    // Centres (195,140) -> (655,260): dx=460 vs dy=120.
    const elements = compileWith([
      { id: "a", type: "Stage", x: 100, y: 100, connections: [{ target: "b" }] },
      { id: "b", type: "Stage", x: 560, y: 220 },
    ])
    const arrow = getArrow(elements, "a", "b")
    expectClose(arrow.startBinding.fixedPoint, [1, 0.5])
    expectClose(arrow.endBinding.fixedPoint, [0, 0.5])
  })

  it("uses the vertical ports when the diagonal is dominated by dy", () => {
    // Centres (195,140) -> (335,540): dy=400 vs dx=140.
    const elements = compileWith([
      { id: "a", type: "Stage", x: 100, y: 100, connections: [{ target: "b" }] },
      { id: "b", type: "Stage", x: 240, y: 500 },
    ])
    const arrow = getArrow(elements, "a", "b")
    expectClose(arrow.startBinding.fixedPoint, [0.5, 1])
    expectClose(arrow.endBinding.fixedPoint, [0.5, 0])
  })

  it("stays finite and deterministic on coincident shapes", () => {
    const elements = compileWith([
      { id: "a", type: "Stage", x: 100, y: 100, connections: [{ target: "b" }] },
      { id: "b", type: "Stage", x: 100, y: 100 },
    ])
    const arrow = getArrow(elements, "a", "b")
    expect(Number.isFinite(arrow.x)).toBe(true)
    expect(Number.isFinite(arrow.y)).toBe(true)
    arrow.points.forEach((p: number[]) => {
      expect(Number.isFinite(p[0])).toBe(true)
      expect(Number.isFinite(p[1])).toBe(true)
    })
    // Degenerate geometry still resolves to a definite port pair (E -> W).
    expectClose(arrow.startBinding.fixedPoint, [1, 0.5])
    expectClose(arrow.endBinding.fixedPoint, [0, 0.5])
  })

  it("anchors an orphan arrow to the missing-target ellipse's edge, not its centre", () => {
    const elements = compileWith([
      { id: "a", type: "Stage", x: 100, y: 100, connections: [{ target: "ghost" }] },
    ])
    const arrow = getArrow(elements, "a", "ghost")
    expect(arrow).toBeDefined()
    expect(arrow.endBinding.elementId).toBe("orphan-a-ghost")

    // Orphan ellipse sits at (340,210), 40x40. Centres (195,140) -> (360,230):
    // dx=165 vs dy=90, so horizontal ports.
    expectClose(arrow.startBinding.fixedPoint, [1, 0.5])
    expectClose(arrow.endBinding.fixedPoint, [0, 0.5])
    const { start, end } = absoluteEndpoints(arrow)
    expect(start).toEqual({ x: 290, y: 140 })
    expect(end).toEqual({ x: 340, y: 230 }) // the ellipse's left-edge midpoint
  })

  it("keeps every endpoint on a shape boundary and away from the centre across a grid of layouts", () => {
    const offsets = [
      [300, 0], [-300, 0], [0, 220], [0, -220], [300, 80], [120, 300],
      [-260, -140], [40, 260], [5, 5], [220, 219],
    ]
    offsets.forEach(([ox, oy]) => {
      const elements = compileWith([
        { id: "a", type: "Stage", x: 100, y: 100, connections: [{ target: "b" }] },
        { id: "b", type: "Stage", x: 100 + ox, y: 100 + oy },
      ])
      const arrow = getArrow(elements, "a", "b")
      const { start, end } = absoluteEndpoints(arrow)
      const rectA = getRect(elements, "a")
      const rectB = getRect(elements, "b")

      expect(onBoundary(start, rectA)).toBe(true)
      expect(onBoundary(end, rectB)).toBe(true)
      // The old centre pin put the endpoint dead on the centre (distance 0).
      expect(distanceFromCentre(start, rectA)).toBeGreaterThan(20)
      expect(distanceFromCentre(end, rectB)).toBeGreaterThan(20)
    })
  })

  it("places the connection label midway between the two ports", () => {
    const elements = compileWith([
      {
        id: "a",
        type: "Stage",
        x: 100,
        y: 100,
        connections: [{ target: "b", label: "sync" }],
      },
      { id: "b", type: "Stage", x: 500, y: 100 },
    ])
    const label = elements.find(
      (el: any) => el.id === "arrow-label-a-b" && el.type === "text"
    )
    expect(label).toBeDefined()
    const arrow = getArrow(elements, "a", "b")
    const { start, end } = absoluteEndpoints(arrow)
    const midX = (start.x + end.x) / 2
    const midY = (start.y + end.y) / 2
    expect(label.x).toBe(midX - 40)
    expect(label.y).toBe(midY - 10)
  })

  it("registers the arrow on both shapes' boundElements so shape interactions know it", () => {
    // Excalidraw's delete/resize handlers walk the shape's boundElements
    // registry; an arrow missing from it is not deleted with its shape and
    // does not take part in bound-element updates.
    const elements = compileWith([
      { id: "a", type: "Stage", x: 100, y: 100, connections: [{ target: "b" }] },
      { id: "b", type: "Stage", x: 500, y: 100 },
    ])
    const rectA: any = elements.find((el: any) => el.id === "a" && el.type === "rectangle")
    const rectB: any = elements.find((el: any) => el.id === "b" && el.type === "rectangle")
    const arrowEntry = { id: "arrow-a-b", type: "arrow" }

    expect(rectA.boundElements).toContainEqual(arrowEntry)
    expect(rectB.boundElements).toContainEqual(arrowEntry)
    // The label text stays registered alongside the arrows.
    expect(rectA.boundElements).toContainEqual({ id: "text-a-0", type: "text" })
  })

  it("registers an orphan arrow on the orphan ellipse's boundElements", () => {
    const elements = compileWith([
      { id: "a", type: "Stage", x: 100, y: 100, connections: [{ target: "ghost" }] },
    ])
    const orphan: any = elements.find(
      (el: any) => el.id === "orphan-a-ghost" && el.type === "ellipse"
    )
    expect(orphan.boundElements).toContainEqual({ id: "arrow-a-ghost", type: "arrow" })
  })

  it("does not register arrows for connections whose target type is hidden", () => {
    const elements = compileSpecToExcalidrawElements(
      {
        system: {
          components: [
            { id: "a", type: "Stage", x: 100, y: 100, connections: [{ target: "b" }] },
            { id: "b", type: "Brick", x: 500, y: 100 },
          ],
        },
      },
      undefined,
      undefined,
      ["brick"]
    )
    const rectA: any = elements.find((el: any) => el.id === "a" && el.type === "rectangle")
    expect(getArrow(elements, "a", "b")).toBeUndefined()
    expect(rectA.boundElements).not.toContainEqual({ id: "arrow-a-b", type: "arrow" })
  })

  it("compiles the same connection to identical ports twice (determinism)", () => {
    const spec = {
      system: {
        components: [
          { id: "a", type: "Stage", x: 100, y: 100, connections: [{ target: "b" }] },
          { id: "b", type: "Stage", x: 480, y: 190 },
        ],
      },
    }
    const first = getArrow(compileSpecToExcalidrawElements(spec), "a", "b")
    const second = getArrow(compileSpecToExcalidrawElements(spec), "a", "b")
    expect(second.startBinding.fixedPoint).toEqual(first.startBinding.fixedPoint)
    expect(second.endBinding.fixedPoint).toEqual(first.endBinding.fixedPoint)
    expect(second.points).toEqual(first.points)
  })
})
