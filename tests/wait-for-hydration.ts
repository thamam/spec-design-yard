import { expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'

/**
 * Workspace hydration is async (it may pull the canonical spec from the
 * server). All mutation paths are locked until it completes, so tests that
 * render <Workspace /> must await this before interacting with the editor.
 */
export async function waitForWorkspaceHydration() {
  await waitFor(() => {
    expect((screen.getByTestId('spec-textarea') as HTMLTextAreaElement).disabled).toBe(false)
  })
}
