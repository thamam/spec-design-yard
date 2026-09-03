import type { NextApiRequest, NextApiResponse } from "next"
import { randomUUID } from "crypto"
import fs from "fs"
import path from "path"
import { writeFileAtomic } from "../../../lib/server-atomic-write"
import { getProjectEpoch, getProjectStatus } from "../../../lib/server-project-config"
import { isJsonContentType, isLoopbackHost, MAX_SPEC_YAML_BYTES } from "../../../lib/server-request-guards"

// File-backed persistence for the workspace store, active only when the app is
// launched with SPEC_YARD_PROJECT_DIR pointing at a client repo. Keys are
// whitelisted — the client never supplies a filesystem path — and every
// resolved path (spec, meta, spec-index) is containment-checked against the
// real (symlink-resolved) project root before any read or write.

// Null-prototype map: prototype-chain keys ("constructor", "__proto__", ...)
// must not pass the whitelist.
const META_FILES: Record<string, string> = Object.assign(Object.create(null), {
  simulation_history: "simulation_history.json",
  custom_presets: "custom_presets.json",
})

const SPEC_ID = "main"
const SPEC_FILENAME = "main.spec.yaml"
const SIDECAR_DIR = ".specyard"
const SPEC_INDEX_FILENAME = "spec-index.json"

interface SpecIndexEntry {
  title?: string
  updatedAt?: string
  /** Opaque collision-free write token; the client echoes it as baseRev. */
  rev?: string
  /** File mtime at our last write — catches raw external edits. */
  mtimeMs?: number
}

type ResolvedTarget =
  | { kind: "spec"; file: string }
  | { kind: "meta"; file: string }

function isInsideRoot(realRoot: string, candidate: string): boolean {
  return candidate === realRoot || candidate.startsWith(realRoot + path.sep)
}

/**
 * Containment check on REAL paths, not lexical ones: path.resolve does not
 * follow symlinks, so a symlinked `.specyard` (git carries symlinks — a cloned
 * repo can ship one) would pass a lexical startsWith check while writes land
 * outside the project. realpath the root, the file (when it exists), and the
 * nearest existing parent (for first writes).
 */
function isRealPathInsideRoot(realRoot: string, file: string): boolean {
  try {
    if (fs.existsSync(file)) {
      return isInsideRoot(realRoot, fs.realpathSync(file))
    }
    // Walk up to the nearest existing ancestor and realpath that.
    let dir = path.dirname(file)
    while (!fs.existsSync(dir)) {
      const parent = path.dirname(dir)
      if (parent === dir) return false
      dir = parent
    }
    return isInsideRoot(realRoot, fs.realpathSync(dir))
  } catch {
    return false
  }
}

function resolveTarget(segments: string[], realRoot: string): ResolvedTarget | null {
  let rel: string
  let kind: ResolvedTarget["kind"]
  if (segments.length === 2 && segments[0] === "spec" && segments[1] === SPEC_ID) {
    rel = SPEC_FILENAME
    kind = "spec"
  } else if (segments.length === 2 && segments[0] === "meta" && Object.hasOwn(META_FILES, segments[1])) {
    rel = path.join(SIDECAR_DIR, META_FILES[segments[1]])
    kind = "meta"
  } else {
    return null
  }
  const file = path.resolve(realRoot, rel)
  if (!isInsideRoot(realRoot, file) || !isRealPathInsideRoot(realRoot, file)) return null
  return { kind, file }
}

/** The sidecar index path gets the same containment treatment as targets. */
function resolveIndexPath(realRoot: string): string | null {
  const file = path.resolve(realRoot, SIDECAR_DIR, SPEC_INDEX_FILENAME)
  if (!isInsideRoot(realRoot, file) || !isRealPathInsideRoot(realRoot, file)) return null
  return file
}

/**
 * Missing or corrupted index is an empty index; an unreadable-but-present
 * index is a fault — treating it as empty would make the PUT path treat a
 * tracked file as untracked and overwrite it.
 */
