"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { EditorPanel } from "./editor-panel"
import { CanvasPanel } from "./canvas-panel"
import { WorkspaceHeader } from "./workspace-header"
import yaml from "yaml"
import { UserSession } from "./auth-panel"
import { db } from "../../lib/db"

const MIN_PANEL_WIDTH = 280
const DEFAULT_SPLIT = 42 // percent

const INITIAL_SPEC = `system:
  name: External Brain v0.2
  components:
    - id: inbox
      type: Store
      name: inbox/
      connections:
        - target: digest_stage
    
    - id: digest_stage
      type: Stage
      name: digest
      connections:
        - target: review_stage
    
    - id: review_stage
      type: Stage
      name: review
      connections:
        - target: commit_stage
    
    - id: commit_stage
      type: Stage
      name: commit
      connections:
        - target: kb_store
        
    - id: kb_store
      type: Store
      name: kb/

    # Attaching Bricks
    - id: b1_schema
      type: Brick
      name: "B1: Schema"
      connections:
        - target: digest_stage
        - target: review_stage

    - id: b2_ledger
      type: Brick
      name: "B2: Ledger"
      connections:
        - target: digest_stage
        - target: commit_stage

    - id: b4_context
      type: Brick
      name: "B4: Context"
      connections:
        - target: digest_stage

    - id: b5_prompt
      type: Brick
      name: "B5: Prompt"
      connections:
        - target: digest_stage
        - target: review_stage

    - id: b6_verify
      type: Brick
      name: "B6: Verify"
      connections:
        - target: review_stage
        - target: commit_stage

    - id: b7_consolidate
      type: Brick
      name: "B7: Consolidate"
      connections:
        - target: commit_stage
        - target: inbox`

