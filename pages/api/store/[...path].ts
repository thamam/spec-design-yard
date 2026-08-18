import type { NextApiRequest, NextApiResponse } from "next"
import fs from "fs"
import path from "path"

// File-backed persistence for the workspace store, active only when the app is
// launched with SPEC_YARD_PROJECT_DIR pointing at a client repo. Keys are
// whitelisted — the client never supplies a filesystem path — so writes cannot
// escape the project directory by construction (double-checked below).

const META_FILES: Record<string, string> = {
  simulation_history: "simulation_history.json",
  custom_presets: "custom_presets.json",
}

const SPEC_ID = "main"
const SPEC_FILENAME = "main.spec.yaml"
const SIDECAR_DIR = ".specyard"
const SPEC_INDEX_FILENAME = "spec-index.json"

type ResolvedTarget =
  | { kind: "spec"; file: string }
  | { kind: "meta"; file: string }

function resolveTarget(segments: string[], projectDir: string): ResolvedTarget | null {
  let rel: string
  let kind: ResolvedTarget["kind"]
  if (segments.length === 2 && segments[0] === "spec" && segments[1] === SPEC_ID) {
    rel = SPEC_FILENAME
    kind = "spec"
  } else if (segments.length === 2 && segments[0] === "meta" && META_FILES[segments[1]]) {
    rel = path.join(SIDECAR_DIR, META_FILES[segments[1]])
    kind = "meta"
  } else {
    return null
  }
  const root = path.resolve(projectDir)
  const file = path.resolve(root, rel)
  if (file !== root && !file.startsWith(root + path.sep)) return null
  return { kind, file }
}

function writeFileAtomic(file: string, contents: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, contents, "utf8")
  fs.renameSync(tmp, file)
}

function readSpecIndex(projectDir: string): Record<string, { title?: string; updatedAt?: string }> {
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
  if (!fs.existsSync(projectDir)) {
    return res.status(500).json({ error: "SPEC_YARD_PROJECT_DIR does not exist" })
  }
  if (req.method !== "GET" && req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const raw = req.query.path
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : []
  const target = resolveTarget(segments, projectDir)
  if (!target) {
    return res.status(400).json({ error: "Unknown store key" })
  }

  if (req.method === "GET") {
    try {
      const contents = fs.readFileSync(target.file, "utf8")
      if (target.kind === "spec") {
        const index = readSpecIndex(projectDir)
        return res.status(200).json({
          id: SPEC_ID,
          title: index[SPEC_ID]?.title || "Untitled Spec",
          yamlContent: contents,
          updatedAt: index[SPEC_ID]?.updatedAt || null,
        })
      }
      return res.status(200).json(JSON.parse(contents))
    } catch {
      // Missing file or corrupted JSON: answer 200 with an empty marker rather
      // than 404 — a 404 shows up as a console error in the browser on every
      // fresh launch, and "nothing stored yet" is a normal state, not a fault.
      return res.status(200).json(target.kind === "spec" ? { found: false } : null)
    }
  }

  // PUT
  if (target.kind === "spec") {
    const body = req.body
    if (!body || typeof body.yamlContent !== "string") {
      return res.status(400).json({ error: "PUT spec requires { title, yamlContent }" })
    }
    writeFileAtomic(target.file, body.yamlContent)
    const index = readSpecIndex(projectDir)
    index[SPEC_ID] = {
      title: typeof body.title === "string" ? body.title : "Untitled Spec",
      updatedAt: new Date().toISOString(),
    }
    writeFileAtomic(path.join(projectDir, SIDECAR_DIR, SPEC_INDEX_FILENAME), JSON.stringify(index, null, 2))
    return res.status(200).json({ ok: true })
  }

  writeFileAtomic(target.file, JSON.stringify(req.body ?? null, null, 2))
  return res.status(200).json({ ok: true })
}
