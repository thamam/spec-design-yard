"use client"

import dynamic from "next/dynamic"
import {
  EyeIcon,
  GridIcon,
  LayersIcon,
  MaximizeIcon,
  MinimizeIcon,
  MousePointerIcon,
  RefreshCwIcon,
  SparklesIcon,
  Copy,
  Trash2,
} from "lucide-react"
import { useState, useMemo } from "react"
import { CanvasChange, autoLayoutDiagram } from "../../lib/reconciler"
import { Diagnostic } from "../../lib/linter"

/* Client-only Excalidraw */
const ExcalidrawCanvas = dynamic(
  () => import("./excalidraw-canvas").then((m) => m.ExcalidrawCanvas),
  {
    ssr: false,
    loading: () => <CanvasSkeleton />,
  }
)

function CanvasSkeleton() {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center gap-4"
      role="status"
      aria-label="Loading canvas"
    >
      {/* Dot-grid background */}
      <svg className="absolute inset-0 w-full h-full opacity-30 pointer-events-none" aria-hidden="true">
        <defs>
          <pattern id="grid-dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill="rgba(255,255,255,0.12)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-dots)" />
      </svg>

      {/* Shimmer shapes */}
      <div className="relative w-72 h-52 z-10">
        <div className="absolute top-4 left-6 w-36 h-16 rounded-xl animate-pulse" style={{ background: "var(--surface-overlay)", border: "1px solid var(--border-subtle)" }} />
        <div className="absolute bottom-6 right-4 w-24 h-14 rounded-xl animate-pulse" style={{ background: "var(--surface-overlay)", border: "1px solid var(--border-subtle)", animationDelay: "0.25s" }} />
        <div className="absolute top-20 right-14 w-14 h-14 rounded-full animate-pulse" style={{ background: "var(--surface-overlay)", border: "1px solid var(--border-subtle)", animationDelay: "0.5s" }} />
        <svg className="absolute top-12 left-40 animate-pulse" style={{ animationDelay: "0.75s" }} width="56" height="28" viewBox="0 0 56 28" fill="none" aria-hidden="true">
          <path d="M0 14 H44 M36 6 L52 14 L36 22" stroke="rgba(79,142,247,0.35)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="text-[12px] z-10" style={{ color: "var(--foreground-muted)" }}>Loading canvas…</p>
    </div>
  )
}

type CanvasView = "diagram" | "grid" | "layers"

const CANVAS_VIEWS: { id: CanvasView; icon: React.ReactNode; label: string }[] = [
  { id: "diagram", icon: <MousePointerIcon size={12} />, label: "Diagram" },
  { id: "grid",    icon: <GridIcon size={12} />,          label: "Grid"    },
  { id: "layers",  icon: <LayersIcon size={12} />,        label: "Layers"  },
]

const FIXABLE_DIAGNOSTIC_CODES = new Set([
  "missing-system-name",
  "empty-system-name",
  "missing-component-id",
  "missing-component-type",
  "invalid-metadata-object",
  "invalid-connections-array",
  "invalid-connection-object",
  "unrecognized-metadata-key",
  "unrecognized-component-key",
  "unrecognized-system-key",
  "unrecognized-connection-key",
  "connection-case-mismatch",
  "invalid-metadata-status",
  "component-overlap",
  "missing-metadata-description",
  "missing-metadata-owner",
  "invalid-metadata-version",
  "unrecognized-type",
  "self-connection",
  "empty-connection-target",
  "duplicate-connection",
  "invalid-id-format",
  "duplicate-id",
  "orphan-connection",
  "disconnected-component",
  "unreachable-component",
  "gateway-to-store",
  "store-to-store",
  "sink-stage-brick",
  "empty-gateway",
  "circular-dependency",
  "invalid-metadata-color",
  "invalid-connection-label",
  "unused-store",
  "missing-system-metadata",
  "invalid-system-metadata-object",
  "invalid-system-metadata-status",
  "invalid-system-metadata-version",
  "placeholder-system-metadata-description",
  "missing-system-metadata-description",
  "placeholder-system-metadata-owner",
  "missing-system-metadata-owner",
  "unrecognized-system-metadata-key",
  "missing-connection-label",
  "duplicate-connection-label"
])

