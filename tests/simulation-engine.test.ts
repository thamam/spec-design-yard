import { describe, it, expect } from "vitest"
import {
  PATH_COST_DEFAULTS,
  FALLBACK_PATH_COST,
  componentLatency,
  componentCapacity,
  computePathMetrics,
  getBottleneckNode,
  getHighestLatencyNode,
  createSimulationState,
  stepSimulation,
  stepSizeForSpeed,
  speedIntervalMs,
  effectiveSuccessProbability,
  formatCompletionLogs,
  formatMilestoneLog,
  formatStepLog,
  type ComponentEntry,
  type SimulationConfig,
} from "../lib/simulation"

/** Build the id → { comp, index } map the path functions expect. */
function lookup(components: any[]) {
  const map = new Map<string, ComponentEntry>()
  components.forEach((comp, index) => map.set(comp.id, { comp, index }))
  return map
}

const NO_DIAGNOSTICS = new Map<number, { severity?: string }[]>()

const LINEAR_SYSTEM = [
  { id: "gw", type: "Gateway" },
  { id: "stage", type: "Stage" },
  { id: "cache", type: "Brick" },
  { id: "db", type: "Store" },
]

function config(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    path: ["gw", "stage", "db"],
    totalPackets: 100,
    lossRatio: 0,
    successRate: 1,
    cumulativeLatency: 125,
    ...overrides,
  }
}

describe("path cost defaults table", () => {
  it("is the single source for every component type's latency and capacity", () => {
    Object.entries(PATH_COST_DEFAULTS).forEach(([type, cost]) => {
      expect(componentLatency({ type })).toBe(cost.latency)
      expect(componentCapacity({ type })).toBe(cost.capacity)
    })
  })

  it("falls back to the neutral cost for unknown types", () => {
    expect(componentLatency({ type: "widget" })).toBe(FALLBACK_PATH_COST.latency)
    expect(componentCapacity({})).toBe(FALLBACK_PATH_COST.capacity)
  })

  it("prefers declared metadata over the type default", () => {
    expect(componentLatency({ type: "Store", metadata: { latency: "12ms" } })).toBe(12)
    expect(componentCapacity({ type: "Store", metadata: { throughput: "900" } })).toBe(900)
    expect(componentCapacity({ type: "Store", rate_limit: "42" })).toBe(42)
  })

  it("treats an unparseable declared value as neutral, not as the type default", () => {
    expect(componentLatency({ type: "Store", metadata: { latency: "slow" } })).toBe(FALLBACK_PATH_COST.latency)
    expect(componentCapacity({ type: "Gateway", metadata: { throughput: "lots" } })).toBe(FALLBACK_PATH_COST.capacity)
  })

  /*
   * The change-one-place property: all three path functions read the same
   * table, so a doctored entry moves every answer at once.
   */
  it("feeds computePathMetrics, getBottleneckNode and getHighestLatencyNode alike", () => {
    const components = lookup(LINEAR_SYSTEM)
    const path = ["gw", "stage", "cache", "db"]

    const expectedLatency =
      PATH_COST_DEFAULTS.gateway.latency +
      PATH_COST_DEFAULTS.stage.latency +
      PATH_COST_DEFAULTS.brick.latency +
      PATH_COST_DEFAULTS.store.latency
    const expectedCapacity = Math.min(
      PATH_COST_DEFAULTS.gateway.capacity,
      PATH_COST_DEFAULTS.stage.capacity,
      PATH_COST_DEFAULTS.brick.capacity,
      PATH_COST_DEFAULTS.store.capacity
    )

    expect(computePathMetrics(path, components, NO_DIAGNOSTICS).cumulativeLatency).toBe(expectedLatency)
    expect(computePathMetrics(path, components, NO_DIAGNOSTICS).bottleneckCapacity).toBe(expectedCapacity)
    expect(getBottleneckNode(path, components).capacity).toBe(expectedCapacity)
    expect(getHighestLatencyNode(path, components).latency).toBe(PATH_COST_DEFAULTS.store.latency)
  })
})

