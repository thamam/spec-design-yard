/**
 * Packet-flow simulation engine.
 *
 * React-free on purpose: the Metrics tab owns the interval scheduling, the
 * setState plumbing and the rendering; every number and every log string comes
 * from here. That split is what keeps the interval tick and the manual
 * single-step from drifting apart — both call `stepSimulation`.
 */

export type SimSpeed = "0.5x" | "1x" | "2x" | "5x"
export type SimSpeedSetting = SimSpeed | "paused"

export interface PathCost {
  /** Milliseconds this component adds to a path. */
  latency: number
  /** Requests/second this component can sustain. */
  capacity: number
}

/**
 * The single per-component-type cost table. Every path calculation
 * (`computePathMetrics`, `getBottleneckNode`, `getHighestLatencyNode`) reads
 * these numbers through `componentLatency` / `componentCapacity`, so changing a
 * default here changes it everywhere.
 */
export const PATH_COST_DEFAULTS: Record<string, PathCost> = {
  gateway: { latency: 5, capacity: 1000 },
  stage: { latency: 40, capacity: 150 },
  brick: { latency: 15, capacity: 300 },
  store: { latency: 80, capacity: 100 },
}

/** Used for unknown types, and for metadata values that are not numbers. */
export const FALLBACK_PATH_COST: PathCost = { latency: 20, capacity: 200 }

/** Success probability floor/ceiling once diagnostics have been subtracted. */
export const MIN_SUCCESS_RATE = 0.5
export const ERROR_SUCCESS_PENALTY = 0.2
export const WARNING_SUCCESS_PENALTY = 0.05

/** A component looked up by id, plus its index in `system.components`. */
export interface ComponentEntry {
  comp: any
  index: number
}

export type ComponentLookup = { get(id: string): ComponentEntry | undefined }
export type DiagnosticLookup = { get(index: number): { severity?: string }[] | undefined }

/**
 * Author-declared metadata wins over the type default. A declared value that
 * does not parse as a number falls back to the neutral cost, not to the type
 * default — the author said something, it just was not a number.
 */
export function componentLatency(comp: any): number {
  const declared = comp?.metadata?.latency || comp?.latency
  if (declared) {
    const parsed = parseInt(declared, 10)
    return isNaN(parsed) ? FALLBACK_PATH_COST.latency : parsed
  }
  const type = String(comp?.type || "").toLowerCase()
  return (PATH_COST_DEFAULTS[type] || FALLBACK_PATH_COST).latency
}

export function componentCapacity(comp: any): number {
  const declared = comp?.metadata?.throughput || comp?.metadata?.rate_limit || comp?.rate_limit || comp?.throughput
  if (declared) {
    const parsed = parseInt(declared, 10)
    return isNaN(parsed) ? FALLBACK_PATH_COST.capacity : parsed
  }
  const type = String(comp?.type || "").toLowerCase()
  return (PATH_COST_DEFAULTS[type] || FALLBACK_PATH_COST).capacity
}

export interface PathMetrics {
  cumulativeLatency: number
  bottleneckCapacity: number
  successRate: number
}

/** Latency sum, narrowest capacity, and diagnostic-derived success rate. */
export function computePathMetrics(
  path: string[],
  componentsById: ComponentLookup,
  diagnosticsByComponent: DiagnosticLookup
): PathMetrics {
  let cumulativeLatency = 0
  let bottleneckCapacity = Infinity
  let successRate = 1.0

  path.forEach((nodeId) => {
    const entry = componentsById.get(nodeId ? nodeId.trim() : "")
    if (!entry) return

    cumulativeLatency += componentLatency(entry.comp)

    const cap = componentCapacity(entry.comp)
    if (cap < bottleneckCapacity) bottleneckCapacity = cap

    const compDiags = diagnosticsByComponent.get(entry.index) || []
    compDiags.forEach((d) => {
      if (d.severity === "error") successRate -= ERROR_SUCCESS_PENALTY
      else if (d.severity === "warning") successRate -= WARNING_SUCCESS_PENALTY
    })
  })

  return {
    cumulativeLatency,
    bottleneckCapacity: bottleneckCapacity === Infinity ? FALLBACK_PATH_COST.capacity : bottleneckCapacity,
    successRate: Math.max(MIN_SUCCESS_RATE, Math.min(1.0, successRate)),
  }
}

/** The narrowest node on the path; ties go to the first one encountered. */
export function getBottleneckNode(path: string[], componentsById: ComponentLookup): { node: string; capacity: number } {
  let minCap = Infinity
  let minNode = ""
  path.forEach((node) => {
    const entry = componentsById.get(node ? node.trim() : "")
    if (!entry) return
    const cap = componentCapacity(entry.comp)
    if (cap < minCap) {
      minCap = cap
      minNode = node
    }
  })
  return { node: minNode, capacity: minCap === Infinity ? FALLBACK_PATH_COST.capacity : minCap }
}

