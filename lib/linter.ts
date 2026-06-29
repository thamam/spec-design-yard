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
      path: "system",
      code: "missing-system",
    })
    return diagnostics
  }

  if (!system.name || typeof system.name !== "string" || system.name.trim() === "") {
    diagnostics.push({
      severity: "warning",
      message: "System name is missing or empty.",
      path: "system.name",
      code: "missing-system-name",
    })
  }

  const allowedSystemKeys = new Set(["name", "components"])
  if (system && typeof system === "object" && !Array.isArray(system)) {
    Object.keys(system).forEach((k) => {
      if (!allowedSystemKeys.has(k)) {
        diagnostics.push({
          severity: "warning",
          message: `Unrecognized key "${k}" in top-level system. Valid system keys are: name, components.`,
          path: `system.${k}`,
          code: "unrecognized-system-key",
        })
      }
    })
  }

  const components = system.components
  if (!components) {
    diagnostics.push({
      severity: "info",
      message: "No components defined in system.",
      path: "system.components",
      code: "no-components",
    })
    return diagnostics
  }

  if (!Array.isArray(components)) {
    diagnostics.push({
      severity: "error",
      message: '"components" must be an array.',
      path: "system.components",
      code: "components-not-array",
    })
    return diagnostics
  }

  const ids = new Set<string>()
  const lowercaseIds = new Map<string, string>()
  const validTypes = new Set(["store", "stage", "brick", "gateway"])
  const allowedComponentKeys = new Set(["id", "type", "name", "x", "y", "connections", "metadata"])
  const typeMap: Record<string, string> = Object.create(null)

  // First pass: collect component IDs and validate basic fields
  components.forEach((comp: any, idx: number) => {
    const pathPrefix = `system.components[${idx}]`
    
    if (!comp || typeof comp !== "object") {
      diagnostics.push({
        severity: "error",
        message: `Component at index ${idx} is not a valid object.`,
        path: pathPrefix,
        code: "invalid-component-object",
      })
      return
    }

    Object.keys(comp).forEach((k) => {
      if (!allowedComponentKeys.has(k)) {
        diagnostics.push({
          severity: "warning",
          message: `Unrecognized component key "${k}" in component "${comp.id || idx}". Valid component keys are: id, type, name, x, y, connections, metadata.`,
          path: `${pathPrefix}.${k}`,
          code: "unrecognized-component-key",
        })
      }
    })

    // 1. Missing ID
    if (!comp.id || typeof comp.id !== "string" || comp.id.trim() === "") {
      diagnostics.push({
        severity: "error",
        message: `Missing required field "id" at component index ${idx}.`,
        path: pathPrefix,
        code: "missing-component-id",
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
        code: "missing-component-type",
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
          code: "invalid-metadata-object",
        })
      } else {
        const allowedMetaKeys = new Set(["owner", "description", "status", "version", "color"])
        Object.keys(meta).forEach((k) => {
          if (!allowedMetaKeys.has(k)) {
            diagnostics.push({
              severity: "info",
              message: `Unrecognized metadata key "${k}". Valid metadata keys are: owner, description, status, version, color.`,
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

        if ('color' in meta) {
          const colorVal = String(meta.color || "").trim().toLowerCase()
          const validColors = new Set(["indigo", "purple", "emerald", "amber", "rose", "sky", "zinc"])
          const hexRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
          if (colorVal !== "" && !validColors.has(colorVal) && !hexRegex.test(colorVal)) {
            diagnostics.push({
              severity: "warning",
              message: `Unrecognized metadata color "${meta.color}". Valid colors are standard names (indigo, purple, emerald, amber, rose, sky, zinc) or a 3, 6, or 8-character hex code (e.g. #f00, #ff00ff, #ff0000ff).`,
              path: `${pathPrefix}.metadata.color`,
              code: "invalid-metadata-color",
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
        code: "invalid-connections-array",
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
          code: "invalid-connection-object",
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

      if ('label' in conn && typeof conn.label !== "string") {
        diagnostics.push({
          severity: "error",
          message: `Connection label must be a string.`,
          path: `${connPath}.label`,
          code: "invalid-connection-label",
        })
      }

      // Check unrecognized connection keys
      const allowedConnectionKeys = new Set(["target", "label"])
      Object.keys(conn).forEach((key) => {
        if (!allowedConnectionKeys.has(key)) {
          diagnostics.push({
            severity: "warning",
            message: `Unrecognized connection key "${key}" for connection to "${target}" on component "${compId}". Valid keys are: target, label.`,
            path: `${connPath}.${key}`,
            code: "unrecognized-connection-key",
          })
        }
      })

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

      if (compType === "store" && targetType === "store") {
        diagnostics.push({
          severity: "warning",
          message: `Store component "${compId}" connects directly to Store "${target}". Data should not flow directly between Stores; consider routing through a Stage or Brick first.`,
          path: `${connPath}.target`,
          code: "store-to-store",
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

  // Perform full graph reachability traversal from all entry points
  const reachable = new Set<string>()
  const hasGateway = Object.values(typeMap).includes("gateway")

  if (components.length > 1) {
    const queue: string[] = []

    // 1. Identify Entry Points
    if (hasGateway) {
      components.forEach((comp: any) => {
        if (comp && typeof comp.id === "string") {
          const compId = comp.id.trim()
          if (ids.has(compId) && typeMap[compId] === "gateway") {
            reachable.add(compId)
            queue.push(compId)
          }
        }
      })
    } else {
      // If no gateway, entry points are components with no inbound connections
      components.forEach((comp: any) => {
        if (comp && typeof comp.id === "string") {
          const compId = comp.id.trim()
          if (ids.has(compId) && !incomingSet.has(compId)) {
            reachable.add(compId)
            queue.push(compId)
          }
        }
      })
    }

    // 2. BFS Traversal
    const tempAdj: Record<string, string[]> = Object.create(null)
    components.forEach((comp: any) => {
      if (comp && typeof comp.id === "string" && ids.has(comp.id.trim())) {
        const compId = comp.id.trim()
        tempAdj[compId] = []
        if (Array.isArray(comp.connections)) {
          comp.connections.forEach((conn: any) => {
            if (conn && typeof conn === "object" && typeof conn.target === "string") {
              const target = conn.target.trim()
              if (ids.has(target) && target !== compId) {
                tempAdj[compId].push(target)
              }
            }
          })
        }
      }
    })

    while (queue.length > 0) {
      const current = queue.shift()!
      const neighbors = tempAdj[current] || []
      for (const neighbor of neighbors) {
        if (!reachable.has(neighbor)) {
          reachable.add(neighbor)
          queue.push(neighbor)
        }
      }
    }
  }

  if (components.length > 1) {
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
      } else if (!reachable.has(compId)) {
        if (hasGateway) {
          if (compType !== "gateway") {
            diagnostics.push({
              severity: "warning",
              message: `Component "${compId}" is unreachable (no execution path exists from any Gateway entry point).`,
              path: `system.components[${compIdx}]`,
              code: "unreachable-component",
            })
          }
        } else {
          diagnostics.push({
            severity: "warning",
            message: `Component "${compId}" is unreachable (no execution path exists from any entry point).`,
            path: `system.components[${compIdx}]`,
            code: "unreachable-component",
          })
        }
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

          let cycleConnectionPath = componentPaths[neighbor]
          const nodeIdx = components.findIndex((c: any) => c && typeof c === 'object' && typeof c.id === 'string' && c.id.trim() === node)
          if (nodeIdx !== -1) {
            const comp = components[nodeIdx]
            if (comp && Array.isArray(comp.connections)) {
              const connIdx = comp.connections.findIndex((conn: any) => conn && typeof conn === 'object' && typeof conn.target === 'string' && conn.target.trim() === neighbor)
              if (connIdx !== -1) {
                cycleConnectionPath = `system.components[${nodeIdx}].connections[${connIdx}].target`
              }
            }
          }

          diagnostics.push({
            severity: "warning",
            message: `Circular dependency loop detected: ${cycleKey}`,
            path: cycleConnectionPath,
            code: "circular-dependency",
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

  // Pass 5: Coordinate overlaps checking
  const coordsMap = new Map<string, string[]>()
  const compIdToIdx = new Map<string, number>()
  components.forEach((comp: any, compIdx: number) => {
    if (comp && typeof comp === "object" && typeof comp.id === "string") {
      const compId = comp.id.trim()
      if (compId !== "" && ids.has(compId)) {
        compIdToIdx.set(compId, compIdx)
        if (
          typeof comp.x === "number" &&
          Number.isFinite(comp.x) &&
          typeof comp.y === "number" &&
          Number.isFinite(comp.y)
        ) {
          const x = Math.round(comp.x)
          const y = Math.round(comp.y)
          const key = `${x},${y}`
          if (!coordsMap.has(key)) {
            coordsMap.set(key, [])
          }
          coordsMap.get(key)!.push(compId)
        }
      }
    }
  })

  coordsMap.forEach((idsList, key) => {
    if (idsList.length > 1) {
      const [x, y] = key.split(",").map(Number)
      idsList.forEach((id) => {
        const compIdx = compIdToIdx.get(id)
        if (compIdx !== undefined) {
          const others = idsList.filter((o) => o !== id)
          diagnostics.push({
            severity: "warning",
            message: `Component "${id}" overlaps with component(s) ${others
              .map((o) => `"${o}"`)
              .join(", ")} at coordinate (${x}, ${y}).`,
            path: `system.components[${compIdx}].x`,
            code: "component-overlap",
          })
        }
      })
    }
  })

  return diagnostics;
}
