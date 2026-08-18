// Remote-sync store: implements the synchronous SpecStore seam by delegating
// to LocalStorageSpecStore (which becomes a write-through cache) and mirroring
// every write to the file-backed API route.
//
// Failure policy (distilled from two adversarial review rounds on PR #10):
// - Only the spec GET gates file mode. Meta fetch failures are scoped to
//   themselves — one bad preset fetch must not disable persistence.
// - Mirrors stay silent until arm() is called (end of workspace hydration):
//   pre-hydration writes would race the in-flight server pull.
// - All PUTs check res.ok and are serialized per URL (spec via specPutChain,
//   meta via per-URL chains) — parallel fire-and-forget would race the
//   optimistic-concurrency base and can land out of order.
// - Spec writes carry a baseRev token. A 409 triggers a reconcile: if the
//   server holds exactly what we last sent, our ack was merely lost — adopt
//   the fresh rev and retry once. A real divergence latches file mode off
//   with a loud reload instruction rather than clobbering the external change.

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
  // genuine conflict forces us to stop: no mirror fetches after that.
  private fileModeDisabled = false
  // Mirrors stay silent until the workspace finishes hydrating (arm()).
  private armed = false
  // The spec-index rev this session's edits are based on (echoed back as
  // baseRev on PUT). null until the server tells us.
  private serverRev: string | null = null
  // The yamlContent of the most recent PUT we attempted — lets a 409 caused
  // by a lost ack be distinguished from a genuine external edit.
  private lastMirroredYaml: string | null = null
  // Serializes spec PUTs so their baseRev chaining stays valid.
  private specPutChain: Promise<void> = Promise.resolve()
  // Per-URL serialization for meta PUTs (same out-of-order-landing risk).
  private metaChains = new Map<string, Promise<void>>()

  /** Called by the workspace when hydration completes; arms mirroring. */
  arm(): void {
    this.armed = true
  }

  getSpec(id: string): SpecDocument | null {
    return this.local.getSpec(id)
  }

  saveSpec(id: string, title: string, yamlContent: string): SpecDocument {
    const doc = this.local.saveSpec(id, title, yamlContent)
    if (!this.canMirror()) return doc
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

  // Cache-local eviction (tests, cross-project bleed guard). Deliberately NOT
  // mirrored: the project file is never deleted by the store.
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
        this.serverRev = typeof body.rev === "string" ? body.rev : null
        this.lastMirroredYaml = body.yamlContent
      } else {
        // {found:false}: file mode on, nothing stored for THIS project. Drop
        // the cached spec so another project's spec is never written here.
        this.local.removeSpec("main")
        this.serverRev = null
        this.lastMirroredYaml = null
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
      if (!res.ok) {
        console.error(`[spec-yard] Failed to load ${url} (${res.status})`)
        return
      }
      const value = await res.json()
      // An authoritative null means THIS project has no stored metadata —
      // clear the cache rather than showing another project's leftovers.
      if (Array.isArray(value)) apply(value)
      else if (value === null) apply([])
    } catch (e) {
      console.error(`[spec-yard] Failed to load ${url}`, e)
    }
  }

  private async putSpec(url: string, body: { title: string; yamlContent: string }): Promise<void> {
    // What the server should hold if our PREVIOUS (serialized) PUT landed —
    // the reference point for distinguishing a lost ack from a real conflict.
    const prevMirrored = this.lastMirroredYaml
    this.lastMirroredYaml = body.yamlContent
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, baseRev: this.serverRev }),
      })
      if (res.status === 409) {
        await this.reconcileAfterConflict(url, body, prevMirrored)
        return
      }
      if (!res.ok) {
        console.error(`[spec-yard] Spec save failed (${res.status}) — latest edits are only in browser storage`)
        return
      }
      const ack = await res.json().catch(() => null)
      if (ack && typeof ack.rev === "string") this.serverRev = ack.rev
    } catch (e) {
      console.error(`[spec-yard] Failed to mirror ${url} to server`, e)
    }
  }

  /**
   * A 409 is genuine when the server holds something other than what we last
   * sent. When it holds exactly our last PUT, that write landed but its ack
   * was lost — adopt the fresh rev and retry once. Genuine conflicts latch
   * file mode off with a reload instruction.
   */
  private async reconcileAfterConflict(
    url: string,
    body: { title: string; yamlContent: string },
    prevMirrored: string | null
  ): Promise<void> {
    try {
      const res = await fetch(url)
      if (res.ok) {
        const current = await res.json().catch(() => null)
        if (current && current.yamlContent === prevMirrored && typeof current.rev === "string") {
          this.serverRev = current.rev
          const retry = await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, baseRev: this.serverRev }),
          })
          if (retry.ok) {
            const ack = await retry.json().catch(() => null)
            if (ack && typeof ack.rev === "string") this.serverRev = ack.rev
            return
          }
        }
      }
    } catch {
      // Fall through to latch-off below.
    }
    this.fileModeDisabled = true
    console.error(
      "[spec-yard] Conflict: main.spec.yaml changed outside this session; not overwriting. Reload the workspace to adopt the external version."
    )
  }

  private mirror(url: string, body: unknown): void {
    if (!this.canMirror()) return
    const prev = this.metaChains.get(url) ?? Promise.resolve()
    const next = prev.then(() => this.putMeta(url, body))
    this.metaChains.set(url, next)
  }

  private async putMeta(url: string, body: unknown): Promise<void> {
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) console.error(`[spec-yard] Mirror to ${url} failed (${res.status}) — data is only in browser storage`)
    } catch (e) {
      console.error(`Failed to mirror ${url} to server`, e)
    }
  }

  private canMirror(): boolean {
    return typeof window !== "undefined" && this.armed && !this.fileModeDisabled
  }
}

// The app-wide store instance. All consumers must take the store from here —
// not from spec-store — so writes are mirrored to the project files.
const specStore: RemoteSyncSpecStore = new RemoteSyncSpecStore()

export type { SpecDocument }
export default specStore
