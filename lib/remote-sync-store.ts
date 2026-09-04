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
// - Spec writes carry a baseRev token. A 409 triggers a reconcile:
//   disk === this write → we already won (lost ack / other tab echoed us);
//   disk === our baseline → this session is ahead, retry, never "disk won";
//   disk is something else → real fork, latch off with Download + discard-reload.

import {
  LocalStorageSpecStore,
  type CustomPreset,
  type SimulationRun,
  type SpecDocument,
  type SpecStore,
} from "./spec-store"
import { normalizeLineEndings } from "./spec-model"
import { apiFetch, redirectToLoginOnUnauthorized } from "./api-client"

function sameYaml(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false
  return normalizeLineEndings(a) === normalizeLineEndings(b)
}

/**
 * Where saves are going, for the UI to display.
 * - "unconfigured": nothing chosen yet (first run) — the picker is asking.
 * - "local-only": browser storage by deliberate opt-out — calm.
 * - "synced": a project is active and mirroring is healthy.
 * - "halted": mirroring latched off mid-session (conflict, project switched
 *   elsewhere, broken store) — edits stay in the browser; reload to resync.
 *
 * "unconfigured" and "local-only" both mean "not writing files", but they are
 * different stories to the user, and the workspace opens a different starting
 * spec for each — so they stay distinct rather than collapsing into one.
 */
export type HaltKind = "retry" | "adopt" | "rejoin"

