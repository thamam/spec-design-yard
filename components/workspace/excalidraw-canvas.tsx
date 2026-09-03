"use client"

import { useEffect, useRef, useState, useMemo, useCallback } from "react"
import { CanvasChange } from "../../lib/reconciler"
import { lintSpec } from "../../lib/linter"
import {
  createCanvasDiffState,
  diffScene,
  pruneTracking,
  registerCompiledElements,
  resolvePendingRename,
} from "../../lib/canvas-diff"
import { normalizeConnections } from "../../lib/spec-model"

const getDeterministicSeed = (id: string) => {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return (Math.abs(hash) % 100000) + 1
}

const COLOR_MAP: Record<string, { stroke: string; bg: string }> = Object.assign(Object.create(null), {
  indigo: { stroke: '#6366f1', bg: 'rgba(99, 102, 241, 0.1)' },
  purple: { stroke: '#c084fc', bg: 'rgba(168, 85, 247, 0.1)' },
  emerald: { stroke: '#34d399', bg: 'rgba(52, 211, 153, 0.1)' },
  amber: { stroke: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
  rose: { stroke: '#f43f5e', bg: 'rgba(244, 63, 94, 0.1)' },
  sky: { stroke: '#38bdf8', bg: 'rgba(56, 189, 248, 0.1)' },
  zinc: { stroke: '#71717a', bg: 'rgba(113, 113, 122, 0.1)' },
})

export function compileSpecToExcalidrawElements(parsedSpec: any, pathSource?: string, pathTarget?: string, hiddenTypes?: string[], showSecurityOverlay?: boolean): any[] {
  if (!parsedSpec?.system?.components || !Array.isArray(parsedSpec.system.components)) return []
  const elements: any[] = []
  const hiddenTypesSet = new Set((hiddenTypes || []).map(t => String(t).toLowerCase()))
  
  // Pre-compute an ID-to-Type map in O(N) to avoid quadratic connection lookup bottlenecks
  const componentTypeMap = new Map<string, string>()
  parsedSpec.system.components.forEach((c: any) => {
    if (c && c.id) {
      const type = String(c.type || "Unit").toLowerCase()
      componentTypeMap.set(String(c.id).trim(), type)
    }
  })

  const components = parsedSpec.system.components.filter((comp: any) => {
    if (!comp || !comp.id) return false
    const type = String(comp.type || "Unit").toLowerCase()
    return !hiddenTypesSet.has(type)
  })
  const diagnostics = lintSpec(parsedSpec)

  // Calculate directed paths up to 8 hops for trace path highlighting
  const nodesOnPath = new Set<string>()
  const edgesOnPath = new Set<string>() // key: "from->to"

  if (pathSource && pathTarget && pathSource !== pathTarget) {
    const ids = new Set<string>()
    components.forEach((c: any) => {
      if (c && typeof c.id === 'string' && c.id.trim() !== "") {
        ids.add(c.id.trim())
      }
    })

    const adjDirected: Record<string, string[]> = Object.create(null)
    ids.forEach(id => {
      adjDirected[id] = []
    })

    components.forEach((c: any) => {
      if (!c || typeof c.id !== 'string') return
      const u = c.id.trim()
      if (!ids.has(u)) return

      normalizeConnections(c).forEach(({ target }) => {
        const v = target.trim()
        if (ids.has(v) && v !== u) {
          if (!adjDirected[u].includes(v)) adjDirected[u].push(v)
        }
      })
    })

    const visited = new Set<string>()
    let pathCount = 0
    const findPaths = (node: string, currentPath: string[]) => {
      if (pathCount >= 20) return // Cap results at 20 paths
      if (currentPath.length > 8) return
      if (node === pathTarget) {
        pathCount++
        currentPath.forEach((n) => nodesOnPath.add(n))
        for (let i = 0; i < currentPath.length - 1; i++) {
          edgesOnPath.add(`${currentPath[i]}->${currentPath[i+1]}`)
        }
        return
      }
      const neighbors = adjDirected[node] || []
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
  }

  // Layout positions registry using Object.create(null) to prevent prototype pollution
  const positions: Record<string, { x: number; y: number }> = Object.create(null)

  // 1. Assign positions to nodes based on logical layout rules.
  // Every component consumes its lane slot, pinned or not. If the counters only
  // advanced for unpinned components, giving one component an explicit x/y
  // would slide every later component a slot to the left — and the coordinate
  // writeback would then persist that slide, so a single drag made the rest of
  // the diagram twitch on both axes.
  let coreIdx = 0
  let brickIdx = 0

  components.forEach((comp: any) => {
    if (!comp || typeof comp !== "object" || !comp.id) return
    const type = String(comp.type || "").toLowerCase()
    const isBrick = type === 'brick'
    // Bricks sit in a row below the core loop; stages and stores run across it.
    const slot = isBrick ? brickIdx++ : coreIdx++

    // Each axis is honoured on its own. Requiring both meant `y: 200` with no
    // `x` was silently discarded and the component snapped back to its auto
    // slot, so hand-placing one axis in the YAML looked like the canvas
    // fighting the edit.
    const auto = isBrick
      ? { x: 100 + slot * 260, y: 380 }
      : { x: 60 + slot * 250, y: 160 }
    const hasX = typeof comp.x === 'number' && Number.isFinite(comp.x)
    const hasY = typeof comp.y === 'number' && Number.isFinite(comp.y)

    positions[comp.id] = {
      x: hasX ? comp.x : auto.x,
      y: hasY ? comp.y : auto.y,
    }
  })

  // Find duplicate IDs to flag all instances as errors using Object.create(null) to prevent prototype pollution
  const idCounts: Record<string, number> = Object.create(null)
  components.forEach((c: any) => {
    if (c && typeof c === 'object' && c.id) {
      idCounts[c.id] = (idCounts[c.id] || 0) + 1
    }
  })

  // 2. Generate Rectangle & Text elements for each component
  components.forEach((comp: any, idx: number) => {
    if (!comp || typeof comp !== "object" || !comp.id) return
    const pos = positions[comp.id] || { x: 100, y: 100 }
    const type = String(comp.type || "").toLowerCase()

    // Find diagnostics for this component based on path prefix
    const diagnosticsForComp = diagnostics.filter((d) => {
      if (!d.path) return false
      const prefix = `system.components[${idx}]`
      return d.path === prefix || d.path.startsWith(prefix + ".")
    })

    const isDuplicate = comp.id && idCounts[comp.id] > 1
    const hasError = isDuplicate || diagnosticsForComp.some((d) => d.severity === "error")
    const hasWarning = diagnosticsForComp.some((d) => d.severity === "warning")
    const isOnPath = comp.id && nodesOnPath.has(comp.id.trim())
    
    // Determine colors matching our HUD and Excalidraw specs
    let strokeColor = '#6366f1' // Indigo
    let backgroundColor = 'rgba(99, 102, 241, 0.1)'
    let strokeWidth = 2
    if (hasError) {
      strokeColor = '#ef4444' // Error Red
      backgroundColor = 'rgba(239, 68, 68, 0.15)'
    } else if (isOnPath) {
      strokeColor = '#818cf8' // Neon Indigo/bright purple-blue for active path lineage
      backgroundColor = 'rgba(129, 140, 248, 0.25)' // Brighter neon glow
      strokeWidth = 3 // Thicker outline
    } else if (hasWarning) {
      strokeColor = '#f59e0b' // Warning Amber
      backgroundColor = 'rgba(245, 158, 11, 0.15)'
    } else {
      // Check for custom metadata color
      const customColor = comp.metadata?.color ? String(comp.metadata.color).trim().toLowerCase() : ""
      if (customColor) {
        if (COLOR_MAP[customColor]) {
          strokeColor = COLOR_MAP[customColor].stroke
          backgroundColor = COLOR_MAP[customColor].bg
        } else if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(customColor)) {
          strokeColor = customColor
          let r = 0, g = 0, b = 0
          if (customColor.length === 4) {
            r = parseInt(customColor[1] + customColor[1], 16)
            g = parseInt(customColor[2] + customColor[2], 16)
            b = parseInt(customColor[3] + customColor[3], 16)
          } else {
            r = parseInt(customColor.slice(1, 3), 16)
            g = parseInt(customColor.slice(3, 5), 16)
            b = parseInt(customColor.slice(5, 7), 16)
          }
          backgroundColor = `rgba(${r}, ${g}, ${b}, 0.1)`
        }
      } else if (type === 'stage') {
        strokeColor = '#c084fc' // Purple
        backgroundColor = 'rgba(168, 85, 247, 0.1)'
      } else if (type === 'brick') {
        strokeColor = '#34d399' // Emerald
        backgroundColor = 'rgba(52, 211, 153, 0.1)'
      } else if (type === 'gateway') {
        strokeColor = '#f59e0b' // Amber
        backgroundColor = 'rgba(245, 158, 11, 0.1)'
      }
    }

    const rectId = comp.id
    const textId = `text-${comp.id}-${idx}`
    const rectVersion = getDeterministicSeed(`${rectId}-${Math.round(pos.x)}-${Math.round(pos.y)}-${strokeColor}-${backgroundColor}`)

    // Create the container Rectangle
    elements.push({
      type: 'rectangle',
      id: rectId,
      x: pos.x,
      y: pos.y,
      width: 190,
      height: 80,
      strokeColor,
      backgroundColor,
      fillStyle: 'solid',
      strokeWidth,
      roughness: 1.2,
      roundness: { type: 3 }, // Rounded corners
      seed: getDeterministicSeed(rectId),
      version: rectVersion,
      versionNonce: rectVersion,
      isDeleted: false,
      groupIds: [],
      frameId: null,
      boundElements: [{ id: textId, type: 'text' }],
      updated: rectVersion,
      link: null,
      locked: false,
    })

    // Create the bound Label text element
    let marker = ""
    if (hasError) {
      marker = " ❌"
    } else if (hasWarning) {
      marker = " ⚠️"
    }
    const labelText = `${comp.name || comp.id}${marker}\n[${comp.type || 'Unit'}]`
    const textVersion = getDeterministicSeed(`${textId}-${labelText}-${Math.round(pos.x)}-${Math.round(pos.y)}`)
    elements.push({
      type: 'text',
      id: textId,
      containerId: rectId,
      x: pos.x + 5,
      y: pos.y + 15,
      width: 180,
      height: 50,
      text: labelText,
      fontSize: 14,
      fontFamily: 1, // Virgil
      strokeColor: '#1e1e1e', // Dark-theme inversion filter renders this near-white
      textAlign: 'center',
      verticalAlign: 'middle',
      originalText: labelText,
      autoResize: true,
      seed: getDeterministicSeed(textId),
      version: textVersion,
      versionNonce: textVersion,
      isDeleted: false,
      groupIds: [],
      frameId: null,
      boundElements: [],
      updated: textVersion,
      link: null,
      locked: false,
    })

    const strideDiags = diagnosticsForComp.filter((d) => d.code && String(d.code).startsWith("stride-"))
    if (showSecurityOverlay && strideDiags.length > 0) {
      const activeThreats = Array.from(new Set(strideDiags.map(d => {
        const code = String(d.code || "")
        if (code === "stride-spoofing") return "Spoofing"
        if (code === "stride-tampering") return "Tampering"
        if (code === "stride-repudiation") return "Repudiation"
        if (code === "stride-information-disclosure") return "Disclosure"
        if (code === "stride-elevation-of-privilege") return "Elevation"
        if (code === "stride-denial-of-service") return "DoS"
        if (code === "stride-secret-leak") return "Secret Leak"
        return ""
      }).filter(Boolean))).sort().join(", ")

      if (activeThreats) {
        const threatText = `⚠️ STRIDE: ${activeThreats}`
        const threatTextId = `threat-text-${comp.id}-${idx}`
        const threatTextVersion = getDeterministicSeed(`${threatTextId}-${threatText}-${Math.round(pos.x)}-${Math.round(pos.y)}`)

        elements.push({
          type: 'text',
          id: threatTextId,
          x: pos.x,
          y: pos.y - 20,
          width: 190,
          height: 16,
          text: threatText,
          fontSize: 11,
          fontFamily: 1, // Virgil
          strokeColor: '#f43f5e',
          textAlign: 'center',
          verticalAlign: 'middle',
          originalText: threatText,
          autoResize: true,
          seed: getDeterministicSeed(threatTextId),
          version: threatTextVersion,
          versionNonce: threatTextVersion,
          isDeleted: false,
          groupIds: [],
          frameId: null,
          boundElements: [],
          updated: threatTextVersion,
          link: null,
          locked: false,
        })

        const threatZoneId = `threat-zone-${comp.id}-${idx}`
        const threatZoneVersion = getDeterministicSeed(`${threatZoneId}-${Math.round(pos.x)}-${Math.round(pos.y)}`)
        elements.push({
          type: 'rectangle',
          id: threatZoneId,
          x: pos.x - 8,
          y: pos.y - 8,
          width: 206,
          height: 96,
          strokeColor: '#f43f5e',
          backgroundColor: 'rgba(244, 63, 94, 0.04)',
          fillStyle: 'solid',
          strokeWidth: 1.5,
          strokeStyle: 'dashed',
          roughness: 1.5,
          roundness: { type: 3 },
          seed: getDeterministicSeed(threatZoneId),
          version: threatZoneVersion,
          versionNonce: threatZoneVersion,
          isDeleted: false,
          groupIds: [],
          frameId: null,
          boundElements: [],
          updated: threatZoneVersion,
          link: null,
          locked: false,
        })
      }
    }
  })

  // 3. Generate Arrows for connections
  components.forEach((comp: any) => {
    if (!comp || typeof comp !== "object" || !comp.id || !Array.isArray(comp.connections)) return
    const posSource = positions[comp.id]
    if (!posSource) return

    comp.connections.forEach((conn: any) => {
      if (!conn || typeof conn !== "object" || !conn.target) return
      
      // Check if target is hidden in O(1) constant-time using our pre-computed Map
      const targetType = componentTypeMap.get(String(conn.target).trim())
      if (targetType && hiddenTypesSet.has(targetType)) {
        // Skip arrow completely because target is hidden
        return
      }
      
      let posTarget = positions[conn.target]
      let isOrphan = false
      if (!posTarget) {
        isOrphan = true
        posTarget = {
          x: posSource.x + 240,
          y: posSource.y + 110,
        }
        
        const dummyId = `orphan-${comp.id}-${conn.target}`
        if (!elements.some((el) => el.id === dummyId)) {
          const dummyVersion = getDeterministicSeed(`${dummyId}-${Math.round(posTarget.x)}-${Math.round(posTarget.y)}`)
          elements.push({
            type: 'ellipse',
            id: dummyId,
            x: posTarget.x,
            y: posTarget.y,
            width: 40,
            height: 40,
            strokeColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            fillStyle: 'solid',
            strokeWidth: 2,
            roughness: 1.5,
            seed: getDeterministicSeed(dummyId),
            version: dummyVersion,
            versionNonce: dummyVersion,
            isDeleted: false,
            groupIds: [],
            frameId: null,
            boundElements: [],
            updated: dummyVersion,
            link: null,
            locked: false,
          })

          const dummyTextId = `text-${dummyId}`
          const dummyTextVersion = getDeterministicSeed(`${dummyTextId}-${Math.round(posTarget.x)}-${Math.round(posTarget.y)}`)
          elements.push({
            type: 'text',
            id: dummyTextId,
            containerId: dummyId,
            x: posTarget.x - 30,
            y: posTarget.y + 45,
            width: 100,
            height: 20,
            text: `Missing: ${conn.target}`,
            fontSize: 11,
            fontFamily: 1,
            strokeColor: '#ef4444',
            textAlign: 'center',
            verticalAlign: 'middle',
            originalText: `Missing: ${conn.target}`,
            autoResize: true,
            seed: getDeterministicSeed(dummyTextId),
            version: dummyTextVersion,
            versionNonce: dummyTextVersion,
            isDeleted: false,
            groupIds: [],
            frameId: null,
            boundElements: [],
            updated: dummyTextVersion,
            link: null,
            locked: false,
          })
        }
      }

      const arrowId = `arrow-${comp.id}-${conn.target}`
      const hasLabel = conn.label && typeof conn.label === "string" && conn.label.trim() !== ""
      const labelId = `arrow-label-${comp.id}-${conn.target}`
      
      // Calculate delta offsets between center of shapes
      const sx = posSource.x + 95
      const sy = posSource.y + 40
      const tx = isOrphan ? (posTarget.x + 20) : (posTarget.x + 95)
      const ty = isOrphan ? (posTarget.y + 20) : (posTarget.y + 40)

      const dx = tx - sx
      const dy = ty - sy

      // Brick arrows are emerald, core arrows are zinc, orphan arrows are red
      const isBrickConn = String(comp.type || "").toLowerCase() === 'brick' || String(conn.target || "").toLowerCase() === 'brick'
      const isOnEdge = comp.id && conn.target && edgesOnPath.has(`${comp.id.trim()}->${conn.target.trim()}`)
      const strokeColor = isOrphan ? '#ef4444' : (isOnEdge ? '#818cf8' : (isBrickConn ? '#34d399' : '#52525b'))
      const strokeWidth = isOnEdge ? 3.5 : 1.8

      const arrowVersion = getDeterministicSeed(`${arrowId}-${Math.round(sx)}-${Math.round(sy)}-${Math.round(dx)}-${Math.round(dy)}`)

      elements.push({
        type: 'arrow',
        id: arrowId,
        x: sx,
        y: sy,
        width: Math.abs(dx),
        height: Math.abs(dy),
        points: [
          [0, 0],
          [dx, dy],
        ],
        strokeColor,
        strokeWidth,
        roughness: 1.3,
        endArrowhead: 'arrow',
        startBinding: { elementId: comp.id, fixedPoint: [0.5, 0.5] },
        endBinding: { elementId: isOrphan ? `orphan-${comp.id}-${conn.target}` : conn.target, fixedPoint: [0.5, 0.5] },
        seed: getDeterministicSeed(arrowId),
        version: arrowVersion,
        versionNonce: arrowVersion,
        isDeleted: false,
        groupIds: [],
        frameId: null,
        boundElements: hasLabel ? [{ id: labelId, type: 'text' }] : [],
        updated: arrowVersion,
        link: null,
        locked: false,
      })

      if (hasLabel) {
        const lx = sx + dx / 2 - 40
        const ly = sy + dy / 2 - 10
        const labelText = conn.label.trim()
        const labelVersion = getDeterministicSeed(`${labelId}-${labelText}-${Math.round(lx)}-${Math.round(ly)}`)

        elements.push({
          type: 'text',
          id: labelId,
          containerId: arrowId,
          x: lx,
          y: ly,
          width: 80,
          height: 20,
          text: labelText,
          fontSize: 12,
          fontFamily: 1, // Virgil
          strokeColor: '#38bdf8', // Light sky blue
          textAlign: 'center',
          verticalAlign: 'middle',
          originalText: labelText,
          autoResize: true,
          seed: getDeterministicSeed(labelId),
          version: labelVersion,
          versionNonce: labelVersion,
          isDeleted: false,
          groupIds: [],
          frameId: null,
          boundElements: [],
          updated: labelVersion,
          link: null,
          locked: false,
        })
      }
    })
  })

  // Normalize: Excalidraw 0.18 computes element bounds via Math.cos(element.angle);
  // a missing `angle` yields Math.cos(undefined) === NaN, which poisons getCommonBounds
  // and makes scrollToContent/zoom-to-fit set scrollX/scrollY/zoom to NaN (blank canvas).
  // Guarantee every element carries the baseline geometry/style fields Excalidraw expects.
  return elements.map((el) => ({
    angle: 0,
    opacity: 100,
    strokeStyle: 'solid',
    // Text glyph layout multiplies fontSize by lineHeight; if it is missing the
    // y-coordinates come out NaN and the label is silently never drawn.
    ...(el.type === 'text' ? { lineHeight: 1.25 } : {}),
    ...el,
  }))
}

export function ExcalidrawCanvas({
  parsedSpec,
  selectedUnit,
  setSelectedUnit,
  onCanvasChange,
  pathSource,
  pathTarget,
  hiddenTypes = [],
  showSecurityOverlay,
}: {
  parsedSpec?: any
  selectedUnit?: string | null
  setSelectedUnit?: (val: string | null) => void
  onCanvasChange?: (change: any[] | CanvasChange) => void
  pathSource?: string
  pathTarget?: string
  hiddenTypes?: string[]
  showSecurityOverlay?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ExcalidrawComponent, setExcalidrawComponent] = useState<React.ComponentType<any> | null>(null)
  const [WelcomeScreenComponent, setWelcomeScreenComponent] = useState<React.ComponentType<any> | null>(null)
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null)
  const [loadError, setLoadError] = useState(false)

  const handleExcalidrawRef = useCallback((api: any) => {
    setExcalidrawAPI(api)
    if (typeof window !== "undefined") {
      (window as any).excalidrawAPI = api
    }
  }, [])

  useEffect(() => {
    // Dynamically import Excalidraw only on the client
    import("@excalidraw/excalidraw")
      .then((mod: any) => {
        const Comp = mod.Excalidraw ?? mod.default
        setExcalidrawComponent(() => Comp)
        setWelcomeScreenComponent(() => mod.WelcomeScreen)
      })
      .catch(() => setLoadError(true))
  }, [])

  const elements = useMemo(() => compileSpecToExcalidrawElements(parsedSpec, pathSource, pathTarget, hiddenTypes, showSecurityOverlay), [parsedSpec, pathSource, pathTarget, hiddenTypes, showSecurityOverlay])

  // Excalidraw takes ownership of whatever elements it is handed and mutates
  // them in place as the user drags. Handing it `elements` directly meant our
  // own compile baseline moved with the gesture, so the scene and the baseline
  // were never different during a drag and the move was never detected — while
  // a spec edit, which does build fresh objects, looked like a drag. Give the
  // scene its own copies so `elements` stays a faithful record of the spec.
  const sceneElements = useMemo(
    () =>
      elements.map((el: any) => ({
        ...el,
        ...(Array.isArray(el.points) ? { points: el.points.map((p: any) => [...p]) } : {}),
      })),
    [elements]
  )

  // Staging and debouncing coordinates updates to avoid dragging lag
  const [pendingElements, setPendingElements] = useState<any[] | null>(null)

  // All scene-vs-compile tracking lives in the pure lib/canvas-diff module;
  // this ref is just its storage cell.
  const diffStateRef = useRef(createCanvasDiffState())

  // Set the moment the user acts on the canvas -- a pointer gesture Excalidraw
  // reports, or an arrow-key nudge -- and cleared once the resulting move has
  // been staged. Coordinates may only flow back into the YAML while this is
  // set: every other `onChange` is either our own `updateScene` echoing back or
  // the scene still catching up with the spec, and treating those as drags
  // overwrote whatever the user was typing.
  const gestureSeenRef = useRef(false)
  // Which compile the outstanding gesture was made against. A gesture only ever
  // speaks for the scene it happened on: once the compiler has run again, the
  // scene is the side that has to catch up, so anything still outstanding is
  // lag rather than a drag. Gestures that move nothing -- a click that only
  // selects, a draw handled by the add path -- never reach the staging branch
  // that lowers the flag, so without this they latch on and the next spec edit
  // is read as a drag: the flicker, back by way of a stray click.
  //
  // This is compared synchronously instead of being cleared in an effect
  // because Excalidraw reports scene changes from its own update lifecycle,
  // during the commit -- before any passive effect of ours could have retired
  // the flag. Lowering it on pointer release instead would be worse still: a
  // release can arrive before the final coordinates are committed, which would
  // drop real drags.
  const gestureCompileRef = useRef<any>(null)
  useEffect(() => {
    diffStateRef.current = registerCompiledElements(diffStateRef.current, elements)
  }, [elements])
  const lastSelectedUnitRef = useRef<string | null>(null)

  // Centering and selecting component on Canvas when selectedUnit changes from outside
  useEffect(() => {
    if (excalidrawAPI && selectedUnit && elements.length > 0) {
      if (lastSelectedUnitRef.current === selectedUnit) return
      lastSelectedUnitRef.current = selectedUnit

      const matchedElement = elements.find((el) => el.id === selectedUnit)
      if (matchedElement) {
        try {
          excalidrawAPI.updateScene({
            appState: {
              selectedElementIds: { [selectedUnit]: true }
            }
          })
          excalidrawAPI.scrollToContent([matchedElement], {
            fitToViewport: false,
            viewportZoomFactor: 0.9,
            animate: true
          })
        } catch (e) {
          console.error("Failed to center on selected unit: ", e)
        }
      }
    } else if (excalidrawAPI && !selectedUnit) {
      lastSelectedUnitRef.current = null
    }
  }, [excalidrawAPI, selectedUnit, elements])

  // Synchronize deleted, added, and connected IDs ref with current elements
  useEffect(() => {
    diffStateRef.current = pruneTracking(diffStateRef.current, elements)
  }, [elements])

  // Clear pending renames once they are reflected in parsedSpec
  useEffect(() => {
    diffStateRef.current = resolvePendingRename(diffStateRef.current, parsedSpec)
  }, [parsedSpec])

  useEffect(() => {
    if (!pendingElements || !onCanvasChange) return
    const timer = setTimeout(() => {
      onCanvasChange(pendingElements)
      setPendingElements(null)
    }, 450) // 450ms idle delay to confirm drag stop
    return () => clearTimeout(timer)
  }, [pendingElements, onCanvasChange])

  // Automatically scroll and fit canvas components to viewport on initial load
  const hasInitialScrolled = useRef(false)
  useEffect(() => {
    if (excalidrawAPI && elements.length > 0 && !hasInitialScrolled.current) {
      hasInitialScrolled.current = true
      const timer = setTimeout(() => {
        try {
          excalidrawAPI.scrollToContent(elements, { fitToViewport: true, viewportZoomFactor: 0.85 })
        } catch (e) {
          console.error("Failed to scroll to content: ", e)
        }
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [excalidrawAPI, elements])

  // Sync elements dynamically on the fly without remounting Excalidraw
  useEffect(() => {
    if (excalidrawAPI && elements.length > 0) {
      try {
        excalidrawAPI.updateScene({ elements: sceneElements })
      } catch (e) {
        console.error("Failed to update Excalidraw scene: ", e)
      }
    }
  }, [excalidrawAPI, sceneElements])

  if (loadError) {
    return <ExcalidrawFallback reason="load-error" />
  }

  if (!ExcalidrawComponent) {
    return <ExcalidrawSkeleton />
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 w-full h-full relative"
      // Excalidraw nudges the selection with the arrow keys and reports no
      // pointer gesture for it, so the writeback gate below would discard the
      // move and the nudge would silently fail to persist. Captured on the way
      // down, because the canvas handles the key before it can bubble.
      onKeyDownCapture={(e) => {
        if (!e.key.startsWith("Arrow")) return
        gestureSeenRef.current = true
        gestureCompileRef.current = elements
      }}
    >
      <ExcalidrawComponent
        excalidrawAPI={handleExcalidrawRef}
        theme="dark"
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
          },
        }}
        initialData={{
          elements: sceneElements,
          appState: {
            // No explicit viewBackgroundColor: the dark theme's inversion filter
            // would flip a dark value to light; the default resolves to dark.
            theme: "dark",
            currentItemStrokeColor: "#a855f7",
            currentItemFontFamily: 1, // Virgil
            gridSize: 20,
            activeTool: { type: "selection" },
          },
        }}
        onChange={(updatedElements: any, appState: any) => {
          // 1. Sync selection back to list tabs
          if (setSelectedUnit && appState?.selectedElementIds) {
            const selectedIds = Object.keys(appState.selectedElementIds).filter(
              (id) => appState.selectedElementIds[id]
            )
            if (selectedIds.length > 0) {
              const matchedId = selectedIds.find((id) =>
                parsedSpec?.system?.components?.some((c: any) => c.id === id)
              )
              if (matchedId && matchedId !== selectedUnit) {
                lastSelectedUnitRef.current = matchedId
                setSelectedUnit(matchedId)
              }
            }
          }

          // 2-4. Deletions, additions, connections, renames and coordinate
          // moves are all decided by the pure scene differ.
          if (!onCanvasChange) return

          if (
            appState?.cursorButton === "down" ||
            appState?.selectedElementsAreBeingDragged ||
            appState?.newElement ||
            appState?.resizingElement
          ) {
            gestureSeenRef.current = true
            gestureCompileRef.current = elements
          }

          const { changes, pendingElements: movedRects, nextState } = diffScene({
            updatedElements,
            compiledElements: elements,
            appState,
            parsedSpec,
            gestureSeen: gestureSeenRef.current && gestureCompileRef.current === elements,
            state: diffStateRef.current,
          })
          diffStateRef.current = nextState
          changes.forEach((change) => onCanvasChange(change))
          if (movedRects) {
            gestureSeenRef.current = false
            gestureCompileRef.current = null
            setPendingElements(movedRects)
          }
        }}
      >
        {WelcomeScreenComponent && <WelcomeScreenComponent />}
      </ExcalidrawComponent>
    </div>
  )
}

function ExcalidrawSkeleton() {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center gap-4 w-full h-full"
      role="status"
      aria-label="Loading canvas"
    >
      {/* Shimmer grid */}
      <div className="relative w-64 h-44">
        {/* Grid dots */}
        <svg
          className="absolute inset-0 w-full h-full"
          aria-hidden="true"
        >
          <defs>
            <pattern id="dots" x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.07)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)" />
        </svg>
        {/* Fake shapes */}
        <div
          className="absolute top-6 left-8 w-32 h-14 rounded-lg animate-pulse"
          style={{ background: "var(--surface-overlay)", border: "1px solid var(--border-subtle)" }}
        />
        <div
          className="absolute bottom-8 right-6 w-20 h-12 rounded-lg animate-pulse"
          style={{
            background: "var(--surface-overlay)",
            border: "1px solid var(--border-subtle)",
            animationDelay: "0.3s",
          }}
        />
        <div
          className="absolute top-16 right-10 w-12 h-12 rounded-full animate-pulse"
          style={{
            background: "var(--surface-overlay)",
            border: "1px solid var(--border-subtle)",
            animationDelay: "0.6s",
          }}
        />
        {/* Arrow */}
        <svg
          className="absolute top-12 left-36 w-16 h-8 animate-pulse"
          style={{ animationDelay: "0.9s" }}
          viewBox="0 0 64 32"
          fill="none"
          aria-hidden="true"
        >
          <path d="M0 16 H52 M44 8 L60 16 L44 24" stroke="rgba(79,142,247,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <p className="text-[12px]" style={{ color: "var(--foreground-muted)" }}>
        Loading canvas…
      </p>
    </div>
  )
}

function ExcalidrawFallback({ reason }: { reason: string }) {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center gap-3 w-full h-full"
      role="alert"
    >
      <div
        className="text-[12px] px-3 py-2 rounded"
        style={{
          background: "rgba(240,96,96,0.1)",
          border: "1px solid rgba(240,96,96,0.2)",
          color: "var(--danger)",
        }}
      >
        Canvas failed to load ({reason})
      </div>
    </div>
  )
}