describe("computePathMetrics", () => {
  it("ignores nodes that are not in the spec and trims ids", () => {
    const components = lookup(LINEAR_SYSTEM)
    const metrics = computePathMetrics([" gw ", "ghost", "db"], components, NO_DIAGNOSTICS)
    expect(metrics.cumulativeLatency).toBe(
      PATH_COST_DEFAULTS.gateway.latency + PATH_COST_DEFAULTS.store.latency
    )
  })

  it("returns the neutral capacity for a path with no known nodes", () => {
    const metrics = computePathMetrics(["ghost"], lookup(LINEAR_SYSTEM), NO_DIAGNOSTICS)
    expect(metrics.bottleneckCapacity).toBe(FALLBACK_PATH_COST.capacity)
    expect(metrics.successRate).toBe(1)
  })

  it("docks the success rate per diagnostic severity, with a 50% floor", () => {
    const components = lookup(LINEAR_SYSTEM)
    const oneError = new Map([[1, [{ severity: "error" }]]])
    expect(computePathMetrics(["gw", "stage"], components, oneError).successRate).toBeCloseTo(0.8)

    const errorAndWarning = new Map([[1, [{ severity: "error" }, { severity: "warning" }]]])
    expect(computePathMetrics(["gw", "stage"], components, errorAndWarning).successRate).toBeCloseTo(0.75)

    const pileOn = new Map([[1, Array.from({ length: 6 }, () => ({ severity: "error" }))]])
    expect(computePathMetrics(["gw", "stage"], components, pileOn).successRate).toBe(0.5)
  })
})

describe("bottleneck and highest-latency selection", () => {
  const components = lookup(LINEAR_SYSTEM)

  it("names the narrowest node on the path", () => {
    expect(getBottleneckNode(["gw", "stage", "db"], components)).toEqual({ node: "db", capacity: 100 })
  })

  it("names the slowest node on the path", () => {
    expect(getHighestLatencyNode(["gw", "stage", "db"], components)).toEqual({ node: "db", latency: 80 })
  })

  it("keeps the first node when capacities tie", () => {
    const tied = lookup([
      { id: "a", type: "Stage" },
      { id: "b", type: "Stage" },
    ])
    expect(getBottleneckNode(["a", "b"], tied).node).toBe("a")
    expect(getHighestLatencyNode(["a", "b"], tied).node).toBe("a")
  })

  it("reports the neutral capacity and no node for an empty path", () => {
    expect(getBottleneckNode([], components)).toEqual({ node: "", capacity: FALLBACK_PATH_COST.capacity })
    expect(getHighestLatencyNode([], components)).toEqual({ node: "", latency: -1 })
  })
})

describe("speed settings", () => {
  it("moves a tenth of the run per step, scaled by the fast-forward speeds", () => {
    expect(stepSizeForSpeed(100)).toBe(10)
    expect(stepSizeForSpeed(100, "0.5x")).toBe(10)
    expect(stepSizeForSpeed(100, "2x")).toBe(20)
    expect(stepSizeForSpeed(100, "5x")).toBe(50)
  })

  it("never steps by less than one packet", () => {
    expect(stepSizeForSpeed(3)).toBe(1)
    expect(stepSizeForSpeed(0)).toBe(1)
  })

  it("slows the tick only at half speed", () => {
    expect(speedIntervalMs("0.5x")).toBe(100)
    expect(speedIntervalMs("1x")).toBe(50)
    expect(speedIntervalMs("5x")).toBe(50)
  })
})

