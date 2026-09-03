import { WorkspaceErrorBoundary } from "./workspace-error-boundary"
import { WorkspaceLayout } from "./workspace-layout"

export function WorkspaceApp() {
  return (
    <WorkspaceErrorBoundary>
      <WorkspaceLayout />
    </WorkspaceErrorBoundary>
  )
}
