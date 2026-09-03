// SERVER-ONLY (imports node fs/os/crypto; API routes only — never import from
// client code). The project-first persistence registry.
//
// Working in a project folder is the DEFAULT story: the active project is
// remembered in <SPEC_YARD_CONFIG_DIR>/config.json (default ~/.specyard), so
// a bare `npm run dev` reopens the last project. Resolution order:
//   1. a switch made in this session (GUI/CLI via the project API)
//   2. SPEC_YARD_PROJECT_DIR — wins for the session and seeds the config,
//      so the next bare launch continues in that project
//   3. the persisted config (last project, or an explicit standalone opt-out)
//   4. nothing anywhere -> "unconfigured": the UI prompts once for a folder
//
// Session state lives on globalThis because Next dev bundles each API route
// as its own entry — plain module state would be duplicated per route and the
// store route would never see the picker's switch. The epoch is derived from
// the active project's identity; store PUTs echo it, so a tab still armed on
// the previous project 409s instead of writing into the new one.

import { createHash } from "crypto"
import fs from "fs"
import os from "os"
import path from "path"
import { writeFileAtomic } from "./server-atomic-write"

export type PersistenceMode = "project" | "standalone" | "unconfigured"

export interface ProjectStatus {
  mode: PersistenceMode
  /** Active project dir when mode === "project", else null. */
  dir: string | null
  source: "gui" | "env" | "config" | null
  recents: string[]
}

interface PersistedConfig {
  mode?: "project" | "standalone"
  activeProject?: string | null
  recentProjects?: string[]
}

interface SessionState {
  selection: { kind: "project"; dir: string } | { kind: "standalone" } | null
  envSeeded: boolean
}

const state: SessionState = ((globalThis as any).__specYardProjectState ??= {
  selection: null,
  envSeeded: false,
})

const RECENTS_CAP = 8

function configDir(): string {
  return process.env.SPEC_YARD_CONFIG_DIR || path.join(os.homedir(), ".specyard")
}

function configPath(): string {
  return path.join(configDir(), "config.json")
}

/** Missing or corrupted config is a fresh install, never a crash. */
function readConfig(): PersistedConfig {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), "utf8"))
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed
  } catch {
    // ENOENT or bad JSON: fall through to empty.
  }
  return {}
}

/** Config writes are a convenience (remembering the project); failure must
 *  never break a request — the session keeps working un-remembered. */
function writeConfig(cfg: PersistedConfig): void {
  try {
    writeFileAtomic(configPath(), JSON.stringify(cfg, null, 2), configDir())
  } catch (e) {
    console.error("[spec-yard] Failed to persist project config", e)
  }
}

function bumpRecents(recents: string[] | undefined, dir: string): string[] {
  const clean = Array.isArray(recents) ? recents.filter((d) => typeof d === "string" && d !== dir) : []
  return [dir, ...clean].slice(0, RECENTS_CAP)
}

function recentsFrom(cfg: PersistedConfig): string[] {
  return Array.isArray(cfg.recentProjects) ? cfg.recentProjects.filter((d) => typeof d === "string") : []
}

/** An env-var launch is recorded once per process, so the next bare launch
 *  resumes the same project. Only a resolvable directory is persisted — the
 *  realpath, so the registry never holds a relative or dangling value (the
 *  session itself still honors the raw env var either way). */
function seedConfigFromEnv(envDir: string): PersistedConfig {
  const cfg = readConfig()
  if (state.envSeeded) return cfg
  let realDir: string
  try {
    realDir = fs.realpathSync(envDir)
    if (!fs.statSync(realDir).isDirectory()) return cfg
  } catch {
    // Missing dir: don't poison the registry; retry on a later request in
    // case the dir appears.
    return cfg
  }
  state.envSeeded = true
  const seeded: PersistedConfig = {
    mode: "project",
    activeProject: realDir,
    recentProjects: bumpRecents(cfg.recentProjects, realDir),
  }
  writeConfig(seeded)
  return seeded
}

export function getProjectStatus(): ProjectStatus {
  if (state.selection?.kind === "project") {
    return { mode: "project", dir: state.selection.dir, source: "gui", recents: recentsFrom(readConfig()) }
  }
  if (state.selection?.kind === "standalone") {
    return { mode: "standalone", dir: null, source: "gui", recents: recentsFrom(readConfig()) }
  }
  const envDir = process.env.SPEC_YARD_PROJECT_DIR
  if (envDir) {
    const cfg = seedConfigFromEnv(envDir)
    return { mode: "project", dir: envDir, source: "env", recents: recentsFrom(cfg) }
  }
  const cfg = readConfig()
  if (cfg.mode === "standalone") {
    return { mode: "standalone", dir: null, source: "config", recents: recentsFrom(cfg) }
  }
  if (typeof cfg.activeProject === "string" && cfg.activeProject) {
    return { mode: "project", dir: cfg.activeProject, source: "config", recents: recentsFrom(cfg) }
  }
  return { mode: "unconfigured", dir: null, source: null, recents: recentsFrom(cfg) }
}

export function getActiveProjectDir(): string | null {
  const status = getProjectStatus()
  return status.mode === "project" ? status.dir : null
}

/**
 * The epoch is derived from the active project's identity (its real path),
 * NOT minted per process: a dev-server restart must not invalidate open
 * tabs' epochs (that would silently latch them to local-only), while a
 * switch to a different project must.
 */
export function getProjectEpoch(resolvedDir?: string): string {
  let key = resolvedDir
  if (key === undefined) {
    // No caller-supplied path: resolve the active project ourselves. Callers
    // that already realpathed it (the store route does, for its containment
    // checks) pass it in, so one request costs one resolution, not three.
    const dir = getActiveProjectDir()
    key = dir ?? "standalone"
    if (dir) {
      try {
        key = fs.realpathSync(dir)
      } catch {
        // Unresolvable dir: hash the raw value; store writes 500 anyway.
      }
    }
  }
  return createHash("sha256").update(key).digest("hex").slice(0, 16)
}

export function setActiveProject(dir: string): void {
  state.selection = { kind: "project", dir }
  const cfg = readConfig()
  writeConfig({ mode: "project", activeProject: dir, recentProjects: bumpRecents(cfg.recentProjects, dir) })
}

export function setStandaloneMode(): void {
  state.selection = { kind: "standalone" }
  const cfg = readConfig()
  writeConfig({ mode: "standalone", activeProject: cfg.activeProject ?? null, recentProjects: recentsFrom(cfg) })
}

/** Prefilled path for the one-time first-run prompt. Never persisted
 *  unless the user actually creates or opens that folder. */
export function getSuggestedProjectDir(): string {
  return path.join(os.homedir(), "spec-yard-projects", "my-system")
}

/** Branch name when `dir` is a git work tree on a named branch; otherwise null. */
export function readGitBranch(dir: string): string | null {
  try {
    const head = fs.readFileSync(path.join(dir, ".git", "HEAD"), "utf8").trim()
    const match = /^ref:\s+refs\/heads\/(.+)$/.exec(head)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/** Test hook: clears session state (config files are the tests' own temp dirs). */
export function resetProjectStateForTests(): void {
  state.selection = null
  state.envSeeded = false
}
