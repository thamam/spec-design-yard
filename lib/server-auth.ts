// SERVER-ONLY auth seam for opt-in remote access (Option A).
// Imports Node crypto/fs/child_process — never import from client code.
//
// Local mode (default): no auth, loopback Host only — today's model.
// Remote mode (SPEC_YARD_REMOTE=1): session cookie or Bearer token, Host
// allowlist (loopback + this machine's Tailscale name/IPs + SPEC_YARD_REMOTE_HOST).
//
// First provider is a locally generated shared token stored under the
// specyard config dir (not the project folder). Later Option B can keep
// this provider on a VPS; Option C swaps the store and can swap this
// provider without rewriting the route guards.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto"
import { execFileSync, type ExecFileSyncOptions } from "child_process"
import fs from "fs"
import path from "path"
import { getConfigDir } from "./server-project-config"
import { isLoopbackHost } from "./server-request-guards"
import {
  REMOTE_CSRF_HEADER,
  REMOTE_CSRF_VALUE,
  REMOTE_SESSION_GEN_FILENAME,
  REMOTE_TOKEN_FILENAME,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SEC,
} from "./remote-access"

export interface AuthProvider {
  readonly id: string
  isEnabled(): boolean
  hasSecret(): boolean
  verifySecret(secret: string): boolean
}

export type AccessOk = { ok: true }
export type AccessDenied = { ok: false; status: 401 | 403 | 503; body: { error: string; code: string } }
export type AccessResult = AccessOk | AccessDenied

type HeaderMap = Record<string, string | string[] | undefined>

export interface AuthRequest {
  method?: string
  headers: HeaderMap
}

type HostDetector = () => string[]
type StatusExec = (file: string, args: string[], options: ExecFileSyncOptions) => string

let detectedHostsCache: string[] | null = null
let hostDetector: HostDetector = detectTailscaleHosts
let statusExec: StatusExec = execFileSync as StatusExec

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export function isRemoteMode(): boolean {
  const raw = process.env.SPEC_YARD_REMOTE
  return raw === "1" || raw === "true"
}

export function getLocalTokenProvider(): AuthProvider {
  return localTokenProvider
}

const localTokenProvider: AuthProvider = {
  id: "local-token",
  isEnabled() {
    return isRemoteMode()
  },
  hasSecret() {
    return readRemoteToken() != null
  },
  verifySecret(secret: string) {
    const token = readRemoteToken()
    if (token == null) return false
    return secretsEqual(token, secret)
  },
}

export function remoteTokenPath(): string {
  return path.join(getConfigDir(), REMOTE_TOKEN_FILENAME)
}

export function readRemoteToken(): string | null {
  try {
    const raw = fs.readFileSync(remoteTokenPath(), "utf8")
    const token = raw.split(/\r?\n/, 1)[0].trim()
    return token || null
  } catch {
    return null
  }
}

/**
 * Create the token file if missing. Prints the secret to stdout only when
 * newly generated — never writes it into the repo or the project folder.
 */
export function ensureRemoteToken(): { token: string; created: boolean } | { error: string } {
  const existing = readRemoteToken()
  if (existing) return { token: existing, created: false }
  const dir = getConfigDir()
  const file = remoteTokenPath()
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    const token = randomBytes(32).toString("hex")
    fs.writeFileSync(file, token + "\n", { encoding: "utf8", mode: 0o600 })
    console.log("[spec-yard] Generated remote token (shown once):")
    console.log(token)
    console.log(`[spec-yard] Rotate: delete ${file} and restart with --remote`)
    return { token, created: true }
  } catch {
    return { error: "remote-token-unwritable" }
  }
}

function secretsEqual(expected: string, given: string): boolean {
  const a = createHash("sha256").update(expected).digest()
  const b = createHash("sha256").update(given).digest()
  return timingSafeEqual(a, b)
}

function sessionKey(token: string): Buffer {
  return createHash("sha256").update("spec-yard-session-v1\0").update(token).digest()
}

export function sessionGenPath(): string {
  return path.join(getConfigDir(), REMOTE_SESSION_GEN_FILENAME)
}

/** Cookies carry this integer. Logout increments it so copied cookies die. */
export function currentSessionGeneration(): number {
  try {
    const raw = fs.readFileSync(sessionGenPath(), "utf8").trim()
    const n = Number.parseInt(raw, 10)
    if (Number.isInteger(n) && n >= 0) return n
  } catch {}
  return 0
}

export function bumpSessionGeneration(): number {
  const next = currentSessionGeneration() + 1
  try {
    fs.mkdirSync(getConfigDir(), { recursive: true, mode: 0o700 })
    fs.writeFileSync(sessionGenPath(), `${next}\n`, { encoding: "utf8", mode: 0o600 })
    return next
  } catch {
    return currentSessionGeneration()
  }
}

