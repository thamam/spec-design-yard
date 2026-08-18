// Compile-safe Local Database client & API connector
// Thin delegate onto the shared SpecStore seam (app-wide instance lives in
// lib/remote-sync-store.ts, which mirrors writes to the project files when
// the app is launched with SPEC_YARD_PROJECT_DIR).

import specStore, { type SpecDocument } from "./remote-sync-store"

export type { SpecDocument }

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
}
