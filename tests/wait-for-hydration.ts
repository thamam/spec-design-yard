import { expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'

/**
 * Workspace hydration is async (it may pull the canonical spec from the
 * server). First-run keeps the editor disabled after that until the user
 * picks a folder or opts out — so "hydrated" is not the same as "typeable".
 */
export async function waitForWorkspaceHydration() {
  await waitFor(() => {
    expect(screen.getByTestId('sync-status').textContent).not.toMatch(/loading workspace/i)
  })
}

/** Hydrated and the first-run decision is done (or was never needed). */
export async function waitForWorkspaceInteractive() {
  await waitForWorkspaceHydration()
  await waitFor(() => {
    expect((screen.getByTestId('spec-textarea') as HTMLTextAreaElement).disabled).toBe(false)
  })
}
