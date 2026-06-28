export interface Diagnostic {
  severity: "error" | "warning" | "info"
  message: string
  path?: string
  code?: string
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
  const lowercaseIds = new Map<string, string>()
  const validTypes = new Set(["store", "stage", "brick", "gateway"])
  const typeMap: Record<string, string> = Object.create(null)

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
          code: "duplicate-id",
        })
      } else {
        ids.add(id)
        lowercaseIds.set(id.toLowerCase(), id)
        // 2a. Invalid ID format
        if (!/^[a-zA-Z0-9_\-]+$/.test(id)) {
          diagnostics.push({
            severity: "warning",
            message: `Component ID "${id}" contains invalid characters. ID must be alphanumeric, hyphen, or underscore.`,
            path: `${pathPrefix}.id`,
            code: "invalid-id-format",
          })
        }
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
      if (comp.id && typeof comp.id === "string") {
        typeMap[comp.id.trim()] = type
      }
      // 4. Unrecognized Type
      if (!validTypes.has(type)) {
        diagnostics.push({
          severity: "warning",
          message: `Unrecognized component type "${comp.type}" for component "${comp.id || idx}". Valid types are: Store, Stage, Brick, Gateway.`,
          path: `${pathPrefix}.type`,
          code: "unrecognized-type",
        })
      }
    }

    // Validate metadata
    if ('metadata' in comp) {
      const meta = comp.metadata
      if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
        diagnostics.push({
          severity: "error",
          message: `"metadata" must be an object.`,
          path: `${pathPrefix}.metadata`,
        })
      } else {
        const allowedMetaKeys = new Set(["owner", "description", "status", "version"])
        Object.keys(meta).forEach((k) => {
          if (!allowedMetaKeys.has(k)) {
            diagnostics.push({
              severity: "info",
              message: `Unrecognized metadata key "${k}". Valid metadata keys are: owner, description, status, version.`,
              path: `${pathPrefix}.metadata.${k}`,
              code: "unrecognized-metadata-key",
            })
          }
        })

        if ('status' in meta) {
          const statusVal = String(meta.status || "").trim().toLowerCase()
          const validStatuses = new Set(["draft", "active", "deprecated"])
          if (!validStatuses.has(statusVal)) {
            diagnostics.push({
              severity: "warning",
              message: `Unrecognized status value "${meta.status}". Valid status values are: draft, active, deprecated.`,
              path: `${pathPrefix}.metadata.status`,
              code: "invalid-metadata-status",
            })
          }
        }

        if ('version' in meta) {
          const versionVal = String(meta.version || "").trim()
          const semverRegex = /^v?\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/
          if (versionVal !== "" && !semverRegex.test(versionVal)) {
            diagnostics.push({
              severity: "warning",
              message: `Metadata version "${meta.version}" does not follow semantic versioning format (e.g. 1.0.0 or v1.2.3).`,
              path: `${pathPrefix}.metadata.version`,
              code: "invalid-metadata-version",
            })
          }
        }
      }
    }

    // Missing documentation metadata checks
    if (comp.id && typeof comp.id === "string") {
      const compId = comp.id.trim()
      if (compId !== "") {
        const meta = comp.metadata || {}
        if (!meta.description || String(meta.description).trim() === "") {
          diagnostics.push({
            severity: "info",
            message: `Component "${compId}" lacks a description metadata field for architectural documentation.`,
            path: `${pathPrefix}`,
            code: "missing-metadata-description",
          })
        }
        if (!meta.owner || String(meta.owner).trim() === "") {
          diagnostics.push({
            severity: "info",
            message: `Component "${compId}" lacks an owner metadata field for architectural documentation.`,
            path: `${pathPrefix}`,
            code: "missing-metadata-owner",
          })
        }
      }
    }
  })

  // Second pass: validate connections (orphan targets, self-connections)
  const pass2Seen = new Set<string>()
  components.forEach((comp: any, compIdx: number) => {
    if (!comp || typeof comp.id !== "string" || comp.id.trim() === "") return
    const compId = comp.id.trim()
    if (!ids.has(compId) || pass2Seen.has(compId)) return
    pass2Seen.add(compId)

    if (!comp.connections) return
    const pathPrefix = `system.components[${compIdx}].connections`

    if (!Array.isArray(comp.connections)) {
      diagnostics.push({
        severity: "error",
        message: `"connections" for component "${compId}" must be an array.`,
        path: pathPrefix,
      })
      return
    }

    const seenTargets = new Set<string>()
    comp.connections.forEach((conn: any, connIdx: number) => {
      const connPath = `${pathPrefix}[${connIdx}]`
      if (!conn || typeof conn !== "object") {
        diagnostics.push({
          severity: "error",
          message: `Invalid connection entry at index ${connIdx} for component "${compId}".`,
          path: connPath,
        })
        return
      }

      if (conn.target === undefined || typeof conn.target !== "string" || conn.target.trim() === "") {
        diagnostics.push({
          severity: "error",
          message: `Connection at index ${connIdx} for component "${compId}" has an empty target.`,
          path: connPath,
          code: "empty-connection-target",
        })
        return
      }

      const target = conn.target.trim()

      // Duplicate connection check
      if (seenTargets.has(target)) {
        diagnostics.push({
          severity: "warning",
          message: `Component "${compId}" has duplicate connection targeting "${target}".`,
          path: connPath,
          code: "duplicate-connection",
        })
      } else {
        seenTargets.add(target)
      }

      // 5. Orphan Connection Target
      if (!ids.has(target)) {
        const caseMismatchId = lowercaseIds.get(target.toLowerCase())

        if (caseMismatchId) {
          diagnostics.push({
            severity: "warning",
            message: `Connection target "${target}" does not exist, but matches component "${caseMismatchId}" with different casing. Connection targets are case-sensitive.`,
            path: `${connPath}.target`,
            code: "connection-case-mismatch",
          })
        } else {
          diagnostics.push({
            severity: "error",
            message: `Connection target "${target}" does not exist in the components list.`,
            path: `${connPath}.target`,
            code: "orphan-connection",
          })
        }
      }

      // Self-connection check
      if (target === compId) {
        diagnostics.push({
          severity: "error",
          message: `Component "${compId}" has a self-connection.`,
          path: `${connPath}.target`,
          code: "self-connection",
        })
      }

      // Architectural flow rules
      const compType = typeMap[compId]
      const targetType = typeMap[target]

      if (compType === "gateway" && targetType === "store") {
        diagnostics.push({
          severity: "warning",
          message: `Gateway component "${compId}" connects directly to Store "${target}". Consider routing through a Stage or Brick first.`,
          path: `${connPath}.target`,
          code: "gateway-to-store",
        })
      }

      if (targetType === "gateway") {
        diagnostics.push({
          severity: "warning",
          message: `Component "${compId}" (${compType || 'unknown'}) connects directly to Gateway "${target}". Gateways are entry points and should not receive internal flow.`,
          path: `${connPath}.target`,
          code: "stage-brick-to-gateway",
        })
      }
    })
  })

  // Third pass: find disconnected/isolated components
  const outgoingCount: Record<string, number> = Object.create(null)
  const incomingSet = new Set<string>()
  const pass3Seen = new Set<string>()

  components.forEach((comp: any) => {
    if (!comp || typeof comp.id !== "string" || comp.id.trim() === "") return
    const compId = comp.id.trim()
    if (!ids.has(compId) || pass3Seen.has(compId)) return
    pass3Seen.add(compId)

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
    const hasGateway = Object.values(typeMap).includes("gateway")
    const pass3ReportSeen = new Set<string>()
    components.forEach((comp: any, compIdx: number) => {
      if (!comp || typeof comp.id !== "string" || comp.id.trim() === "") return
      const compId = comp.id.trim()
      if (!ids.has(compId) || pass3ReportSeen.has(compId)) return
      pass3ReportSeen.add(compId)

      const compType = typeMap[compId]

      if (outgoingCount[compId] === 0 && !incomingSet.has(compId)) {
        diagnostics.push({
          severity: "warning",
          message: `Component "${compId}" is disconnected (no inbound or outbound connections).`,
          path: `system.components[${compIdx}]`,
          code: "disconnected-component",
        })
      } else if (hasGateway && compType !== "gateway" && !incomingSet.has(compId)) {
        diagnostics.push({
          severity: "warning",
          message: `Component "${compId}" is unreachable (no inbound connections and is not a Gateway entry point).`,
          path: `system.components[${compIdx}]`,
          code: "unreachable-component",
        })
      }
    })
  }

  // Pass 3b: empty-gateway and sink-stage-brick checks
  components.forEach((comp: any, compIdx: number) => {
    if (!comp || typeof comp.id !== "string" || comp.id.trim() === "") return
    const compId = comp.id.trim()
    if (!ids.has(compId)) return

    const compType = typeMap[compId]

    if (compType === "gateway" && outgoingCount[compId] === 0) {
      diagnostics.push({
        severity: "warning",
        message: `Gateway component "${compId}" has no outgoing connections. Gateways must route incoming external traffic to downstream stages/stores.`,
        path: `system.components[${compIdx}]`,
        code: "empty-gateway",
      })
    }

    if (outgoingCount[compId] === 0 && incomingSet.has(compId) && (compType === "stage" || compType === "brick")) {
      diagnostics.push({
        severity: "warning",
        message: `Component "${compId}" of type "${comp.type}" has incoming connections but no outgoing connections (sink). Intermediate processing units should route to a downstream node.`,
        path: `system.components[${compIdx}]`,
        code: "sink-stage-brick",
      })
    }
  })

  // Fourth pass: Cycle detection using DFS
  const adj: Record<string, string[]> = Object.create(null)
  const pass4Seen = new Set<string>()
  components.forEach((comp: any) => {
    if (!comp || typeof comp.id !== "string" || comp.id.trim() === "") return
    const compId = comp.id.trim()
    if (!ids.has(compId) || pass4Seen.has(compId)) return
    pass4Seen.add(compId)

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

  // Build component paths mapping for cycle diagnostics
  const componentPaths: Record<string, string> = Object.create(null)
  const passPathsSeen = new Set<string>()
  components.forEach((comp: any, compIdx: number) => {
    if (comp && typeof comp.id === "string" && comp.id.trim() !== "") {
      const compId = comp.id.trim()
      if (ids.has(compId) && !passPathsSeen.has(compId)) {
        passPathsSeen.add(compId)
        componentPaths[compId] = `system.components[${compIdx}]`
      }
    }
  })

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
        const sortedCycleNodes = [...cyclePath.slice(0, -1)].sort()
        const cycleKeyHash = JSON.stringify(sortedCycleNodes)
        if (!detectedCycles.has(cycleKeyHash)) {
          detectedCycles.add(cycleKeyHash)
          diagnostics.push({
            severity: "warning",
            message: `Circular dependency loop detected: ${cycleKey}`,
            path: componentPaths[neighbor] || undefined,
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
