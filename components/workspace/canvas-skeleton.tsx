/** Quiet loading placeholder — a pulse, not a fake architecture diagram. */
export function CanvasSkeleton() {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center gap-3 w-full h-full"
      role="status"
      aria-label="Loading canvas"
    >
      <div
        data-testid="canvas-skeleton-pulse"
        className="w-10 h-10 rounded-full animate-pulse"
        style={{ background: "var(--surface-overlay)" }}
        aria-hidden="true"
      />
      <p className="text-[12px]" style={{ color: "var(--foreground-muted)" }}>
        Loading canvas…
      </p>
    </div>
  )
}
