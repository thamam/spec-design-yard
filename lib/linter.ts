export interface Diagnostic {
  severity: "error" | "warning" | "info"
  message: string
  path?: string
}

export function lintSpec(parsedSpec: any): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  if (!parsedSpec) return diagnostics

  const system = parsedSpec.system
  if (!system) {
    diagnostics.push({
      severity: "error",
      message: 'Missing top-level "system" object.',
    })
    return diagnostics
  }

  if (!system.name || typeof system.name !== "string" || system.name.trim() === "") {
    diagnostics.push({
      severity: "warning",
      message: "System name is missing or empty.",
    })
  }

  const components = system.components
  if (!components) {
    diagnostics.push({
      severity: "info",
      message: "No components defined in system.",
    })
    return diagnostics
  }

  if (!Array.isArray(components)) {
    diagnostics.push({
      severity: "error",
      message: '"components" must be an array.',
    })
    return diagnostics
  }

  const ids = new Set<string>()
  const validTypes = new Set(["store", "stage", "brick", "gateway"])

  // First pass: collect component IDs and validate basic fields
  components.forEach((comp: any, idx: number) => {
    const pathPrefix = `system.components[${idx}]`
    
    if (!comp || typeof comp !== "object") {
      diagnostics.push({
        severity: "error",
        message: `Component at index ${idx} is not a valid object.`,
        path: pathPrefix,
      })
      return
    }

    // 1. Missing ID
    if (!comp.id || typeof comp.id !== "string" || comp.id.trim() === "") {
      diagnostics.push({
        severity: "error",
        message: `Missing required field "id" at component index ${idx}.`,
        path: pathPrefix,
      })
    } else {
      const id = comp.id.trim()
      // 2. Duplicate ID
      if (ids.has(id)) {
        diagnostics.push({
          severity: "error",
          message: `Duplicate component ID "${id}".`,
          path: `${pathPrefix}.id`,
        })
      } else {
        ids.add(id)
      }
    }

    // 3. Missing Type
    if (!comp.type || typeof comp.type !== "string" || comp.type.trim() === "") {
      diagnostics.push({
        severity: "error",
        message: `Missing required field "type" for component "${comp.id || idx}".`,
        path: `${pathPrefix}.type`,
      })
    } else {
      const type = comp.type.trim().toLowerCase()
      // 4. Unrecognized Type
      if (!validTypes.has(type)) {
        diagnostics.push({
          severity: "warning",
          message: `Unrecognized component type "${comp.type}" for component "${comp.id || idx}". Valid types are: Store, Stage, Brick, Gateway.`,
          path: `${pathPrefix}.type`,
        })
      }
    }
  })

  // Second pass: validate connections (orphan targets, self-connections)
  components.forEach((comp: any, compIdx: number) => {
    if (!comp || !comp.id || !comp.connections) return
    const pathPrefix = `system.components[${compIdx}].connections`

    if (!Array.isArray(comp.connections)) {
      diagnostics.push({
        severity: "error",
        message: `"connections" for component "${comp.id}" must be an array.`,
        path: pathPrefix,
      })
      return
    }

    comp.connections.forEach((conn: any, connIdx: number) => {
      const connPath = `${pathPrefix}[${connIdx}]`
      if (!conn || typeof conn !== "object" || typeof conn.target !== "string" || conn.target.trim() === "") {
        diagnostics.push({
          severity: "error",
          message: `Invalid connection entry at index ${connIdx} for component "${comp.id}". Target must be a non-empty string.`,
          path: connPath,
        })
        return
      }

      const target = conn.target.trim()
      const compId = comp.id.trim()

      // 5. Orphan Connection Target
      if (!ids.has(target)) {
        diagnostics.push({
          severity: "error",
          message: `Connection target "${target}" does not exist in the components list.`,
          path: `${connPath}.target`,
        })
      }

      // Self-connection check
      if (target === compId) {
        diagnostics.push({
          severity: "error",
          message: `Component "${compId}" has a self-connection.`,
          path: `${connPath}.target`,
        })
      }
    })
  })

  // Third pass: find disconnected/isolated components
  const outgoingCount: Record<string, number> = Object.create(null)
  const incomingSet = new Set<string>()

  components.forEach((comp: any) => {
    if (!comp || !comp.id) return
    const compId = comp.id.trim()
    outgoingCount[compId] = 0

    if (Array.isArray(comp.connections)) {
      comp.connections.forEach((conn: any) => {
        if (conn && typeof conn === "object" && typeof conn.target === "string") {
          const target = conn.target.trim()
          if (target !== compId && ids.has(target)) {
            outgoingCount[compId]++
            incomingSet.add(target)
          }
        }
      })
    }
  })

  if (components.length > 1) {
    components.forEach((comp: any, compIdx: number) => {
      if (!comp || !comp.id) return
      const compId = comp.id.trim()
      if (outgoingCount[compId] === 0 && !incomingSet.has(compId)) {
        diagnostics.push({
          severity: "warning",
          message: `Component "${compId}" is disconnected (no inbound or outbound connections).`,
          path: `system.components[${compIdx}]`,
        })
      }
    })
  }

  // Fourth pass: Cycle detection using DFS
  const adj: Record<string, string[]> = Object.create(null)
  components.forEach((comp: any) => {
    if (!comp || !comp.id) return
    const compId = comp.id.trim()
    adj[compId] = []
    if (Array.isArray(comp.connections)) {
      comp.connections.forEach((conn: any) => {
        if (conn && typeof conn === "object" && typeof conn.target === "string") {
          const target = conn.target.trim()
          if (ids.has(target) && target !== compId) {
            adj[compId].push(target)
          }
        }
      })
    }
  })

  const visited = new Set<string>()
  const recStack: string[] = []
  const detectedCycles = new Set<string>()

  function dfs(node: string) {
    visited.add(node)
    recStack.push(node)

    const neighbors = adj[node] || []
    for (const neighbor of neighbors) {
      const stackIdx = recStack.indexOf(neighbor)
      if (stackIdx !== -1) {
        // Cycle detected
        const cyclePath = recStack.slice(stackIdx)
        cyclePath.push(neighbor)
        const cycleKey = cyclePath.join(" → ")
        const sortedCycleNodes = [...cyclePath.slice(0, -1)].sort().join(",")
        if (!detectedCycles.has(sortedCycleNodes)) {
          detectedCycles.add(sortedCycleNodes)
          diagnostics.push({
            severity: "warning",
            message: `Circular dependency loop detected: ${cycleKey}`,
          })
        }
      } else if (!visited.has(neighbor)) {
        dfs(neighbor)
      }
    }

    recStack.pop()
  }

  Object.keys(adj).forEach((node) => {
    if (!visited.has(node)) {
      dfs(node)
    }
  })

  return diagnostics;
}