export function CanvasPanel({
  parsedSpec,
  selectedUnit,
  setSelectedUnit,
  onCanvasChange,
  pathSource,
  pathTarget,
  setActiveTab,
  diagnostics = [],
}: {
  parsedSpec?: any
  selectedUnit?: string | null
  setSelectedUnit?: (val: string | null) => void
  onCanvasChange?: (change: any[] | CanvasChange) => void
  pathSource?: string
  pathTarget?: string
  setActiveTab?: (tab: "code" | "tree" | "focus" | "metrics") => void
  diagnostics?: Diagnostic[]
}) {
  const [view, setView] = useState<CanvasView>("diagram")
  const [fullscreen, setFullscreen] = useState(false)
  const [hiddenTypes, setHiddenTypes] = useState<string[]>([])

  const handleAutoLayout = () => {
    if (!onCanvasChange || !parsedSpec) return
    const payload = autoLayoutDiagram(parsedSpec)
    if (payload.length > 0) {
      onCanvasChange({
        type: "coords",
        payload,
      })
    }
  }

  const systemName = parsedSpec?.system?.name || "External Brain"

  return (
    <section
      data-testid="canvas-panel"
      className="flex flex-col h-full relative"
      style={{ background: "var(--background)" }}
      aria-label="Visual canvas"
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between shrink-0 px-2"
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          height: 36,
        }}
      >
        {/* View switcher */}
        <div className="flex items-center gap-0.5" role="tablist" aria-label="Canvas views">
          {CANVAS_VIEWS.map((v) => {
            const isActive = view === v.id
            return (
              <button
                key={v.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setView(v.id)}
                className="relative flex items-center gap-1.5 px-3 h-9 text-[12px] font-medium transition-colors duration-100 select-none"
                style={{
                  color: isActive ? "var(--foreground)" : "var(--foreground-muted)",
                  background: isActive ? "var(--surface-elevated)" : "transparent",
                  borderRadius: "4px 4px 0 0",
                }}
              >
                <span style={{ color: isActive ? "var(--accent)" : "var(--foreground-muted)" }}>
                  {v.icon}
                </span>
                {v.label}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t"
                    style={{ background: "var(--accent)" }}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Canvas actions */}
        <div className="flex items-center gap-1">
          <CanvasToolButton icon={<EyeIcon size={12} />} label="Preview" onClick={() => {}} />
          <CanvasToolButton
            icon={<RefreshCwIcon size={12} />}
            label="Reset view"
            onClick={() => {
              if (typeof window !== "undefined" && (window as any).excalidrawAPI) {
                try {
                  const api = (window as any).excalidrawAPI
                  const els = api.getSceneElements()
                  api.scrollToContent(els, { fitToViewport: true, viewportZoomFactor: 0.85 })
                } catch (err) {
                  console.error("Failed to reset view:", err)
                }
              }
            }}
          />
          <CanvasToolButton
            icon={<SparklesIcon size={12} />}
            label="Re-layout Diagram"
            onClick={handleAutoLayout}
          />
          <CanvasToolButton
            icon={fullscreen ? <MinimizeIcon size={12} /> : <MaximizeIcon size={12} />}
            label={fullscreen ? "Minimize" : "Fullscreen"}
            onClick={() => setFullscreen((f) => !f)}
            active={fullscreen}
          />
        </div>
      </div>

      {/* Canvas breadcrumb */}
      <div
        className="flex items-center gap-2 px-3 h-7 shrink-0 text-[11px] select-none"
        style={{
          background: "var(--background)",
          borderBottom: "1px solid var(--border)",
          color: "var(--foreground-muted)",
        }}
      >
        <span
          className="w-2 h-2 rounded-sm shrink-0"
          style={{ background: "var(--accent)", opacity: 0.7 }}
          aria-hidden="true"
        />
        <span>{systemName}</span>
        <span style={{ color: "var(--foreground-dim)" }}>/</span>
        <span style={{ color: "var(--foreground)" }}>Architecture Diagram</span>
        <span
          className="ml-auto px-1.5 py-0.5 rounded text-[10px]"
          style={{ background: "var(--surface-overlay)", color: "var(--foreground-muted)" }}
        >
          Excalidraw
        </span>
      </div>

      {/* Canvas content */}
      <div className="flex flex-col flex-1 min-h-0 relative overflow-hidden">
        {view === "diagram" && (
          <ExcalidrawCanvas
            parsedSpec={parsedSpec}
            selectedUnit={selectedUnit}
            setSelectedUnit={setSelectedUnit}
            onCanvasChange={onCanvasChange}
            pathSource={pathSource}
            pathTarget={pathTarget}
            hiddenTypes={hiddenTypes}
          />
        )}
        {view === "grid" && (
          <GridView
            parsedSpec={parsedSpec}
            selectedUnit={selectedUnit}
            setSelectedUnit={setSelectedUnit}
            setActiveTab={setActiveTab}
            diagnostics={diagnostics}
            onCanvasChange={onCanvasChange}
            hiddenTypes={hiddenTypes}
          />
        )}
        {view === "layers" && (
          <LayersView
            parsedSpec={parsedSpec}
            hiddenTypes={hiddenTypes}
            setHiddenTypes={setHiddenTypes}
          />
        )}
      </div>
    </section>
  )
}

interface GridViewProps {
  parsedSpec: any
  selectedUnit?: string | null
  setSelectedUnit?: (val: string | null) => void
  setActiveTab?: (tab: "code" | "tree" | "focus" | "metrics") => void
  diagnostics?: Diagnostic[]
  onCanvasChange?: (change: any[] | CanvasChange) => void
  hiddenTypes?: string[]
}

/* ── Grid view ── */
function GridView({
  parsedSpec,
  selectedUnit,
  setSelectedUnit,
  setActiveTab,
  diagnostics = [],
  onCanvasChange,
  hiddenTypes = [],
}: GridViewProps) {
  const components = parsedSpec?.system?.components || []
  const hiddenTypesSet = useMemo(() => new Set((hiddenTypes || []).map(t => String(t).toLowerCase())), [hiddenTypes])

  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [issueFilter, setIssueFilter] = useState("all")
  const [sortBy, setSortBy] = useState("id-asc")

  // State for inline renaming in GridView
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [newIdVal, setNewIdVal] = useState("")
  const [renamingError, setRenamingError] = useState<string | null>(null)

  const handleStartRename = (id: string) => {
    setRenamingId(id)
    setNewIdVal(id)
    setRenamingError(null)
  }

  const handleCommitRename = (oldId: string) => {
    const cleaned = newIdVal.trim()
    if (cleaned === oldId) {
      handleCancelRename()
      return
    }
    if (cleaned === "") {
      setRenamingError("ID cannot be empty.")
      return
    }
    if (!/^[a-zA-Z0-9_\-]+$/.test(cleaned)) {
      setRenamingError("ID must be alphanumeric, hyphen, or underscore.")
      return
    }
    const idExists = components.some((comp: any) => comp && comp.id && String(comp.id).toLowerCase() === cleaned.toLowerCase() && String(comp.id) !== oldId)
    if (idExists) {
      setRenamingError(`Component ID "${cleaned}" already exists.`)
      return
    }

    if (onCanvasChange) {
      onCanvasChange({
        type: "rename-id",
        payload: { id: oldId, newId: cleaned }
      })
      if (selectedUnit === oldId && setSelectedUnit) {
        setSelectedUnit(cleaned)
      }
    }
    setRenamingId(null)
    setRenamingError(null)
  }

  const handleCancelRename = () => {
    setRenamingId(null)
    setRenamingError(null)
  }

  // Pre-group diagnostics by component index in O(D) time
  const diagnosticsByComponent = useMemo(() => {
    const map = new Map<number, Diagnostic[]>()
    diagnostics.forEach((d) => {
      if (!d.path) return
      const match = d.path.match(/^system\.components\[(\d+)\](?:\.|$)/)
      if (match) {
        const idx = parseInt(match[1], 10)
        if (!map.has(idx)) map.set(idx, [])
        map.get(idx)!.push(d)
      }
    })
    return map
  }, [diagnostics])

  const cards = useMemo(() => {
    return components.map((comp: any, idx: number) => {
      const type = String(comp.type || "").toLowerCase()
      let color = "#6366f1" // Store/default: Indigo
      if (type === "stage") color = "#c084fc" // Stage: Purple
      else if (type === "brick") color = "#34d399" // Brick: Emerald
      else if (type === "gateway") color = "#f59e0b" // Gateway: Amber

      const compDiags = diagnosticsByComponent.get(idx) || []
      const errorsCount = compDiags.filter(d => d.severity === "error").length
      const warningsCount = compDiags.filter(d => d.severity === "warning" || d.severity === "info").length

      const label = String(comp.id || "")
      const desc = String(comp.name || comp.id || "")

      return {
        idx,
        label,
        type,
        method: String(comp.type || "").toUpperCase(),
        color,
        desc,
        x: typeof comp.x === "number" ? comp.x : 0,
        y: typeof comp.y === "number" ? comp.y : 0,
        errorsCount,
        warningsCount,
        totalIssues: errorsCount + warningsCount,
        diagnostics: compDiags,
      }
    })
  }, [components, diagnosticsByComponent])

  // Filter cards
  const filteredCards = useMemo(() => {
    return cards.filter((c: any) => {
      // 0. Filter by hidden types
      if (hiddenTypesSet.has(c.type.toLowerCase())) {
        return false
      }

      // 1. Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        const matchesLabel = c.label.toLowerCase().includes(term)
        const matchesDesc = c.desc.toLowerCase().includes(term)
        const matchesType = c.type.toLowerCase().includes(term)
        if (!matchesLabel && !matchesDesc && !matchesType) {
          return false
        }
      }

      // 2. Type filter
      if (typeFilter !== "all" && c.type !== typeFilter) {
        return false
      }

      // 3. Issue filter
      if (issueFilter === "issues" && c.errorsCount === 0 && c.warningsCount === 0) {
        return false
      }

      return true
    })
  }, [cards, searchTerm, typeFilter, issueFilter, hiddenTypesSet])

  // Sort cards
  const sortedCards = useMemo(() => {
    const list = [...filteredCards]
    if (sortBy === "id-asc") {
      list.sort((a, b) => a.label.localeCompare(b.label))
    } else if (sortBy === "id-desc") {
      list.sort((a, b) => b.label.localeCompare(a.label))
    } else if (sortBy === "type") {
      list.sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label))
    }
    return list
  }, [filteredCards, sortBy])

  if (components.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-xs p-6 min-h-[250px]">
        <GridIcon size={24} className="text-zinc-600 mb-2 animate-pulse" />
        <p>Awaiting valid specification components to render grid...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full relative">
      {/* Controls HUD Panel */}
      <div
        className="flex flex-wrap items-center gap-2 px-6 py-2.5 shrink-0 border-b border-border-subtle"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border-subtle)" }}
      >
        {/* Search */}
        <div className="relative flex-1 min-w-[150px]">
          <input
            type="text"
            data-testid="grid-search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search components..."
            className="w-full h-8 px-2.5 rounded-lg text-xs font-sans bg-surface-elevated text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-accent"
            style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", color: "var(--foreground)" }}
          />
        </div>

        {/* Type Filter */}
        <select
          data-testid="grid-type-select"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-8 px-2 rounded-lg text-xs font-sans bg-surface-elevated text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-accent"
          style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", color: "var(--foreground)" }}
        >
          <option value="all">All Types</option>
          <option value="store">Store</option>
          <option value="stage">Stage</option>
          <option value="brick">Brick</option>
          <option value="gateway">Gateway</option>
        </select>

        {/* Issue Filter */}
        <select
          data-testid="grid-issue-select"
          value={issueFilter}
          onChange={(e) => setIssueFilter(e.target.value)}
          className="h-8 px-2 rounded-lg text-xs font-sans bg-surface-elevated text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-accent"
          style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", color: "var(--foreground)" }}
        >
          <option value="all">All Components</option>
          <option value="issues">Only Components with Issues</option>
        </select>

        {/* Sort Select */}
        <select
          data-testid="grid-sort-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="h-8 px-2 rounded-lg text-xs font-sans bg-surface-elevated text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-accent"
          style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", color: "var(--foreground)" }}
        >
          <option value="id-asc">Alphabetical (A-Z)</option>
          <option value="id-desc">Alphabetical (Z-A)</option>
        </select>
      </div>

      <div className="flex-1 overflow-auto p-6 relative">
        {/* Dot grid overlay */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30" aria-hidden="true">
          <defs>
            <pattern id="canvas-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.7" fill="rgba(255,255,255,0.05)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#canvas-dots)" />
        </svg>

        {sortedCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-zinc-500 text-xs p-6 min-h-[150px]">
            <p>No components match the active search and filter criteria.</p>
          </div>
        ) : (
          <div className="relative grid grid-cols-2 lg:grid-cols-3 gap-4 max-w-2xl">
            {sortedCards.map((c: any) => {
              const isSelected = selectedUnit === c.label
              return (
                <div
                  key={`${c.idx}-${c.label}`}
                  onClick={() => {
                    if (setSelectedUnit) setSelectedUnit(c.label)
                    if (setActiveTab) setActiveTab("focus")
                    if (renamingId && renamingId !== c.label) {
                      handleCancelRename()
                    }
                  }}
                  onDoubleClick={() => handleStartRename(c.label)}
                  aria-label={`Select component ${c.label}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      if (setSelectedUnit) setSelectedUnit(c.label)
                      if (setActiveTab) setActiveTab("focus")
                      if (renamingId && renamingId !== c.label) {
                        handleCancelRename()
                      }
                    }
                  }}
                  className="flex flex-col gap-2 p-3 rounded-xl cursor-pointer transition-all duration-150 focus:outline-none relative group"
                  style={{
                    background: isSelected ? "var(--surface-overlay)" : "var(--surface-elevated)",
                    border: isSelected ? `1px solid ${c.color}` : `1px solid var(--border)`,
                    boxShadow: isSelected ? `0 0 12px ${c.color}22` : "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = c.color + "55"
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = "var(--border)"
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{
                        background: c.color + "18",
                        color: c.color,
                        border: `1px solid ${c.color}30`,
                      }}
                    >
                      {c.method}
                    </span>

                    {/* Hover Actions & Diagnostics Container */}
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {/* Hover Actions */}
                      <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-1">
                        <button
                          type="button"
                          data-testid={`grid-duplicate-${c.label}`}
                          title="Duplicate component"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (onCanvasChange) {
                              let suffix = 1
                              let newId = `${c.label}_${suffix}`
                              const componentsList = parsedSpec?.system?.components || []
                              const existingIds = new Set(componentsList.map((comp: any) => comp?.id).filter(Boolean))
                              while (existingIds.has(newId)) {
                                suffix++
                                newId = `${c.label}_${suffix}`
                              }
                              onCanvasChange({
                                type: "duplicate",
                                payload: { id: c.label, newId }
                              })
                            }
                          }}
                          className="flex items-center justify-center w-5 h-5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                        >
                          <Copy size={11} />
                        </button>
                        <button
                          type="button"
                          data-testid={`grid-delete-${c.label}`}
                          title="Delete component"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (onCanvasChange) {
                              onCanvasChange({
                                type: "delete",
                                payload: { ids: [c.label] }
                              })
                              if (selectedUnit === c.label && setSelectedUnit) {
                                setSelectedUnit(null)
                              }
                            }
                          }}
                          className="flex items-center justify-center w-5 h-5 rounded hover:bg-red-500/10 text-zinc-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>

                      {/* Diagnostics Badge */}
                      {c.totalIssues > 0 && (
                        <div
                          data-testid="issue-badge"
                          className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 ${
                            c.errorsCount > 0
                              ? "bg-red-500/10 text-red-500 border border-red-500/20"
                              : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                          }`}
                          title={c.diagnostics.map((d: any) => d.message).join("\n")}
                        >
                          {c.totalIssues}
                        </div>
                      )}
                    </div>
                  </div>
                  {renamingId === c.label ? (
                    <div
                      className="flex flex-col gap-1.5 mt-1"
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        data-testid={`grid-rename-input-${c.label}`}
                        value={newIdVal}
                        onChange={(e) => setNewIdVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            handleCommitRename(c.label)
                          } else if (e.key === "Escape") {
                            e.preventDefault()
                            handleCancelRename()
                          }
                        }}
                        className="w-full h-7 px-1.5 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-accent"
                        style={{
                          background: "var(--surface-elevated)",
                          color: "var(--foreground)",
                          border: "1px solid var(--border)",
                        }}
                        autoFocus
                      />
                      {renamingError && (
                        <p data-testid="grid-rename-error" className="text-[10px] text-red-500 font-medium leading-tight">
                          {renamingError}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <button
                          type="button"
                          data-testid={`grid-rename-save-${c.label}`}
                          onClick={() => handleCommitRename(c.label)}
                          className="px-2 py-0.5 rounded text-[10px] text-white hover:opacity-95 font-medium transition-all"
                          style={{
                            background: "var(--accent)",
                          }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          data-testid={`grid-rename-cancel-${c.label}`}
                          onClick={handleCancelRename}
                          className="px-2 py-0.5 rounded text-[10px] font-medium transition-all"
                          style={{
                            background: "var(--surface)",
                            color: "var(--foreground-muted)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-[12px] font-medium leading-tight" style={{ color: isSelected ? c.color : "var(--foreground)" }}>
                        {c.label}
                      </p>
                      <p className="text-[11px] font-mono" style={{ color: "var(--foreground-muted)" }}>
                        {c.desc}
                      </p>

                      {/* Inline Diagnostics & Quick-Fixes */}
                      {c.totalIssues > 0 && (
                        <div className="flex flex-col gap-1 mt-1.5 pt-1.5 border-t border-border-subtle" onClick={(e) => e.stopPropagation()}>
                          {c.diagnostics.map((d: any, dIdx: number) => {
                            const isFixable = d.code && d.path && (FIXABLE_DIAGNOSTIC_CODES.has(d.code) || d.code.startsWith("stride-"))
                            const textClass = d.severity === "error" ? "text-red-400" : "text-amber-400/90"
                            return (
                              <div key={dIdx} className="flex items-start justify-between gap-1.5 text-[10px] leading-snug font-sans bg-zinc-900/40 p-1.5 rounded border border-zinc-800/45">
                                <span className={`flex-1 ${textClass}`}>
                                  {d.message}
                                </span>
                                {isFixable && (
                                  <button
                                    type="button"
                                    data-testid={`grid-quick-fix-${d.code}-${c.label}`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (onCanvasChange) {
                                        onCanvasChange({
                                          type: "quick-fix",
                                          payload: { path: d.path, fixType: d.code }
                                        })
                                      }
                                    }}
                                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 text-[9px] font-medium transition-all shrink-0 cursor-pointer"
                                  >
                                    <SparklesIcon size={8} />
                                    <span>Fix</span>
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

interface LayersViewProps {
  parsedSpec: any
  hiddenTypes: string[]
  setHiddenTypes: (val: string[] | ((prev: string[]) => string[])) => void
}

/* ── Layers view ── */
function LayersView({ parsedSpec, hiddenTypes, setHiddenTypes }: LayersViewProps) {
  const components = parsedSpec?.system?.components || []
  
  // Count types
  const counts: Record<string, number> = {}
  components.forEach((comp: any) => {
    const t = comp.type || "Unit"
    counts[t] = (counts[t] || 0) + 1
  })

  const typeColors: Record<string, string> = {
    Gateway: "#f59e0b",
    Stage: "#c084fc",
    Store: "#6366f1",
    Brick: "#34d399",
  }

  const layers = Object.entries(counts).map(([name, count]) => {
    const isHidden = hiddenTypes.includes(name)
    return {
      name,
      count,
      color: typeColors[name] || "var(--foreground-muted)",
      visible: !isHidden,
    }
  })

  const toggleLayer = (layerName: string) => {
    setHiddenTypes((prev) => {
      if (prev.includes(layerName)) {
        return prev.filter((t) => t !== layerName)
      } else {
        return [...prev, layerName]
      }
    })
  }

  if (layers.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-xs p-6 min-h-[250px]">
        <LayersIcon size={24} className="text-zinc-600 mb-2 animate-pulse" />
        <p>Awaiting specification components to display layers...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <p className="text-[11px] uppercase tracking-widest font-semibold mb-3" style={{ color: "var(--foreground-muted)" }}>
        Layer Groups
      </p>
      <ul className="space-y-1">
        {layers.map((layer) => (
          <li
            key={layer.name}
            className="flex items-center gap-3 px-3 py-2 rounded-lg"
            style={{
              background: "var(--surface-elevated)",
              border: "1px solid var(--border)",
              opacity: layer.visible ? 1 : 0.45,
            }}
          >
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: layer.color }}
              aria-hidden="true"
            />
            <span className="flex-1 text-[12px] font-medium" style={{ color: "var(--foreground)" }}>
              {layer.name}
            </span>
            <span
              className="text-[10px] px-1.5 rounded font-mono"
              style={{ background: "var(--surface-overlay)", color: "var(--foreground-muted)" }}
            >
              {layer.count}
            </span>
            <button
              onClick={() => toggleLayer(layer.name)}
              aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name} layer`}
              className="flex items-center justify-center w-6 h-6 rounded transition-colors"
              style={{ color: layer.visible ? "var(--accent)" : "var(--foreground-dim)" }}
            >
              <EyeIcon size={11} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── Small icon button ── */
function CanvasToolButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex items-center justify-center w-7 h-7 rounded transition-colors"
      style={{
        color: active ? "var(--accent)" : "var(--foreground-muted)",
        background: active ? "var(--accent-dim)" : "transparent",
      }}
    >
      {icon}
    </button>
  )
}