describe("stepSimulation", () => {
  it("accumulates packets to exactly the configured total", () => {
    const cfg = config()
    let state = createSimulationState()
    let steps = 0
    let completed = false

    while (!completed && steps < 50) {
      const result = stepSimulation(state, cfg, stepSizeForSpeed(cfg.totalPackets))
      state = result.state
      completed = result.completed
      steps++
    }

    expect(completed).toBe(true)
    expect(steps).toBe(10)
    expect(state.packets).toBe(100)
    expect(state.successful).toBe(100)
  })

  it("never overshoots the total when the step size does not divide it", () => {
    const cfg = config({ totalPackets: 55 })
    let state = createSimulationState()
    let result = stepSimulation(state, cfg, 40)
    expect(result.state.packets).toBe(40)
    result = stepSimulation(result.state, cfg, 40)
    expect(result.completed).toBe(true)
    expect(result.state.packets).toBe(55)
    expect(result.added).toBe(15)
  })

  it("compounds path reliability with the configured loss ratio", () => {
    expect(effectiveSuccessProbability(1, 20)).toBeCloseTo(0.8)
    expect(effectiveSuccessProbability(0.5, 50)).toBeCloseTo(0.25)

    const cfg = config({ lossRatio: 20, successRate: 1 })
    const result = stepSimulation(createSimulationState(), cfg, 10)
    expect(result.state.successful).toBe(8)
    expect(result.dropped).toBe(92)
  })

  it("reports the whole run's shortfall as dropped, not just this step's", () => {
    const cfg = config({ lossRatio: 50 })
    const result = stepSimulation(createSimulationState(), cfg, 10)
    expect(result.state.packets).toBe(10)
    expect(result.state.successful).toBe(5)
    expect(result.dropped).toBe(95)
  })

  it("flags the 30% and 60% crossings once each, and never on the final step", () => {
    const cfg = config()
    let state = createSimulationState()
    const milestones: (number | null)[] = []

    for (let i = 0; i < 10; i++) {
      const result = stepSimulation(state, cfg, 10)
      milestones.push(result.milestone)
      state = result.state
      if (result.completed) expect(result.milestone).toBeNull()
    }

    expect(milestones).toEqual([null, null, 30, null, null, 60, null, null, null, null])
  })

  /*
   * The whole reason the engine exists: the paused single-step button and the
   * running interval used to hand-copy this math and could drift.
   */
  it("gives a single step the same result as one interval tick at 1x", () => {
    const cfg = config({ lossRatio: 15, successRate: 0.9 })
    const stepSize = stepSizeForSpeed(cfg.totalPackets)

    const asTick = stepSimulation(createSimulationState(), cfg, stepSize)
    const asSingleStep = stepSimulation(createSimulationState(), cfg, stepSizeForSpeed(cfg.totalPackets, "1x"))

    expect(asSingleStep).toEqual(asTick)
  })

  it("completes immediately when the step size covers the whole run", () => {
    const cfg = config()
    const result = stepSimulation(createSimulationState(), cfg, 500)
    expect(result.completed).toBe(true)
    expect(result.state.packets).toBe(100)
    expect(result.added).toBe(100)
  })
})

describe("log lines", () => {
  const cfg = config({ path: ["gw", "stage", "db"], cumulativeLatency: 125 })

  it("names the final node in the completion report", () => {
    const result = stepSimulation({ packets: 90, successful: 90 }, cfg, 10)
    expect(formatCompletionLogs(cfg, result)).toEqual([
      "✅ [Complete] All 100 packets processed. Reached final store/sink [db] successfully.",
      "📊 [Report] Transmitted: 100, Success: 100, Dropped/Lost: 0",
    ])
  })

  it("reports accumulated latency at the 30% mark and the penultimate node at 60%", () => {
    expect(formatMilestoneLog(cfg, 30)).toBe(
      "📦 [30%] Routing packets through [stage] (latency accumulated so far: 38 ms)..."
    )
    expect(formatMilestoneLog(cfg, 60)).toBe("⚡ [60%] Flow passing successfully through [stage]...")
  })

  it("reports the post-step packet count in the step line", () => {
    const result = stepSimulation(createSimulationState(), cfg, 10)
    expect(formatStepLog(cfg, result)).toBe("🦶 [Step] Stepped to 10/100 packets.")
  })
})
