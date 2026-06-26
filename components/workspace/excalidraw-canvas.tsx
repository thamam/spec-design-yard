"use client"

import { useEffect, useRef, useState, useMemo } from "react"

const getDeterministicSeed = (id: string) => {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return (Math.abs(hash) % 100000) + 1
}

export function compileSpecToExcalidrawElements(parsedSpec: any): any[] {
  if (!parsedSpec?.system?.components || !Array.isArray(parsedSpec.system.components)) return []
  const elements: any[] = []
  const components = parsedSpec.system.components

  // Layout positions registry
  const positions: Record<string, { x: number; y: number }> = {}

  // 1. Assign positions to nodes based on logical layout rules
  let coreIdx = 0
  let brickIdx = 0

  components.forEach((comp: any) => {
    if (!comp || typeof comp !== "object" || !comp.id) return
    if (typeof comp.x === 'number' && typeof comp.y === 'number') {
      positions[comp.id] = {
        x: comp.x,
        y: comp.y,
      }
    } else {
      const type = String(comp.type || "").toLowerCase()
      
      if (type === 'brick') {
        // Lay out bricks in a row below the core loop
        positions[comp.id] = {
          x: 100 + brickIdx * 260,
          y: 380,
        }
        brickIdx++
      } else {
        // Lay out core stages and stores in a horizontal sequence
        positions[comp.id] = {
          x: 60 + coreIdx * 250,
          y: 160,
        }
        coreIdx++
      }
    }
  })

  // 2. Generate Rectangle & Text elements for each component
  components.forEach((comp: any) => {
    if (!comp || typeof comp !== "object" || !comp.id) return
    const pos = positions[comp.id] || { x: 100, y: 100 }
    const type = String(comp.type || "").toLowerCase()
    
    // Determine colors matching our HUD and Excalidraw specs
    let strokeColor = '#6366f1' // Indigo
    let backgroundColor = 'rgba(99, 102, 241, 0.1)'
    if (type === 'stage') {
      strokeColor = '#c084fc' // Purple
      backgroundColor = 'rgba(168, 85, 247, 0.1)'
    } else if (type === 'brick') {
      strokeColor = '#34d399' // Emerald
      backgroundColor = 'rgba(52, 211, 153, 0.1)'
    } else if (type === 'gateway') {
      strokeColor = '#f59e0b' // Amber
      backgroundColor = 'rgba(245, 158, 11, 0.1)'
    }

    const rectId = comp.id
    const textId = `text-${comp.id}`

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
      strokeWidth: 2,
      roughness: 1.2,
      roundness: { type: 3 }, // Rounded corners
      seed: getDeterministicSeed(rectId),
      version: 1,
      versionNonce: getDeterministicSeed(`${rectId}-rect-nonce`),
      isDeleted: false,
      groupIds: [],
      frameId: null,
      boundElements: [{ id: textId, type: 'text' }],
      updated: Date.now(),
      link: null,
      locked: false,
    })

    // Create the bound Label text element
    const labelText = `${comp.name || comp.id}\n[${comp.type || 'Unit'}]`
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
      strokeColor: '#f4f4f5', // High contrast white
      textAlign: 'center',
      verticalAlign: 'middle',
      originalText: labelText,
      autoResize: true,
      seed: getDeterministicSeed(textId),
      version: 1,
      versionNonce: getDeterministicSeed(`${textId}-text-nonce`),
      isDeleted: false,
      groupIds: [],
      frameId: null,
      boundElements: [],
      updated: Date.now(),
      link: null,
      locked: false,
    })
  })

  // 3. Generate Arrows for connections
  components.forEach((comp: any) => {
    if (!comp || typeof comp !== "object" || !comp.id || !comp.connections) return
    const posSource = positions[comp.id]
    if (!posSource) return

    comp.connections.forEach((conn: any) => {
      if (!conn || typeof conn !== "object" || !conn.target) return
      const posTarget = positions[conn.target]
      if (!posTarget) return

      const arrowId = `arrow-${comp.id}-${conn.target}`
      
      // Calculate delta offsets between center of shapes
      const sx = posSource.x + 95
      const sy = posSource.y + 40
      const tx = posTarget.x + 95
      const ty = posTarget.y + 40

      const dx = tx - sx
      const dy = ty - sy

      // Brick arrows are emerald, core arrows are zinc
      const isBrickConn = String(comp.type || "").toLowerCase() === 'brick' || String(conn.target || "").toLowerCase() === 'brick'
      const strokeColor = isBrickConn ? '#34d399' : '#52525b'

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
        strokeWidth: 1.8,
        roughness: 1.3,
        endArrowhead: 'arrow',
        startBinding: { elementId: comp.id, fixedPoint: [0.5, 0.5] },
        endBinding: { elementId: conn.target, fixedPoint: [0.5, 0.5] },
        seed: getDeterministicSeed(arrowId),
        version: 1,
        versionNonce: getDeterministicSeed(`${arrowId}-arrow-nonce`),
        isDeleted: false,
        groupIds: [],
        frameId: null,
        boundElements: [],
        updated: Date.now(),
        link: null,
        locked: false,
      })
    })
  })

  return elements
}

export function ExcalidrawCanvas({
  parsedSpec,
  selectedUnit,
  setSelectedUnit,
  onCanvasChange,
}: {
  parsedSpec?: any
  selectedUnit?: string | null
  setSelectedUnit?: (val: string | null) => void
  onCanvasChange?: (updated: any[]) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ExcalidrawComponent, setExcalidrawComponent] = useState<React.ComponentType<any> | null>(null)
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    // Dynamically import Excalidraw only on the client
    import("@excalidraw/excalidraw")
      .then((mod: any) => {
        const Comp = mod.Excalidraw ?? mod.default
        setExcalidrawComponent(() => Comp)
      })
      .catch(() => setLoadError(true))
  }, [])

  const elements = useMemo(() => compileSpecToExcalidrawElements(parsedSpec), [parsedSpec])

  // Staging and debouncing coordinates updates to avoid dragging lag
  const [pendingElements, setPendingElements] = useState<any[] | null>(null)

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
        excalidrawAPI.updateScene({ elements })
      } catch (e) {
        console.error("Failed to update Excalidraw scene: ", e)
      }
    }
  }, [excalidrawAPI, elements])

  if (loadError) {
    return <ExcalidrawFallback reason="load-error" />
  }

  if (!ExcalidrawComponent) {
    return <ExcalidrawSkeleton />
  }

  return (
    <div ref={containerRef} className="flex-1 min-h-0 w-full h-full relative">
      <ExcalidrawComponent
        excalidrawRef={(api: any) => {
          setExcalidrawAPI(api)
          if (typeof window !== "undefined") {
            (window as any).excalidrawAPI = api
          }
        }}
        theme="dark"
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
          },
        }}
        initialData={{
          elements,
          appState: {
            viewBackgroundColor: "#0a0a0c",
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
              if (matchedId) {
                setSelectedUnit(matchedId)
              }
            }
          }

          // 2. Sync coordinate changes back to editor spec
          if (onCanvasChange && updatedElements && updatedElements.length > 0) {
            const rects = updatedElements.filter((el: any) => el.type === 'rectangle' && !el.isDeleted)
            if (rects.length > 0) {
              const hasChanged = rects.some((r: any) => {
                const current = elements.find((el: any) => el.id === r.id)
                return current && (Math.round(current.x) !== Math.round(r.x) || Math.round(current.y) !== Math.round(r.y))
              })
              if (hasChanged) {
                setPendingElements(rects)
              }
            }
          }
        }}
      />
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
