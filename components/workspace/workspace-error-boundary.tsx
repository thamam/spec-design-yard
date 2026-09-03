import { Component, type ErrorInfo, type ReactNode } from "react"
import { persistSpecDraft, readCrashDraft } from "../../lib/spec-draft"
import { triggerDownload } from "./download"

interface Props {
  children: ReactNode
  onReload?: () => void
  onDownload?: (yaml: string) => void
}

interface State {
  error: Error | null
}

/**
 * Last-resort recovery when a render throws (e.g. a canvas update loop).
 * The last rendered spec is persisted as a crash draft — the 1s autosave
 * timer is cancelled when this fallback unmounts the workspace, so Reload
 * alone would lose an in-flight edit.
 */
export class WorkspaceErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    // Persist before the fallback paints — componentDidCatch runs after
    // render, and the recovery copy must know whether a draft exists.
    persistSpecDraft()
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[spec-yard] workspace crashed", error, info)
    persistSpecDraft()
  }

  private reload = () => {
    if (this.props.onReload) this.props.onReload()
    else window.location.reload()
  }

  private download = () => {
    const yaml = persistSpecDraft() ?? readCrashDraft()
    if (yaml == null) return
    if (this.props.onDownload) {
      this.props.onDownload(yaml)
      return
    }
    triggerDownload(
      `data:text/yaml;charset=utf-8,${encodeURIComponent(yaml)}`,
      "main.spec.yaml"
    )
  }

  render() {
    if (!this.state.error) return this.props.children
    const hasDraft = readCrashDraft() != null
    return (
      <div
        role="alert"
        data-testid="workspace-crash"
        className="flex flex-col items-center justify-center h-screen w-screen gap-3 px-6 text-center"
        style={{ background: "var(--background)", color: "var(--foreground)" }}
      >
        <h1 className="text-lg font-medium">The workspace hit an error</h1>
        <p className="text-[13px] max-w-md" style={{ color: "var(--foreground-muted)" }}>
          {hasDraft
            ? "A copy of the last rendered spec was saved in this browser. Download it before reloading — reload may open the project file instead of this draft."
            : "Reload to continue. An edit that had not been saved yet may be unrecoverable."}
        </p>
        <div className="flex items-center gap-2">
          {hasDraft && (
            <button
              type="button"
              data-testid="workspace-crash-download"
              onClick={this.download}
              className="px-3 py-1.5 rounded text-[12px] font-medium cursor-pointer"
              style={{
                background: "var(--surface-overlay)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
              }}
            >
              Download spec
            </button>
          )}
          <button
            type="button"
            data-testid="workspace-crash-reload"
            onClick={this.reload}
            className="px-3 py-1.5 rounded text-[12px] font-medium cursor-pointer"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Reload workspace
          </button>
        </div>
      </div>
    )
  }
}
