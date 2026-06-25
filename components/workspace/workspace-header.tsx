"use client"

import { useState } from "react"
import {
  GitBranchIcon,
  PlayIcon,
  SaveIcon,
  SettingsIcon,
  ShareIcon,
  TerminalIcon,
} from "lucide-react"

export function WorkspaceHeader() {
  const [saved, setSaved] = useState(true)

  const handleSave = () => {
    setSaved(false)
    setTimeout(() => setSaved(true), 1200)
  }

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

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-[12px] min-w-0" aria-label="Breadcrumb">
          <span style={{ color: "var(--foreground-muted)" }}>workspace</span>
          <span style={{ color: "var(--foreground-dim)" }}>/</span>
          <span style={{ color: "var(--foreground)" }} className="font-medium truncate">spec-editor</span>
          <span style={{ color: "var(--foreground-dim)" }}>/</span>
          <span
            className="truncate font-mono"
            style={{ color: "var(--accent)" }}
          >
            main.spec
          </span>
        </nav>

        {/* Branch pill */}
        <div
          className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded text-[11px]"
          style={{
            background: "var(--surface-overlay)",
            border: "1px solid var(--border-subtle)",
            color: "var(--foreground-muted)",
          }}
        >
          <GitBranchIcon size={10} />
          <span>main</span>
        </div>
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
          onClick={() => {}}
        />
        <HeaderButton
          icon={<SaveIcon size={13} />}
          label={saved ? "Save" : "Saving…"}
          onClick={handleSave}
          active={!saved}
        />
        <HeaderButton
          icon={<ShareIcon size={13} />}
          label="Share"
          onClick={() => {}}
        />
        <div
          className="w-px h-4 mx-1"
          style={{ background: "var(--border-subtle)" }}
          aria-hidden="true"
        />
        <HeaderButton
          icon={<PlayIcon size={13} />}
          label="Run"
          onClick={() => {}}
          accent
        />
        <HeaderButton
          icon={<SettingsIcon size={13} />}
          label="Settings"
          onClick={() => {}}
        />
      </div>
    </header>
  )
}

interface HeaderButtonProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
  active?: boolean
  accent?: boolean
}

function HeaderButton({ icon, label, onClick, active, accent }: HeaderButtonProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors duration-100"
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
        if (!accent) {
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