export function mintSessionCookie(nowMs = Date.now()): string | null {
  const token = readRemoteToken()
  if (!token) return null
  const payload = Buffer.from(
    JSON.stringify({ v: 1, exp: nowMs + SESSION_MAX_AGE_SEC * 1000, g: currentSessionGeneration() })
  ).toString("base64url")
  const mac = createHmac("sha256", sessionKey(token)).update(payload).digest("base64url")
  return `${payload}.${mac}`
}

export function verifySessionCookie(cookieValue: string | null | undefined, nowMs = Date.now()): boolean {
  if (!cookieValue) return false
  const token = readRemoteToken()
  if (!token) return false
  const dot = cookieValue.lastIndexOf(".")
  if (dot <= 0) return false
  const payload = cookieValue.slice(0, dot)
  const mac = cookieValue.slice(dot + 1)
  if (!payload || !mac) return false
  const expected = createHmac("sha256", sessionKey(token)).update(payload).digest("base64url")
  const macBuf = Buffer.from(mac)
  const expectedBuf = Buffer.from(expected)
  if (macBuf.length !== expectedBuf.length) return false
  if (!timingSafeEqual(macBuf, expectedBuf)) return false
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    return (
      !!data &&
      data.v === 1 &&
      typeof data.exp === "number" &&
      data.exp > nowMs &&
      typeof data.g === "number" &&
      data.g === currentSessionGeneration()
    )
  } catch {
    return false
  }
}

export function readCookie(header: string | string[] | undefined, name: string): string | undefined {
  const raw = Array.isArray(header) ? header.join("; ") : header
  if (!raw) return undefined
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=")
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    if (key !== name) continue
    try {
      return decodeURIComponent(part.slice(eq + 1).trim())
    } catch {
      return part.slice(eq + 1).trim()
    }
  }
  return undefined
}

