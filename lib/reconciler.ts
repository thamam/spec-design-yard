import yaml from "yaml"

export interface CanvasChange {
  type: "coords" | "delete" | "rename"
  payload: any
}

export function reconcileSpec(specText: string, change: CanvasChange): string {
  try {
    const parsed = yaml.parse(specText)
    if (!parsed || !parsed.system) return specText

    if (!parsed.system.components) {
      parsed.system.components = []
    }

    let modified = false

    if (change.type === "coords") {
      const coordsList = change.payload as { id: string; x: number; y: number }[]
      parsed.system.components = parsed.system.components.map((comp: any) => {
        const match = coordsList.find((c) => c.id === comp.id)
        if (match) {
          modified = true
          return {
            ...comp,
            x: Math.round(match.x),
            y: Math.round(match.y),
          }
        }
        return comp
      })
    } else if (change.type === "delete") {
      const { id } = change.payload as { id: string }
      
      // 1. Filter out the deleted component
      const originalLength = parsed.system.components.length
      parsed.system.components = parsed.system.components.filter(
        (comp: any) => comp.id !== id
      )
      if (parsed.system.components.length !== originalLength) {
        modified = true
      }

      // 2. Prune any connection referencing this component
      parsed.system.components = parsed.system.components.map((comp: any) => {
        if (comp.connections && Array.isArray(comp.connections)) {
          const originalConnLength = comp.connections.length
          const filteredConnections = comp.connections.filter(
            (conn: any) => conn && conn.target !== id
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
    } else if (change.type === "rename") {
      const { id, newName, newType } = change.payload as {
        id: string
        newName: string
        newType?: string
      }

      parsed.system.components = parsed.system.components.map((comp: any) => {
        if (comp.id === id) {
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
