import yaml from "yaml"

export type CanvasChange =
  | { type: "coords"; payload: { id: string; x: number; y: number }[] }
  | { type: "delete"; payload: { ids: string[] } }
  | { type: "rename"; payload: { id: string; newName: string; newType?: string } }

export function reconcileSpec(specText: string, change: CanvasChange): string {
  try {
    const parsed = yaml.parse(specText)
    if (!parsed || !parsed.system) return specText

    if (!parsed.system.components || !Array.isArray(parsed.system.components)) {
      parsed.system.components = []
    }

    let modified = false

    if (change.type === "coords") {
      const coordsList = change.payload
      parsed.system.components = parsed.system.components.map((comp: any) => {
        if (!comp || typeof comp !== "object") return comp

        const match = coordsList.find((c) => c && c.id === comp.id)
        if (match && typeof match.x === "number" && typeof match.y === "number") {
          const roundedX = Math.round(match.x)
          const roundedY = Math.round(match.y)
          if (comp.x !== roundedX || comp.y !== roundedY) {
            modified = true
            return {
              ...comp,
              x: roundedX,
              y: roundedY,
            }
          }
        }
        return comp
      })
    } else if (change.type === "delete") {
      const { ids } = change.payload
      if (Array.isArray(ids) && ids.length > 0) {
        // 1. Filter out all deleted components
        const originalLength = parsed.system.components.length
        parsed.system.components = parsed.system.components.filter((comp: any) => {
          if (!comp || typeof comp !== "object") return false
          return !ids.includes(comp.id)
        })
        if (parsed.system.components.length !== originalLength) {
          modified = true
        }

        // 2. Prune any connections referencing deleted components
        parsed.system.components = parsed.system.components.map((comp: any) => {
          if (!comp || typeof comp !== "object") return comp

          if (comp.connections && Array.isArray(comp.connections)) {
            const originalConnLength = comp.connections.length
            const filteredConnections = comp.connections.filter(
              (conn: any) => conn && typeof conn === "object" && conn.target && !ids.includes(conn.target)
            )
            if (filteredConnections.length !== originalConnLength) {
              modified = true
              return {
                ...comp,
                connections: filteredConnections,
              }
            }
          }
          return comp
        })
      }
    } else if (change.type === "rename") {
      const { id, newName, newType } = change.payload

      parsed.system.components = parsed.system.components.map((comp: any) => {
        if (!comp || typeof comp !== "object") return comp

        if (comp.id === id) {
          if (comp.name !== newName || (newType && comp.type !== newType)) {
            modified = true
            const updated: any = {
              ...comp,
              name: newName,
            }
            if (newType) {
              updated.type = newType
            }
            return updated
          }
        }
        return comp
      })
    }

    if (modified) {
      return yaml.stringify(parsed)
    }
  } catch (e) {
    console.error("Reconciliation error:", e)
  }

  return specText
}
