"use client"

import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from "react"
import { SearchIcon, SparklesIcon } from "lucide-react"
import { lintSpec, type Diagnostic } from "../../lib/linter"
import specStore from "../../lib/remote-sync-store"
import { normalizeConnections } from "../../lib/spec-model"
import { generateArchitectureAuditReport, architectureAuditReportFilename } from "../../lib/export-report"
import { triggerDownload } from "./download"
import {
  computePathMetrics as computePathMetricsFor,
  getBottleneckNode as getBottleneckNodeFor,
  getHighestLatencyNode as getHighestLatencyNodeFor,
  createSimulationState,
  stepSimulation,
  stepSizeForSpeed,
  speedIntervalMs,
  formatStartLogs,
  formatCompletionLogs,
  formatMilestoneLog,
  formatStepLog,
  formatPauseLog,
  formatSpeedLog,
  type SimSpeed,
  type SimulationConfig,
  type SimulationState,
  type StepResult,
} from "../../lib/simulation"

interface MetricsTabProps {
  parsedSpec?: any
  selectedUnit?: string | null
  setSelectedUnit?: (val: string | null) => void
  diagnostics?: Diagnostic[]
  onQuickFix?: (path: string, fixType: string, extraData?: any) => void
  pathSource?: string
  setPathSource?: (val: string) => void
  pathTarget?: string
  setPathTarget?: (val: string) => void
  /** Flips true when workspace hydration (incl. server pull) has completed. */
  storeHydrated?: boolean
}

const EMPTY_DIAGNOSTICS: Diagnostic[] = []

const COMPONENT_DIAGNOSTIC_PATH = /^system\.components\[(\d+)\]/
const CONNECTION_DIAGNOSTIC_PATH = /^system\.components\[(\d+)\]\.connections\[(\d+)\]/

/** Column order for every simulation-run CSV this tab writes. */
const SIMULATION_RUN_CSV_HEADERS = [
  "ID", "Timestamp", "Path", "Packets", "Successful", "Dropped", "Loss Ratio (%)", "Latency (ms)", "Bottleneck (req/s)"
]

function simulationRunCsvRow(run: any, path: string = run.path) {
  return [run.id, run.timestamp, path, run.packetCount, run.successful, run.dropped, run.lossRatio, run.latency, run.bottleneck]
}

