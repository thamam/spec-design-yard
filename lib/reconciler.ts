import yaml from "yaml"

export type CanvasChange =
  | { type: "coords"; payload: { id: string; x: number; y: number }[] }
  | { type: "delete"; payload: { ids: string[] } }
  | { type: "rename"; payload: { id: string; newName: string; newType?: string } }
  | { type: "quick-fix"; payload: { path: string; fixType: string; extraData?: any } }
  | { type: "quick-fix-all"; payload: { fixes: { path: string; fixType: string; extraData?: any }[] } }
  | { type: "add"; payload: { id: string; x: number; y: number; type: string; name?: string } }
  | { type: "connect"; payload: { source: string; target: string } }
  | { type: "disconnect"; payload: { source: string; target: string } }
  | { type: "connection-label"; payload: { source: string; target: string; label: string } }
  | { type: "update-property"; payload: { id: string; path: string; value: any } }
  | { type: "duplicate"; payload: { id: string; newId: string } }

export function parsePath(path: string): (string | number)[] {
  const parts: (string | number)[] = []
  const regex = /([^.\[\]]+)|\[(\d+)\]/g
  let match
  while ((match = regex.exec(path)) !== null) {
    if (match[1] !== undefined) {
      const key = match[1]
      // Security: Prevent Prototype Pollution
      if (key !== "__proto__" && key !== "constructor" && key !== "prototype") {
        parts.push(key)
      }
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
          if (match && typeof match.x === "number" && Number.isFinite(match.x) && typeof match.y === "number" && Number.isFinite(match.y)) {
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
                if (!connNode) return false
                if (typeof connNode.get === 'function') {
                  const targetId = connNode.get('target')
                  return targetId === target
                }
                const val = typeof connNode.toJSON === 'function' ? connNode.toJSON() : connNode
                return val === target
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
    } else if (change.type === "disconnect") {
      const { source, target } = change.payload
      if (comps && comps.items) {
        comps.items.forEach((compNode: any) => {
          if (!compNode || typeof compNode.get !== 'function') return

          const id = compNode.get('id')
          if (id === source) {
            const conns = compNode.get('connections')
            if (conns && conns.items && Array.isArray(conns.items)) {
              for (let i = conns.items.length - 1; i >= 0; i--) {
                const connNode = conns.items[i]
                if (connNode && typeof connNode.get === 'function') {
                  const targetId = connNode.get('target')
                  if (targetId === target) {
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
    } else if (change.type === "connection-label") {
      const { source, target, label } = change.payload
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
            if (conns && conns.items) {
              conns.items.forEach((connNode: any) => {
                if (connNode && typeof connNode.get === 'function') {
                  const targetId = connNode.get('target')
                  if (targetId === target) {
                    const currentLabel = connNode.get('label')
                    if (currentLabel !== label) {
                      connNode.set('label', label)
                      modified = true
                    }
                  }
                } else if (connNode) {
                  // If it's a string node e.g. - target (though typically it's an object)
                  const val = typeof connNode.toJSON === 'function' ? connNode.toJSON() : connNode
                  if (val === target) {
                    // Convert to object so we can set label
                    const idx = conns.items.indexOf(connNode)
                    if (idx !== -1) {
                      conns.set(idx, doc.createNode({ target, label }))
                      modified = true
                    }
                  }
                }
              })
            }
          }
        })
      }
    } else if (change.type === "update-property") {
      const { id, path, value } = change.payload
      if (comps && comps.items) {
        comps.items.forEach((compNode: any) => {
          if (!compNode || typeof compNode.get !== 'function') return
          const compId = compNode.get('id')
          if (compId === id) {
            try {
              const parts = parsePath(path)
              const currentVal = compNode.getIn(parts)
              if (currentVal !== value) {
                compNode.setIn(parts, value)
                modified = true
              }
            } catch (e) {
              console.warn(`Failed to safely set property ${path} on component ${id}:`, e)
            }
          }
        })
      }
    } else if (change.type === "duplicate") {
      const { id, newId } = change.payload
      if (comps && comps.items) {
        let sourceNode: any = null
        comps.items.forEach((compNode: any) => {
          if (compNode && typeof compNode.get === 'function' && compNode.get('id') === id) {
            sourceNode = compNode
          }
        })

        if (sourceNode && typeof sourceNode.toJSON === 'function') {
          const raw = sourceNode.toJSON()
          const currentX = typeof raw.x === 'number' ? Math.round(raw.x) : 100
          const currentY = typeof raw.y === 'number' ? Math.round(raw.y) : 100
          const currentName = raw.name ? String(raw.name) : String(raw.id)

          const duplicatedObj = {
            ...raw,
            id: newId,
            name: `${currentName} Copy`,
            x: currentX + 100,
            y: currentY + 100,
          }

          const newNode = doc.createNode(duplicatedObj)
          comps.add(newNode)
          modified = true
        }
      }
    } else if (change.type === "quick-fix" || change.type === "quick-fix-all") {
      const fixes = change.type === "quick-fix"
        ? [change.payload]
        : change.payload.fixes

      if (Array.isArray(fixes)) {
        // Sort fixes descending by their array indices to prevent index shift issues during deletions
        const getPathIndices = (p: string): number[] => {
          const matches = p.match(/\d+/g)
          return matches ? matches.map(Number) : []
        }

        const sortedFixes = [...fixes].sort((a, b) => {
          const idxA = getPathIndices(a.path)
          const idxB = getPathIndices(b.path)
          const minLen = Math.min(idxA.length, idxB.length)
          for (let i = 0; i < minLen; i++) {
            if (idxA[i] !== idxB[i]) {
              return idxB[i] - idxA[i]
            }
          }
          if (idxA.length !== idxB.length) {
            return idxB.length - idxA.length
          }
          // Same indices and depth. Ensure "delete-component" happens LAST for the same index so modifications are processed first (or skipped if already deleted)
          if (a.fixType === "delete-component" && b.fixType !== "delete-component") {
            return 1
          }
          if (b.fixType === "delete-component" && a.fixType !== "delete-component") {
            return -1
          }
          return 0
        })

        const deletedPaths: string[] = []

        sortedFixes.forEach((fix) => {
          const { path, fixType, extraData } = fix

          // Skip if this path is a sub-path of an already deleted component or connection
          const isStale = deletedPaths.some((deletedPath) => {
            return path === deletedPath || path.startsWith(deletedPath + ".") || path.startsWith(deletedPath + "[")
          })
          if (isStale) return

          if (fixType === "delete-component" || fixType === "invalid-connection-object") {
            deletedPaths.push(path)
          }

          const parts = parsePath(path)
      
      if (fixType === "missing-system-name" || fixType === "empty-system-name") {
        doc.setIn(parts, "unnamed_system")
        modified = true
      } else if (fixType === "missing-component-id") {
        const compNode = doc.getIn(parts) as any
        if (compNode && typeof compNode.set === "function" && typeof compNode.get === "function") {
          const type = String(compNode.get("type") || "Stage").toLowerCase()
          const prefix = type === "store" ? "store" : type === "brick" ? "brick" : type === "gateway" ? "gateway" : "stage"
          const compsNode = doc.getIn(["system", "components"]) as any
          const existingIds = new Set<string>()
          if (compsNode && compsNode.items) {
            compsNode.items.forEach((c: any) => {
              if (c && typeof c.get === "function") {
                const id = c.get("id")
                if (id) existingIds.add(String(id).trim())
              }
            })
          }
          let suffix = 1
          let uniqueId = `${prefix}_${suffix}`
          while (existingIds.has(uniqueId)) {
            suffix++
            uniqueId = `${prefix}_${suffix}`
          }
          compNode.set("id", uniqueId)
          modified = true
        }
      } else if (fixType === "missing-component-type") {
        doc.setIn(parts, "Stage")
        modified = true
      } else if (fixType === "invalid-metadata-object") {
        doc.setIn(parts, doc.createNode({}))
        modified = true
      } else if (fixType === "invalid-connections-array") {
        doc.setIn(parts, doc.createNode([]))
        modified = true
      } else if (fixType === "invalid-connection-object") {
        const connIdx = parts[parts.length - 1] as number
        const connsNode = doc.getIn(parts.slice(0, -1)) as any
        if (connsNode && typeof connsNode.delete === "function") {
          connsNode.delete(connIdx)
          modified = true
        }
      } else if (fixType === "unrecognized-metadata-key" || fixType === "unrecognized-component-key" || fixType === "unrecognized-system-key" || fixType === "unrecognized-connection-key") {
        const parentPath = parts.slice(0, -1)
        const keyToDelete = parts[parts.length - 1] as string
        const parentNode = doc.getIn(parentPath) as any
        if (parentNode && typeof parentNode.delete === "function") {
          parentNode.delete(keyToDelete)
          modified = true
        }
      } else if (fixType === "connection-case-mismatch") {
        const currentTarget = String(doc.getIn(parts) || "").trim()
        if (currentTarget) {
          const compsNode = doc.getIn(["system", "components"]) as any
          let correctId = ""
          if (compsNode && compsNode.items) {
            for (const c of compsNode.items) {
              if (c && typeof c.get === "function") {
                const id = c.get("id")
                if (id && String(id).trim().toLowerCase() === currentTarget.toLowerCase()) {
                  correctId = String(id).trim()
                  break
                }
              }
            }
          }
          if (correctId) {
            doc.setIn(parts, correctId)
            modified = true
          }
        }
      } else if (fixType === "invalid-metadata-status") {
        doc.setIn(parts, "draft")
        modified = true
      } else if (fixType === "invalid-metadata-color") {
        doc.setIn(parts, "zinc")
        modified = true
      } else if (fixType === "invalid-connection-label") {
        const currentVal = doc.getIn(parts)
        const fixedVal = currentVal !== undefined && currentVal !== null ? String(currentVal) : ""
        doc.setIn(parts, fixedVal)
        modified = true
      } else if (fixType === "component-overlap") {
        const currentX = doc.getIn(parts) as number
        if (typeof currentX === "number" && Number.isFinite(currentX)) {
          doc.setIn(parts, currentX + 100)
          modified = true
        }
      } else if (fixType === "missing-metadata-description") {
        const compNode = doc.getIn(parts) as any
        if (compNode && typeof compNode.get === "function") {
          let metadataNode = compNode.get("metadata") as any
          if (!metadataNode || typeof metadataNode.set !== "function") {
            compNode.set("metadata", doc.createNode({}))
            metadataNode = compNode.get("metadata")
          }
          metadataNode.set("description", "[Add Description]")
          modified = true
        }
      } else if (fixType === "missing-metadata-owner") {
        const compNode = doc.getIn(parts) as any
        if (compNode && typeof compNode.get === "function") {
          let metadataNode = compNode.get("metadata") as any
          if (!metadataNode || typeof metadataNode.set !== "function") {
            compNode.set("metadata", doc.createNode({}))
            metadataNode = compNode.get("metadata")
          }
          metadataNode.set("owner", "[Add Owner]")
          modified = true
        }
      } else if (fixType === "unrecognized-type") {
        const newType = extraData?.type || "Stage"
        doc.setIn(parts, newType)
        modified = true
      } else if (fixType === "set-default-version") {
        doc.setIn(parts, "v0.1.0")
        modified = true
      } else if (fixType === "convert-to-store") {
        const compNode = doc.getIn(parts) as any
        if (compNode && typeof compNode.set === "function") {
          compNode.set("type", "Store")
          modified = true
        }
      } else if (fixType === "connect-to-store") {
        let compNode = doc.getIn(parts) as any
        if (parts[parts.length - 1] === "type") {
          compNode = doc.getIn(parts.slice(0, -1)) as any
        }
        if (compNode && typeof compNode.get === "function") {
          const compId = compNode.get("id")
          const compType = String(compNode.get("type") || "").toLowerCase()
          const compsNode = doc.getIn(["system", "components"]) as any

          if (compType === "store") {
            // The component is a Store. We want to connect some Stage/Brick TO this Store.
            let candidateNode: any = null
            if (compsNode && compsNode.items) {
              // Priority 1: A Stage/Brick with no connections
              for (const c of compsNode.items) {
                if (c && typeof c.get === "function" && c.get("id") !== compId) {
                  const type = String(c.get("type") || "").toLowerCase()
                  if (type === "stage" || type === "brick") {
                    const conns = c.get("connections")
                    if (!conns || (conns.items && conns.items.length === 0)) {
                      candidateNode = c
                      break
                    }
                  }
                }
              }
              // Priority 2: Any Stage/Brick
              if (!candidateNode) {
                for (const c of compsNode.items) {
                  if (c && typeof c.get === "function" && c.get("id") !== compId) {
                    const type = String(c.get("type") || "").toLowerCase()
                    if (type === "stage" || type === "brick") {
                      candidateNode = c
                      break
                    }
                  }
                }
              }
            }

            if (candidateNode) {
              let conns = candidateNode.get("connections") as any
              if (!conns || typeof conns.get !== "function") {
                candidateNode.set("connections", doc.createNode([]))
                conns = candidateNode.get("connections")
              }
              let connExists = false
              if (conns && conns.items) {
                connExists = conns.items.some((connNode: any) => {
                  if (connNode && typeof connNode.get === "function") {
                    return connNode.get("target") === compId
                  }
                  return false
                })
              }
              if (!connExists) {
                const newConn = doc.createNode({ target: compId })
                if (conns && typeof conns.add === "function") {
                  conns.add(newConn)
                  modified = true
                }
              }
            }
          } else {
            // Original logic: component is Stage/Brick. Connect IT to some Store.
            let targetStoreId = ""
            if (compsNode && compsNode.items) {
              for (const c of compsNode.items) {
                if (c && typeof c.get === "function") {
                  const id = c.get("id")
                  const type = String(c.get("type") || "").toLowerCase()
                  if (type === "store" && id !== compId) {
                    targetStoreId = id
                    break
                  }
                }
              }
            }
            if (targetStoreId) {
              let conns = compNode.get("connections") as any
              if (!conns || typeof conns.get !== "function") {
                compNode.set("connections", doc.createNode([]))
                conns = compNode.get("connections")
              }
              let connExists = false
              if (conns && conns.items) {
                connExists = conns.items.some((connNode: any) => {
                  if (connNode && typeof connNode.get === "function") {
                    return connNode.get("target") === targetStoreId
                  }
                  return false
                })
              }
              if (!connExists) {
                const newConn = doc.createNode({ target: targetStoreId })
                if (conns && typeof conns.add === "function") {
                  conns.add(newConn)
                  modified = true
                }
              }
            }
          }
        }
      } else if (fixType === "connect-to-stage") {
        const compNode = doc.getIn(parts) as any
        if (compNode && typeof compNode.get === "function") {
          const compId = compNode.get("id")
          const compsNode = doc.getIn(["system", "components"]) as any
          let targetStageId = ""
          if (compsNode && compsNode.items) {
            for (const c of compsNode.items) {
              if (c && typeof c.get === "function") {
                const id = c.get("id")
                const type = String(c.get("type") || "").toLowerCase()
                if (type === "stage" && id !== compId) {
                  targetStageId = id
                  break
                }
              }
            }
          }
          if (targetStageId) {
            let conns = compNode.get("connections") as any
            if (!conns || typeof conns.get !== "function") {
              compNode.set("connections", doc.createNode([]))
              conns = compNode.get("connections")
            }
            let connExists = false
            if (conns && conns.items) {
              connExists = conns.items.some((connNode: any) => {
                if (connNode && typeof connNode.get === "function") {
                  return connNode.get("target") === targetStageId
                }
                return false
              })
            }
            if (!connExists) {
              const newConn = doc.createNode({ target: targetStageId })
              if (conns && typeof conns.add === "function") {
                conns.add(newConn)
                modified = true
              }
            }
          }
        }
      } else if (fixType === "self-connection" || fixType === "empty-connection-target" || fixType === "duplicate-connection" || fixType === "circular-dependency") {
        const resolvedParts = parts[parts.length - 1] === "target" ? parts.slice(0, -1) : parts
        if (resolvedParts.length >= 2 && resolvedParts[resolvedParts.length - 2] === "connections") {
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
      } else if (fixType === "delete-component") {
        const compIdx = parts[parts.length - 1] as number
        const compsNode = doc.getIn(["system", "components"]) as any
        if (compsNode && typeof compsNode.delete === 'function') {
          const compNode = compsNode.get(compIdx) as any
          let compId = ""
          if (compNode && typeof compNode.get === 'function') {
            compId = compNode.get('id')
          }
          compsNode.delete(compIdx)
          modified = true

          if (compId && compsNode.items) {
            compsNode.items.forEach((cNode: any) => {
              if (!cNode || typeof cNode.get !== 'function') return
              const conns = cNode.get('connections')
              if (conns && conns.items && Array.isArray(conns.items)) {
                for (let i = conns.items.length - 1; i >= 0; i--) {
                  const connNode = conns.items[i]
                  if (connNode && typeof connNode.get === 'function') {
                    const target = connNode.get('target')
                    if (target === compId) {
                      conns.delete(i)
                      modified = true
                    }
                  }
                }
                if (conns.items.length === 0) {
                  cNode.delete('connections')
                  modified = true
                }
              }
            })
          }
        }
      } else if (fixType === "connect-from-gateway") {
        const compIdx = parts[parts.length - 1] as number
        const compsNode = doc.getIn(["system", "components"]) as any
        if (compsNode && compsNode.items) {
          const targetNode = compsNode.get(compIdx) as any
          let targetId = ""
          if (targetNode && typeof targetNode.get === 'function') {
            targetId = targetNode.get('id')
          }

          if (targetId) {
            let gatewayId = ""
            compsNode.items.forEach((cNode: any) => {
              if (gatewayId) return
              if (cNode && typeof cNode.get === 'function') {
                const type = String(cNode.get('type') || "").toLowerCase()
                if (type === "gateway") {
                  gatewayId = cNode.get('id')
                }
              }
            })

            if (!gatewayId && compsNode.items.length > 0) {
              const firstNode = compsNode.get(0) as any
              if (firstNode && typeof firstNode.get === 'function') {
                const firstId = firstNode.get('id')
                if (firstId !== targetId) {
                  gatewayId = firstId
                }
              }
            }

            if (gatewayId) {
              compsNode.items.forEach((cNode: any) => {
                if (cNode && typeof cNode.get === 'function' && cNode.get('id') === gatewayId) {
                  let conns = cNode.get('connections')
                  if (!conns || typeof conns.get !== 'function') {
                    cNode.set('connections', doc.createNode([]))
                    conns = cNode.get('connections')
                  }

                  let connExists = false
                  if (conns && conns.items) {
                    connExists = conns.items.some((connNode: any) => {
                      if (!connNode || typeof connNode.get !== 'function') return false
                      return connNode.get('target') === targetId
                    })
                  }

                  if (!connExists) {
                    const newConn = doc.createNode({ target: targetId })
                    if (conns && typeof conns.add === 'function') {
                      conns.add(newConn)
                      modified = true
                    }
                  }
                }
              })
            }
          }
        }
      } else if (fixType === "insert-stage") {
        const resolvedParts = parts[parts.length - 1] === "target" ? parts.slice(0, -1) : parts
        const connIdx = resolvedParts[resolvedParts.length - 1] as number
        const connsArrayPath = resolvedParts.slice(0, -1)
        const connsNode = doc.getIn(connsArrayPath) as any
        if (connsNode) {
          const connNode = connsNode.get(connIdx) as any
          if (connNode && typeof connNode.get === 'function') {
            const targetId = connNode.get('target')
            const compPath = resolvedParts.slice(0, -2)
            const compNode = doc.getIn(compPath) as any
            let sourceId = ""
            if (compNode && typeof compNode.get === 'function') {
              sourceId = compNode.get('id')
            }

            if (sourceId && targetId) {
              let newStageId = `${sourceId}_to_${targetId}`
              const compsNode = doc.getIn(["system", "components"]) as any
              const existingIds = new Set<string>()
              if (compsNode && compsNode.items) {
                compsNode.items.forEach((c: any) => {
                  if (c && typeof c.get === 'function') {
                    const id = c.get('id')
                    if (id) existingIds.add(String(id).trim())
                  }
                })
              }
              if (existingIds.has(newStageId)) {
                let suffix = 1
                let uniqueId = `${newStageId}_${suffix}`
                while (existingIds.has(uniqueId)) {
                  suffix++
                  uniqueId = `${newStageId}_${suffix}`
                }
                newStageId = uniqueId
              }

              const newCompNode = doc.createNode({
                id: newStageId,
                type: "Stage",
                name: `${sourceId} to ${targetId} stage`,
              }) as any

              let sourceX = compNode.get('x')
              let sourceY = compNode.get('y')
              let targetX: number | undefined
              let targetY: number | undefined
              if (compsNode && compsNode.items) {
                compsNode.items.forEach((c: any) => {
                  if (c && typeof c.get === 'function' && c.get('id') === targetId) {
                    targetX = c.get('x')
                    targetY = c.get('y')
                  }
                })
              }
              if (typeof sourceX === 'number' && typeof sourceY === 'number' && typeof targetX === 'number' && typeof targetY === 'number') {
                newCompNode.set('x', Math.round((sourceX + targetX) / 2))
                newCompNode.set('y', Math.round((sourceY + targetY) / 2))
              }

              newCompNode.set('connections', doc.createNode([{ target: targetId }]))
              if (compsNode && typeof compsNode.add === 'function') {
                compsNode.add(newCompNode)
                connNode.set('target', newStageId)
                modified = true
              }
            }
          }
        }
      }
        })
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

export function autoLayoutDiagram(parsedSpec: any): { id: string; x: number; y: number }[] {
  const components = parsedSpec?.system?.components || []
  if (components.length === 0) return []

  const ids = new Set(components.map((c: any) => c.id).filter(Boolean))
  const adj: Record<string, string[]> = {}
  const inDegree: Record<string, number> = {}

  // Initialize graph structures
  components.forEach((comp: any) => {
    if (!comp || !comp.id) return
    adj[comp.id] = []
    inDegree[comp.id] = 0
  })

  // Build adjacency list and in-degrees
  components.forEach((comp: any) => {
    if (!comp || !comp.id) return
    const conns = comp.connections || []
    conns.forEach((conn: any) => {
      if (conn && conn.target && ids.has(conn.target) && conn.target !== comp.id) {
        adj[comp.id].push(conn.target)
        inDegree[conn.target] = (inDegree[conn.target] || 0) + 1
      }
    })
  })

  // Compute depth layers using a BFS/Layered approach
  const depth: Record<string, number> = {}
  components.forEach((comp: any) => {
    if (!comp || !comp.id) return
    depth[comp.id] = 0
  })

  // Identify entry points:
  // 1. Gateways
  // 2. Nodes with inDegree == 0
  const queue: string[] = []
  components.forEach((comp: any) => {
    if (!comp || !comp.id) return
    const type = String(comp.type || "").toLowerCase()
    if (type === "gateway" || inDegree[comp.id] === 0) {
      queue.push(comp.id)
      depth[comp.id] = 0
    }
  })

  // BFS traversal to calculate layered depth
  while (queue.length > 0) {
    const current = queue.shift()!
    const currentDepth = depth[current]
    if (currentDepth >= components.length) {
      continue
    }
    const neighbors = adj[current] || []
    neighbors.forEach((neighbor) => {
      // If the neighbor's depth is not updated, or can be pushed further right to avoid back-arrows crossing stages
      if (depth[neighbor] <= currentDepth) {
        depth[neighbor] = currentDepth + 1
        queue.push(neighbor)
      }
    })
  }

  // Group nodes by depth layer
  const layers: Record<number, string[]> = {}
  components.forEach((comp: any) => {
    if (!comp || !comp.id) return
    const layer = depth[comp.id] || 0
    if (!layers[layer]) {
      layers[layer] = []
    }
    layers[layer].push(comp.id)
  })

  const payload: { id: string; x: number; y: number }[] = []

  // Assign clean geometric coords:
  // x = 60 + layerIndex * 260
  // y = distributed vertically around center (e.g. 140 + index * 150)
  Object.keys(layers).map(Number).sort((a, b) => a - b).forEach((layer) => {
    const nodes = layers[layer]
    nodes.forEach((id, index) => {
      const x = 60 + layer * 260
      const y = 140 + index * 150
      payload.push({ id, x, y })
    })
  })

  return payload
}
