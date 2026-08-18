// Remote-sync store: implements the synchronous SpecStore seam by delegating
// to LocalStorageSpecStore (which becomes a write-through cache) and mirroring
// every write to the file-backed API route. The mirror is fire-and-forget —
// a failed PUT is logged, never thrown into the UI — so the app keeps working
// in local-only mode when the server is unreachable or file mode is off.
//
// On startup the workspace awaits loadFromServer() before hydrating: the
// project file is the source of truth when file mode is active, so server
// state overrides the stale local cache before autosave can push cache back.

import {
  LocalStorageSpecStore,
  type CustomPreset,
  type SimulationRun,
  type SpecDocument,
  type SpecStore,
} from "./spec-store"

export class RemoteSyncSpecStore implements SpecStore {
  private local = new LocalStorageSpecStore()
  // Flipped when loadFromServer sees 501 (file mode off) or an unreachable
  // server: from then on no mirror fetches are attempted, keeping standalone
  // mode exactly the localStorage baseline.
  private fileModeDisabled = false

  getSpec(id: string): SpecDocument | null {
    return this.local.getSpec(id)
  }

  saveSpec(id: string, title: string, yamlContent: string): SpecDocument {
    const doc = this.local.saveSpec(id, title, yamlContent)
    this.mirror(`/api/store/spec/${encodeURIComponent(id)}`, { title, yamlContent })
    return doc
  }

  getSimulationHistory(): SimulationRun[] {
    return this.local.getSimulationHistory()
  }

  saveSimulationHistory(history: SimulationRun[]): void {
    this.local.saveSimulationHistory(history)
    this.mirror("/api/store/meta/simulation_history", history)
  }

  clearSimulationHistory(): void {
    this.saveSimulationHistory([])
  }

  getCustomPresets(): CustomPreset[] {
    return this.local.getCustomPresets()
  }

  saveCustomPresets(presets: CustomPreset[]): void {
    this.local.saveCustomPresets(presets)
    this.mirror("/api/store/meta/custom_presets", presets)
  }

  /**
   * Pull server state into the local cache. Returns true when file mode is
   * active (the API route has a project dir), false on 501 or unreachable —
   * in which case the caller proceeds with local-only persistence.
   * A 404 spec response means "file mode on, no spec file yet": local cache
   * stays as-is so a first save creates the file.
   */
  async loadFromServer(): Promise<boolean> {
    if (typeof window === "undefined") return false
    try {
      const specRes = await fetch("/api/store/spec/main")
      // File mode off: the route answers {enabled:false} (200) — or a legacy
      // 501 — so standalone mode stays quiet and local-only.
      if (specRes.status === 501) {
        this.fileModeDisabled = true
        return false
      }
      if (specRes.ok) {
        const body = await specRes.json()
        if (body && body.enabled === false) {
          this.fileModeDisabled = true
          return false
        }
        if (body && typeof body.id === "string" && typeof body.yamlContent === "string") {
          this.local.saveSpec(body.id, typeof body.title === "string" ? body.title : "Untitled Spec", body.yamlContent)
        }
      }
      const historyRes = await fetch("/api/store/meta/simulation_history")
      if (historyRes.ok) {
        const history = await historyRes.json()
        if (Array.isArray(history)) this.local.saveSimulationHistory(history)
      }
      const presetsRes = await fetch("/api/store/meta/custom_presets")
      if (presetsRes.ok) {
        const presets = await presetsRes.json()
        if (Array.isArray(presets)) this.local.saveCustomPresets(presets)
      }
      return true
    } catch (e) {
      console.error("Failed to load spec store from server", e)
      this.fileModeDisabled = true
      return false
    }
  }

  private mirror(url: string, body: unknown): void {
    if (typeof window === "undefined" || this.fileModeDisabled) return
    fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch((e) => console.error(`Failed to mirror ${url} to server`, e))
  }
}

// The app-wide store instance. All consumers must take the store from here —
// not from spec-store — so writes are mirrored to the project files.
const specStore: RemoteSyncSpecStore = new RemoteSyncSpecStore()

export type { SpecDocument }
export default specStore
