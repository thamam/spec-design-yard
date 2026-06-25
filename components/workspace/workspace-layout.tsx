"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { EditorPanel } from "./editor-panel"
import { CanvasPanel } from "./canvas-panel"
import { WorkspaceHeader } from "./workspace-header"

const MIN_PANEL_WIDTH = 280
const DEFAULT_SPLIT = 42 // percent

export function WorkspaceLayout() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [splitPercent, setSplitPercent] = useState(DEFAULT_SPLIT)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartX = useRef(0)
  const dragStartSplit = useRef(DEFAULT_SPLIT)

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
      <WorkspaceHeader />

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
          <EditorPanel />
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
          <CanvasPanel />
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
        <span>spec.json</span>
      </div>
      <div className="flex items-center gap-4">
        <span>UTF-8</span>
        <span style={{ color: "var(--foreground-dim)" }}>|</span>
        <span>TypeScript</span>
        <span style={{ color: "var(--foreground-dim)" }}>|</span>
        <span>Ln 1, Col 1</span>
      </div>
    </footer>
  )
}
