// Compile-safe Local Database client & API connector
// Thin delegate onto the shared SpecStore seam (see lib/spec-store.ts).

import specStore, { type SpecDocument } from "./spec-store"

export type { SpecDocument }

export const db = {
  getSpec(id: string): SpecDocument | null {
    return specStore.getSpec(id)
  },
  saveSpec(id: string, title: string, yamlContent: string): SpecDocument {
    return specStore.saveSpec(id, title, yamlContent)
  },
}
