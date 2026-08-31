"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { EditorPanel } from "./editor-panel"
import { CanvasPanel } from "./canvas-panel"
import { WorkspaceHeader } from "./workspace-header"
import { db, type SyncState } from "../../lib/db"
import { reconcileSpec } from "../../lib/reconciler"
import { useUndoRedo } from "./use-undo-redo"
import { lintSpec, droppedConnectionDiagnostics } from "../../lib/linter"
import { parseSpec, type DroppedConnection } from "../../lib/spec-model"

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

// What a file-backed project opens with when its repo has no spec yet. The
// demo above is standalone-only: it must never be written into a client repo
// uninvited, so fresh projects get this labeled skeleton instead — and it is
// not autosaved until the user actually edits it.
const FRESH_PROJECT_SPEC = `# New project — this spec is saved to main.spec.yaml on your first edit.
system:
  name: New System
  components: []
`

// First run, before any folder is picked: same calm slate, but it must not
// promise a file it has no folder to write to yet.
const UNCONFIGURED_SPEC = `# Pick a project folder above to start saving this spec to a file.
system:
  name: New System
  components: []
`

export function WorkspaceLayout() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [splitPercent, setSplitPercent] = useState(DEFAULT_SPLIT)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartX = useRef(0)
  const dragStartSplit = useRef(DEFAULT_SPLIT)

  // Shared application states
  const {
    specText,
    updateSpecText: setSpecText,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory,
  } = useUndoRedo(INITIAL_SPEC)

  // The canvas hands its zoomToFit() up here by prop (not through
  // window.excalidrawAPI) so the global shortcut and the canvas controls all
  // call one implementation. It is null whenever no canvas is mounted.
  const zoomToFitRef = useRef<(() => void) | null>(null)
  const registerZoomToFit = useCallback((fit: (() => void) | null) => {
    zoomToFitRef.current = fit
  }, [])

  // Zoom to fit — Shift+1 — on its own listener, in the CAPTURE phase.
  // Excalidraw binds Shift+1 to its own zoomToFit action and handles it after
  // the target, so a bubble-phase listener loses the race whenever focus is
  // inside the canvas: Excalidraw fits with its own options instead of the
  // shared implementation, exactly when the shortcut matters most. Claiming
  // the key on the way down, then stopping it, keeps all three routes on one
  // fit and stops Excalidraw's action double-applying.
  //
  // Split out of the undo/redo handler below rather than folded into it: that
  // one deliberately runs in the bubble phase and passes Shift+1 through to
  // the spec textarea, where "!" is a legal YAML character.
  useEffect(() => {
    const handleZoomShortcut = (e: KeyboardEvent) => {
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.code !== "Digit1") return
      const target = e.target as HTMLElement
      // Typing "!" into any field — the spec textarea included — must never
      // yank the canvas, so the shortcut yields rather than preventing.
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return
      e.preventDefault()
      e.stopPropagation()
      zoomToFitRef.current?.()
    }
    window.addEventListener("keydown", handleZoomShortcut, true)
    return () => window.removeEventListener("keydown", handleZoomShortcut, true)
  }, [])

  // Sync keyboard shortcuts and track user keystroke grouping
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInputOrTextarea = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      const isSpecTextarea = target && target.getAttribute("data-focus-field") === "spec-textarea"

      if (isInputOrTextarea && !isSpecTextarea) {
        return
      }

      const isCmdOrCtrl = e.metaKey || e.ctrlKey
      if (isCmdOrCtrl) {
        if (e.key.toLowerCase() === "z") {
          e.preventDefault()
          if (e.shiftKey) {
            redo()
          } else {
            undo()
          }
        } else if (e.key.toLowerCase() === "y") {
          e.preventDefault()
          redo()
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [undo, redo])

  const [parsedSpec, setParsedSpec] = useState<any>(null)
  const [droppedConnections, setDroppedConnections] = useState<DroppedConnection[]>([])
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"code" | "tree" | "focus" | "metrics" | "security">("code")
  const [pathSource, setPathSource] = useState<string>("")
  const [pathTarget, setPathTarget] = useState<string>("")

  const [isHydrated, setIsHydrated] = useState(false)

  // Where saves are going (browser vs project file vs halted) — surfaced in
  // the status bar so a mirroring latch-off is never console-only.
  const [syncState, setSyncState] = useState<SyncState>(() => db.getSyncState())
  useEffect(() => db.subscribeSyncState(setSyncState), [])

  const lastLoadedSpecRef = useRef<string | null>(null)

  // Bumped once per spec/project LOAD, never per edit. The canvas uses it to
  // decide when a fresh zoom-to-fit is owed: hydration replaces the spec after
  // the canvas has already mounted and fitted the pre-hydration template, so
  // without this the user is left looking at the wrong framing.
  const [loadedSpecId, setLoadedSpecId] = useState(0)

  // Hydrate the saved spec on mount. When the app runs against a project dir
  // (SPEC_YARD_PROJECT_DIR), the repo file is canonical: pull server state
  // into the store first so a stale localStorage cache never wins, and only
  // then arm autosave (isHydrated) so cache can't be pushed over the file.
  useEffect(() => {
    let cancelled = false
    const hydrate = async () => {
      // true = file mode is on (a project dir is being mirrored to).
      const fileMode = await db.loadFromServer()
      if (cancelled) return
      const savedDoc = db.getSpec("main")
      // No spec anywhere. A file-backed project opens blank (the demo must
      // never leak into a client repo), and so does a first run — opening a
      // 59-diagnostic demo behind the "choose your project" prompt reads as
      // noise, not as a welcome. Only a deliberate browser-storage opt-out
      // keeps the demo, as something to play with.
      const unconfigured = db.getSyncState().status === "unconfigured"
      const loaded =
        savedDoc && savedDoc.yamlContent
          ? savedDoc.yamlContent
          : fileMode
          ? FRESH_PROJECT_SPEC
          : unconfigured
          ? UNCONFIGURED_SPEC
          : INITIAL_SPEC
      lastLoadedSpecRef.current = loaded
      resetHistory(loaded)
      setLoadedSpecId((n) => n + 1)
      setIsHydrated(true)
    }
    hydrate()
    return () => {
      cancelled = true
    }
  }, [resetHistory])

  // Until hydration resolves, NO mutation path may touch the spec — an early
  // edit would fork from the built-in template and then be autosaved over the
  // canonical project file. The textarea is disabled in the UI; every other
  // path (canvas edits, quick-fixes, renames) is gated here at the source.
  const guardedSetSpecText = useCallback((
    val: string | ((prev: string) => string),
    options?: { isTyping?: boolean; immediate?: boolean }
  ) => {
    if (!isHydrated) return
    setSpecText(val, options)
  }, [isHydrated, setSpecText])

  // Save current spec to DB on modification (once hydrated) with debouncing to prevent lagging synchronous LocalStorage writes
  useEffect(() => {
    if (specText && isHydrated) {
      if (specText === lastLoadedSpecRef.current) {
        return
      }

      const timer = setTimeout(() => {
        const { spec } = parseSpec(specText)
        const systemName = spec?.system?.name
        const title =
          typeof systemName === "string" && systemName.trim() !== ""
            ? systemName.trim()
            : db.getSpec("main")?.title || "Untitled Spec"
        db.saveSpec("main", title, specText)
        lastLoadedSpecRef.current = specText
      }, 1000)

      return () => clearTimeout(timer)
    }
  }, [specText, isHydrated])

  // Sync canvas position edits, deletions, and renames back into YAML spec
  const handleCanvasChange = useCallback((change: any[] | { type: string; payload: any }) => {
    if (!isHydrated) return
    if (Array.isArray(change)) {
      const updated = reconcileSpec(specText, { type: "coords", payload: change })
      if (updated !== specText) {
        setSpecText(updated, { immediate: true })
      }
    } else if (change && typeof change === "object" && change.type) {
      const updated = reconcileSpec(specText, { type: change.type as any, payload: change.payload })
      if (updated !== specText) {
        setSpecText(updated, { immediate: true })
      }
    }
  }, [isHydrated, specText, setSpecText])

  // Dynamically parse the YAML as user types
  useEffect(() => {
    // Ignore invalid parse on typos, keep last valid parse
    const { spec, droppedConnections: dropped } = parseSpec(specText)
    setDroppedConnections(dropped)
    if (spec) {
      setParsedSpec(spec)
    }
  }, [specText])

  const diagnostics = useMemo(() => {
    return [...lintSpec(parsedSpec), ...droppedConnectionDiagnostics(droppedConnections)]
  }, [parsedSpec, droppedConnections])

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
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
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
            setSpecText={guardedSetSpecText}
            parsedSpec={parsedSpec}
            selectedUnit={selectedUnit}
            setSelectedUnit={setSelectedUnit}
            pathSource={pathSource}
            setPathSource={setPathSource}
            pathTarget={pathTarget}
            setPathTarget={setPathTarget}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isHydrated={isHydrated}
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
            onZoomToFitReady={registerZoomToFit}
            specIdentity={`spec-${loadedSpecId}`}
            parsedSpec={parsedSpec}
            selectedUnit={selectedUnit}
            setSelectedUnit={setSelectedUnit}
            onCanvasChange={handleCanvasChange}
            pathSource={pathSource}
            pathTarget={pathTarget}
            setActiveTab={setActiveTab}
            diagnostics={diagnostics}
            activeTab={activeTab}
          />
        </div>
      </div>

      {/* Status bar */}
      <StatusBar syncState={syncState} />
    </div>
  )
}

function StatusBar({ syncState }: { syncState: SyncState }) {
  const halted = syncState.status === "halted"
  const label =
    syncState.status === "synced"
      ? "Synced to project"
      : halted
      ? syncState.reason || "Saving halted — reload the workspace"
      : syncState.status === "unconfigured"
      ? "No project chosen — pick a folder to save to files"
      : "Browser storage only"
  return (
    <footer
      className="flex items-center justify-between px-4 h-6 shrink-0 text-[11px] select-none"
      style={{
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        color: "var(--foreground-muted)",
      }}
    >
      <div className="flex items-center gap-4 min-w-0">
        <span className="flex items-center gap-1.5 min-w-0" data-testid="sync-status">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
            style={{
              background: halted
                ? "var(--warning, #eab308)"
                : syncState.status === "synced"
                ? "var(--success)"
                : "var(--foreground-muted)",
            }}
          />
          <span
            className="truncate"
            style={halted ? { color: "var(--warning, #eab308)", fontWeight: 600 } : undefined}
          >
            {label}
          </span>
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
