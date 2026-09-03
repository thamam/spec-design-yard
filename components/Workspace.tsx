import { WorkspaceErrorBoundary } from './workspace/workspace-error-boundary'
import { WorkspaceLayout } from './workspace/workspace-layout'

export default function Workspace() {
  return (
    <WorkspaceErrorBoundary>
      <WorkspaceLayout />
    </WorkspaceErrorBoundary>
  )
}