function readSpecIndex(indexPath: string): Record<string, SpecIndexEntry> {
  let raw: string
  try {
    raw = fs.readFileSync(indexPath, "utf8")
  } catch (e: any) {
    if (e?.code === "ENOENT") return {}
    throw e
  }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed
  } catch {
    // Corrupted index is rebuilt from this save.
  }
  return {}
}

export default function storeHandler(req: NextApiRequest, res: NextApiResponse) {
  try {
    return handle(req, res)
  } catch (e) {
    console.error("[spec-yard] store route error", e)
    return res.status(500).json({ error: "Store operation failed" })
  }
}

function handle(req: NextApiRequest, res: NextApiResponse) {
  // File persistence is armed by default (project-first), so this route needs
  // the same DNS-rebinding defense as the project route — a rebinding page is
  // same-origin and could otherwise read or overwrite the project's files.
  if (!isLoopbackHost(req.headers?.host)) {
    return res.status(403).json({ error: "Store API is loopback-only" })
  }

  // Project-first resolution: session switch > SPEC_YARD_PROJECT_DIR >
  // persisted config (see lib/server-project-config.ts). Null means
  // standalone opt-out or a first run with no project chosen yet.
  const status = getProjectStatus()
  if (status.mode !== "project" || !status.dir) {
    // 200-with-flag rather than 501: having no project is a normal state, and
    // an error status would surface in the browser console on every load.
    // The mode rides along because the two no-project states are different
    // stories: "unconfigured" has chosen nothing yet and must open a calm
    // blank slate behind the picker, while "standalone" is a deliberate
    // browser-only opt-out that keeps the current spec (or a blank slate
    // when the browser cache is empty) — never a surprise demo.
    return res.status(200).json({ enabled: false, mode: status.mode })
  }
  const projectDir = status.dir
  let realRoot: string
  try {
    realRoot = fs.realpathSync(projectDir)
  } catch {
    // Loud 500: the client latches file mode off for the session; the picker
    // (project API) stays available to select a valid folder and heal this.
    return res.status(500).json({ error: "Active project directory does not exist" })
  }
  if (req.method !== "GET" && req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" })
  }
  if (req.method === "PUT" && !isJsonContentType(req.headers["content-type"])) {
    return res.status(415).json({ error: "PUT requires Content-Type: application/json" })
  }
  // Derived from the realpath we just resolved, so the whole request costs a
  // single project resolution.
  const epoch = getProjectEpoch(realRoot)

  // Project-epoch guard: the client echoes the epoch it hydrated under (query
  // param). After a picker switch the epoch changes, so a tab still armed on
  // the previous project 409s instead of writing into the new one. A PUT with
  // no epoch is allowed — hand-rolled loopback requests were always trusted;
  // this guard targets stale in-app sessions, not curl.
  const claimedEpoch = req.query.epoch
  if (req.method === "PUT" && typeof claimedEpoch === "string" && claimedEpoch !== epoch) {
    return res.status(409).json({ conflict: true, reason: "project-switched" })
  }

  const raw = req.query.path
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : []
  const target = resolveTarget(segments, realRoot)
  if (!target) {
    return res.status(400).json({ error: "Unknown store key" })
  }

  const indexPath = resolveIndexPath(realRoot)
  if (!indexPath) {
    return res.status(400).json({ error: "Unknown store key" })
  }

  if (req.method === "GET") {
    if (target.kind === "spec") {
      let contents: string
      try {
        contents = fs.readFileSync(target.file, "utf8")
      } catch (e: any) {
        // Only ENOENT is "nothing stored yet" (200 marker, kept off the browser
        // console). EACCES/EISDIR/EIO mean a spec exists but can't be read —
        // answering found:false there would let autosave overwrite a file we
        // failed to read, so those are 500s.
        if (e?.code === "ENOENT") return res.status(200).json({ found: false, epoch })
        return res.status(500).json({ error: "Failed to read spec file" })
      }
      const index = readSpecIndex(indexPath)
      // Migration: an entry written before rev existed gets one minted on
      // read (fail-closed — without this, its writes would 409 forever).
      if (index[SPEC_ID] && index[SPEC_ID].rev == null) {
        index[SPEC_ID].rev = randomUUID()
        index[SPEC_ID].mtimeMs = fs.statSync(target.file).mtimeMs
        writeFileAtomic(indexPath, JSON.stringify(index, null, 2), path.dirname(indexPath))
      }
      return res.status(200).json({
        id: SPEC_ID,
        title: index[SPEC_ID]?.title || "Untitled Spec",
        yamlContent: contents,
        updatedAt: index[SPEC_ID]?.updatedAt || null,
        rev: index[SPEC_ID]?.rev || null,
        epoch,
      })
    }
    try {
      return res.status(200).json(JSON.parse(fs.readFileSync(target.file, "utf8")))
    } catch (e: any) {
      // Missing (ENOENT) or corrupted JSON meta is a normal empty state;
      // unreadable-but-present is a fault.
      if (e?.code === "ENOENT" || e instanceof SyntaxError) return res.status(200).json(null)
      return res.status(500).json({ error: "Failed to read metadata" })
    }
  }

  // PUT
  if (target.kind === "spec") {
    const body = req.body
    if (!body || typeof body.yamlContent !== "string") {
      return res.status(400).json({ error: "PUT spec requires { title, yamlContent }" })
    }
    if (Buffer.byteLength(body.yamlContent, "utf8") > MAX_SPEC_YAML_BYTES) {
      return res.status(413).json({ error: "Spec exceeds the 1 MB size limit" })
    }
    // Optimistic concurrency. The client echoes the rev its edit was based on;
    // the index also records the file mtime from our last write, so a second
    // app instance (stale rev), a raw external edit (mtime mismatch — an
    // external editor doesn't touch the index), and an external deletion all
    // 409 instead of silently clobbering. A file with no index entry is
    // adopted: the app may legitimately open a repo whose main.spec.yaml was
    // authored by hand, and blocking first-save would brick that flow.
    const index = readSpecIndex(indexPath)
    const entry = index[SPEC_ID]
    if (entry) {
      // Legacy entry without a rev: refuse adoption-overwrite; the client must
      // GET first (which mints a rev and establishes the baseline).
      if (entry.rev == null) {
        return res.status(409).json({ conflict: true, reason: "legacy-index", current: { title: entry.title, updatedAt: entry.updatedAt } })
      }
      if (!fs.existsSync(target.file)) {
        return res.status(409).json({ conflict: true, reason: "deleted", current: { title: entry.title, updatedAt: entry.updatedAt } })
      }
      const currentMtime = fs.statSync(target.file).mtimeMs
      if (currentMtime !== entry.mtimeMs || body.baseRev !== entry.rev) {
        return res.status(409).json({ conflict: true, current: { title: entry.title, updatedAt: entry.updatedAt } })
      }
    }
    writeFileAtomic(target.file, body.yamlContent, path.dirname(indexPath))
    const updatedAt = new Date().toISOString()
    const rev = randomUUID()
    index[SPEC_ID] = {
      title: typeof body.title === "string" ? body.title : "Untitled Spec",
      updatedAt,
      rev,
      mtimeMs: fs.statSync(target.file).mtimeMs,
    }
    writeFileAtomic(indexPath, JSON.stringify(index, null, 2), path.dirname(indexPath))
    // Echo rev so the client can chain its next PUT on it.
    return res.status(200).json({ ok: true, updatedAt, rev })
  }

  writeFileAtomic(target.file, JSON.stringify(req.body ?? null, null, 2), path.dirname(target.file))
  return res.status(200).json({ ok: true })
}