export interface SyncState {
  status: "unconfigured" | "local-only" | "synced" | "halted"
  reason?: string
  /** How the status bar should recover a halted session. Absent unless halted. */
  haltKind?: HaltKind
}

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
  // The project epoch this session hydrated under (?epoch= on every PUT).
  // The server re-mints it when the picker switches projects, so a tab armed
  // on the previous project 409s instead of writing into the new one.
  private serverEpoch: string | null = null
  // The yamlContent of the most recent PUT we attempted — lets a 409 caused
  // by a lost ack be distinguished from a genuine external edit.
  private lastMirroredYaml: string | null = null
  // Serializes spec PUTs so their baseRev chaining stays valid.
  private specPutChain: Promise<void> = Promise.resolve()
  // Per-URL serialization for meta PUTs (same out-of-order-landing risk).
  private metaChains = new Map<string, Promise<void>>()
  // Meta writes attempted before arm() (pre-hydration user actions) are
  // stashed per URL and flushed after hydration's pulls land, so an early
  // simulation run isn't silently discarded. The apply fn re-syncs the local
  // delegate, which pullMeta may have overwritten with server state.
  private pendingMeta = new Map<string, { body: unknown; apply: (v: any) => void }>()
  // Current sync state + subscribers (plain callbacks — lib stays React-free).
  private syncState: SyncState = { status: "local-only" }
  private syncListeners = new Set<(s: SyncState) => void>()

  /** Called by the workspace when hydration completes; arms mirroring and
   *  flushes any pre-hydration meta writes on top of the pulled state. */
  arm(): void {
    this.armed = true
    this.pendingMeta.forEach(({ body, apply }, url) => {
      apply(body)
      this.mirror(url, body, apply)
    })
    this.pendingMeta.clear()
  }

  /**
   * Soft-switch to browser storage without remounting the workspace.
   * The current spec stays in the local cache; file mirroring stops.
   */
  adoptStandalone(): void {
    this.fileModeDisabled = true
    this.serverEpoch = null
    this.setSyncState({ status: "local-only" })
    // Keep a browser-only sketch portable into the next project the user
    // picks — same tag loadFromServer already treats as adoptable.
    if (this.local.getSpec("main")) this.setCacheOrigin("main", "standalone")
  }

  getSyncState(): SyncState {
    return this.syncState
  }

  /** Returns an unsubscribe function. */
  subscribeSyncState(listener: (s: SyncState) => void): () => void {
    this.syncListeners.add(listener)
    return () => this.syncListeners.delete(listener)
  }

  private setSyncState(next: SyncState): void {
    this.syncState = next
    this.syncListeners.forEach((l) => l(next))
  }

  getSpec(id: string): SpecDocument | null {
    return this.local.getSpec(id)
  }

  saveSpec(id: string, title: string, yamlContent: string): SpecDocument {
    const doc = this.local.saveSpec(id, title, yamlContent)
    this.setCacheOrigin(id, this.originForWrites())
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
    this.mirror("/api/store/meta/simulation_history", history, (v) => this.local.saveSimulationHistory(v))
  }

  clearSimulationHistory(): void {
    this.saveSimulationHistory([])
  }

  getCustomPresets(): CustomPreset[] {
    return this.local.getCustomPresets()
  }

  saveCustomPresets(presets: CustomPreset[]): void {
    this.local.saveCustomPresets(presets)
    this.mirror("/api/store/meta/custom_presets", presets, (v) => this.local.saveCustomPresets(v))
  }

  // Cache-local eviction (tests, cross-project bleed guard). Deliberately NOT
  // mirrored: the project file is never deleted by the store.
  removeSpec(id: string): void {
    this.local.removeSpec(id)
    this.clearCacheOrigin(id)
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
      const specRes = await apiFetch("/api/store/spec/main")
      if (redirectToLoginOnUnauthorized(specRes.status)) return false
      // File mode off: the route answers {enabled:false} (200) — or a legacy
      // 501 — so standalone mode stays quiet and local-only.
      if (specRes.status === 501) {
        this.fileModeDisabled = true
        this.setSyncState({ status: "local-only" })
        return false
      }
      if (!specRes.ok) {
        // 5xx: the launch intended file mode but the server is broken (e.g.
        // missing project dir). Loud log, local-only for the session.
        console.error(`[spec-yard] Store API returned ${specRes.status} — file persistence disabled for this session`)
        this.fileModeDisabled = true
        this.setSyncState({
          status: "halted",
          haltKind: "rejoin",
          reason: "Project store error — saving to browser only. Download this spec, then fix the project and reload.",
        })
        return false
      }
      const body = await specRes.json()
      if (body && body.enabled === false) {
        this.fileModeDisabled = true
        this.setSyncState({ status: body.mode === "unconfigured" ? "unconfigured" : "local-only" })
        return false
      }
      // File mode confirmed on — clear any latch from a previous failed
      // attempt (e.g. a Fast Refresh remount after a transient error).
      this.fileModeDisabled = false
      this.setSyncState({ status: "synced" })
      this.serverEpoch = body && typeof body.epoch === "string" ? body.epoch : null
      if (body && typeof body.id === "string" && typeof body.yamlContent === "string") {
        this.local.saveSpec(body.id, typeof body.title === "string" ? body.title : "Untitled Spec", body.yamlContent)
        // "unknown-project" (server sent no epoch) never satisfies the
        // standalone-adoption check below — fail closed against bleed.
        this.setCacheOrigin(body.id, this.serverEpoch ?? "unknown-project")
        this.serverRev = typeof body.rev === "string" ? body.rev : null
        this.lastMirroredYaml = normalizeLineEndings(body.yamlContent)
      } else {
        // {found:false}: file mode on, nothing stored for THIS project.
        // A cache tagged "standalone" is the user's browser-only sketch and
        // this is their first project — adopt it rather than deleting their
        // only copy (it is still not written until they edit). Any other
        // cache (another project's, or untagged legacy) is dropped so it is
        // never written into this project.
        const origin = this.getCacheOrigin("main")
        if (origin !== "standalone" || !this.local.getSpec("main")) {
          this.local.removeSpec("main")
          this.clearCacheOrigin("main")
        }
        this.serverRev = null
        this.lastMirroredYaml = null
      }
    } catch (e) {
      console.error("Failed to load spec store from server", e)
      this.fileModeDisabled = true
      // Server unreachable: the whole app is served by it, so this is either
      // a dying dev server or a test environment — browser-only is accurate.
      this.setSyncState({ status: "local-only" })
      return false
    }
    // Meta pulls are best-effort and scoped: a failure here never gates mode.
    await this.pullMeta("/api/store/meta/simulation_history", (v) => this.local.saveSimulationHistory(v))
    await this.pullMeta("/api/store/meta/custom_presets", (v) => this.local.saveCustomPresets(v))
    return true
  }

  private async pullMeta(url: string, apply: (value: any[]) => void): Promise<void> {
    try {
      const res = await apiFetch(url)
      if (redirectToLoginOnUnauthorized(res.status)) return
      if (!res.ok) {
        console.error(`[spec-yard] Failed to load ${url} (${res.status})`)
        return
      }
      const value = await res.json()
      // An authoritative non-array (null = nothing stored; a wrong-shape file
      // = not ours) clears the cache rather than showing another project's
      // leftovers.
      if (Array.isArray(value)) apply(value)
      else apply([])
    } catch (e) {
      console.error(`[spec-yard] Failed to load ${url}`, e)
    }
  }

  private async putSpec(url: string, body: { title: string; yamlContent: string }): Promise<void> {
    // What the server should hold if our PREVIOUS (serialized) PUT landed —
    // the reference point for distinguishing a lost ack from a real conflict.
    const prevMirrored = this.lastMirroredYaml
    this.lastMirroredYaml = normalizeLineEndings(body.yamlContent)
    try {
      const res = await this.putJson(url, { ...body, baseRev: this.serverRev })
      if (redirectToLoginOnUnauthorized(res.status)) return
      if (res.status === 409) {
        // The picker retargeted the server in another tab. Never reconcile
        // there — a lost-ack retry would push THIS project's spec into the
        // newly selected one.
        if (await this.isProjectSwitch(res)) {
          this.latchProjectSwitched()
          return
        }
        await this.reconcileAfterConflict(url, body, prevMirrored)
        return
      }
      if (!res.ok) {
        // Not a conflict — a broken store (project dir deleted mid-session,
        // disk full, permissions). Say so instead of leaving the status bar
        // claiming "synced", but do NOT latch file mode off: the next
        // autosave may well land, and a success below clears this.
        console.error(`[spec-yard] Spec save failed (${res.status}) — latest edits are only in browser storage`)
        this.setSyncState({
          status: "halted",
          haltKind: "retry",
          reason: `Last save failed (${res.status}) — edits are in browser storage; still retrying.`,
        })
        return
      }
      await this.adoptAckRev(res)
      // A save landed: clear a transient-failure alarm. A latched conflict
      // never reaches here (fileModeDisabled stops the PUT).
      if (this.syncState.status !== "synced") this.setSyncState({ status: "synced" })
    } catch (e) {
      // Same honesty as !res.ok: a thrown fetch left the bar claiming
      // "Synced to project" while nothing reached the file.
      console.error(`[spec-yard] Failed to mirror ${url} to server`, e)
      this.setSyncState({
        status: "halted",
        haltKind: "retry",
        reason: "Last save failed (network) — edits are in browser storage; still retrying.",
      })
    }
  }

  /**
   * Classify a 409 against what disk actually holds. Own-session writeback
   * (canvas connect, drag) often 409s because the index mtime/rev drifted
   * while yaml did not — that is never "disk won".
   */
  private async reconcileAfterConflict(
    url: string,
    body: { title: string; yamlContent: string },
    prevMirrored: string | null
  ): Promise<void> {
    try {
      const res = await apiFetch(url)
      if (redirectToLoginOnUnauthorized(res.status)) return
      if (res.ok) {
        const current = await res.json().catch(() => null)
        const disk = typeof current?.yamlContent === "string" ? current.yamlContent : null
        if (sameYaml(disk, body.yamlContent)) {
          if (typeof current.rev === "string") this.serverRev = current.rev
          this.lastMirroredYaml = normalizeLineEndings(body.yamlContent)
          if (this.syncState.status !== "synced") this.setSyncState({ status: "synced" })
          return
        }
        if (sameYaml(disk, prevMirrored)) {
          if (typeof current.rev === "string") {
            this.serverRev = current.rev
            const retry = await this.putJson(url, { ...body, baseRev: this.serverRev })
            if (redirectToLoginOnUnauthorized(retry.status)) return
            if (retry.ok) {
              await this.adoptAckRev(retry)
              if (this.syncState.status !== "synced") this.setSyncState({ status: "synced" })
              return
            }
          }
          // Disk never moved. Roll lastMirroredYaml back to that baseline so
          // Retry save does not treat the unsaved buffer as "what disk has".
          this.lastMirroredYaml = prevMirrored != null ? normalizeLineEndings(prevMirrored) : null
          this.latchBufferAhead()
          return
        }
      }
    } catch {
      // Fall through to a real-fork latch below.
    }
    this.fileModeDisabled = true
    this.setSyncState({
      status: "halted",
      haltKind: "adopt",
      reason:
        "main.spec.yaml differs from this session. Download your copy to keep it. Reload discards this session and uses the file on disk.",
    })
    console.error(
      "[spec-yard] Conflict: main.spec.yaml differs from this session; not overwriting. Download this copy, or reload to adopt the file on disk."
    )
  }

  /** Disk still has what we last loaded/acked — this buffer is the newer copy. */
  private latchBufferAhead(): void {
    this.setSyncState({
      status: "halted",
      haltKind: "retry",
      reason: "Could not save this session's edits. Download your copy — they have not reached disk yet.",
    })
    console.error(
      "[spec-yard] Save refused but disk still matches this session's baseline; edits have not reached the file."
    )
  }

  private mirror(url: string, body: unknown, apply: (v: any) => void): void {
    if (typeof window === "undefined") return
    if (this.fileModeDisabled) return
    if (!this.armed) {
      // Pre-hydration write: stash the latest value per URL; arm() flushes.
      this.pendingMeta.set(url, { body, apply })
      return
    }
    const prev = this.metaChains.get(url) ?? Promise.resolve()
    const next = prev.then(() => this.putMeta(url, body))
    this.metaChains.set(url, next)
  }

  private async putMeta(url: string, body: unknown): Promise<void> {
    try {
      const res = await this.putJson(url, body)
      if (redirectToLoginOnUnauthorized(res.status)) return
      if (res.status === 409 && (await this.isProjectSwitch(res))) {
        this.latchProjectSwitched()
        return
      }
      if (!res.ok) console.error(`[spec-yard] Mirror to ${url} failed (${res.status}) — data is only in browser storage`)
    } catch (e) {
      console.error(`Failed to mirror ${url} to server`, e)
    }
  }

  /**
   * Where the content being cached belongs. loadFromServer uses this tag to
   * migrate a browser-only sketch into the first project the user picks,
   * while dropping any cache that belongs to a different project.
   *
   * Only genuinely project-less work is portable. Anything written while a
   * project is (or was) active is tagged with that project's epoch — or
   * "unknown-project" when the server never volunteered one, which the
   * migration check never adopts. Failing closed matters here: "standalone"
   * is the one tag that gets adopted, so guessing it wrong bleeds one
   * project's spec into another.
   */
  private originForWrites(): string {
    const status = this.syncState.status
    if (status === "unconfigured" || status === "local-only") return "standalone"
    return this.serverEpoch ?? "unknown-project"
  }

  // Provenance tag for the cached spec (sits beside spec_<id> in
  // localStorage). Reads/writes are best-effort — a storage failure only
  // costs the migration convenience, never correctness.
  private setCacheOrigin(id: string, origin: string): void {
    if (typeof window === "undefined") return
    try {
      localStorage.setItem(`spec_${id}_origin`, origin)
    } catch {}
  }

  private getCacheOrigin(id: string): string | null {
    if (typeof window === "undefined") return null
    try {
      return localStorage.getItem(`spec_${id}_origin`)
    } catch {
      return null
    }
  }

  private clearCacheOrigin(id: string): void {
    if (typeof window === "undefined") return
    try {
      localStorage.removeItem(`spec_${id}_origin`)
    } catch {}
  }

  /** The one shape every mirror write takes: JSON envelope, and ?epoch= once
   *  the server has told us which project this session is bound to (a stale
   *  epoch 409s instead of writing into a project the user switched away
   *  from). */
  private putJson(url: string, payload: unknown): Promise<Response> {
    const target = this.serverEpoch ? `${url}?epoch=${encodeURIComponent(this.serverEpoch)}` : url
    return apiFetch(target, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  }

  /** Consumes the 409 body: true when the picker retargeted the server. */
  private async isProjectSwitch(res: Response): Promise<boolean> {
    const conflict: any = await res.json().catch(() => null)
    return !!conflict && conflict.reason === "project-switched"
  }

  /** Chain the next PUT on the rev the server just minted. */
  private async adoptAckRev(res: Response): Promise<void> {
    const ack: any = await res.json().catch(() => null)
    if (ack && typeof ack.rev === "string") this.serverRev = ack.rev
  }

  private latchProjectSwitched(): void {
    this.fileModeDisabled = true
    this.setSyncState({
      status: "halted",
      haltKind: "rejoin",
      reason: "The active project changed in another tab. Download this spec, or reload to join the other project.",
    })
    console.error(
      "[spec-yard] The active project changed in another tab/window; this session stopped mirroring. Reload the workspace to join the new project."
    )
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
