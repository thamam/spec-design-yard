import { normalizeConnections, type DroppedConnection } from "./spec-model"

const PLACEHOLDER_REGEX = /^(todo|tbd|placeholder|\[add description\]|\[add owner\])$/i
const SENSITIVE_METADATA_REGEX = /(?:^|[^a-zA-Z0-9])(secret|password|token|api_key|apikey|private_key|passwd)(?:$|[^a-zA-Z0-9])/i
const SECRET_PLACEHOLDER_REGEX = /^(todo|tbd|placeholder|\[add description\]|\[add owner\]|none|disabled|null|false)$/i

export interface Diagnostic {
  severity: "error" | "warning" | "info"
  message: string
  path?: string
  code?: string
}

// Non-object connection entries ("- digest", "- 8080") are stripped at the
// parse boundary (lib/spec-model.ts). Surface each dropped entry as a
// diagnostic so the user gets feedback instead of silent data loss. Path
// format matches the linter's connection-level diagnostics.
export function droppedConnectionDiagnostics(dropped: DroppedConnection[]): Diagnostic[] {
  return dropped.map((d) => ({
    severity: "info",
    code: "string-connection-stripped",
    path: `system.components[${d.componentIndex}].connections[${d.connectionIndex}]`,
    message: `Connection "- ${d.value}" was ignored; use the object form "- target: ${d.value}".`,
  }))
}

