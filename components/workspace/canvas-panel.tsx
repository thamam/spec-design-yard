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
} from "lucide-react"
import { useState } from "react"
import { CanvasChange } from "../../lib/reconciler"

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

export function CanvasPanel({
  parsedSpec,
  selectedUnit,
  setSelectedUnit,
  onCanvasChange,
}: {
  parsedSpec?: any
  selectedUnit?: string | null
  setSelectedUnit?: (val: string | null) => void
  onCanvasChange?: (change: any[] | CanvasChange) => void
}) {
  const [view, setView] = useState<CanvasView>("diagram")
  const [fullscreen, setFullscreen] = useState(false)

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
            onClick={() => {}}
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
          />
        )}
        {view === "grid" && <GridView parsedSpec={parsedSpec} />}
        {view === "layers" && <LayersView parsedSpec={parsedSpec} />}
      </div>
    </section>
  )
}

/* ── Grid view ── */
function GridView({ parsedSpec }: { parsedSpec: any }) {
  const components = parsedSpec?.system?.components || []
  
  const cards = components.map((comp: any) => {
    const type = String(comp.type).toLowerCase()
    let color = "#6366f1" // Store/default: Indigo
    if (type === "stage") color = "#c084fc" // Stage: Purple
    else if (type === "brick") color = "#34d399" // Brick: Emerald
    else if (type === "gateway") color = "#f59e0b" // Gateway: Amber

    return {
      label: comp.id,
      method: String(comp.type).toUpperCase(),
      color,
      desc: comp.name || comp.id,
    }
  })

  if (cards.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-xs p-6 min-h-[250px]">
        <GridIcon size={24} className="text-zinc-600 mb-2 animate-pulse" />
        <p>Awaiting valid specification components to render grid...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Dot grid overlay */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30" aria-hidden="true">
        <defs>
          <pattern id="canvas-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.7" fill="rgba(255,255,255,0.05)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#canvas-dots)" />
      </svg>
      <div className="relative grid grid-cols-2 lg:grid-cols-3 gap-4 max-w-2xl">
        {cards.map((c: any) => (
          <div
            key={c.label}
            className="flex flex-col gap-2 p-3 rounded-xl cursor-pointer transition-all duration-150"
            style={{
              background: "var(--surface-elevated)",
              border: `1px solid var(--border)`,
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = c.color + "55")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)")}
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
            </div>
            <p className="text-[12px] font-medium leading-tight" style={{ color: "var(--foreground)" }}>
              {c.label}
            </p>
            <p className="text-[11px] font-mono" style={{ color: "var(--foreground-muted)" }}>
              {c.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Layers view ── */
function LayersView({ parsedSpec }: { parsedSpec: any }) {
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

  const layers = Object.entries(counts).map(([name, count]) => ({
    name,
    count,
    color: typeColors[name] || "var(--foreground-muted)",
    visible: true,
  }))

  const [vis, setVis] = useState<Record<string, boolean>>(
    Object.fromEntries(layers.map((l) => [l.name, l.visible]))
  )

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
              opacity: vis[layer.name] ? 1 : 0.45,
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
              onClick={() => setVis((v) => ({ ...v, [layer.name]: !v[layer.name] }))}
              aria-label={`${vis[layer.name] ? "Hide" : "Show"} ${layer.name} layer`}
              className="flex items-center justify-center w-6 h-6 rounded transition-colors"
              style={{ color: vis[layer.name] ? "var(--accent)" : "var(--foreground-dim)" }}
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
