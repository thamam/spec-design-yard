"use client"

import { useEffect, useRef, useState } from "react"

/* ── Dynamic import wrapper for Excalidraw ── */
export function ExcalidrawCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ExcalidrawComponent, setExcalidrawComponent] = useState<React.ComponentType<{
    theme?: string
    UIOptions?: Record<string, unknown>
    initialData?: Record<string, unknown>
  }> | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    // Dynamically import Excalidraw only on the client
    import("@excalidraw/excalidraw")
      .then((mod) => {
        const Comp = mod.Excalidraw ?? mod.default
        setExcalidrawComponent(() => Comp)
      })
      .catch(() => setLoadError(true))
  }, [])

  if (loadError) {
    return <ExcalidrawFallback reason="load-error" />
  }

  if (!ExcalidrawComponent) {
    return <ExcalidrawSkeleton />
  }

  return (
    <div ref={containerRef} className="flex-1 min-h-0 w-full h-full relative">
      <ExcalidrawComponent
        theme="dark"
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
          },
        }}
        initialData={{
          appState: {
            viewBackgroundColor: "#0a0a0c",
            theme: "dark",
          },
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