function downloadJSON(data: any, filename: string) {
  triggerDownload("data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2)), filename)
}

function downloadCSV(rows: any[][], filename: string) {
  const csvContent = "data:text/csv;charset=utf-8," +
    [SIMULATION_RUN_CSV_HEADERS.join(","), ...rows.map(r => r.join(","))].join("\n")
  triggerDownload(encodeURI(csvContent), filename)
}

/**
 * Walk the components a linter rule flagged. Recommendations that restate a
 * linter rule read the component back out of the spec so they can keep their
 * own wording and their own quick-fix, without re-deriving the rule.
 */
function forEachDiagnosticComponent(
  diagnostics: Diagnostic[],
  code: string,
  components: any[],
  visit: (comp: any, compIdx: number) => void
) {
  diagnostics.forEach((d) => {
    if (d.code !== code) return
    const match = (d.path || "").match(COMPONENT_DIAGNOSTIC_PATH)
    if (!match) return
    const compIdx = parseInt(match[1], 10)
    const comp = components[compIdx]
    if (comp && typeof comp.id === "string") visit(comp, compIdx)
  })
}

/** The same, for rules whose diagnostic points at a single connection. */
function forEachDiagnosticConnection(
  diagnostics: Diagnostic[],
  code: string,
  components: any[],
  visit: (sourceId: string, targetId: string, compIdx: number, connIdx: number) => void
) {
  diagnostics.forEach((d) => {
    if (d.code !== code) return
    const match = (d.path || "").match(CONNECTION_DIAGNOSTIC_PATH)
    if (!match) return
    const compIdx = parseInt(match[1], 10)
    const connIdx = parseInt(match[2], 10)
    const comp = components[compIdx]
    if (!comp || typeof comp.id !== "string") return
    const conn = Array.isArray(comp.connections) ? comp.connections[connIdx] : undefined
    const target = typeof conn === "string" ? conn : conn?.target
    if (typeof target !== "string") return
    visit(comp.id.trim(), target.trim(), compIdx, connIdx)
  })
}

interface ComponentWithIndex {
  comp: {
    id: string
    name?: string
    type?: string
    [key: string]: any
  }
  originalIdx: number
}

export function MetricsTab({
  parsedSpec,
  selectedUnit,
  setSelectedUnit,
  diagnostics = EMPTY_DIAGNOSTICS,
  onQuickFix,
  pathSource: propPathSource,
  setPathSource: propSetPathSource,
  pathTarget: propPathTarget,
  setPathTarget: propSetPathTarget,
  storeHydrated,
}: MetricsTabProps) {
  const [localPathSource, setLocalPathSource] = useState<string>("")
  const [localPathTarget, setLocalPathTarget] = useState<string>("")
  const pathSource = propPathSource !== undefined ? propPathSource : localPathSource
  const setPathSource = propSetPathSource || setLocalPathSource
  const pathTarget = propPathTarget !== undefined ? propPathTarget : localPathTarget
  const setPathTarget = propSetPathTarget || setLocalPathTarget

  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [severityFilter, setSeverityFilter] = useState("all")

  const [simulationState, setSimulationState] = useState<"idle" | "running" | "completed">("idle")
  const [simSpeed, setSimSpeed] = useState<"0.5x" | "1x" | "2x" | "5x" | "paused">("1x")
  const [simulationLogs, setSimulationLogs] = useState<string[]>([])
  const [simulatedPackets, setSimulatedPackets] = useState<number>(0)
  const [simulatedSuccessful, setSimulatedSuccessful] = useState<number>(0)
  const [simulatingPathIndex, setSimulatingPathIndex] = useState<number | null>(null)
  const [simPacketCount, setSimPacketCount] = useState<number>(100)
  const [simLossRatio, setSimLossRatio] = useState<number>(0)
  const [customPresets, setCustomPresets] = useState<{ name: string; packets: number; loss: number }[]>([])
  const [customPresetName, setCustomPresetName] = useState("")

  const [comparedPathIndices, setComparedPathIndices] = useState<number[]>([])
  const [simulationHistory, setSimulationHistory] = useState<any[]>([])

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSimulationHistory(specStore.getSimulationHistory())
      setCustomPresets(specStore.getCustomPresets())
    }
  }, [])

  // Server hydration lands after mount (workspace awaits loadFromServer before
  // isHydrated flips). Re-read the store when that signal arrives so the UI
  // shows the project-backed history/presets instead of overwriting them with
  // the empty pre-hydration state. storeHydrated is optional: undefined means
  // "no workspace hydration signal" (standalone usage/tests) and never re-reads.
  useEffect(() => {
    if (storeHydrated && typeof window !== "undefined") {
      setSimulationHistory(specStore.getSimulationHistory())
      setCustomPresets(specStore.getCustomPresets())
    }
  }, [storeHydrated])

  useEffect(() => {
    setComparedPathIndices([])
  }, [pathSource, pathTarget])

  const derivedPreset = useMemo(() => {
    const matchingCustom = customPresets.find(p => p.packets === simPacketCount && p.loss === simLossRatio)
    if (matchingCustom) return matchingCustom.name

    if (simPacketCount === 100 && simLossRatio === 0) return "default"
    if (simPacketCount === 500 && simLossRatio === 5) return "load"
    if (simPacketCount === 200 && simLossRatio === 20) return "flaky"
    if (simPacketCount === 500 && simLossRatio === 50) return "stress"
    if (simPacketCount === 50 && simLossRatio === 0) return "sanity"
    return "custom"
  }, [simPacketCount, simLossRatio, customPresets])

  const handlePresetChange = (preset: string) => {
    const custom = customPresets.find(p => p.name === preset)
    if (custom) {
      setSimPacketCount(custom.packets)
      setSimLossRatio(custom.loss)
      return
    }

    if (preset === "default") {
      setSimPacketCount(100)
      setSimLossRatio(0)
    } else if (preset === "load") {
      setSimPacketCount(500)
      setSimLossRatio(5)
    } else if (preset === "flaky") {
      setSimPacketCount(200)
      setSimLossRatio(20)
    } else if (preset === "stress") {
      setSimPacketCount(500)
      setSimLossRatio(50)
    } else if (preset === "sanity") {
      setSimPacketCount(50)
      setSimLossRatio(0)
    }
  }

  const simulationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current)
      }
    }
  }, [])

  useEffect(() => {
    setSimulationState("idle")
    setSimulatingPathIndex(null)
    setSimulatedPackets(0)
    setSimulatedSuccessful(0)
    setSimSpeed("1x")
    setSimulationLogs([])
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current)
      simulationIntervalRef.current = null
    }
  }, [pathSource, pathTarget, simPacketCount, simLossRatio])

  const systemMetadata = parsedSpec?.system?.metadata
  const hasSystemMetadata = !!systemMetadata && typeof systemMetadata === "object" && !Array.isArray(systemMetadata)

  // The graph rules behind several recommendations are the linter's, not this
  // tab's. Lint the spec here rather than trusting the `diagnostics` prop: the
  // recommendations used to be derived straight from the spec and must keep
  // standing on their own when a caller passes a narrowed diagnostic list.
  const specDiagnostics = useMemo(() => lintSpec(parsedSpec), [parsedSpec])

  const sysMetadataDiagnostics = useMemo(() => {
    if (!diagnostics) return []
    return diagnostics.filter((d) => {
      const p = d.path || ""
      return p === "system" || p === "system.metadata" || p.startsWith("system.metadata.")
    })
  }, [diagnostics])

  // 1. Pre-group diagnostics by component index in O(D) time
  const diagnosticsByComponent = useMemo(() => {
    const map = new Map<number, Diagnostic[]>()
    
    diagnostics.forEach((d) => {
      const path = d.path
      if (!path) return
      
      const match = path.match(/^system\.components\[(\d+)\](?:\.|$)/)
      if (match) {
        const idx = parseInt(match[1], 10)
        if (!map.has(idx)) {
          map.set(idx, [])
        }
        map.get(idx)!.push(d)
      }
    })
    
    return map
  }, [diagnostics])

  const metrics = useMemo(() => {
    const components = Array.isArray(parsedSpec?.system?.components) ? parsedSpec.system.components : []
    const systemName = parsedSpec?.system?.name || "Unnamed System"

    // Compute metrics
    const totalComponents = components.length
    let gatewayCount = 0
    let stageCount = 0
    let brickCount = 0
    let storeCount = 0

    let totalConnections = 0

    components.forEach((c: any) => {
      if (!c) return
      const type = String(c.type || '').toLowerCase()
      if (type === 'gateway') gatewayCount++
      else if (type === 'stage') stageCount++
      else if (type === 'brick') brickCount++
      else if (type === 'store') storeCount++

      const conns = c.connections || []
      if (Array.isArray(conns)) {
        conns.forEach((conn: any) => {
          const target = typeof conn === 'string' ? conn : conn?.target
          if (target) {
            totalConnections++
          }
        })
      }
    })

    // Compute diagnostics counts
    const errorsCount = diagnostics.filter(d => d.severity === "error").length
    const warningsCount = diagnostics.filter(d => d.severity === "warning").length
    const infoCount = diagnostics.filter(d => d.severity === "info").length

    // Health Score Calculation: starts at 100%, drops by 15% per error and 5% per warning
    const healthPct = Math.max(0, 100 - (errorsCount * 15) - (warningsCount * 5))

    const connectionDensity = totalComponents > 0 ? parseFloat((totalConnections / totalComponents).toFixed(2)) : 0

    let couplingRating = "Empty"
    if (connectionDensity > 0) {
      if (connectionDensity < 1.0) couplingRating = "Loose"
      else if (connectionDensity < 1.8) couplingRating = "Balanced"
      else if (connectionDensity < 2.5) couplingRating = "Dense"
      else couplingRating = "Spaghettified"
    }

    // Connected components (undirected subgraphs count)
    const ids = new Set<string>()
    components.forEach((c: any) => {
      if (c && typeof c.id === 'string' && c.id.trim() !== "") {
        ids.add(c.id.trim())
      }
    })

    const adjUndirected: Record<string, string[]> = Object.create(null)
    const adjDirected: Record<string, string[]> = Object.create(null)
    ids.forEach(id => {
      adjUndirected[id] = []
      adjDirected[id] = []
    })

    components.forEach((c: any) => {
      if (!c || typeof c.id !== 'string') return
      const u = c.id.trim()
      if (!ids.has(u)) return

      const conns = c.connections || []
      if (Array.isArray(conns)) {
        conns.forEach((conn: any) => {
          const target = typeof conn === 'string' ? conn : conn?.target
          if (typeof target === 'string') {
            const v = target.trim()
            if (ids.has(v) && v !== u) {
              if (!adjUndirected[u].includes(v)) adjUndirected[u].push(v)
              if (!adjUndirected[v].includes(u)) adjUndirected[v].push(u)
              if (!adjDirected[u].includes(v)) adjDirected[u].push(v)
            }
          }
        })
      }
    })

    const visitedNodes = new Set<string>()
    let subgraphsCount = 0

    ids.forEach(startNode => {
      if (!visitedNodes.has(startNode)) {
        subgraphsCount++
        const queue = [startNode]
        visitedNodes.add(startNode)
        let qIdx = 0
        while (qIdx < queue.length) {
          const node = queue[qIdx++]
          const neighbors = adjUndirected[node] || []
          for (const neighbor of neighbors) {
            if (!visitedNodes.has(neighbor)) {
              visitedNodes.add(neighbor)
              queue.push(neighbor)
            }
          }
        }
      }
    })

    // Hotspot components calculation
    const incomingCountMap: Record<string, number> = Object.create(null)
    const outgoingCountMap: Record<string, number> = Object.create(null)
    ids.forEach(id => {
      incomingCountMap[id] = 0
      outgoingCountMap[id] = 0
    })

    components.forEach((c: any) => {
      if (!c || typeof c.id !== 'string') return
      const u = c.id.trim()
      if (!ids.has(u)) return

      const conns = c.connections || []
      if (Array.isArray(conns)) {
        conns.forEach((conn: any) => {
          const target = typeof conn === 'string' ? conn : conn?.target
          if (typeof target === 'string') {
            const v = target.trim()
            if (ids.has(v) && v !== u) {
              outgoingCountMap[u]++
              incomingCountMap[v]++
            }
          }
        })
      }
    })

    const hotspots = components
      .filter((c: any) => c && typeof c.id === 'string' && ids.has(c.id.trim()))
      .map((c: any) => {
        const id = c.id.trim()
        const outDeg = outgoingCountMap[id] || 0
        const inDeg = incomingCountMap[id] || 0
        const degree = outDeg + inDeg
        return {
          id,
          name: c.name || id,
          type: c.type || "Stage",
          degree,
          incoming: inDeg,
          outgoing: outDeg
        }
      })
      .sort((a: any, b: any) => b.degree - a.degree)

    // Single Points of Failure / Articulation Points detection
    const singlePointsOfFailure: any[] = []
    if (components.length > 2) {
      ids.forEach((v) => {
        const visitedRemaining = new Set<string>()
        let remainingSubgraphsCount = 0

        ids.forEach(startNode => {
          if (startNode !== v && !visitedRemaining.has(startNode)) {
            remainingSubgraphsCount++
            const queue = [startNode]
            visitedRemaining.add(startNode)
            let qIdx = 0
            while (qIdx < queue.length) {
              const node = queue[qIdx++]
              const neighbors = adjUndirected[node] || []
              for (const neighbor of neighbors) {
                if (neighbor !== v && !visitedRemaining.has(neighbor)) {
                  visitedRemaining.add(neighbor)
                  queue.push(neighbor)
                }
              }
            }
          }
        })

        if (remainingSubgraphsCount > subgraphsCount) {
          const compObj = components.find((c: any) => c && typeof c.id === 'string' && c.id.trim() === v)
          singlePointsOfFailure.push({
            id: v,
            name: compObj?.name || v,
            type: compObj?.type || "Stage"
          })
        }
      })
    }

    const recommendations: {
      type: "info" | "warning" | "success";
      message: string;
      action: string;
      fix?: {
        path: string;
        fixType: string;
        extraData?: any;
        buttonLabel: string;
      };
    }[] = []

    // 1. Coupling Insight
    if (couplingRating === "Spaghettified" || couplingRating === "Dense") {
      recommendations.push({
        type: "warning",
        message: `High connection coupling (${connectionDensity}).`,
        action: "Consider introducing an asynchronous event broker or refactoring hub components to reduce tight coupling."
      })
    } else if (couplingRating === "Loose" && totalComponents > 1) {
      recommendations.push({
        type: "info",
        message: "Loose connection coupling.",
        action: "Ensure that all core processing paths are fully integrated and not running in silos."
      })
    }

    // 2. SPOF Insight
    if (singlePointsOfFailure.length > 0) {
      const spofIds = singlePointsOfFailure.map(s => s.id).join(", ")
      recommendations.push({
        type: "warning",
        message: `Critical single point of failure (SPOF) detected: ${spofIds}.`,
        action: "Introduce parallel execution stages, fallback channels, or load balancers to protect system integrity."
      })
    }

    // 3. Isolated Stores — the linter's "unused-store" rule, phrased for this tab.
    forEachDiagnosticComponent(specDiagnostics, "unused-store", components, (comp, compIdx) => {
      recommendations.push({
        type: "warning",
        message: `Isolated Data Store with no inbound flow: "${comp.id}".`,
        action: "Ensure this store receives writes from an active processing stage or ingest gateway.",
        fix: {
          path: `system.components[${compIdx}]`,
          fixType: "connect-to-store",
          buttonLabel: `Connect Stage to ${comp.id}`
        }
      })
    })

    // 4. Processing Sinks — the linter's "sink-stage-brick" rule.
    forEachDiagnosticComponent(specDiagnostics, "sink-stage-brick", components, (comp, compIdx) => {
      recommendations.push({
        type: "warning",
        message: `Processing sink stage/brick with no outbound flow: "${comp.id}".`,
        action: "Connect this terminal stage to downstream data stores or subsequent stages to complete the data lifecycle.",
        fix: {
          path: `system.components[${compIdx}]`,
          fixType: "connect-to-store",
          buttonLabel: `Connect ${comp.id} to Downstream Store`
        }
      })
    })

    // 5. Gateway Directly to Store — the linter's "gateway-to-store" rule. Its
    // path points at the offending connection's target; the fix acts on the
    // connection itself.
    forEachDiagnosticConnection(specDiagnostics, "gateway-to-store", components, (gatewayId, targetId, compIdx, connIdx) => {
      recommendations.push({
        type: "warning",
        message: `Direct Gateway-to-Store bypass connection detected: "${gatewayId} → ${targetId}".`,
        action: "Route gateway ingestion traffic through a validation or sanitization Stage before writing to the Store.",
        fix: {
          path: `system.components[${compIdx}].connections[${connIdx}]`,
          fixType: "insert-stage",
          buttonLabel: `Insert Validation Stage before ${targetId}`
        }
      })
    })

    // 6. STRIDE Security Recommendation Insights
    if (diagnostics && Array.isArray(diagnostics)) {
      diagnostics.forEach((d) => {
        if (d.code && d.code.startsWith("stride-") && d.path) {
          let buttonLabel = "Apply Security Guard"
          if (d.code === "stride-spoofing") buttonLabel = "Apply Spoofing Guard (Auth Label)"
          else if (d.code === "stride-tampering") buttonLabel = "Apply Tampering Guard (TLS Flow)"
          else if (d.code === "stride-repudiation") buttonLabel = "Inject Central Audit Logger"
          else if (d.code === "stride-information-disclosure") buttonLabel = "Inject Auth Verifier Stage"
          else if (d.code === "stride-elevation-of-privilege") buttonLabel = "Apply Elevation Guard"
          else if (d.code === "stride-denial-of-service") buttonLabel = "Apply Rate Limiting Guard"

          recommendations.push({
            type: "warning",
            message: `STRIDE Security Threat: ${d.message}`,
            action: "Mitigate this risk by applying the recommended security guard to secure the architectural boundaries.",
            fix: {
              path: d.path,
              fixType: d.code,
              buttonLabel
            }
          })
        }
      })
    }

    if (recommendations.length === 0 && totalComponents > 0 && healthPct === 100) {
      recommendations.push({
        type: "success",
        message: "Highly robust and clean system architecture layout.",
        action: "All processing pipelines, entry gateways, and storage nodes are perfectly balanced with no detected SPOFs or flow bypasses!"
      })
    }

    return {
      components,
      systemName,
      totalComponents,
      gatewayCount,
      stageCount,
      brickCount,
      storeCount,
      totalConnections,
      errorsCount,
      warningsCount,
      infoCount,
      healthPct,
      connectionDensity,
      couplingRating,
      subgraphsCount,
      hotspots,
      singlePointsOfFailure,
      adjDirected,
      allIds: Array.from(ids).sort(),
      recommendations
    }
  }, [parsedSpec, diagnostics, specDiagnostics])

  const {
    components,
    systemName,
    totalComponents,
    gatewayCount,
    stageCount,
    brickCount,
    storeCount,
    totalConnections,
    errorsCount,
    warningsCount,
    infoCount,
    healthPct,
    connectionDensity,
    couplingRating,
    subgraphsCount,
    hotspots,
    singlePointsOfFailure,
    adjDirected,
    allIds,
    recommendations
  } = metrics

  // Pre-computed O(1) Component Lookup Map
  const componentsById = useMemo(() => {
    const map = new Map<string, { comp: any; index: number }>()
    const compList = Array.isArray(components) ? components : []
    compList.forEach((c: any, idx: number) => {
      if (c && typeof c.id === "string") {
        map.set(c.id.trim(), { comp: c, index: idx })
      }
    })
    return map
  }, [components])

  // Memoized Path Metrics Calculation using O(1) map
  const computePathMetrics = useCallback(
    (path: string[]) => computePathMetricsFor(path, componentsById, diagnosticsByComponent),
    [componentsById, diagnosticsByComponent]
  )

  useEffect(() => {
    if (simulationState === "completed") {
      const path = simPathRef.current
      if (path && path.length > 0) {
        const pathMetrics = computePathMetrics(path)
        const totalPackets = simPacketCount
        const finalSuccess = simStateRef.current.successful
        const pathStr = path.join(" ➔ ")
        const newRun = {
          id: `sim-run-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp: new Date().toLocaleString(),
          path: pathStr,
          packetCount: totalPackets,
          successful: finalSuccess,
          dropped: totalPackets - finalSuccess,
          lossRatio: simLossRatio,
          latency: pathMetrics.cumulativeLatency,
          bottleneck: pathMetrics.bottleneckCapacity
        }
        
        setSimulationHistory(prev => {
          const duplicate = prev.some(r => r.path === pathStr && r.packetCount === totalPackets && r.lossRatio === simLossRatio && (Date.now() - new Date(r.timestamp).getTime()) < 1000)
          if (duplicate) return prev
          const next = [newRun, ...prev]
          if (typeof window !== "undefined") {
            specStore.saveSimulationHistory(next)
          }
          return next
        })
      }
    }
  }, [simulationState, simPacketCount, simLossRatio, computePathMetrics])

  const handleExportJSON = (run: any) => {
    downloadJSON(run, `simulation-run-${run.id}.json`)
  }

  const handleExportCSV = (run: any) => {
    downloadCSV([simulationRunCsvRow(run)], `simulation-run-${run.id}.csv`)
  }

  const handleExportAllJSON = () => {
    downloadJSON(simulationHistory, `simulation-history-${Date.now()}.json`)
  }

  const handleExportAllCSV = () => {
    // The bulk export quotes the arrow-joined path; a single run's path never
    // needs it because the whole file is that one row.
    const rows = simulationHistory.map(run => simulationRunCsvRow(run, `"${run.path.replace(/"/g, '""')}"`))
    downloadCSV(rows, `simulation-history-${Date.now()}.csv`)
  }

  const handleExportMarkdownReport = () => {
    const md = generateArchitectureAuditReport(parsedSpec, diagnostics)

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      const p = navigator.clipboard.writeText(md)
      if (p && typeof p.catch === "function") {
        p.catch((e) => console.error("Clipboard copy failed:", e))
      }
    }

    triggerDownload(
      "data:text/markdown;charset=utf-8," + encodeURIComponent(md),
      architectureAuditReportFilename(systemName)
    )
  }

  const getBottleneckNode = useCallback(
    (path: string[]) => getBottleneckNodeFor(path, componentsById),
    [componentsById]
  )

  const getHighestLatencyNode = useCallback(
    (path: string[]) => getHighestLatencyNodeFor(path, componentsById),
    [componentsById]
  )

  const simStateRef = useRef<SimulationState>(createSimulationState())
  const simPathRef = useRef<string[]>([])
  const simPathIdxRef = useRef<number | null>(null)

  // The engine is pure, so the tab rebuilds the config whenever it needs to run
  // a step: path costs, packet count and loss ratio all come from current state.
  const buildSimConfig = useCallback((path: string[]): SimulationConfig => {
    const pathMetrics = computePathMetrics(path)
    return {
      path,
      totalPackets: simPacketCount,
      lossRatio: simLossRatio,
      successRate: pathMetrics.successRate,
      cumulativeLatency: pathMetrics.cumulativeLatency
    }
  }, [computePathMetrics, simPacketCount, simLossRatio])

  const applyStep = (result: StepResult) => {
    simStateRef.current = result.state
    setSimulatedSuccessful(result.state.successful)
    setSimulatedPackets(result.state.packets)
  }

  const startIntervalAtSpeed = (speed: SimSpeed) => {
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current)
    }

    const config = buildSimConfig(simPathRef.current)
    const stepSize = stepSizeForSpeed(config.totalPackets, speed)

    simulationIntervalRef.current = setInterval(() => {
      const result = stepSimulation(simStateRef.current, config, stepSize)

      if (result.completed) {
        if (simulationIntervalRef.current) {
          clearInterval(simulationIntervalRef.current)
          simulationIntervalRef.current = null
        }
        setSimulationState("completed")
        setSimulationLogs(prev => [...prev, ...formatCompletionLogs(config, result)])
      } else if (result.milestone !== null) {
        setSimulationLogs(prev => [...prev, formatMilestoneLog(config, result.milestone as 30 | 60)])
      }

      applyStep(result)
    }, speedIntervalMs(speed))
  }

  const handleStartSimulation = (path: string[], pathIdx: number) => {
    if (simulationState === "running") return

    simStateRef.current = createSimulationState()
    simPathRef.current = path
    simPathIdxRef.current = pathIdx

    setSimulationState("running")
    setSimulatingPathIndex(pathIdx)
    setSimulatedPackets(0)
    setSimulatedSuccessful(0)
    setSimSpeed("1x")

    setSimulationLogs(formatStartLogs(buildSimConfig(path), derivedPreset))

    startIntervalAtSpeed("1x")
  }

  const handleChangeSpeed = (newSpeed: SimSpeed | "paused") => {
    if (simulationState !== "running") return

    setSimSpeed(newSpeed)

    if (newSpeed === "paused") {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current)
        simulationIntervalRef.current = null
      }
      setSimulationLogs(prev => [
        ...prev,
        formatPauseLog(simStateRef.current.packets, simPacketCount)
      ])
    } else {
      setSimulationLogs(prev => [
        ...prev,
        formatSpeedLog(newSpeed)
      ])
      startIntervalAtSpeed(newSpeed)
    }
  }

  // Same engine call as the interval tick above — the step math lives in one place.
  const handleSingleStep = () => {
    if (simulationState !== "running" || simSpeed !== "paused") return

    const config = buildSimConfig(simPathRef.current)
    const result = stepSimulation(simStateRef.current, config, stepSizeForSpeed(config.totalPackets))

    if (result.completed) {
      setSimulationState("completed")
      setSimulationLogs(prev => [
        ...prev,
        formatStepLog(config, result),
        ...formatCompletionLogs(config, result)
      ])
    } else {
      setSimulationLogs(prev => [
        ...prev,
        formatStepLog(config, result)
      ])
    }

    applyStep(result)
  }

  // Pre-computed O(1) type and label lookup maps for the path tracer to avoid nested linear scans on renders
  const { componentTypeMap, edgeLabelMap } = useMemo(() => {
    const typeMap = new Map<string, string>()
    const labelMap = new Map<string, string>()
    
    if (components && Array.isArray(components)) {
      components.forEach((c: any) => {
        if (c && typeof c.id === 'string' && c.id.trim() !== '') {
          const compId = c.id.trim()
          typeMap.set(compId, c.type || "Stage")
          
          normalizeConnections(c).forEach((conn) => {
            if (conn.target.trim() !== '' && conn.label) {
              labelMap.set(`${compId}->${conn.target.trim()}`, conn.label)
            }
          })
        }
      })
    }
    
    return { componentTypeMap: typeMap, edgeLabelMap: labelMap }
  }, [components])

  // Interactive Path Finder & Lineage Analyzer
  const tracedPaths = useMemo(() => {
    if (!pathSource || !pathTarget || pathSource === pathTarget) return []
    const adj = adjDirected || {}
    if (!adj[pathSource] || !adj[pathTarget]) return []

    const result: string[][] = []
    const visited = new Set<string>()

    const findPaths = (node: string, currentPath: string[]) => {
      if (result.length >= 20) return // Cap results at 20 paths
      if (currentPath.length > 8) return // limit path search depth
      if (node === pathTarget) {
        result.push([...currentPath])
        return
      }
      const neighbors = adj[node] || []
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          currentPath.push(neighbor)
          findPaths(neighbor, currentPath)
          currentPath.pop()
          visited.delete(neighbor)
        }
      }
    }

    visited.add(pathSource)
    findPaths(pathSource, [pathSource])
    return result
  }, [pathSource, pathTarget, adjDirected])

  // Traced paths with their pre-calculated latency, capacity, and success metrics
  const tracedPathsWithMetrics = useMemo(() => {
    return tracedPaths.slice(0, 5).map((path) => ({
      path,
      metrics: computePathMetrics(path)
    }))
  }, [tracedPaths, computePathMetrics])

  // Filter the components list in O(N) using O(1) map lookups
  const filteredComponents = useMemo(() => {
    return (components as any[])
      .map((comp, idx): ComponentWithIndex => ({ comp, originalIdx: idx }))
      .filter(({ comp, originalIdx }) => {
        if (!comp || !comp.id) return false

        // 1. Search term filter
        if (searchTerm.trim() !== "") {
          const term = searchTerm.toLowerCase()
          const idMatch = typeof comp.id === 'string' && comp.id.toLowerCase().includes(term)
          const nameMatch = typeof comp.name === 'string' && comp.name.toLowerCase().includes(term)
          if (!idMatch && !nameMatch) return false
        }

        // 2. Type filter
        if (typeFilter !== "all") {
          const type = String(comp.type || "").toLowerCase()
          if (type !== typeFilter) return false
        }

        // 3. Severity filter with O(1) diagnostics lookup
        if (severityFilter !== "all") {
          const compDiagnostics = diagnosticsByComponent.get(originalIdx) || []
          
          if (severityFilter === "has-issues") {
            if (compDiagnostics.length === 0) return false
          } else {
            const hasSeverity = compDiagnostics.some((d) => d.severity === severityFilter)
            if (!hasSeverity) return false
          }
        }

        return true
      })
  }, [components, searchTerm, typeFilter, severityFilter, diagnosticsByComponent])

  return (
    <div className="flex-1 overflow-auto p-4 flex flex-col h-full font-sans select-none text-zinc-300 gap-4">
      {/* Header card */}
      <div className="border border-zinc-800 bg-zinc-950/80 p-4 rounded-xl flex flex-col gap-2 shrink-0">
        <h3 className="text-sm font-bold text-zinc-100 flex items-center justify-between uppercase tracking-wide">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-md shadow-emerald-500/20" />
            System Architecture Metrics
          </span>
          <span className="text-xs text-zinc-400 font-mono">
            System Health: <span className={healthPct === 100 ? "text-emerald-400 font-bold" : healthPct >= 80 ? "text-amber-400 font-bold" : "text-rose-500 font-bold"}>{healthPct}%</span>
          </span>
        </h3>
        <div className="text-[11px] text-zinc-500 leading-relaxed font-mono flex flex-wrap gap-2 justify-between items-center mt-1 border-t border-zinc-900 pt-2">
          <span>System: <span className="text-zinc-300 font-bold">{systemName}</span></span>
          <div className="flex items-center gap-2 text-[10px]">
            {errorsCount > 0 && (
              <span className="text-rose-400 bg-rose-950/40 border border-rose-900/50 px-1.5 py-0.5 rounded font-bold">
                Errors: {errorsCount}
              </span>
            )}
            {warningsCount > 0 && (
              <span className="text-amber-400 bg-amber-950/40 border border-amber-900/50 px-1.5 py-0.5 rounded font-bold">
                Warnings: {warningsCount}
              </span>
            )}
            <span className="text-sky-400 bg-sky-950/40 border border-sky-900/50 px-1.5 py-0.5 rounded font-bold">
              Info: {infoCount}
            </span>
          </div>
        </div>
        <button
          type="button"
          data-testid="export-markdown-report-btn"
          onClick={handleExportMarkdownReport}
          className="mt-1.5 w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-indigo-600/15 hover:bg-indigo-600/35 border border-indigo-500/25 hover:border-indigo-500/50 rounded-lg text-[11px] font-semibold text-indigo-300 font-sans tracking-wide transition-all active:scale-[0.98] cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export Markdown Report
        </button>
      </div>

      {/* System Metadata Card */}
      <div data-testid="system-metadata-card" className="border border-zinc-900 bg-zinc-950/40 p-3.5 rounded-lg flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between border-b border-zinc-900/60 pb-1.5">
          <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">System Specification Metadata</h4>
          {sysMetadataDiagnostics.length > 0 && (
            <span className="text-[10px] text-amber-500 font-mono font-bold flex items-center gap-1">
              ⚠️ {sysMetadataDiagnostics.length} Issue{sysMetadataDiagnostics.length > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {!hasSystemMetadata ? (
          <div className="flex flex-col items-center justify-center p-4 bg-zinc-950/20 border border-dashed border-zinc-800 rounded-lg text-center gap-2">
            <p className="text-xs text-zinc-500 italic max-w-sm">
              System architecture metadata (owner, description, version, status) is not initialized. Add metadata to compile world-class documentation.
            </p>
            {onQuickFix && (
              <button
                type="button"
                onClick={() => onQuickFix("system", "missing-system-metadata")}
                className="mt-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold uppercase tracking-wide transition-colors active:scale-95 cursor-pointer"
              >
                Initialize System Metadata
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 text-xs font-mono">
            {/* Version & Status line */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-zinc-500 uppercase font-sans font-bold">System Version:</span>
                <span className="text-zinc-200 font-bold">
                  {typeof systemMetadata.version === "object"
                    ? JSON.stringify(systemMetadata.version)
                    : (systemMetadata.version || <span className="text-zinc-600 italic">not set</span>)}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-zinc-500 uppercase font-sans font-bold">System Status:</span>
                <span className={`font-bold capitalize ${
                  String(systemMetadata.status || "draft").toLowerCase() === "active" ? "text-emerald-400" :
                  String(systemMetadata.status || "draft").toLowerCase() === "deprecated" ? "text-rose-400" :
                  "text-amber-400"
                }`}>
                  {typeof systemMetadata.status === "object"
                    ? JSON.stringify(systemMetadata.status)
                    : (systemMetadata.status || "draft")}
                </span>
              </div>
            </div>

            {/* Owner field */}
            <div className="flex flex-col gap-0.5 border-t border-zinc-900/40 pt-1.5">
              <span className="text-[10px] text-zinc-500 uppercase font-sans font-bold">System Owner:</span>
              <span className="text-zinc-200 font-bold">
                {typeof systemMetadata.owner === "object"
                  ? JSON.stringify(systemMetadata.owner)
                  : (systemMetadata.owner || <span className="text-zinc-600 italic">not set</span>)}
              </span>
            </div>

            {/* Description field */}
            <div className="flex flex-col gap-0.5 border-t border-zinc-900/40 pt-1.5">
              <span className="text-[10px] text-zinc-500 uppercase font-sans font-bold">System Description:</span>
              <p className="text-zinc-300 font-sans leading-relaxed text-[11px] whitespace-pre-wrap">
                {typeof systemMetadata.description === "object"
                  ? JSON.stringify(systemMetadata.description)
                  : (systemMetadata.description || <span className="text-zinc-600 italic">No description provided.</span>)}
              </p>
            </div>

            {/* Individual Diagnostic Alerts */}
            {sysMetadataDiagnostics.length > 0 && (
              <div className="mt-2 flex flex-col gap-2 bg-zinc-950/60 p-2.5 rounded border border-zinc-900">
                <span className="text-[9px] text-zinc-500 uppercase font-sans font-bold">Documentation Issues & Warnings:</span>
                <div className="flex flex-col gap-1.5 max-h-24 overflow-y-auto">
                  {sysMetadataDiagnostics.map((d, i) => (
                    <div key={`${d.code || "diag"}-${i}`} className="flex items-start justify-between gap-2 border-b border-zinc-900/50 pb-1.5 last:border-0 last:pb-0">
                      <div className="flex items-start gap-1 text-[11px] text-amber-400 font-sans leading-relaxed">
                        <span className="shrink-0">{d.severity === "error" ? "❌" : d.severity === "warning" ? "⚠️" : "ℹ️"}</span>
                        <span>{d.message}</span>
                      </div>
                      {onQuickFix && d.path && d.code && (
                        <button
                          type="button"
                          onClick={() => onQuickFix(d.path!, d.code!)}
                          className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 hover:text-white text-[9px] text-zinc-400 uppercase tracking-wide font-sans rounded transition-colors cursor-pointer shrink-0"
                        >
                          Fix
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grid of stats */}
      <div className="grid grid-cols-2 gap-3 shrink-0">
        <div className="border border-zinc-900 bg-zinc-950/40 p-3 rounded-lg flex flex-col gap-1 font-mono">
          <span className="text-[10px] text-zinc-500 uppercase font-sans font-bold">Total Components:</span>
          <span className="text-xl font-bold text-zinc-100">{totalComponents}</span>
        </div>
        <div className="border border-zinc-900 bg-zinc-950/40 p-3 rounded-lg flex flex-col gap-1 font-mono">
          <span className="text-[10px] text-zinc-500 uppercase font-sans font-bold">Total Connections</span>
          <span className="text-xl font-bold text-indigo-400">{totalConnections}</span>
        </div>
        <div className="border border-zinc-900 bg-zinc-950/40 p-3 rounded-lg flex flex-col gap-1 font-mono">
          <span className="text-[10px] text-zinc-500 uppercase font-sans font-bold">Connection Density</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-emerald-400">{connectionDensity}</span>
            <span className={`text-[10px] font-bold uppercase ${
              couplingRating === "Loose" ? "text-emerald-500" :
              couplingRating === "Balanced" ? "text-indigo-400" :
              couplingRating === "Dense" ? "text-amber-500" :
              couplingRating === "Spaghettified" ? "text-rose-500" :
              "text-zinc-500"
            }`}>
              {couplingRating}
            </span>
          </div>
        </div>
        <div className="border border-zinc-900 bg-zinc-950/40 p-3 rounded-lg flex flex-col gap-1 font-mono">
          <span className="text-[10px] text-zinc-500 uppercase font-sans font-bold">Independent Subgraphs</span>
          <span className="text-xl font-bold text-sky-400">
            {subgraphsCount} {subgraphsCount === 1 ? "Subgraph" : "Subgraphs"}
          </span>
        </div>
      </div>

      {/* Breakdown by Type */}
      <div className="flex flex-col gap-1.5 shrink-0">
        <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Breakdown by Type</h4>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div className="flex items-center justify-between p-2 rounded bg-zinc-950/20 border border-zinc-900">
            <span className="text-zinc-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Gateways
            </span>
            <span className="font-bold text-zinc-300">{gatewayCount} Gateways</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded bg-zinc-950/20 border border-zinc-900">
            <span className="text-zinc-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              Stages
            </span>
            <span className="font-bold text-zinc-300">{stageCount} Stages</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded bg-zinc-950/20 border border-zinc-900">
            <span className="text-zinc-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Bricks
            </span>
            <span className="font-bold text-zinc-300">{brickCount} Bricks</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded bg-zinc-950/20 border border-zinc-900">
            <span className="text-zinc-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              Stores
            </span>
            <span className="font-bold text-zinc-300">{storeCount} Stores</span>
          </div>
        </div>
      </div>

      {/* Architectural Hotspots / Network Hubs */}
      <div className="flex flex-col gap-1.5 shrink-0 border-t border-zinc-900 pt-3">
        <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Architectural Hotspots</h4>
        <div className="flex flex-col gap-1.5 text-xs font-mono">
          {hotspots.slice(0, 3).map((h: any, idx: number) => {
            let badgeColor = "bg-zinc-900/40 text-zinc-400 border-zinc-900"
            if (h.degree >= 5) badgeColor = "bg-rose-950/30 text-rose-400 border-rose-900/40"
            else if (h.degree >= 3) badgeColor = "bg-amber-950/30 text-amber-400 border-amber-900/40"
            else if (h.degree >= 1) badgeColor = "bg-indigo-950/30 text-indigo-400 border-indigo-900/40"

            return (
              <div
                key={`${h.id}-${idx}`}
                onClick={() => setSelectedUnit && setSelectedUnit(h.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedUnit && setSelectedUnit(h.id)
                  }
                }}
                tabIndex={0}
                className={`w-full text-left flex items-center justify-between p-2 rounded border transition-all cursor-pointer hover:brightness-110 active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-indigo-500 ${badgeColor}`}
                aria-label={`Select hotspot ${h.id}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-bold hover:underline">{h.id}</span>
                  <span className="text-[10px] text-zinc-500 font-sans">({h.type})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500">In: {h.incoming} / Out: {h.outgoing}</span>
                  <span className="font-bold">Degree: {h.degree}</span>
                </div>
              </div>
            )
          })}
          {hotspots.length === 0 && (
            <p className="text-[11px] text-zinc-500 italic">No connections in system to analyze hotspots.</p>
          )}
        </div>
      </div>

      {/* Single Points of Failure / SPOFs */}
      <div className="flex flex-col gap-1.5 shrink-0 border-t border-zinc-900 pt-3">
        <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
          Single Points of Failure (SPOFs)
        </h4>
        <div className="flex flex-col gap-1.5 text-xs font-mono">
          {singlePointsOfFailure.map((s: any, idx: number) => (
            <div
              key={`${s.id}-${idx}`}
              onClick={() => setSelectedUnit && setSelectedUnit(s.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelectedUnit && setSelectedUnit(s.id)
                }
              }}
              tabIndex={0}
              className="w-full text-left flex items-center justify-between p-2 rounded border transition-all cursor-pointer hover:brightness-110 active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-rose-950/20 text-rose-300 border-rose-900/30"
              aria-label={`Select SPOF ${s.id}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-bold hover:underline">{s.id}</span>
                <span className="text-[10px] text-zinc-500 font-sans">({s.type})</span>
              </div>
              <span className="text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/25 px-1.5 py-0.5 rounded font-sans uppercase font-bold shrink-0">
                Critical SPOF
              </span>
            </div>
          ))}
          {singlePointsOfFailure.length === 0 && (
            <p className="text-[11px] text-zinc-500 italic">No single points of failure detected. Robust, resilient architecture!</p>
          )}
        </div>
      </div>

      {/* Architectural Actionable Recommendations */}
      <div className="flex flex-col gap-1.5 shrink-0 border-t border-zinc-900 pt-3">
        <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Architectural Recommendations
        </h4>
        <div className="flex flex-col gap-2.5 text-xs font-sans">
          {recommendations.map((rec, rIdx) => {
            let itemBg = "bg-zinc-950/40 border-zinc-900/60";
            let icon = "ℹ️";
            let titleColor = "text-sky-400";
            if (rec.type === "warning") {
              itemBg = "bg-amber-950/15 border-amber-900/30";
              icon = "⚠️";
              titleColor = "text-amber-400";
            } else if (rec.type === "success") {
              itemBg = "bg-emerald-950/15 border-emerald-900/30";
              icon = "✅";
              titleColor = "text-emerald-400";
            }

            return (
              <div key={rIdx} className={`p-3 rounded-lg border ${itemBg} flex flex-col gap-1.5`}>
                <div className="flex items-center gap-1.5 font-bold leading-none font-sans">
                  <span>{icon}</span>
                  <span className={`${titleColor}`}>{rec.message}</span>
                </div>
                <p className="text-zinc-400 font-sans text-[11px] leading-relaxed">
                  {rec.action}
                </p>
                {rec.fix && (
                  <button
                    onClick={() => onQuickFix && onQuickFix(rec.fix!.path, rec.fix!.fixType, rec.fix!.extraData)}
                    className="mt-2 text-[10px] font-bold tracking-wide uppercase px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md active:scale-95 cursor-pointer max-w-max"
                  >
                    {rec.fix!.buttonLabel}
                  </button>
                )}
              </div>
            );
          })}
          {recommendations.length === 0 && (
            <p className="text-[11px] text-zinc-500 italic">No recommendations. Run architectural validations to generate insights.</p>
          )}
        </div>
      </div>

      {/* Interactive Flow & Path Tracer */}
      <div className="flex flex-col gap-2 shrink-0 border-t border-zinc-900 pt-3">
        <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-md shadow-indigo-500/20 animate-pulse" />
          Interactive Flow & Path Tracer
        </h4>
        <div className="flex flex-col gap-2 bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-900 text-xs font-sans">
          {/* Node Selector Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="trace-start-select" className="text-[9px] text-zinc-500 uppercase font-bold">Trace Path Start</label>
              <select
                id="trace-start-select"
                aria-label="Trace Path Start"
                value={pathSource}
                onChange={(e) => setPathSource(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="">Select Start Node...</option>
                {allIds.map((id: string) => (
                  <option key={`start-${id}`} value={id}>{id}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="trace-end-select" className="text-[9px] text-zinc-500 uppercase font-bold">Trace Path End</label>
              <select
                id="trace-end-select"
                aria-label="Trace Path End"
                value={pathTarget}
                onChange={(e) => setPathTarget(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="">Select End Node...</option>
                {allIds.map((id: string) => (
                  <option key={`end-${id}`} value={id}>{id}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Simulation Configuration */}
          <div className="mt-2 pt-2 border-t border-zinc-900/50 flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="sim-preset-select" className="text-[9px] text-zinc-500 uppercase font-bold">Simulation Environment Preset</label>
              <select
                id="sim-preset-select"
                data-testid="sim-preset-select"
                value={derivedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 cursor-pointer font-sans"
              >
                <option value="default">Standard Dev (Default)</option>
                <option value="load">High Traffic / Load Test</option>
                <option value="flaky">Flaky Wireless Link</option>
                <option value="stress">Extreme Stress Test</option>
                <option value="sanity">Sanity Check</option>
                {customPresets.map((p) => (
                  <option key={`custom-preset-${p.name}`} value={p.name}>
                    {p.name} (Custom)
                  </option>
                ))}
                <option value="custom" disabled>Custom / Manual Adjustments</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="sim-packet-select" className="text-[9px] text-zinc-500 uppercase font-bold">Simulated Packets</label>
                <select
                  id="sim-packet-select"
                  data-testid="sim-packet-select"
                  value={simPacketCount}
                  onChange={(e) => setSimPacketCount(parseInt(e.target.value, 10))}
                  className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 cursor-pointer font-sans"
                >
                  <option value={50}>50 Packets</option>
                  <option value={100}>100 Packets (Default)</option>
                  <option value={200}>200 Packets</option>
                  <option value={500}>500 Packets</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center font-sans">
                  <label htmlFor="sim-loss-slider" className="text-[9px] text-zinc-500 uppercase font-bold">Additional Packet Loss</label>
                  <span className="text-[9px] text-indigo-400 font-bold font-mono" data-testid="sim-loss-val">{simLossRatio}%</span>
                </div>
                <div className="flex items-center gap-1.5 h-7">
                  <input
                    id="sim-loss-slider"
                    data-testid="sim-loss-slider"
                    type="range"
                    min="0"
                    max="90"
                    step="5"
                    value={simLossRatio}
                    onChange={(e) => setSimLossRatio(parseInt(e.target.value, 10))}
                    className="w-full accent-indigo-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Custom Presets Section */}
            <div className="mt-1 pt-1 bg-zinc-950/20 p-2 rounded-lg border border-zinc-900/40 flex flex-col gap-2 font-sans">
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  data-testid="custom-preset-name-input"
                  aria-label="Custom Preset Name"
                  placeholder="Custom Preset Name..."
                  value={customPresetName}
                  onChange={(e) => setCustomPresetName(e.target.value)}
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  data-testid="save-custom-preset-btn"
                  onClick={() => {
                    const trimmed = customPresetName.trim();
                    if (!trimmed) return;
                    const builtIns = ["default", "load", "flaky", "stress", "sanity", "custom"];
                    if (builtIns.includes(trimmed.toLowerCase())) {
                      return;
                    }
                    setCustomPresets(prev => {
                      const filtered = prev.filter(p => p.name !== trimmed);
                      const next = [...filtered, { name: trimmed, packets: simPacketCount, loss: simLossRatio }];
                      if (typeof window !== "undefined") {
                        specStore.saveCustomPresets(next)
                      }
                      return next;
                    });
                    setCustomPresetName("");
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[11px] px-2.5 py-1 rounded transition-colors"
                >
                  Save Preset
                </button>
              </div>

              {customPresets.length > 0 && (
                <div className="flex flex-col gap-1.5 border-t border-zinc-900/50 pt-2">
                  <div className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Saved Custom Presets</div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {customPresets.map((preset) => (
                      <div
                        key={`custom-preset-tag-${preset.name}`}
                        className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300"
                      >
                        <span className="font-mono">{preset.name}</span>
                        <span className="text-zinc-500">({preset.packets}p, {preset.loss}%)</span>
                        <button
                          type="button"
                          data-testid={`delete-custom-preset-${preset.name}`}
                          onClick={() => {
                            setCustomPresets(prev => {
                              const next = prev.filter(p => p.name !== preset.name);
                              if (typeof window !== "undefined") {
                                specStore.saveCustomPresets(next)
                              }
                              return next;
                            });
                          }}
                          className="text-zinc-500 hover:text-red-400 font-bold ml-0.5 text-[9px]"
                          aria-label={`Delete custom preset ${preset.name}`}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tracer Results */}
          {pathSource && pathTarget && (
            <div className="flex flex-col gap-2 border-t border-zinc-900/60 pt-2.5 font-mono">
              {pathSource === pathTarget ? (
                <p className="text-[11px] text-zinc-500 italic">Start and End nodes are the same. Please select distinct nodes.</p>
              ) : tracedPaths.length === 0 ? (
                <div className="p-2 rounded bg-zinc-950/20 border border-zinc-900 text-center text-zinc-500">
                  <p className="text-[11px] italic">No active directed data flow path exists from "{pathSource}" to "{pathTarget}".</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                  <div className="flex items-center justify-between text-[10px] text-zinc-500 font-sans border-b border-zinc-900/65 pb-1 mb-1 font-bold">
                    <span>Found {tracedPaths.length} Path{tracedPaths.length > 1 ? "s" : ""}</span>
                    <span>Max depth: 8 hops</span>
                  </div>
                  {tracedPathsWithMetrics.map(({ path, metrics: pathMetrics }, pIdx) => {
                    return (
                      <div key={`path-${pIdx}`} className="p-2 rounded bg-zinc-950/30 border border-zinc-900 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-zinc-500 font-sans font-bold">Path {pIdx + 1} ({path.length - 1} hop{path.length > 2 ? "s" : ""})</span>
                          <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-sans cursor-pointer select-none">
                            <input
                              type="checkbox"
                              data-testid={`compare-path-checkbox-${pIdx}`}
                              checked={comparedPathIndices.includes(pIdx)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  if (comparedPathIndices.length < 2) {
                                    setComparedPathIndices(prev => [...prev, pIdx])
                                  } else {
                                    setComparedPathIndices(prev => [prev[0], pIdx])
                                  }
                                } else {
                                  setComparedPathIndices(prev => prev.filter(idx => idx !== pIdx))
                                }
                              }}
                              className="rounded border-zinc-800 bg-zinc-950 text-indigo-600 focus:ring-indigo-500 h-3 w-3 cursor-pointer"
                            />
                            <span>Compare</span>
                          </label>
                        </div>
                        <div className="flex flex-wrap items-center gap-1 leading-relaxed">
                          {path.map((node, nIdx) => {
                            const isLast = nIdx === path.length - 1;
                            const type = componentTypeMap.get(node) || "Stage";
                            
                            // Determine color coding based on type
                            let typeColor = "text-zinc-400";
                            if (type.toLowerCase() === "gateway") typeColor = "text-amber-400 font-bold";
                            else if (type.toLowerCase() === "store") typeColor = "text-indigo-400 font-bold";
                            else if (type.toLowerCase() === "brick") typeColor = "text-emerald-400";
                            else if (type.toLowerCase() === "stage") typeColor = "text-purple-400";

                            const nextNode = isLast ? null : path[nIdx + 1];
                            const connLabel = !isLast && nextNode ? edgeLabelMap.get(`${node}->${nextNode}`) : null;

                            return (
                              <Fragment key={`${node}-${nIdx}`}>
                                {/* Node interactive button */}
                                <button
                                  type="button"
                                  onClick={() => setSelectedUnit && setSelectedUnit(node)}
                                  aria-label={`Trace Path Node ${node}`}
                                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 hover:text-white transition-all text-left text-[11px] shrink-0 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer active:scale-95 text-zinc-100"
                                >
                                  <span className="hover:underline text-zinc-100">{node}</span>
                                  <span className={`text-[9px] font-sans scale-[0.85] shrink-0 ${typeColor}`}>({type})</span>
                                </button>

                                {!isLast && (
                                  <div className="flex flex-col items-center justify-center px-0.5 text-zinc-500 shrink-0 select-none">
                                    <span className="text-xs">→</span>
                                    {connLabel && (
                                      <span className="text-[8px] font-sans text-zinc-600 max-w-[80px] truncate" title={connLabel}>
                                        {connLabel}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </Fragment>
                            );
                          })}
                        </div>

                        {/* Interactive Simulation and Metrics Section */}
                        <div className="mt-2 pt-2 border-t border-zinc-900/40 flex flex-col gap-1.5 font-sans">
                          <div className="grid grid-cols-3 gap-2 text-[10px] text-zinc-400">
                            <div>
                              <span className="text-zinc-500">Cumulative Latency: <span className="font-bold text-zinc-200 font-mono">{pathMetrics.cumulativeLatency} ms</span></span>
                            </div>
                            <div>
                              <span className="text-zinc-500">Bottleneck Capacity: <span className="font-bold text-zinc-200 font-mono">{pathMetrics.bottleneckCapacity} req/s</span></span>
                            </div>
                            <div>
                              <span className="text-zinc-500">Success Rate: </span>
                              <span className={`font-bold font-mono ${pathMetrics.successRate === 1 ? "text-emerald-400" : pathMetrics.successRate >= 0.8 ? "text-amber-400" : "text-rose-400"}`}>{Math.round(pathMetrics.successRate * 100)}%</span>
                            </div>
                          </div>

                          {simulatingPathIndex === pIdx ? (
                            <div className="flex flex-col gap-1 bg-zinc-950/60 p-2 rounded border border-zinc-900/60">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="font-bold flex items-center gap-1">
                                  <span className={`w-1.5 h-1.5 rounded-full ${simulationState === "running" ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
                                  {simulationState === "running" ? "Simulation Active" : "Simulation Completed"}
                                </span>
                                <span className="font-mono text-zinc-400">{Math.round((simulatedPackets / simPacketCount) * 100)}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                                <div className={`h-full transition-all duration-100 ${simulationState === "running" ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.round((simulatedPackets / simPacketCount) * 100)}%` }} />
                              </div>
                              <div className="flex justify-between items-center text-[9px] text-zinc-500 mt-1 font-mono">
                                <span>Packets Transmitted: {simulatedPackets} / {simPacketCount}</span>
                                <span>Simulated Success Rate: <span className="text-zinc-300 font-bold">{simulatedPackets > 0 ? Math.round((simulatedSuccessful / simulatedPackets) * 100) : 0}%</span></span>
                              </div>

                              {/* Simulation Speed and Playback Controls */}
                              {simulationState === "running" && (
                                <div className="mt-2 flex flex-col gap-1.5 border-t border-zinc-900/40 pt-2 text-[10px]">
                                  <div className="flex justify-between items-center text-zinc-400">
                                    <span>Playback Control:</span>
                                    <div className="flex items-center gap-1 font-sans">
                                      {(["0.5x", "1x", "2x", "5x"] as const).map((speed) => (
                                        <button
                                          key={speed}
                                          type="button"
                                          data-testid={`sim-speed-btn-${speed}`}
                                          onClick={() => handleChangeSpeed(speed)}
                                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-all cursor-pointer ${simSpeed === speed ? "bg-indigo-600 border-indigo-500 text-white font-bold" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"}`}
                                        >
                                          {speed}
                                        </button>
                                      ))}
                                      <button
                                        type="button"
                                        data-testid="sim-speed-btn-paused"
                                        onClick={() => handleChangeSpeed(simSpeed === "paused" ? "1x" : "paused")}
                                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-all cursor-pointer ${simSpeed === "paused" ? "bg-amber-600 border-amber-500 text-white font-bold" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"}`}
                                      >
                                        {simSpeed === "paused" ? "▶️ Resume" : "⏸️ Pause"}
                                      </button>
                                      {simSpeed === "paused" && (
                                        <button
                                          type="button"
                                          data-testid="sim-speed-btn-step"
                                          onClick={handleSingleStep}
                                          className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-900 border border-indigo-800 hover:bg-indigo-800 text-indigo-200 transition-all cursor-pointer active:scale-95"
                                        >
                                          🦶 Step
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Real-time Flow Simulation Log Console */}
                              {simulationLogs.length > 0 && (
                                <div className="mt-2 flex flex-col gap-1">
                                  <span className="text-[8px] uppercase tracking-wider text-zinc-500 font-semibold">Tracing Logs Terminal:</span>
                                  <div
                                    data-testid="simulation-logs-console"
                                    className="max-h-24 overflow-y-auto bg-zinc-950 p-2 rounded text-[9px] border border-zinc-900 leading-normal text-emerald-400 font-mono flex flex-col-reverse gap-0.5"
                                  >
                                    {[...simulationLogs].reverse().map((log, lIdx) => (
                                      <div key={`log-${lIdx}`} className="break-all whitespace-pre-wrap">{log}</div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {simulationState === "completed" && (
                                <div
                                  data-testid="simulation-report"
                                  className="mt-2 p-2 bg-zinc-900/50 border border-zinc-800/80 rounded flex flex-col gap-1.5 text-[10px]"
                                >
                                  <div className="font-bold text-zinc-300 flex items-center gap-1">
                                    📊 Path Performance Diagnostic Report
                                  </div>
                                  
                                  <div className="flex flex-col gap-1 text-zinc-400">
                                    <div className="flex justify-between border-b border-zinc-900/30 pb-0.5">
                                      <span>Transmitted:</span>
                                      <span className="font-mono text-zinc-300 font-bold">{simulatedPackets} packets</span>
                                    </div>
                                    <div className="flex justify-between border-b border-zinc-900/30 pb-0.5">
                                      <span>Successful Delivery:</span>
                                      <span className="font-mono text-emerald-400 font-bold">{simulatedSuccessful} ({simulatedPackets > 0 ? Math.round((simulatedSuccessful / simulatedPackets) * 100) : 0}%)</span>
                                    </div>
                                    <div className="flex justify-between border-b border-zinc-900/30 pb-0.5">
                                      <span>Dropped/Lost:</span>
                                      <span className={`font-mono font-bold ${simulatedPackets - simulatedSuccessful > 0 ? "text-rose-400" : "text-zinc-500"}`}>{simulatedPackets - simulatedSuccessful} packets</span>
                                    </div>
                                  </div>

                                  {/* Dynamic Insights & Actionable Recommendations */}
                                  <div className="flex flex-col gap-1 mt-1 pt-1 border-t border-zinc-900/40">
                                    {(() => {
                                      const bottleneck = getBottleneckNode(path)
                                      const highestLatency = getHighestLatencyNode(path)
                                      const recs: string[] = []

                                      if (bottleneck.node) {
                                        recs.push(`System capacity throttled to ${bottleneck.capacity} req/s by bottleneck ${bottleneck.node}.`)
                                        if (bottleneck.capacity < 100) {
                                          recs.push(`Scale throughput of "${bottleneck.node}" to optimize path flow.`)
                                        }
                                      }
                                      if (highestLatency.node) {
                                        recs.push(`Highest latency node is "${highestLatency.node}" (${highestLatency.latency} ms).`)
                                        if (pathMetrics.cumulativeLatency > 150) {
                                          recs.push(`Reduce workload/latency on "${highestLatency.node}" to improve speed.`)
                                        }
                                      }
                                      if (simLossRatio > 0) {
                                        recs.push(`Packet loss ratio of ${simLossRatio} percent configured; consider secure channels.`)
                                      }

                                      return (
                                        <div className="space-y-1">
                                          <span className="text-zinc-500 font-semibold uppercase text-[8px] tracking-wider">Analysis & Recommendations:</span>
                                          <ul className="list-disc pl-3 text-zinc-400 space-y-0.5">
                                            {recs.map((rec, rIdx) => (
                                              <li key={rIdx}>{rec}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )
                                    })()}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartSimulation(path, pIdx)}
                              className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors active:scale-95 text-center cursor-pointer max-w-max"
                            >
                              Run Performance Simulation
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {tracedPaths.length > 5 && (
                    <p className="text-[10px] text-zinc-500 italic text-center mt-1">Showing first 5 paths.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Comparison Panel */}
          {pathSource && pathTarget && comparedPathIndices.length === 2 && comparedPathIndices.every(idx => idx < tracedPathsWithMetrics.length) && (
            <div
              data-testid="path-comparison-panel"
              className="border border-indigo-900/50 bg-indigo-950/15 p-4 rounded-xl flex flex-col gap-3 font-sans mt-3 shrink-0"
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200 uppercase tracking-wide border-b border-indigo-950/40 pb-2 mb-1">
                <SparklesIcon size={12} className="text-indigo-400" />
                <span>Path Comparison: Path {comparedPathIndices[0] + 1} vs Path {comparedPathIndices[1] + 1}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {(() => {
                  const idxA = comparedPathIndices[0]
                  const idxB = comparedPathIndices[1]
                  const pathA = tracedPathsWithMetrics[idxA]?.path
                  const pathB = tracedPathsWithMetrics[idxB]?.path
                  const metricsA = tracedPathsWithMetrics[idxA]?.metrics
                  const metricsB = tracedPathsWithMetrics[idxB]?.metrics

                  if (!pathA || !pathB || !metricsA || !metricsB) return null

                  // Latency Winner
                  const latDiff = Math.abs(metricsA.cumulativeLatency - metricsB.cumulativeLatency)
                  const latWinner = metricsA.cumulativeLatency < metricsB.cumulativeLatency ? "A" : metricsA.cumulativeLatency > metricsB.cumulativeLatency ? "B" : "Tie"
                  const fasterPercent = latWinner !== "Tie"
                    ? Math.round((latDiff / Math.max(metricsA.cumulativeLatency, metricsB.cumulativeLatency)) * 100)
                    : 0

                  // Throughput Winner
                  const capDiff = Math.abs(metricsA.bottleneckCapacity - metricsB.bottleneckCapacity)
                  const capWinner = metricsA.bottleneckCapacity > metricsB.bottleneckCapacity ? "A" : metricsA.bottleneckCapacity < metricsB.bottleneckCapacity ? "B" : "Tie"
                  const minCap = Math.min(metricsA.bottleneckCapacity, metricsB.bottleneckCapacity)
                  const capacityPercent = capWinner !== "Tie" && minCap > 0
                    ? Math.round((capDiff / minCap) * 100)
                    : 0

                  // Success Winner
                  const successWinner = metricsA.successRate > metricsB.successRate ? "A" : metricsA.successRate < metricsB.successRate ? "B" : "Tie"

                  return (
                    <div className="col-span-2 flex flex-col gap-3">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        {/* Path A Column */}
                        <div className="flex flex-col gap-2 p-2.5 rounded-lg border border-zinc-900 bg-zinc-950/40">
                          <span className="font-bold text-indigo-400">Path {idxA + 1}</span>
                          <div className="flex flex-col gap-1 text-[11px] text-zinc-400 font-mono">
                            <div>Latency: <span className="text-zinc-200 font-bold">{metricsA.cumulativeLatency} ms</span></div>
                            <div>Bottleneck: <span className="text-zinc-200 font-bold">{metricsA.bottleneckCapacity} req/s</span></div>
                            <div>Reliability: <span className={`${metricsA.successRate === 1 ? "text-emerald-400" : "text-amber-400"} font-bold`}>{Math.round(metricsA.successRate * 100)}%</span></div>
                          </div>
                        </div>

                        {/* Path B Column */}
                        <div className="flex flex-col gap-2 p-2.5 rounded-lg border border-zinc-900 bg-zinc-950/40">
                          <span className="font-bold text-purple-400">Path {idxB + 1}</span>
                          <div className="flex flex-col gap-1 text-[11px] text-zinc-400 font-mono">
                            <div>Latency: <span className="text-zinc-200 font-bold">{metricsB.cumulativeLatency} ms</span></div>
                            <div>Bottleneck: <span className="text-zinc-200 font-bold">{metricsB.bottleneckCapacity} req/s</span></div>
                            <div>Reliability: <span className={`${metricsB.successRate === 1 ? "text-emerald-400" : "text-amber-400"} font-bold`}>{Math.round(metricsB.successRate * 100)}%</span></div>
                          </div>
                        </div>
                      </div>

                      {/* Routing Recommendation */}
                      <div className="p-3 bg-zinc-950/60 border border-zinc-900 rounded-lg flex flex-col gap-2 text-[11px] font-sans">
                        <div className="font-semibold text-zinc-400 uppercase tracking-wider text-[9px]">
                          ⚡ Smart Routing Analysis
                        </div>

                        <div className="flex flex-col gap-1.5 leading-relaxed text-zinc-300">
                          {/* Latency routing option */}
                          <div className="flex items-start gap-1.5">
                            <span className="text-emerald-500 shrink-0">✔</span>
                            <div>
                              <span className="font-bold text-zinc-200">Low-Latency Option: Route via Path {latWinner === "B" ? idxB + 1 : idxA + 1}</span>
                              <span className="text-zinc-400">
                                {latWinner === "Tie" ? (
                                  " — Both paths offer equal latency."
                                ) : (
                                  ` (saves ${latDiff} ms — ${fasterPercent}% faster latency response).`
                                )}
                              </span>
                            </div>
                          </div>

                          {/* Throughput routing option */}
                          <div className="flex items-start gap-1.5">
                            <span className="text-sky-500 shrink-0">✔</span>
                            <div>
                              <span className="font-bold text-zinc-200">High-Throughput Option: Route via Path {capWinner === "B" ? idxB + 1 : idxA + 1}</span>
                              <span className="text-zinc-400">
                                {capWinner === "Tie" ? (
                                  " — Both paths share the same bottleneck capacity."
                                ) : (
                                  ` (handles ${capDiff} req/s more — ${capacityPercent}% higher throughput capacity).`
                                )}
                              </span>
                            </div>
                          </div>

                          {/* Reliability routing option */}
                          {successWinner !== "Tie" && (
                            <div className="flex items-start gap-1.5 border-t border-zinc-900/60 pt-1.5 mt-0.5">
                              <span className="text-amber-500 shrink-0">⚠</span>
                              <div className="text-zinc-400">
                                <span className="font-bold text-zinc-200">Reliability Warning:</span> Path {successWinner === "A" ? idxB + 1 : idxA + 1} has a higher risk of packet drops due to unresolved architectural lint warnings.
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {/* Simulation History Section */}
          {simulationHistory.length > 0 && (
            <div
              data-testid="simulation-history-panel"
              className="mt-4 p-3 bg-zinc-900/50 border border-zinc-800/80 rounded-xl flex flex-col gap-2 text-[11px]"
            >
              <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2 mb-1">
                <span className="font-bold text-zinc-300 flex items-center gap-1.5">
                  ⏱️ Past Simulation Runs History ({simulationHistory.length})
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="export-all-json-btn"
                    onClick={handleExportAllJSON}
                    className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-zinc-950 hover:bg-zinc-900 text-zinc-300 border border-zinc-800 transition-all cursor-pointer active:scale-95"
                  >
                    Export All JSON
                  </button>
                  <button
                    type="button"
                    data-testid="export-all-csv-btn"
                    onClick={handleExportAllCSV}
                    className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-zinc-950 hover:bg-zinc-900 text-zinc-300 border border-zinc-800 transition-all cursor-pointer active:scale-95"
                  >
                    Export All CSV
                  </button>
                  <button
                    type="button"
                    data-testid="clear-history-btn"
                    onClick={() => {
                      setSimulationHistory([])
                      if (typeof window !== "undefined") {
                        specStore.clearSimulationHistory()
                      }
                    }}
                    className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-950 hover:bg-red-900 text-red-200 border border-red-900/40 transition-all cursor-pointer active:scale-95 ml-1"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="max-h-40 overflow-y-auto flex flex-col gap-1.5 pr-1">
                {simulationHistory.map((run) => (
                  <div
                    key={run.id}
                    data-testid={`sim-history-item-${run.id}`}
                    className="p-2 rounded border border-zinc-800/60 bg-zinc-950/40 hover:bg-zinc-950/80 flex flex-col gap-1 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500 text-[9px] font-mono">{run.timestamp}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          data-testid={`export-run-json-${run.id}`}
                          onClick={() => handleExportJSON(run)}
                          className="px-1 py-0.5 rounded text-[8px] font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 transition-all cursor-pointer"
                        >
                          JSON
                        </button>
                        <button
                          type="button"
                          data-testid={`export-run-csv-${run.id}`}
                          onClick={() => handleExportCSV(run)}
                          className="px-1 py-0.5 rounded text-[8px] font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 transition-all cursor-pointer"
                        >
                          CSV
                        </button>
                      </div>
                    </div>

                    <div className="font-medium text-zinc-300 truncate max-w-full" title={run.path}>
                      {run.path}
                    </div>

                    <div className="grid grid-cols-4 gap-1 text-[10px] text-zinc-400 font-mono mt-0.5">
                      <div>
                        Packets: <span className="text-zinc-300 font-bold">{run.packetCount}</span>
                      </div>
                      <div>
                        Success: <span className="text-emerald-400 font-bold">{run.successful} ({Math.round((run.successful / run.packetCount) * 100)}%)</span>
                      </div>
                      <div>
                        Latency: <span className="text-zinc-300">{run.latency}ms</span>
                      </div>
                      <div>
                        B-neck: <span className="text-zinc-300">{run.bottleneck} r/s</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Component Interactive List */}
      <div className="flex flex-col flex-1 min-h-0 gap-2">
        <div className="flex items-center justify-between">
          <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Component Directory</h4>
          {filteredComponents.length !== totalComponents && (
            <span className="text-[10px] text-zinc-500 font-mono">
              Showing {filteredComponents.length} of {totalComponents}
            </span>
          )}
        </div>

        {/* Search & Filter Controls */}
        <div className="flex flex-col gap-2 p-2.5 rounded-lg border border-zinc-900 bg-zinc-950/40">
          {/* Search box */}
          <div className="relative flex items-center">
            <span className="absolute left-2 text-zinc-500 pointer-events-none">
              <SearchIcon size={12} />
            </span>
            <input
              type="text"
              placeholder="Search components..."
              aria-label="Search components by ID or name"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 pl-7 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                aria-label="Clear search"
                className="absolute right-2 text-zinc-500 hover:text-zinc-300 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Select Filter Dropdowns */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="type-filter" className="text-[10px] text-zinc-500 font-bold uppercase">Filter by Type</label>
              <select
                id="type-filter"
                aria-label="Filter by Type"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">All Types</option>
                <option value="gateway">Gateways</option>
                <option value="stage">Stages</option>
                <option value="brick">Bricks</option>
                <option value="store">Stores</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="severity-filter" className="text-[10px] text-zinc-500 font-bold uppercase">Filter by Issue</label>
              <select
                id="severity-filter"
                aria-label="Filter by Issue"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">All Issues</option>
                <option value="error">Errors</option>
                <option value="warning">Warnings</option>
                <option value="info">Infos</option>
                <option value="has-issues">Any Issue</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border border-zinc-900 bg-zinc-950/10 rounded-lg p-2 font-mono text-xs divide-y divide-zinc-900/50">
          {components.length === 0 ? (
            <p className="text-zinc-600 text-center py-4 italic">No components defined.</p>
          ) : filteredComponents.length === 0 ? (
            <p className="text-zinc-600 text-center py-4 italic">No components match search criteria.</p>
          ) : (
            filteredComponents.map(({ comp, originalIdx }: any) => {
              if (!comp || !comp.id) return null
              const isSelected = selectedUnit === comp.id
              const type = String(comp.type || '').toLowerCase()
              
              // Use neutral color for unknown component types to prevent Store color confusion
              const bulletColor = 
                type === 'gateway' ? 'bg-amber-500' : 
                type === 'stage' ? 'bg-purple-500' : 
                type === 'brick' ? 'bg-emerald-500' : 
                type === 'store' ? 'bg-indigo-500' : 
                'bg-zinc-500'

              // Constant-time diagnosis lookup - replaces nested filter scan
              const compDiagnostics = diagnosticsByComponent.get(originalIdx) || []
              const compErrors = compDiagnostics.filter(d => d.severity === "error")
              const compWarnings = compDiagnostics.filter(d => d.severity === "warning")
              const compInfos = compDiagnostics.filter(d => d.severity === "info")

              let badge = null
              if (compErrors.length > 0) {
                badge = (
                  <span className="text-[9px] text-rose-400 bg-rose-950/40 border border-rose-900/50 px-1 rounded font-bold font-sans ml-2 shrink-0">
                    Error
                  </span>
                )
              } else if (compWarnings.length > 0) {
                badge = (
                  <span className="text-[9px] text-amber-400 bg-amber-950/40 border border-amber-900/50 px-1 rounded font-bold font-sans ml-2 shrink-0">
                    Warning
                  </span>
                )
              } else if (compInfos.length > 0) {
                badge = (
                  <span className="text-[9px] text-sky-400 bg-sky-950/40 border border-sky-900/50 px-1 rounded font-bold font-sans ml-2 shrink-0">
                    Info
                  </span>
                )
              }

              return (
                <button
                  key={comp.id + '-' + originalIdx}
                  onClick={() => setSelectedUnit && setSelectedUnit(comp.id)}
                  className={`w-full flex items-center justify-between py-2 px-2 hover:bg-zinc-900/40 rounded transition-colors text-left ${isSelected ? 'bg-indigo-500/10 text-indigo-300 border-l-2 border-indigo-500' : 'text-zinc-400'}`}
                >
                  <span className="flex items-center gap-2 font-bold truncate min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full ${bulletColor} shrink-0`} />
                    <span className="truncate">{comp.id}</span>
                    {badge}
                  </span>
                  <span className="text-[10px] text-zinc-600 bg-zinc-900/60 px-1.5 py-0.5 rounded uppercase shrink-0 font-sans">
                    {comp.type || 'Unit'}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