/** The slowest node on the path; ties go to the first one encountered. */
export function getHighestLatencyNode(path: string[], componentsById: ComponentLookup): { node: string; latency: number } {
  let maxLat = -1
  let maxNode = ""
  path.forEach((node) => {
    const entry = componentsById.get(node ? node.trim() : "")
    if (!entry) return
    const lat = componentLatency(entry.comp)
    if (lat > maxLat) {
      maxLat = lat
      maxNode = node
    }
  })
  return { node: maxNode, latency: maxLat }
}

/* ── Simulation engine ── */

export interface SimulationConfig {
  /** Node ids the packets travel through, source first. */
  path: string[]
  totalPackets: number
  /** Operator-configured packet loss, in percent. */
  lossRatio: number
  /** Path success probability, before packet loss is applied. */
  successRate: number
  /** Sum of the path's per-node latencies, used by the progress log lines. */
  cumulativeLatency: number
}

export interface SimulationState {
  packets: number
  successful: number
}

export interface StepResult {
  state: SimulationState
  /** Packets added by this step, clamped so the run never overshoots. */
  added: number
  /** Packets that will never arrive, over the whole run. */
  dropped: number
  completed: boolean
  /** Progress threshold this step crossed, or null. Never set on the last step. */
  milestone: 30 | 60 | null
}

export function createSimulationState(): SimulationState {
  return { packets: 0, successful: 0 }
}

/** Per-tick delay: the half-speed setting waits longer, every other speed moves more packets. */
export function speedIntervalMs(speed: SimSpeed): number {
  return speed === "0.5x" ? 100 : 50
}

/** Packets per step. One tenth of the run, scaled by the fast-forward speeds. */
export function stepSizeForSpeed(totalPackets: number, speed: SimSpeed = "1x"): number {
  const base = Math.max(1, Math.round(totalPackets / 10))
  if (speed === "2x") return base * 2
  if (speed === "5x") return base * 5
  return base
}

/** Path reliability and configured packet loss compound. */
export function effectiveSuccessProbability(successRate: number, lossRatio: number): number {
  return successRate * (1 - lossRatio / 100)
}

/**
 * The one implementation of the step math. Both the running interval and the
 * paused single-step button go through here, so they cannot disagree.
 */
export function stepSimulation(state: SimulationState, config: SimulationConfig, stepSize: number): StepResult {
  const { totalPackets } = config
  const successProb = effectiveSuccessProbability(config.successRate, config.lossRatio)

  const rawNext = state.packets + stepSize
  const completed = rawNext >= totalPackets
  const added = completed ? totalPackets - state.packets : stepSize
  const successful = state.successful + Math.round(added * successProb)
  const packets = completed ? totalPackets : rawNext

  let milestone: 30 | 60 | null = null
  if (!completed) {
    const currentPct = Math.round((state.packets / totalPackets) * 100)
    const nextPct = Math.round((packets / totalPackets) * 100)
    if (currentPct < 30 && nextPct >= 30) milestone = 30
    else if (currentPct < 60 && nextPct >= 60) milestone = 60
  }

  return {
    state: { packets, successful },
    added,
    dropped: totalPackets - successful,
    completed,
    milestone,
  }
}

/* ── Log lines ── */

export function formatStartLogs(config: SimulationConfig, preset: string): string[] {
  const { path, totalPackets, lossRatio } = config
  const startNode = path[0] || "start"
  const endNode = path[path.length - 1] || "end"
  return [
    `🚀 [Start] Initiating flow tracing from start node [${startNode}] to final destination [${endNode}] with ${totalPackets} packets.`,
    `⚙️ [Config] Preset: ${preset}, Simulated packet loss: ${lossRatio} percent`,
  ]
}

export function formatCompletionLogs(config: SimulationConfig, result: StepResult): string[] {
  const endNode = config.path[config.path.length - 1] || "end"
  return [
    `✅ [Complete] All ${config.totalPackets} packets processed. Reached final store/sink [${endNode}] successfully.`,
    `📊 [Report] Transmitted: ${config.totalPackets}, Success: ${result.state.successful}, Dropped/Lost: ${result.dropped}`,
  ]
}

export function formatMilestoneLog(config: SimulationConfig, milestone: 30 | 60): string {
  const { path } = config
  if (milestone === 30) {
    const midNode = path[Math.floor(path.length / 2)] || "intermediate"
    return `📦 [30%] Routing packets through [${midNode}] (latency accumulated so far: ${Math.round(config.cumulativeLatency * 0.3)} ms)...`
  }
  const lastNode = path[path.length - 2] || path[0]
  return `⚡ [60%] Flow passing successfully through [${lastNode}]...`
}

export function formatStepLog(config: SimulationConfig, result: StepResult): string {
  return `🦶 [Step] Stepped to ${result.state.packets}/${config.totalPackets} packets.`
}

export function formatPauseLog(packets: number, totalPackets: number): string {
  return `⏸️ [Pause] Simulation paused at ${packets}/${totalPackets} packets.`
}

export function formatSpeedLog(speed: SimSpeed): string {
  return `▶️ [Speed] Set speed to ${speed}. Resuming simulation tick...`
}
