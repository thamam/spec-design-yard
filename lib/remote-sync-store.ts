// Remote-sync store: implements the synchronous SpecStore seam by delegating
// to LocalStorageSpecStore (which becomes a write-through cache) and mirroring
// every write to the file-backed API route.
//
// Failure policy (distilled from adversarial review of PR #10):
// - Only the spec GET gates file mode. Meta fetch failures are scoped to
//   themselves — one bad preset fetch must not silently disable persistence
//   for the session.
// - mirror() checks res.ok; HTTP failures are logged loudly, never thrown
//   into the UI. Spec PUTs are serialized (promise chain) because they carry
//   optimistic-concurrency bases — parallel fire-and-forget would 409 itself.
// - A 409 conflict (file changed outside this session) stops mirroring and
//   logs a reload instruction rather than clobbering the external change.

import {
  LocalStorageSpecStore,
  type CustomPreset,
  type SimulationRun,
  type SpecDocument,
  type SpecStore,
} from "./spec-store"

export class RemoteSyncSpecStore implements SpecStore {
  private local = new LocalStorageSpecStore()
  // Flipped when loadFromServer sees file mode off / unreachable, or a
  // conflict forces us to stop: from then on no mirror fetches are attempted,
  // keeping standalone mode exactly the localStorage baseline.
  private fileModeDisabled = false
  // The spec-index updatedAt this session's edits are based on (echoed back
  // as baseUpdatedAt on PUT). null until the server tells us.
  private serverUpdatedAt: string | null = null
  // Serializes spec PUTs so their baseUpdatedAt chaining stays valid.
  private specPutChain: Promise<void> = Promise.resolve()

  getSpec(id: string): SpecDocument | null {
    return this.local.getSpec(id)
  }

  saveSpec(id: string, title: string, yamlContent: string): SpecDocument {
    const doc = this.local.saveSpec(id, title, yamlContent)
    if (typeof window === "undefined" || this.fileModeDisabled) return doc
    this.specPutChain = this.specPutChain.then(() =>
      this.putSpec(`/api/store/spec/${encodeURIComponent(id)}`, { title, yamlContent })
    )
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

  removeSpec(id: string): void {
    this.local.removeSpec(id)
  }

  /**
   * Pull server state into the local cache. Returns true when file mode is
   * active (the API route has a project dir), false when off or unreachable —
   * in which case the caller proceeds with local-only persistence.
   * A {found:false} spec response means "file mode on, no spec file yet" — a
   * DIFFERENT project than the cache may hold, so the cached spec is dropped
   * rather than bled into the new repo on first autosave.
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
      if (!specRes.ok) {
        // 5xx: the launch intended file mode but the server is broken (e.g.
        // typo'd SPEC_YARD_PROJECT_DIR). Loud log, local-only for the session.
        console.error(`[spec-yard] Store API returned ${specRes.status} — file persistence disabled for this session`)
        this.fileModeDisabled = true
        return false
      }
      const body = await specRes.json()
      if (body && body.enabled === false) {
        this.fileModeDisabled = true
        return false
      }
      if (body && typeof body.id === "string" && typeof body.yamlContent === "string") {
        this.local.saveSpec(body.id, typeof body.title === "string" ? body.title : "Untitled Spec", body.yamlContent)
        this.serverUpdatedAt = typeof body.updatedAt === "string" ? body.updatedAt : null
      } else {
        // {found:false}: file mode on, nothing stored for THIS project. Drop
        // the cached spec so another project's spec is never written here.
        this.local.removeSpec("main")
        this.serverUpdatedAt = null
      }
    } catch (e) {
      console.error("Failed to load spec store from server", e)
      this.fileModeDisabled = true
      return false
    }
    // Meta pulls are best-effort and scoped: a failure here never gates mode.
    await this.pullMeta("/api/store/meta/simulation_history", (v) => this.local.saveSimulationHistory(v))
    await this.pullMeta("/api/store/meta/custom_presets", (v) => this.local.saveCustomPresets(v))
    return true
  }

  private async pullMeta(url: string, apply: (value: any[]) => void): Promise<void> {
    try {
      const res = await fetch(url)
      if (res.ok) {
        const value = await res.json()
        if (Array.isArray(value)) apply(value)
      } else {
        console.error(`[spec-yard] Failed to load ${url} (${res.status})`)
      }
    } catch (e) {
      console.error(`[spec-yard] Failed to load ${url}`, e)
    }
  }

  private async putSpec(url: string, body: { title: string; yamlContent: string }): Promise<void> {
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, baseUpdatedAt: this.serverUpdatedAt }),
      })
      if (res.status === 409) {
        this.fileModeDisabled = true
        console.error(
          "[spec-yard] Conflict: main.spec.yaml changed outside this session; not overwriting. Reload the workspace to adopt the external version."
        )
        return
      }
      if (!res.ok) {
        console.error(`[spec-yard] Spec save failed (${res.status}) — latest edits are only in browser storage`)
        return
      }
      const ack = await res.json().catch(() => null)
      if (ack && typeof ack.updatedAt === "string") this.serverUpdatedAt = ack.updatedAt
    } catch (e) {
      console.error(`[spec-yard] Failed to mirror ${url} to server`, e)
    }
  }

  private mirror(url: string, body: unknown): void {
    if (typeof window === "undefined" || this.fileModeDisabled) return
    fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((res) => {
        if (!res.ok) console.error(`[spec-yard] Mirror to ${url} failed (${res.status}) — data is only in browser storage`)
      })
      .catch((e) => console.error(`Failed to mirror ${url} to server`, e))
  }
}

// The app-wide store instance. All consumers must take the store from here —
// not from spec-store — so writes are mirrored to the project files.
const specStore: RemoteSyncSpecStore = new RemoteSyncSpecStore()

export type { SpecDocument }
export default specStore