// Deliberately `any`: the linter's job is to diagnose specs that violate the
// Spec shape (numeric ids, scalar metadata), which its tests pass in directly.
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

  if (typeof system.name === "string" && system.name.trim() === "") {
    diagnostics.push({
      severity: "warning",
      message: "System name is empty.",
      path: "system.name",
      code: "empty-system-name",
    })
  } else if (typeof system.name !== "string") {
    diagnostics.push({
      severity: "warning",
      message: "System name is missing.",
      path: "system.name",
      code: "missing-system-name",
    })
  }

  const allowedSystemKeys = new Set(["name", "components", "metadata"])
  if (system && typeof system === "object" && !Array.isArray(system)) {
    Object.keys(system).forEach((k) => {
      if (!allowedSystemKeys.has(k)) {
        diagnostics.push({
          severity: "warning",
          message: `Unrecognized key "${k}" in top-level system. Valid system keys are: name, components, metadata.`,
          path: `system.${k}`,
          code: "unrecognized-system-key",
        })
      }
    })

    if ("metadata" in system) {
      const sysMeta = system.metadata
      if (!sysMeta || typeof sysMeta !== "object" || Array.isArray(sysMeta)) {
        diagnostics.push({
          severity: "error",
          message: 'System "metadata" must be an object.',
          path: "system.metadata",
          code: "invalid-system-metadata-object",
        })
      } else {
        const allowedSysMetaKeys = new Set(["owner", "description", "status", "version"])
        Object.keys(sysMeta).forEach((k) => {
          if (!allowedSysMetaKeys.has(k)) {
            diagnostics.push({
              severity: "warning",
              message: `Unrecognized metadata key "${k}" in top-level system metadata. Valid system metadata keys are: owner, description, status, version.`,
              path: `system.metadata.${k}`,
              code: "unrecognized-system-metadata-key",
            })
          }
        })

        if ("status" in sysMeta) {
          const statusVal = String(sysMeta.status || "").trim().toLowerCase()
          const validStatuses = new Set(["draft", "active", "deprecated"])
          if (!validStatuses.has(statusVal)) {
            diagnostics.push({
              severity: "warning",
              message: `Unrecognized system status value "${sysMeta.status}". Valid status values are: draft, active, deprecated.`,
              path: "system.metadata.status",
              code: "invalid-system-metadata-status",
            })
          }
        }

        if ("version" in sysMeta) {
          const versionVal = String(sysMeta.version || "").trim()
          const semverRegex = /^v?\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/
          if (versionVal !== "" && !semverRegex.test(versionVal)) {
            diagnostics.push({
              severity: "warning",
              message: `System metadata version "${sysMeta.version}" does not follow semantic versioning format (e.g. 1.0.0 or v1.2.3).`,
              path: "system.metadata.version",
              code: "invalid-system-metadata-version",
            })
          }
        }

        if (!sysMeta.description || String(sysMeta.description).trim() === "") {
          diagnostics.push({
            severity: "info",
            message: "System metadata lacks a description field for architectural documentation.",
            path: "system.metadata.description",
            code: "missing-system-metadata-description",
          })
        } else {
          if (PLACEHOLDER_REGEX.test(String(sysMeta.description).trim())) {
            diagnostics.push({
              severity: "warning",
              message: `System metadata has a placeholder description "${sysMeta.description}". Please provide a meaningful description.`,
              path: "system.metadata.description",
              code: "placeholder-system-metadata-description",
            })
          }
        }

        if (!sysMeta.owner || String(sysMeta.owner).trim() === "") {
          diagnostics.push({
            severity: "info",
            message: "System metadata lacks an owner field for architectural documentation.",
            path: "system.metadata.owner",
            code: "missing-system-metadata-owner",
          })
        } else {
          if (PLACEHOLDER_REGEX.test(String(sysMeta.owner).trim())) {
            diagnostics.push({
              severity: "warning",
              message: `System metadata has a placeholder owner "${sysMeta.owner}". Please assign a valid owner.`,
              path: "system.metadata.owner",
              code: "placeholder-system-metadata-owner",
            })
          }
        }
      }
    } else {
      diagnostics.push({
        severity: "info",
        message: "System is missing the metadata block (owner, description, version, status).",
        path: "system",
        code: "missing-system-metadata",
      })
    }
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
      if (comp.id && typeof comp.id === "string" && !(comp.id.trim() in typeMap)) {
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
        const allowedMetaKeys = new Set([
          "owner", "description", "status", "version", "color",
          "rate_limit", "rate_limiting", "rateLimit", "rateLimiting", "rate-limit", "rate-limiting",
          "throttled", "throttling", "buffer"
        ])
        const sortedAllowedKeys = Array.from(allowedMetaKeys).sort().join(", ")
        Object.keys(meta).forEach((k) => {
          if (!allowedMetaKeys.has(k)) {
            diagnostics.push({
              severity: "info",
              message: `Unrecognized metadata key "${k}". Valid metadata keys are: ${sortedAllowedKeys}.`,
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
        } else {
          if (PLACEHOLDER_REGEX.test(String(meta.description).trim())) {
            diagnostics.push({
              severity: "warning",
              message: `Component "${compId}" has a placeholder description "${meta.description}". Please provide a meaningful description.`,
              path: `${pathPrefix}.metadata.description`,
              code: "placeholder-metadata-description",
            })
          }
        }
        if (!meta.owner || String(meta.owner).trim() === "") {
          diagnostics.push({
            severity: "info",
            message: `Component "${compId}" lacks an owner metadata field for architectural documentation.`,
            path: `${pathPrefix}`,
            code: "missing-metadata-owner",
          })
        } else {
          if (PLACEHOLDER_REGEX.test(String(meta.owner).trim())) {
            diagnostics.push({
              severity: "warning",
              message: `Component "${compId}" has a placeholder owner "${meta.owner}". Please assign a valid owner.`,
              path: `${pathPrefix}.metadata.owner`,
              code: "placeholder-metadata-owner",
            })
          }
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
    const seenLabels = new Set<string>()
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

      // Check for missing connection label on Stage/Brick
      const currentCompType = typeMap[compId]
      if ((currentCompType === "stage" || currentCompType === "brick") && (!conn.label || typeof conn.label !== "string" || conn.label.trim() === "")) {
        diagnostics.push({
          severity: "info",
          message: `Connection from "${compId}" to "${target}" lacks a label describing the data flow.`,
          path: connPath,
          code: "missing-connection-label",
        })
      }

      // Check for duplicate connection label on same component
      if (conn.label && typeof conn.label === "string" && conn.label.trim() !== "") {
        const trimmedLabel = conn.label.trim()
        if (seenLabels.has(trimmedLabel)) {
          diagnostics.push({
            severity: "warning",
            message: `Component "${compId}" has duplicate connection label "${trimmedLabel}" on connection to "${target}".`,
            path: connPath,
            code: "duplicate-connection-label",
          })
        } else {
          seenLabels.add(trimmedLabel)
        }
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

      if ((compType === "stage" || compType === "brick") && targetType === "gateway") {
        diagnostics.push({
          severity: "warning",
          message: `Component "${compId}" (${compType || 'unknown'}) connects directly to Gateway "${target}". Gateways are entry points and should not receive internal flow.`,
          path: `${connPath}.target`,
          code: "stage-brick-to-gateway",
        })
      }

      if (compType === "brick" && targetType === "brick") {
        diagnostics.push({
          severity: "warning",
          message: `Brick component "${compId}" connects directly to Brick "${target}". Bricks are auxiliary components and should only attach to core components (Gateways, Stages, or Stores).`,
          path: `${connPath}.target`,
          code: "brick-to-brick",
        })
      }

      if (compType === "gateway" && targetType === "gateway") {
        diagnostics.push({
          severity: "warning",
          message: `Gateway component "${compId}" connects directly to Gateway "${target}". Gateways are external ingestion points and should route to internal processing or storage nodes.`,
          path: `${connPath}.target`,
          code: "gateway-to-gateway",
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

    if (compType === "store" && !incomingSet.has(compId)) {
      diagnostics.push({
        severity: "warning",
        message: `Store component "${compId}" has no incoming connections. Stores should act as state repositories and receive data flow.`,
        path: `system.components[${compIdx}].type`,
        code: "unused-store",
      })
    }

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

  // Pass 6: Single Points of Failure / Articulation Points detection
  if (components.length > 2) {
    const spofIds = new Set<string>()
    components.forEach((c: any) => {
      if (c && typeof c === 'object' && typeof c.id === 'string' && c.id.trim() !== "" && ids.has(c.id.trim())) {
        spofIds.add(c.id.trim())
      }
    })

    const buildUndirectedAdj = (): Record<string, string[]> => {
      const adjUndir: Record<string, string[]> = Object.create(null)
      spofIds.forEach(id => {
        adjUndir[id] = []
      })

      components.forEach((c: any) => {
        if (!c || typeof c !== 'object' || typeof c.id !== 'string') return
        const u = c.id.trim()
        if (u === "" || !spofIds.has(u)) return

        normalizeConnections(c).forEach(({ target }) => {
          const v = target.trim()
          if (v !== "" && v !== u && spofIds.has(v)) {
            if (!adjUndir[u].includes(v)) adjUndir[u].push(v)
            if (!adjUndir[v].includes(u)) adjUndir[v].push(u)
          }
        })
      })
      return adjUndir
    }

    const countComponentsWithExclude = (
      adjUndir: Record<string, string[]>, 
      activeIds: Set<string>, 
      excludeId?: string
    ): number => {
      const visitedUndir = new Set<string>()
      let count = 0

      activeIds.forEach(startNode => {
        if (startNode !== excludeId && !visitedUndir.has(startNode)) {
          count++
          const queue = [startNode]
          visitedUndir.add(startNode)
          let qIdx = 0
          while (qIdx < queue.length) {
            const node = queue[qIdx++]
            const neighbors = adjUndir[node] || []
            for (const neighbor of neighbors) {
              if (neighbor !== excludeId && !visitedUndir.has(neighbor)) {
                visitedUndir.add(neighbor)
                queue.push(neighbor)
              }
            }
          }
        }
      })
      return count
    }

    const fullAdj = buildUndirectedAdj()
    const baseSubgraphsCount = countComponentsWithExclude(fullAdj, spofIds)

    components.forEach((comp: any, compIdx: number) => {
      if (!comp || typeof comp !== 'object' || typeof comp.id !== 'string') return
      const v = comp.id.trim()
      if (v === "" || !spofIds.has(v)) return

      const remainingSubgraphsCount = countComponentsWithExclude(fullAdj, spofIds, v)

      if (remainingSubgraphsCount > baseSubgraphsCount) {
        diagnostics.push({
          severity: "warning",
          message: `Component "${v}" is a single point of failure (articulation point) in the architecture. Its removal splits the system into disconnected subgraphs.`,
          path: `system.components[${compIdx}]`,
          code: "single-point-of-failure",
        })
      }
    })
  }

  // Pass 7: STRIDE Security & Threat Modeling Checks
  if (components && Array.isArray(components)) {
    const auditNodeIds = new Set<string>()
    const verifyNodeIds = new Set<string>()
    const incomingCount: Record<string, number> = Object.create(null)
    
    // Calculate inbound counts
    components.forEach((other: any) => {
      if (other && Array.isArray(other.connections)) {
        const seenTargetsForOther = new Set<string>()
        normalizeConnections(other).forEach(({ target }) => {
          if (target.trim() !== "") {
            const trimmedTarget = target.trim()
            if (ids.has(trimmedTarget) && !seenTargetsForOther.has(trimmedTarget)) {
              seenTargetsForOther.add(trimmedTarget)
              incomingCount[trimmedTarget] = (incomingCount[trimmedTarget] || 0) + 1
            }
          }
        })
      }
    })
    
    components.forEach((other: any) => {
      if (other && typeof other.id === 'string') {
        const otherId = other.id.trim()
        const otherName = String(other.name || "").toLowerCase()
        const isAudit = otherId.toLowerCase().includes("audit") || 
                        otherId.toLowerCase().includes("ledger") || 
                        otherId.toLowerCase().includes("logger") || 
                        otherId.toLowerCase().includes("log") ||
                        otherName.includes("audit") ||
                        otherName.includes("ledger")
        if (isAudit) {
          auditNodeIds.add(otherId)
        }
        
        const isVerify = otherId.toLowerCase().includes("verify") ||
                         otherId.toLowerCase().includes("auth") ||
                         otherId.toLowerCase().includes("secure") ||
                         otherName.includes("verify") ||
                         otherName.includes("auth")
        if (isVerify) {
          verifyNodeIds.add(otherId)
        }
      }
    })

    components.forEach((comp: any, compIdx: number) => {
      if (!comp || typeof comp !== 'object' || typeof comp.id !== 'string') return
      const compId = comp.id.trim()
      if (compId === "" || !ids.has(compId)) return

      const type = String(comp.type || "").toLowerCase()

      // 1. Spoofing Check (Gateways lacking owner or lacking secure/auth labels on outgoing connections)
      if (type === "gateway") {
        const conns = comp.connections || []
        let hasSecureConn = false
        if (Array.isArray(conns)) {
          conns.forEach((conn: any) => {
            const label = String(typeof conn === 'string' ? "" : (conn?.label || "")).toLowerCase()
            const isSecureMatch = /(?:^|[^a-zA-Z0-9])(auth|verify|secure|validate|token)(?:$|[^a-zA-Z0-9])/i.test(label) &&
                                  !(/(?:^|[^a-zA-Z0-9])(unsecure|insecure|unauth|nonsecure)(?:$|[^a-zA-Z0-9])/i.test(label))
            if (isSecureMatch) {
              hasSecureConn = true
            }
          })
        }
        if (!hasSecureConn) {
          diagnostics.push({
            severity: "warning",
            message: `Gateway "${compId}" is vulnerable to Spoofing. Outbound connections must use security/auth labels to guarantee trusted incoming identity.`,
            path: `system.components[${compIdx}]`,
            code: "stride-spoofing"
          })
        }
      }

      // 2. Tampering Check (Unlabeled connections or raw flows)
      const conns = comp.connections || []
      if (Array.isArray(conns)) {
        conns.forEach((conn: any, connIdx: number) => {
          const label = typeof conn === 'string' ? "" : (conn?.label || "")
          if (!label || String(label).trim() === "") {
            diagnostics.push({
              severity: "warning",
              message: `Connection to "${typeof conn === 'string' ? conn : conn?.target}" is susceptible to Tampering. Consider adding a connection label specifying secure channels (TLS/gRPC/HTTPS).`,
              path: `system.components[${compIdx}].connections[${connIdx}]`,
              code: "stride-tampering"
            })
          }
        })
      }

      // 3. Repudiation Check (Store nodes without audited event ledgers or logging neighbors)
      if (type === "store") {
        let hasAudit = false
        const compConns = comp.connections || []
        const hasOutToAudit = Array.isArray(compConns) && normalizeConnections(comp).some(({ target }) =>
          auditNodeIds.has(target.trim())
        )
        
        let hasInFromAudit = false
        components.forEach((other: any) => {
          if (other && typeof other.id === 'string' && auditNodeIds.has(other.id.trim())) {
            const otherConns = other.connections || []
            const hasIn = Array.isArray(otherConns) && normalizeConnections(other).some(({ target }) =>
              target.trim() === compId
            )
            if (hasIn) hasInFromAudit = true
          }
        })
        
        if (hasOutToAudit || hasInFromAudit) {
          hasAudit = true
        }

        if (!hasAudit) {
          diagnostics.push({
            severity: "info",
            message: `Store "${compId}" lacks audit trails / log tracing. Connect an auditing/ledger Brick (e.g. b2_ledger) to store events and prevent Repudiation.`,
            path: `system.components[${compIdx}]`,
            code: "stride-repudiation"
          })
        }
      }

      // 4. Information Disclosure Check (direct Gateway-to-Store connections / bypasses)
      if (type === "gateway") {
        normalizeConnections(comp).forEach(({ target, originalIdx: connIdx }) => {
          if (ids.has(target.trim())) {
            const targetType = typeMap[target.trim()] || ""
            if (targetType === "store") {
              diagnostics.push({
                severity: "warning",
                message: `Gateway connects directly to Store "${target.trim()}". Bypassing validation stages presents an Information Disclosure / Tampering threat.`,
                path: `system.components[${compIdx}].connections[${connIdx}]`,
                code: "stride-information-disclosure"
              })
            }
          }
        })
      }

      // 5. Elevation of Privilege Check (privileged component lacking verification node connections)
      const isPrivileged = comp.metadata?.privileged === true || 
                           compId.toLowerCase().includes("admin") || 
                           compId.toLowerCase().includes("root") ||
                           String(comp.name || "").toLowerCase().includes("admin") ||
                           String(comp.name || "").toLowerCase().includes("root")
      if (isPrivileged) {
        let hasVerifyNode = false
        const compConns = comp.connections || []
        const hasOutToVerify = Array.isArray(compConns) && normalizeConnections(comp).some(({ target }) =>
          verifyNodeIds.has(target.trim())
        )
        
        let hasInFromVerify = false
        components.forEach((other: any) => {
          if (other && typeof other.id === 'string' && verifyNodeIds.has(other.id.trim())) {
            const otherConns = other.connections || []
            const hasIn = Array.isArray(otherConns) && normalizeConnections(other).some(({ target }) =>
              target.trim() === compId
            )
            if (hasIn) hasInFromVerify = true
          }
        })
        
        if (hasOutToVerify || hasInFromVerify) {
          hasVerifyNode = true
        }

        if (!hasVerifyNode) {
          diagnostics.push({
            severity: "warning",
            message: `Privileged component "${compId}" lacks verification guards. Connect a verification Brick (e.g. b6_verify) to prevent unauthorized Elevation of Privilege.`,
            path: `system.components[${compIdx}]`,
            code: "stride-elevation-of-privilege"
          })
        }
      }

      // 6. Denial of Service Check (high fan-in / bottleneck components)
      const inboundCount = incomingCount[compId] || 0
      const isLimitEnabled = (val: any) => {
        if (typeof val === 'boolean') return val;
        if (typeof val === 'string') {
          const norm = val.trim().toLowerCase();
          const isFalsyStr = norm === 'false' || norm === 'no' || norm === '' || norm === '0' || norm === 'none' || norm === 'disabled' || norm === 'off';
          return !isFalsyStr;
        }
        if (typeof val === 'number') return val > 0;
        return !!val;
      };

      const hasRateLimit = 
        isLimitEnabled(comp.metadata?.rate_limit) ||
        isLimitEnabled(comp.metadata?.rate_limiting) ||
        isLimitEnabled(comp.metadata?.rateLimit) ||
        isLimitEnabled(comp.metadata?.rateLimiting) ||
        isLimitEnabled(comp.metadata?.["rate-limit"]) ||
        isLimitEnabled(comp.metadata?.["rate-limiting"]) ||
        isLimitEnabled(comp.metadata?.throttled) ||
        isLimitEnabled(comp.metadata?.throttling) ||
        isLimitEnabled(comp.metadata?.buffer);

      if (inboundCount >= 3 && !hasRateLimit) {
        diagnostics.push({
          severity: "warning",
          message: `Component "${compId}" has high incoming traffic fan-in (${inboundCount} inbound connections) and is vulnerable to Denial of Service (DoS). Consider adding "rate_limit: true" or "throttled: true" under component metadata to prevent service degradation.`,
          path: `system.components[${compIdx}]`,
          code: "stride-denial-of-service"
        })
      }

      // 7. Information Disclosure: Hardcoded Secret/Token Leakage Check in Component Metadata
      if (comp.metadata && typeof comp.metadata === "object" && !Array.isArray(comp.metadata)) {
        Object.keys(comp.metadata).forEach((k) => {
          if (SENSITIVE_METADATA_REGEX.test(k)) {
            const val = comp.metadata[k]
            if (val !== undefined && val !== null && typeof val !== "boolean" && typeof val !== "object") {
              const valStr = String(val).trim()
              if (
                valStr !== "" &&
                !valStr.startsWith("${") &&
                !SECRET_PLACEHOLDER_REGEX.test(valStr)
              ) {
                diagnostics.push({
                  severity: "warning",
                  message: `Potential hardcoded secret or token detected in metadata key "${k}". Storing raw credentials in system blueprints is an Information Disclosure vulnerability (STRIDE).`,
                  path: `system.components[${compIdx}].metadata.${k}`,
                  code: "stride-secret-leak",
                })
              }
            }
          }
        })
      }
    })
  }

  return diagnostics;
}