export function sessionCookieHeader(value: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SEC}`,
  ]
  if (secure) parts.push("Secure")
  return parts.join("; ")
}

export function clearSessionCookieHeader(secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
  ]
  if (secure) parts.push("Secure")
  return parts.join("; ")
}

export function requestIsHttps(headers: HeaderMap): boolean {
  const proto = headerValue(headers["x-forwarded-proto"])
  if (proto) return proto.split(",")[0].trim().toLowerCase() === "https"
  return false
}

export function parseHostName(hostHeader: string | string[] | undefined): string | null {
  const raw = headerValue(hostHeader)
  if (!raw) return null
  let host: string
  if (raw.startsWith("[")) {
    const end = raw.indexOf("]")
    if (end === -1) return null
    host = raw.slice(1, end)
  } else if ((raw.match(/:/g) || []).length > 1) {
    // Bare IPv6 from Tailscale status (no brackets, no port).
    host = raw
  } else {
    host = raw.split(":")[0]
  }
  if (!host) return null
  return host.toLowerCase().replace(/\.$/, "")
}

function parseRemoteHostList(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((part) => {
      const trimmed = part.trim()
      if (!trimmed) return ""
      return parseHostName(trimmed) || ""
    })
    .filter(Boolean)
}

function detectTailscaleHosts(): string[] {
  try {
    const json = statusExec("tailscale", ["status", "--json"], {
      encoding: "utf8",
      timeout: 1500,
      stdio: ["ignore", "pipe", "ignore"],
    })
    const status = JSON.parse(json)
    const hosts: string[] = []
    const dns = status?.Self?.DNSName
    if (typeof dns === "string" && dns) {
      const name = parseHostName(dns)
      if (name) hosts.push(name)
    }
    const ips = status?.Self?.TailscaleIPs
    if (Array.isArray(ips)) {
      for (const ip of ips) {
        if (typeof ip === "string" && ip) {
          const name = parseHostName(ip)
          if (name) hosts.push(name)
        }
      }
    }
    return hosts
  } catch {
    return []
  }
}

export function getAllowedRemoteHosts(): string[] {
  const fromEnv = parseRemoteHostList(process.env.SPEC_YARD_REMOTE_HOST)
  if (detectedHostsCache == null) {
    detectedHostsCache = hostDetector()
      .map((host) => parseHostName(host))
      .filter((host): host is string => !!host)
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const host of [...fromEnv, ...detectedHostsCache]) {
    if (!seen.has(host)) {
      seen.add(host)
      out.push(host)
    }
  }
  return out
}

export function isAllowedHost(hostHeader: string | string[] | undefined): boolean {
  if (isLoopbackHost(hostHeader)) return true
  if (!isRemoteMode()) return false
  const name = parseHostName(hostHeader)
  if (!name) return false
  return getAllowedRemoteHosts().includes(name)
}

function bearerToken(headers: HeaderMap): string | null {
  const raw = headerValue(headers.authorization)
  if (!raw) return null
  const match = /^Bearer\s+(\S+)/i.exec(raw.trim())
  return match ? match[1] : null
}

function hasCsrfHeader(headers: HeaderMap): boolean {
  const raw = headerValue(headers[REMOTE_CSRF_HEADER])
  return raw === REMOTE_CSRF_VALUE
}

function isMutatingMethod(method: string | undefined): boolean {
  const m = (method || "GET").toUpperCase()
  return m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE"
}

/**
 * Shared gate for /api/project and /api/store/*. Local mode keeps the
 * historical loopback-only error string. Remote mode requires a valid
 * session or Bearer token; cookie mutations also need the CSRF header.
 */
export function gateApiRequest(req: AuthRequest, localLoopbackError: string): AccessResult {
  if (!isRemoteMode()) {
    if (!isLoopbackHost(req.headers.host)) {
      return { ok: false, status: 403, body: { error: localLoopbackError, code: "loopback-only" } }
    }
    return { ok: true }
  }

  if (!isAllowedHost(req.headers.host)) {
    return { ok: false, status: 403, body: { error: "Host is not allowed for remote access", code: "host-not-allowed" } }
  }

  if (!localTokenProvider.hasSecret()) {
    return {
      ok: false,
      status: 503,
      body: { error: "Remote token is not configured", code: "remote-auth-unconfigured" },
    }
  }

  const bearer = bearerToken(req.headers)
  if (bearer && localTokenProvider.verifySecret(bearer)) return { ok: true }

  const cookie = readCookie(req.headers.cookie, SESSION_COOKIE_NAME)
  if (!verifySessionCookie(cookie)) {
    return { ok: false, status: 401, body: { error: "Sign in required", code: "unauthenticated" } }
  }

  if (isMutatingMethod(req.method) && !hasCsrfHeader(req.headers)) {
    return { ok: false, status: 403, body: { error: "CSRF header required", code: "csrf" } }
  }
  return { ok: true }
}

/** Host allowlist only — login/session probes use this, not a session. */
export function gateAuthEndpoint(req: AuthRequest): AccessResult {
  if (!isRemoteMode()) {
    if (!isLoopbackHost(req.headers.host)) {
      return { ok: false, status: 403, body: { error: "Auth API is loopback-only when remote mode is off", code: "loopback-only" } }
    }
    return { ok: true }
  }
  if (!isAllowedHost(req.headers.host)) {
    return { ok: false, status: 403, body: { error: "Host is not allowed for remote access", code: "host-not-allowed" } }
  }
  return { ok: true }
}

export function sessionFromRequest(req: AuthRequest): boolean {
  const bearer = bearerToken(req.headers)
  if (bearer && localTokenProvider.verifySecret(bearer)) return true
  return verifySessionCookie(readCookie(req.headers.cookie, SESSION_COOKIE_NAME))
}

export function workspacePageGuard(ctx: { req: AuthRequest }): { props: Record<string, never> } | { redirect: { destination: string; permanent: false } } {
  if (!isRemoteMode()) return { props: {} }
  if (!sessionFromRequest(ctx.req)) {
    return { redirect: { destination: "/login", permanent: false } }
  }
  return { props: {} }
}

export function loginPageGuard(ctx: {
  req: AuthRequest
  query?: { expired?: string | string[] }
}):
  | { props: { tokenMissing: boolean; expired: boolean } }
  | { redirect: { destination: string; permanent: false } } {
  if (!isRemoteMode()) return { redirect: { destination: "/", permanent: false } }
  if (sessionFromRequest(ctx.req)) return { redirect: { destination: "/", permanent: false } }
  const expiredRaw = ctx.query?.expired
  const expired = Array.isArray(expiredRaw) ? expiredRaw[0] === "1" : expiredRaw === "1"
  return { props: { tokenMissing: !localTokenProvider.hasSecret(), expired } }
}

export function resetAuthStateForTests(): void {
  detectedHostsCache = null
  hostDetector = detectTailscaleHosts
  statusExec = execFileSync as StatusExec
}

export function setRemoteHostDetectorForTests(fn: HostDetector | null): void {
  detectedHostsCache = null
  hostDetector = fn ?? detectTailscaleHosts
}

export function setRemoteStatusExecForTests(fn: StatusExec | null): void {
  detectedHostsCache = null
  statusExec = fn ?? (execFileSync as StatusExec)
}
