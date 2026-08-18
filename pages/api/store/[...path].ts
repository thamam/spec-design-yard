import type { NextApiRequest, NextApiResponse } from "next"
import fs from "fs"
import path from "path"

// File-backed persistence for the workspace store, active only when the app is
// launched with SPEC_YARD_PROJECT_DIR pointing at a client repo. Keys are
// whitelisted — the client never supplies a filesystem path — and every
// resolved path is containment-checked against the real (symlink-resolved)
// project root before any read or write.

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
  if (!isInsideRoot(realRoot, file)) return null
  return { kind, file }
}

function writeFileAtomic(file: string, contents: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, contents, "utf8")
  fs.renameSync(tmp, file)
}

function readSpecIndex(projectDir: string): Record<string, { title?: string; updatedAt?: string; mtimeMs?: number }> {
  try {
    const raw = fs.readFileSync(path.join(projectDir, SIDECAR_DIR, SPEC_INDEX_FILENAME), "utf8")
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed
  } catch {
    // Missing or corrupted index is rebuilt from this save.
  }
  return {}
}

export default function storeHandler(req: NextApiRequest, res: NextApiResponse) {
  const projectDir = process.env.SPEC_YARD_PROJECT_DIR
  if (!projectDir) {
    // 200-with-flag rather than 501: standalone mode is a normal configuration,
    // and an error status would surface in the browser console on every load.
    return res.status(200).json({ enabled: false })
  }
  let realRoot: string
  try {
    realRoot = fs.realpathSync(projectDir)
  } catch {
    return res.status(500).json({ error: "SPEC_YARD_PROJECT_DIR does not exist" })
  }
  if (req.method !== "GET" && req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const raw = req.query.path
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : []
  const target = resolveTarget(segments, realRoot)
  if (!target || !isRealPathInsideRoot(realRoot, target.file)) {
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
        if (e?.code === "ENOENT") return res.status(200).json({ found: false })
        return res.status(500).json({ error: "Failed to read spec file" })
      }
      const index = readSpecIndex(projectDir)
      return res.status(200).json({
        id: SPEC_ID,
        title: index[SPEC_ID]?.title || "Untitled Spec",
        yamlContent: contents,
        updatedAt: index[SPEC_ID]?.updatedAt || null,
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
    // Optimistic concurrency. The client echoes the updatedAt its edit was
    // based on; the index also records the file mtime from our last write, so
    // BOTH a second app instance (updatedAt mismatch) and a raw external edit
    // (mtime mismatch — an external editor doesn't touch the index) 409
    // instead of silently clobbering. A file with no index entry is adopted:
    // the app may legitimately open a repo whose main.spec.yaml was authored
    // by hand, and blocking first-save would brick that flow.
    const index = readSpecIndex(projectDir)
    const entry = index[SPEC_ID]
    if (fs.existsSync(target.file) && entry?.mtimeMs != null) {
      const currentMtime = fs.statSync(target.file).mtimeMs
      if (currentMtime !== entry.mtimeMs || body.baseUpdatedAt !== entry.updatedAt) {
        return res.status(409).json({ conflict: true, current: { title: entry.title, updatedAt: entry.updatedAt } })
      }
    }
    writeFileAtomic(target.file, body.yamlContent)
    const updatedAt = new Date().toISOString()
    index[SPEC_ID] = {
      title: typeof body.title === "string" ? body.title : "Untitled Spec",
      updatedAt,
      mtimeMs: fs.statSync(target.file).mtimeMs,
    }
    writeFileAtomic(path.join(projectDir, SIDECAR_DIR, SPEC_INDEX_FILENAME), JSON.stringify(index, null, 2))
    // Echo updatedAt so the client can chain its next PUT on it.
    return res.status(200).json({ ok: true, updatedAt })
  }

  writeFileAtomic(target.file, JSON.stringify(req.body ?? null, null, 2))
  return res.status(200).json({ ok: true })
}
