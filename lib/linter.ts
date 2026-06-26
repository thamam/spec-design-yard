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

  // Second pass: validate connections (orphan targets)
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
      // 5. Orphan Connection Target
      if (!ids.has(target)) {
        diagnostics.push({
          severity: "error",
          message: `Connection target "${target}" does not exist in the components list.`,
          path: `${connPath}.target`,
        })
      }
    })
  })

  return diagnostics
}
