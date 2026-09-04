"use client"

import { useEffect, useRef, useState } from "react"
import {
  GitBranchIcon,
  LogOut,
  PlayIcon,
  SaveIcon,
  SettingsIcon,
  ShareIcon,
  TerminalIcon,
  Undo,
  Redo,
} from "lucide-react"
import { ProjectPicker } from "./project-picker"
import { formatSaveButtonLabel } from "../../lib/status-copy"
import type { SyncState } from "../../lib/db"
import { apiFetch } from "../../lib/api-client"

export function WorkspaceHeader({
  canUndo = false,
  canRedo = false,
  canSave = true,
  onUndo,
  onRedo,
  onSave,
  onRun,
  onStandalone,
  blockingFirstRun = false,
  storageMode,
}: {
  canUndo?: boolean
  canRedo?: boolean
  canSave?: boolean
  onUndo?: () => void
  onRedo?: () => void
  onSave?: () => void
  onRun?: () => void
  onStandalone?: () => void
  blockingFirstRun?: boolean
  storageMode?: SyncState["status"]
}) {
  const [savePhase, setSavePhase] = useState<"idle" | "saving" | "saved">("idle")
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [gitBranch, setGitBranch] = useState<string | null>(null)
  const [showLogout, setShowLogout] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiFetch("/api/auth/session")
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (!cancelled && body && body.remote === true && body.authenticated === true) {
          setShowLogout(true)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const handleLogout = () => {
    apiFetch("/api/auth/logout", { method: "POST" })
      .catch(() => {})
      .finally(() => {
        window.location.replace("/login")
      })
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (savedTimer.current) clearTimeout(savedTimer.current)
    }
  }, [])

  const handleSave = () => {
    onSave?.()
    setSavePhase("saving")
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    saveTimer.current = setTimeout(() => {
      setSavePhase("saved")
      savedTimer.current = setTimeout(() => setSavePhase("idle"), 1200)
    }, 400)
  }

  const standaloneLike = storageMode === "local-only" || storageMode === "unconfigured"
  const crumbRoot = storageMode === "unconfigured" ? "spec-yard" : standaloneLike ? "browser" : "workspace"
  const crumbMid = storageMode === "unconfigured" ? "new spec" : standaloneLike ? "main.spec" : "spec-editor"
  const showSpecCrumb = !standaloneLike

  return (
    <header
      className="flex items-center justify-between px-3 h-11 shrink-0 select-none"
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Left — logo + breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Logo mark */}
        <div
          className="flex items-center justify-center w-6 h-6 rounded"
          style={{ background: "var(--accent)" }}
          aria-hidden="true"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="5" height="5" rx="1" fill="white" fillOpacity="0.9" />
            <rect x="8" y="1" width="5" height="5" rx="1" fill="white" fillOpacity="0.5" />
            <rect x="1" y="8" width="5" height="5" rx="1" fill="white" fillOpacity="0.5" />
            <rect x="8" y="8" width="5" height="5" rx="1" fill="white" fillOpacity="0.9" />
          </svg>
        </div>

        {/* Breadcrumb — softened when there is no project / git repo */}
        <nav className="flex items-center gap-1 text-[12px] min-w-0" aria-label="Breadcrumb">
          <span style={{ color: "var(--foreground-muted)" }}>{crumbRoot}</span>
          <span style={{ color: "var(--foreground-dim)" }}>/</span>
          <span
            className={showSpecCrumb ? "font-medium truncate" : "truncate font-mono"}
            style={{ color: showSpecCrumb ? "var(--foreground)" : "var(--accent)" }}
          >
            {crumbMid}
          </span>
          {showSpecCrumb && (
            <>
              <span style={{ color: "var(--foreground-dim)" }}>/</span>
              <span className="truncate font-mono" style={{ color: "var(--accent)" }}>
                main.spec
              </span>
            </>
          )}
        </nav>

        {gitBranch && (
          <div
            data-testid="git-branch-chip"
            className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded text-[11px]"
            style={{
              background: "var(--surface-overlay)",
              border: "1px solid var(--border-subtle)",
              color: "var(--foreground-muted)",
            }}
          >
            <GitBranchIcon size={10} />
            <span>{gitBranch}</span>
          </div>
        )}

        <ProjectPicker
          onStandalone={onStandalone}
          blockingFirstRun={blockingFirstRun}
          onInfo={(info) => setGitBranch(info.mode === "project" ? info.gitBranch ?? null : null)}
        />
      </div>

      {/* Center — title */}
      <div
        className="hidden md:flex absolute left-1/2 -translate-x-1/2 text-[12px] font-medium tracking-wide"
        style={{ color: "var(--foreground-muted)" }}
      >
        Workspace
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-1">
        <HeaderButton
          icon={<TerminalIcon size={13} />}
          label="Terminal"
          title="Not available — this is a local workspace"
          onClick={() => {}}
          disabled
        />
        <HeaderButton
          icon={<SaveIcon size={13} />}
          label={formatSaveButtonLabel(savePhase)}
          onClick={handleSave}
          active={savePhase !== "idle"}
          disabled={!canSave}
        />
        <HeaderButton
          icon={<Undo size={13} />}
          label="Undo"
          onClick={onUndo || (() => {})}
          disabled={!canUndo}
        />
        <HeaderButton
          icon={<Redo size={13} />}
          label="Redo"
          onClick={onRedo || (() => {})}
          disabled={!canRedo}
        />
        <HeaderButton
          icon={<ShareIcon size={13} />}
          label="Share"
          title="Not available — specs live on this machine"
          onClick={() => {}}
          disabled
        />
        <div
          className="w-px h-4 mx-1"
          style={{ background: "var(--border-subtle)" }}
          aria-hidden="true"
        />
        <HeaderButton
          icon={<PlayIcon size={13} />}
          label="Run"
          title="Open the packet simulator"
          onClick={onRun || (() => {})}
          accent
        />
        <HeaderButton
          icon={<SettingsIcon size={13} />}
          label="Settings"
          title="Not available — no settings panel yet"
          onClick={() => {}}
          disabled
        />
        {showLogout && (
          <HeaderButton
            icon={<LogOut size={13} />}
            label="Log out"
            title="End the remote session — project files stay on disk"
            onClick={handleLogout}
          />
        )}
      </div>
    </header>
  )
}

interface HeaderButtonProps {
  icon: React.ReactNode
  label: string
  title?: string
  onClick: () => void
  active?: boolean
  accent?: boolean
  disabled?: boolean
}

function HeaderButton({ icon, label, title, onClick, active, accent, disabled }: HeaderButtonProps) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title || label}
      aria-label={label}
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors duration-100 ${
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
      }`}
      style={{
        background: accent
          ? "var(--accent)"
          : active
          ? "var(--surface-overlay)"
          : "transparent",
        color: accent
          ? "#fff"
          : active
          ? "var(--accent)"
          : "var(--foreground-muted)",
        border: accent ? "none" : "1px solid transparent",
      }}
      onMouseEnter={(e) => {
        if (!accent && !disabled) {
          ;(e.currentTarget as HTMLButtonElement).style.background =
            "var(--surface-overlay)"
          ;(e.currentTarget as HTMLButtonElement).style.color =
            "var(--foreground)"
        }
      }}
      onMouseLeave={(e) => {
        if (!accent) {
          ;(e.currentTarget as HTMLButtonElement).style.background =
            active ? "var(--surface-overlay)" : "transparent"
          ;(e.currentTarget as HTMLButtonElement).style.color = active
            ? "var(--accent)"
            : "var(--foreground-muted)"
        }
      }}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
