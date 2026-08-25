// Compile-safe Local Database client & API connector
// Thin delegate onto the shared SpecStore seam (app-wide instance lives in
// lib/remote-sync-store.ts, which mirrors writes to the project files when
// the app is launched with SPEC_YARD_PROJECT_DIR).

import specStore, { type SpecDocument, type SyncState } from "./remote-sync-store"

export type { SpecDocument, SyncState }

export const db = {
  getSpec(id: string): SpecDocument | null {
    return specStore.getSpec(id)
  },
  saveSpec(id: string, title: string, yamlContent: string): SpecDocument {
    return specStore.saveSpec(id, title, yamlContent)
  },
  removeSpec(id: string): void {
    return specStore.removeSpec(id)
  },
  /** Pull project-file state into the local cache. See RemoteSyncSpecStore. */
  async loadFromServer(): Promise<boolean> {
    const active = await specStore.loadFromServer()
    // Hydration attempt complete either way — arm mirroring (no-op when the
    // store decided file mode is off).
    specStore.arm()
    return active
  },
  /** Where saves are going right now (for the status bar). */
  getSyncState(): SyncState {
    return specStore.getSyncState()
  },
  /** Subscribe to sync-state changes; returns an unsubscribe function. */
  subscribeSyncState(listener: (s: SyncState) => void): () => void {
    return specStore.subscribeSyncState(listener)
  },
}