export function WorkspaceLayout() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [splitPercent, setSplitPercent] = useState(DEFAULT_SPLIT)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartX = useRef(0)
  const dragStartSplit = useRef(DEFAULT_SPLIT)

  // Shared application states
  const [specText, setSpecText] = useState(INITIAL_SPEC)
  const [parsedSpec, setParsedSpec] = useState<any>(null)
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null)

  // User Session & DB storage states
  const [session, setSession] = useState<UserSession>({ user: null })
  const [isHydrated, setIsHydrated] = useState(false)

  // Load custom saved spec when user signs in
  useEffect(() => {
    if (session.user) {
      const savedDoc = db.getSpec("main")
      if (savedDoc && savedDoc.yamlContent) {
        setSpecText(savedDoc.yamlContent)
      }
      setIsHydrated(true)
    } else {
      setIsHydrated(false)
    }
  }, [session])

  // Save current spec to DB on modification (if signed in and hydrated)
  useEffect(() => {
    if (session.user && specText && isHydrated) {
      db.saveSpec("main", "External Brain v0.2", specText)
    }
  }, [specText, session, isHydrated])

  const handleLogin = useCallback((email: string, name: string) => {
    setSession({ user: { email, name } })
  }, [])

  const handleLogout = useCallback(() => {
    setSession({ user: null })
  }, [])

  // Sync canvas position edits back into YAML spec
  const handleCanvasChange = useCallback((updatedComponents: any[]) => {
    try {
      const parsed = yaml.parse(specText)
      if (parsed && parsed.system && parsed.system.components) {
        let changed = false
        const updatedList = parsed.system.components.map((c: any) => {
          const match = updatedComponents.find((uc: any) => uc.id === c.id)
          if (match) {
            const roundedX = Math.round(match.x)
            const roundedY = Math.round(match.y)
            if (c.x !== roundedX || c.y !== roundedY) {
              changed = true
              return {
                ...c,
                x: roundedX,
                y: roundedY,
              }
            }
          }
          return c
        })
        if (changed) {
          parsed.system.components = updatedList
          const newYaml = yaml.stringify(parsed)
          setSpecText(newYaml)
        }
      }
    } catch (e) {
      console.error("Failed to sync canvas changes to YAML: ", e)
    }
  }, [specText])

  // Dynamically parse the YAML as user types
  useEffect(() => {
    try {
      const parsed = yaml.parse(specText)
      if (parsed && typeof parsed === "object") {
        setParsedSpec(parsed)
      }
    } catch (e) {
      // Ignore invalid parse on typos, keep last valid parse
    }
  }, [specText])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragStartX.current = e.clientX
    dragStartSplit.current = splitPercent
  }, [splitPercent])

  useEffect(() => {
    if (!isDragging) return

    const onMouseMove = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return
      const totalWidth = container.getBoundingClientRect().width
      const delta = e.clientX - dragStartX.current
      const deltaPct = (delta / totalWidth) * 100
      const next = Math.min(
        Math.max(
          dragStartSplit.current + deltaPct,
          (MIN_PANEL_WIDTH / totalWidth) * 100
        ),
        100 - (MIN_PANEL_WIDTH / totalWidth) * 100
      )
      setSplitPercent(next)
    }

    const onMouseUp = () => setIsDragging(false)

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [isDragging])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <WorkspaceHeader
        session={session}
        onLogin={handleLogin}
        onLogout={handleLogout}
      />

      {/* Split pane body */}
      <div
        ref={containerRef}
        className="flex flex-1 min-h-0 overflow-hidden"
        style={{ cursor: isDragging ? "col-resize" : "auto" }}
      >
        {/* Left — editor */}
        <div
          style={{ width: `${splitPercent}%`, minWidth: MIN_PANEL_WIDTH }}
          className="flex flex-col min-w-0 overflow-hidden"
        >
          <EditorPanel
            specText={specText}
            setSpecText={setSpecText}
            parsedSpec={parsedSpec}
            selectedUnit={selectedUnit}
            setSelectedUnit={setSelectedUnit}
          />
        </div>

        {/* Drag handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
          onMouseDown={onMouseDown}
          className="relative flex items-center justify-center w-[5px] shrink-0 group cursor-col-resize select-none z-10"
          style={{ background: "var(--border)" }}
        >
          {/* Visual track + dots */}
          <div
            className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px transition-colors duration-150"
            style={{
              background: isDragging
                ? "var(--accent)"
                : "var(--border-subtle)",
            }}
          />
          <div
            className="relative flex flex-col gap-[3px] z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            aria-hidden="true"
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className="block w-[3px] h-[3px] rounded-full"
                style={{
                  background: isDragging
                    ? "var(--accent)"
                    : "var(--foreground-muted)",
                }}
              />
            ))}
          </div>
        </div>

        {/* Right — canvas */}
        <div
          style={{ width: `${100 - splitPercent}%`, minWidth: MIN_PANEL_WIDTH }}
          className="flex flex-col min-w-0 overflow-hidden"
        >
          <CanvasPanel
            parsedSpec={parsedSpec}
            selectedUnit={selectedUnit}
            setSelectedUnit={setSelectedUnit}
            onCanvasChange={handleCanvasChange}
          />
        </div>
      </div>

      {/* Status bar */}
      <StatusBar />
    </div>
  )
}

function StatusBar() {
  return (
    <footer
      className="flex items-center justify-between px-4 h-6 shrink-0 text-[11px] select-none"
      style={{
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        color: "var(--foreground-muted)",
      }}
    >
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--success)" }}
          />
          Ready
        </span>
        <span style={{ color: "var(--foreground-dim)" }}>|</span>
        <span>main.spec.yaml</span>
      </div>
      <div className="flex items-center gap-4">
        <span>UTF-8</span>
        <span style={{ color: "var(--foreground-dim)" }}>|</span>
        <span>YAML</span>
        <span style={{ color: "var(--foreground-dim)" }}>|</span>
        <span>Ln 1, Col 1</span>
      </div>
    </footer>
  )
}
