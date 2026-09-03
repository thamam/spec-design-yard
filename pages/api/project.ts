import type { NextApiRequest, NextApiResponse } from "next"
import fs from "fs"
import os from "os"
import path from "path"
import {
  getProjectStatus,
  getSuggestedProjectDir,
  readGitBranch,
  setActiveProject,
  setStandaloneMode,
} from "../../lib/server-project-config"
import { isJsonContentType, isLoopbackHost } from "../../lib/server-request-guards"

// Project selection for the workspace — the primary way users pick where
// their specs live (project-first; see lib/server-project-config.ts).
//
// GET -> { mode:"project", dir, exists, source, recents }
//      | { mode:"standalone", recents }
//      | { mode:"unconfigured", suggestedDir, recents }   (first run)
// PUT { dir, create? }       -> switch to (optionally mkdir) a project folder
// PUT { mode:"standalone" }  -> explicit opt-out of project files
//
// Safety model (the store API is unauthenticated by design, loopback only):
// - Host header must be loopback: a DNS-rebinding page resolves to 127.0.0.1
//   but still sends its own hostname, so this blocks it from reading the
//   active path or retargeting writes.
// - PUT requires a JSON content type: cross-origin JSON needs a CORS
//   preflight (which we never answer), so simple-request CSRF can't switch.
// - The target must be an absolute path to an existing, writable directory
//   on this machine (create:true may mkdir it first — an explicit action).
// - Every switch re-mints the project epoch (stale-tab writes 409).

function expandHome(dir: string): string {
  if (dir === "~") return os.homedir()
  if (dir.startsWith("~/")) return path.join(os.homedir(), dir.slice(2))
  return dir
}

export default function projectHandler(req: NextApiRequest, res: NextApiResponse) {
  try {
    return handle(req, res)
  } catch (e) {
    console.error("[spec-yard] project route error", e)
    return res.status(500).json({ error: "Project operation failed" })
  }
}

function handle(req: NextApiRequest, res: NextApiResponse) {
  if (!isLoopbackHost(req.headers.host)) {
    return res.status(403).json({ error: "Project API is loopback-only" })
  }

  if (req.method === "GET") {
    const status = getProjectStatus()
    if (status.mode === "project") {
      let realDir = status.dir as string
      let exists = false
      try {
        realDir = fs.realpathSync(status.dir as string)
        exists = fs.statSync(realDir).isDirectory()
      } catch {
        // Stale config or launch typo: report it so the picker can warn.
      }
      return res.status(200).json({
        mode: "project",
        dir: realDir,
        exists,
        source: status.source,
        recents: status.recents,
        gitBranch: exists ? readGitBranch(realDir) : null,
      })
    }
    if (status.mode === "standalone") {
      return res.status(200).json({ mode: "standalone", recents: status.recents })
    }
    return res.status(200).json({ mode: "unconfigured", suggestedDir: getSuggestedProjectDir(), recents: status.recents })
  }

  if (req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  if (!isJsonContentType(req.headers["content-type"])) {
    return res.status(415).json({ error: "PUT requires Content-Type: application/json" })
  }

  const body = req.body
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "PUT requires a JSON body", code: "bad-request" })
  }

  if (body.mode === "standalone") {
    setStandaloneMode()
    return res.status(200).json({ ok: true, mode: "standalone" })
  }

  if (typeof body.dir !== "string" || body.dir.trim() === "") {
    return res.status(400).json({ error: "PUT requires { dir: string } or { mode: \"standalone\" }", code: "bad-request" })
  }

  const dir = expandHome(body.dir.trim())
  if (!path.isAbsolute(dir)) {
    return res.status(400).json({ error: "Project directory must be an absolute path", code: "not-absolute" })
  }

  if (body.create === true && !fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch {
      return res.status(400).json({ error: "Could not create directory", code: "create-failed" })
    }
  }

  let stat: fs.Stats
  try {
    stat = fs.statSync(dir)
  } catch {
    return res.status(400).json({ error: "Directory does not exist", code: "not-found" })
  }
  if (!stat.isDirectory()) {
    return res.status(400).json({ error: "Path is not a directory", code: "not-directory" })
  }
  try {
    fs.accessSync(dir, fs.constants.W_OK)
  } catch {
    return res.status(400).json({ error: "Directory is not writable", code: "not-writable" })
  }

  const realDir = fs.realpathSync(dir)
  setActiveProject(realDir)
  return res.status(200).json({ ok: true, mode: "project", dir: realDir })
}
