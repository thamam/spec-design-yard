"use client"

import { useEffect, useRef, useState } from "react"
import { DatabaseIcon, FolderIcon, TriangleAlertIcon } from "lucide-react"

// Header badge + dropdown for choosing where specs live. Project-first: the
// main story in every state is picking (or creating) a project folder;
// browser-only storage is a de-emphasized opt-out. On the very first run
// (mode "unconfigured") the panel opens itself with a suggested folder
// prefilled — one click creates it and the choice is remembered server-side.
// A successful switch reloads the page so the whole workspace re-hydrates
// from the new project's files.

type ProjectInfo =
  | { mode: "project"; dir: string; exists: boolean; source: string; recents: string[] }
  | { mode: "standalone"; recents: string[] }
  | { mode: "unconfigured"; suggestedDir: string; recents: string[] }
  // The project API answered with an error (e.g. 403 for a non-loopback
  // address): we can't know where writes go, and must never claim we do.
  | { mode: "unknown"; recents: string[] }

interface SwitchError {
  error: string
  code?: string
}

function baseName(dir: string): string {
  return dir.split(/[\\/]/).filter(Boolean).pop() || dir
}

export function ProjectPicker({ reload }: { reload?: () => void }) {
  const [info, setInfo] = useState<ProjectInfo | null>(null)
  const [open, setOpen] = useState(false)
  const [inputDir, setInputDir] = useState("")
  // The dir whose switch failed with not-found — the create button's target
  // (a stale Recent click never populates the input field).
  const [failedDir, setFailedDir] = useState<string | null>(null)
  const [error, setError] = useState<SwitchError | null>(null)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const doReload = reload || (() => window.location.reload())

  useEffect(() => {
    let cancelled = false
    fetch("/api/project")
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) {
          // 403/500: the store route may still be writing files — claiming
          // "Browser storage" here would mislabel where the user's data goes.
          setInfo({ mode: "unknown", recents: [] })
          return
        }
        const body = await res.json().catch(() => null)
        if (cancelled) return
        if (!body || typeof body !== "object") {
          setInfo({ mode: "unknown", recents: [] })
          return
        }
        if (body.mode === "project" && typeof body.dir === "string") {
          setInfo({
            mode: "project",
            dir: body.dir,
            exists: body.exists !== false,
            source: typeof body.source === "string" ? body.source : "config",
            recents: Array.isArray(body.recents) ? body.recents : [],
          })
        } else if (body.mode === "unconfigured") {
          const suggested = typeof body.suggestedDir === "string" ? body.suggestedDir : ""
          setInfo({ mode: "unconfigured", suggestedDir: suggested, recents: Array.isArray(body.recents) ? body.recents : [] })
          // First run: prompt once, prefilled — one click to get a project.
          setInputDir(suggested)
          setOpen(true)
        } else {
          setInfo({ mode: "standalone", recents: Array.isArray(body.recents) ? body.recents : [] })
        }
      })
      .catch(() => {
        // Unreachable/odd responses degrade to the browser-storage display.
        if (!cancelled) setInfo({ mode: "standalone", recents: [] })
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("mousedown", onPointerDown)
    return () => window.removeEventListener("mousedown", onPointerDown)
  }, [open])

  const putProject = async (payload: Record<string, unknown>, attemptedDir?: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    setFailedDir(null)
    try {
      const res = await fetch("/api/project", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body && typeof body.error === "string" ? body : { error: `Switch failed (${res.status})` })
        if (body?.code === "not-found" && attemptedDir) setFailedDir(attemptedDir)
        setBusy(false)
        return
      }
      // Full reload: the whole workspace re-hydrates against the new choice.
      doReload()
    } catch {
      setError({ error: "Could not reach the dev server" })
      setBusy(false)
    }
  }

  const switchTo = (dir: string, create = false) => {
    const trimmed = dir.trim()
    if (!trimmed) return
    putProject(create ? { dir: trimmed, create: true } : { dir: trimmed }, trimmed)
  }

  const firstRun = info?.mode === "unconfigured"
  const projectMode = info?.mode === "project"
  const unknown = info?.mode === "unknown"
  const currentDir = projectMode ? (info as any).dir : null
  const recents = (info?.recents ?? []).filter((r) => r !== currentDir)

  const badgeLabel =
    info === null
      ? "…"
      : projectMode
      ? baseName(currentDir)
      : firstRun
      ? "Choose project…"
      : unknown
      ? "Storage unknown"
      : "Browser storage"

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        data-testid="project-picker-badge"
        onClick={() => setOpen((v) => !v)}
        title={
          projectMode
            ? `Project: ${currentDir}`
            : firstRun
            ? "Pick a project folder for your specs"
            : unknown
            ? "Could not determine where specs are stored"
            : "Specs live in this browser only"
        }
        aria-label="Active project"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] cursor-pointer max-w-[220px]"
        style={{
          background: "var(--surface-overlay)",
          border: "1px solid var(--border-subtle)",
          color: unknown
            ? "var(--warning, #eab308)"
            : projectMode || firstRun
            ? "var(--accent)"
            : "var(--foreground-muted)",
        }}
      >
        {unknown ? <TriangleAlertIcon size={10} /> : projectMode || firstRun ? <FolderIcon size={10} /> : <DatabaseIcon size={10} />}
        <span className="truncate">{badgeLabel}</span>
        {projectMode && !(info as any).exists && (
          <TriangleAlertIcon size={10} style={{ color: "var(--warning, #eab308)" }} />
        )}
      </button>

      {open && info !== null && (
        <div
          data-testid="project-picker-panel"
          className="absolute left-0 top-full mt-1.5 w-[340px] rounded-md p-3 z-50 text-[12px] shadow-lg"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
          }}
        >
          {unknown ? (
            <div style={{ color: "var(--foreground-muted)" }}>
              The project service refused this request, so it is unknown where
              specs are being stored. If you opened the workspace via a network
              address, use <span className="font-mono">http://localhost:3000</span>{" "}
              instead — the project APIs only answer loopback requests.
            </div>
          ) : (
            <>
          {projectMode && (
            <>
              <div className="font-medium mb-1">Project folder</div>
              <div
                className="font-mono text-[11px] break-all rounded px-2 py-1.5 mb-1"
                style={{ background: "var(--surface-overlay)", color: "var(--foreground)" }}
              >
                {currentDir}
              </div>
              <div className="mb-2" style={{ color: "var(--foreground-muted)" }}>
                Specs are saved to <span className="font-mono">main.spec.yaml</span> in this folder
              </div>
              {!(info as any).exists && (
                <div className="mb-2" style={{ color: "var(--warning, #eab308)" }}>
                  This directory does not exist — pick another folder below.
                </div>
              )}
            </>
          )}

          {info.mode === "standalone" && (
            <div className="mb-2" style={{ color: "var(--foreground-muted)" }}>
              Specs currently live in this browser only.
            </div>
          )}

          {firstRun && (
            <div className="font-medium mb-2">Choose where your specs live</div>
          )}

          <label className="block mb-1" style={{ color: "var(--foreground-muted)" }} htmlFor="project-dir-input">
            {projectMode ? "Switch to another project" : "Work in a project folder"}
          </label>
          <div className="flex gap-1.5 mb-2">
            <input
              id="project-dir-input"
              data-testid="project-dir-input"
              value={inputDir}
              onChange={(e) => {
                setInputDir(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") switchTo(inputDir, firstRun)
              }}
              placeholder="/absolute/path/to/project"
              spellCheck={false}
              className="flex-1 min-w-0 rounded px-2 py-1 font-mono text-[11px] outline-none"
              style={{
                background: "var(--surface-overlay)",
                border: "1px solid var(--border-subtle)",
                color: "var(--foreground)",
              }}
            />
            <button
              type="button"
              data-testid="project-switch-button"
              onClick={() => switchTo(inputDir, firstRun)}
              disabled={busy || inputDir.trim() === ""}
              className="px-2 py-1 rounded text-[11px] font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {busy ? "…" : firstRun ? "Create project" : "Switch"}
            </button>
          </div>

          {error && (
            <div className="mb-2">
              <div data-testid="project-picker-error" style={{ color: "var(--danger, #ef4444)" }}>
                {error.error}
              </div>
              {error.code === "not-found" && failedDir && (
                <button
                  type="button"
                  data-testid="project-create-button"
                  onClick={() => switchTo(failedDir, true)}
                  disabled={busy}
                  className="mt-1 px-2 py-1 rounded text-[11px] font-medium cursor-pointer disabled:opacity-40"
                  style={{
                    background: "var(--surface-overlay)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--accent)",
                  }}
                >
                  Create directory &amp; switch
                </button>
              )}
            </div>
          )}

          {recents.length > 0 && (
            <>
              <div className="mb-1" style={{ color: "var(--foreground-muted)" }}>
                Recent
              </div>
              <div className="flex flex-col gap-0.5 mb-2">
                {recents.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => switchTo(r)}
                    disabled={busy}
                    title={r}
                    className="text-left font-mono text-[11px] truncate rounded px-2 py-1 cursor-pointer hover:opacity-80 disabled:opacity-40"
                    style={{ background: "var(--surface-overlay)", color: "var(--foreground)" }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </>
          )}

          {info.mode !== "standalone" && (
            <button
              type="button"
              data-testid="project-standalone-button"
              onClick={() => putProject({ mode: "standalone" })}
              disabled={busy}
              className="text-[11px] underline cursor-pointer disabled:opacity-40 bg-transparent border-0 p-0"
              style={{ color: "var(--foreground-dim)" }}
            >
              {firstRun ? "Skip — use browser storage only" : "Use browser storage instead (no project)"}
            </button>
          )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
