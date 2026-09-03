import type { SyncState } from "./remote-sync-store"

/** Inline colors for the HTML shell so a reload is never a white flash. */
export const WORKSPACE_BOOTSTRAP_BG = "#09090b"
export const WORKSPACE_BOOTSTRAP_FG = "#f4f4f5"

export function formatIssueCount(n: number): string {
  if (n <= 0) return "No issues"
  if (n === 1) return "1 issue"
  return `${n} issues`
}

/** Editor/canvas may accept input only after hydration and a first-run decision. */
export function isWorkspaceInteractive(
  isHydrated: boolean,
  status: SyncState["status"]
): boolean {
  return isHydrated && status !== "unconfigured"
}

export function formatSyncLabel(opts: {
  isHydrated: boolean
  isDirty: boolean
  isSaving: boolean
  status: SyncState["status"]
  haltedReason?: string
}): string {
  if (!opts.isHydrated) return "Loading workspace…"
  if (opts.status === "halted") {
    return opts.haltedReason || "Saving halted — reload the workspace"
  }
  if (opts.status === "unconfigured") {
    return "No project chosen — pick a folder to save to files"
  }
  if (opts.isSaving) return "Saving…"
  if (opts.isDirty) return "Unsaved changes"
  if (opts.status === "synced") return "Synced to project"
  return "Browser storage only"
}

export function formatSaveButtonLabel(phase: "idle" | "saving" | "saved"): string {
  if (phase === "saving") return "Saving…"
  if (phase === "saved") return "Saved"
  return "Save"
}
