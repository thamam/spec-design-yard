import yaml from "yaml"

export type CanvasChange =
  | { type: "coords"; payload: { id: string; x: number; y: number }[] }
  | { type: "delete"; payload: { ids: string[] } }
  | { type: "rename"; payload: { id: string; newName: string; newType?: string } }
  | { type: "quick-fix"; payload: { path: string; fixType: string; extraData?: any } }
  | { type: "add"; payload: { id: string; x: number; y: number; type: string; name?: string } }
  | { type: "connect"; payload: { source: string; target: string } }

export function parsePath(path: string): (string | number)[] {
  const parts: (string | number)[] = []
  const regex = /([^.\[\]]+)|\[(\d+)\]/g
  let match
  while ((match = regex.exec(path)) !== null) {
    if (match[1] !== undefined) {
      parts.push(match[1])
    } else if (match[2] !== undefined) {
      parts.push(parseInt(match[2], 10))
    }
  }
  return parts
}

export function reconcileSpec(specText: string, change: CanvasChange): string {
  try {
    const doc = yaml.parseDocument(specText)
    if (!doc || !doc.get('system')) return specText

    const system = doc.get('system') as any
    if (!system || typeof system.get !== 'function') return specText

    let comps = system.get('components')
    if (!comps || typeof comps.get !== 'function') {
      system.set('components', doc.createNode([]))
      comps = system.get('components')
    }

    let modified = false

    if (change.type === "coords") {
      const coordsList = change.payload
      if (comps && comps.items) {
        comps.items.forEach((compNode: any) => {
          if (!compNode || typeof compNode.get !== 'function') return

          const id = compNode.get('id')
          if (!id) return

          const match = coordsList.find((c) => c && c.id === id)
          if (match && typeof match.x === "number" && typeof match.y === "number") {
            const roundedX = Math.round(match.x)
            const roundedY = Math.round(match.y)
            const currentX = compNode.get('x')
            const currentY = compNode.get('y')

            if (currentX !== roundedX || currentY !== roundedY) {
              modified = true
              compNode.set('x', roundedX)
              compNode.set('y', roundedY)
            }
          }
        })
      }
    } else if (change.type === "delete") {
      const { ids } = change.payload
      if (Array.isArray(ids) && ids.length > 0 && comps && comps.items) {
        // 1. Filter out all deleted components
        for (let i = comps.items.length - 1; i >= 0; i--) {
          const compNode = comps.items[i]
          if (compNode && typeof compNode.get === 'function') {
            const id = compNode.get('id')
            if (id && ids.includes(id)) {
              comps.delete(i)
              modified = true
            }
          }
        }

        // 2. Prune any connections referencing deleted components
        if (comps && comps.items) {
          comps.items.forEach((compNode: any) => {
            if (!compNode || typeof compNode.get !== 'function') return

            const conns = compNode.get('connections')
            if (conns && conns.items && Array.isArray(conns.items)) {
              for (let i = conns.items.length - 1; i >= 0; i--) {
                const connNode = conns.items[i]
                if (connNode && typeof connNode.get === 'function') {
                  const target = connNode.get('target')
                  if (target && ids.includes(target)) {
                    conns.delete(i)
                    modified = true
                  }
                }
              }
              if (conns.items.length === 0) {
                compNode.delete('connections')
                modified = true
              }
            }
          })
        }
      }
    } else if (change.type === "add") {
      const { id, x, y, type, name } = change.payload
      let idExists = false
      if (comps && comps.items) {
        idExists = comps.items.some((compNode: any) => {
          if (!compNode || typeof compNode.get !== 'function') return false
          const compId = compNode.get('id')
          return compId === id
        })
      }
      if (!idExists) {
        const newNode = doc.createNode({
          id,
          type: type || "Stage",
          name: name || id,
          x: Math.round(x),
          y: Math.round(y),
        })
        if (comps && typeof comps.add === 'function') {
          comps.add(newNode)
          modified = true
        }
      }
    } else if (change.type === "connect") {
      const { source, target } = change.payload
      if (comps && comps.items) {
        comps.items.forEach((compNode: any) => {
          if (!compNode || typeof compNode.get !== 'function') return

          const id = compNode.get('id')
          if (id === source) {
            let conns = compNode.get('connections')
            if (!conns || typeof conns.get !== 'function') {
              compNode.set('connections', doc.createNode([]))
              conns = compNode.get('connections')
            }

            let connExists = false
            if (conns && conns.items) {
              connExists = conns.items.some((connNode: any) => {
                if (!connNode || typeof connNode.get !== 'function') return false
                const targetId = connNode.get('target')
                return targetId === target
              })
            }

            if (!connExists) {
              const newConn = doc.createNode({ target })
              if (conns && typeof conns.add === 'function') {
                conns.add(newConn)
                modified = true
              }
            }
          }
        })
      }
    } else if (change.type === "rename") {
      const { id, newName, newType } = change.payload
      if (comps && comps.items) {
        comps.items.forEach((compNode: any) => {
          if (!compNode || typeof compNode.get !== 'function') return

          const compId = compNode.get('id')
          if (compId === id) {
            const currentName = compNode.get('name')
            const currentType = compNode.get('type')

            if (currentName !== newName || (newType && currentType !== newType)) {
              modified = true
              compNode.set('name', newName)
              if (newType) {
                compNode.set('type', newType)
              }
            }
          }
        })
      }
    } else if (change.type === "quick-fix") {
      const { path, fixType, extraData } = change.payload
      const parts = parsePath(path)
      
      if (fixType === "unrecognized-type") {
        const newType = extraData?.type || "Stage"
        doc.setIn(parts, newType)
        modified = true
      } else if (fixType === "self-connection" || fixType === "empty-connection-target" || fixType === "duplicate-connection") {
        const resolvedParts = parts[parts.length - 1] === "target" ? parts.slice(0, -1) : parts
        const connIdx = resolvedParts[resolvedParts.length - 1] as number
        const connsArrayPath = resolvedParts.slice(0, -1)
        const connsNode = doc.getIn(connsArrayPath) as any
        if (connsNode && typeof connsNode.delete === 'function') {
          connsNode.delete(connIdx)
          modified = true
          if (connsNode.items && connsNode.items.length === 0) {
            const compPath = resolvedParts.slice(0, -2)
            const compNode = doc.getIn(compPath) as any
            if (compNode && typeof compNode.delete === 'function') {
              compNode.delete('connections')
            }
          }
        }
      } else if (fixType === "invalid-id-format") {
        const currentId = String(doc.getIn(parts) || "").trim()
        let fixedId = currentId.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/__+/g, "_")
        if (fixedId.endsWith("_") && fixedId.length > 1) {
          fixedId = fixedId.slice(0, -1)
        }
        if (fixedId.startsWith("_") && fixedId.length > 1) {
          fixedId = fixedId.slice(1)
        }
        if (fixedId === "" || fixedId === "_") {
          fixedId = "component"
        }

        const compsNode = doc.getIn(["system", "components"]) as any
        const existingIds = new Set<string>()
        if (compsNode && compsNode.items) {
          compsNode.items.forEach((compNode: any) => {
            if (compNode && typeof compNode.get === 'function') {
              const id = compNode.get('id')
              if (id) existingIds.add(String(id).trim())
            }
          })
        }

        if (existingIds.has(fixedId)) {
          let suffix = 1
          let uniqueId = `${fixedId}_${suffix}`
          while (existingIds.has(uniqueId)) {
            suffix++
            uniqueId = `${fixedId}_${suffix}`
          }
          fixedId = uniqueId
        }

        doc.setIn(parts, fixedId)
        modified = true

        // Update references in connection targets
        if (comps && comps.items) {
          comps.items.forEach((compNode: any) => {
            if (!compNode || typeof compNode.get !== 'function') return
            const conns = compNode.get('connections')
            if (conns && conns.items && Array.isArray(conns.items)) {
              conns.items.forEach((connNode: any) => {
                if (connNode && typeof connNode.get === 'function') {
                  const target = connNode.get('target')
                  if (target === currentId) {
                    connNode.set('target', fixedId)
                  }
                }
              })
            }
          })
        }
      } else if (fixType === "duplicate-id") {
        const currentId = String(doc.getIn(parts) || "")
        const compsNode = doc.getIn(["system", "components"]) as any
        const existingIds = new Set<string>()
        if (compsNode && compsNode.items) {
          compsNode.items.forEach((compNode: any) => {
            if (compNode && typeof compNode.get === 'function') {
              const id = compNode.get('id')
              if (id) existingIds.add(String(id).trim())
            }
          })
        }
        let suffix = 1
        let uniqueId = `${currentId}_${suffix}`
        while (existingIds.has(uniqueId)) {
          suffix++
          uniqueId = `${currentId}_${suffix}`
        }
        doc.setIn(parts, uniqueId)
        modified = true
      } else if (fixType === "orphan-connection") {
        const targetId = String(doc.getIn(parts) || "").trim()
        if (targetId) {
          const compsNode = doc.getIn(["system", "components"]) as any
          if (compsNode && typeof compsNode.add === 'function') {
            const newNode = doc.createNode({
              id: targetId,
              type: "Stage",
              name: targetId,
            })
            compsNode.add(newNode)
            modified = true
          }
        }
      }
    }

    if (modified) {
      return doc.toString()
    }
  } catch (e) {
    console.error("Reconciliation error:", e)
  }

  return specText
}
