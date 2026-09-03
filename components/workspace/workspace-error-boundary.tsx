import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
  children: ReactNode
  onReload?: () => void
}

interface State {
  error: Error | null
}

/**
 * Last-resort recovery when a render throws (e.g. a canvas update loop).
 * Edits already flushed to the store stay in browser storage; reload
 * re-hydrates from the project file or that cache.
 */
export class WorkspaceErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[spec-yard] workspace crashed", error, info)
  }

  private reload = () => {
    if (this.props.onReload) this.props.onReload()
    else window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div
        role="alert"
        data-testid="workspace-crash"
        className="flex flex-col items-center justify-center h-screen w-screen gap-3 px-6 text-center"
        style={{ background: "var(--background)", color: "var(--foreground)" }}
      >
        <h1 className="text-lg font-medium">The workspace hit an error</h1>
        <p className="text-[13px] max-w-md" style={{ color: "var(--foreground-muted)" }}>
          Your latest edits are still in this browser. Reload to continue from
          the project file or the local cache.
        </p>
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
    )
  }
}
