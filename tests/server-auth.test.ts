import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  clearSessionCookieHeader,
  ensureRemoteToken,
  gateApiRequest,
  gateAuthEndpoint,
  getAllowedRemoteHosts,
  getLocalTokenProvider,
  isAllowedHost,
  isRemoteMode,
  loginPageGuard,
  mintSessionCookie,
  parseHostName,
  readCookie,
  readRemoteToken,
  remoteTokenPath,
  requestIsHttps,
  resetAuthStateForTests,
  sessionCookieHeader,
  sessionFromRequest,
  setRemoteHostDetectorForTests,
  setRemoteStatusExecForTests,
  verifySessionCookie,
  workspacePageGuard,
} from '../lib/server-auth'
import { REMOTE_TOKEN_FILENAME, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SEC } from '../lib/remote-access'

let configDir: string

beforeEach(() => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-auth-'))
  process.env.SPEC_YARD_CONFIG_DIR = configDir
  delete process.env.SPEC_YARD_REMOTE
  delete process.env.SPEC_YARD_REMOTE_HOST
  resetAuthStateForTests()
})

afterEach(() => {
  delete process.env.SPEC_YARD_REMOTE
  delete process.env.SPEC_YARD_REMOTE_HOST
  resetAuthStateForTests()
  setRemoteHostDetectorForTests(null)
  setRemoteStatusExecForTests(null)
  fs.rmSync(configDir, { recursive: true, force: true })
})

function writeToken(token = 'test-token-secret') {
  fs.writeFileSync(path.join(configDir, REMOTE_TOKEN_FILENAME), token + '\n', { mode: 0o600 })
  return token
}

describe('isRemoteMode', () => {
  test('is off unless SPEC_YARD_REMOTE is 1 or true', () => {
    expect(isRemoteMode()).toBe(false)
    process.env.SPEC_YARD_REMOTE = '0'
    expect(isRemoteMode()).toBe(false)
    process.env.SPEC_YARD_REMOTE = 'yes'
    expect(isRemoteMode()).toBe(false)
    process.env.SPEC_YARD_REMOTE = '1'
    expect(isRemoteMode()).toBe(true)
    process.env.SPEC_YARD_REMOTE = 'true'
    expect(isRemoteMode()).toBe(true)
  })
})

describe('token file', () => {
  test('readRemoteToken returns null when missing, empty, or unreadable', () => {
    expect(readRemoteToken()).toBeNull()
    expect(remoteTokenPath()).toBe(path.join(configDir, REMOTE_TOKEN_FILENAME))
    fs.writeFileSync(remoteTokenPath(), '\n')
    expect(readRemoteToken()).toBeNull()
  })

  test('ensureRemoteToken creates once, then reuses, and prints only on create', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const first = ensureRemoteToken()
    expect('token' in first && first.created).toBe(true)
    expect('token' in first && first.token).toMatch(/^[0-9a-f]{64}$/)
    expect(log).toHaveBeenCalled()
    log.mockClear()
    const second = ensureRemoteToken()
    expect(second).toEqual({ token: (first as any).token, created: false })
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })

  test('ensureRemoteToken fails closed when the config dir cannot be created', () => {
    const blocker = path.join(configDir, 'not-a-dir')
    fs.writeFileSync(blocker, 'x')
    process.env.SPEC_YARD_CONFIG_DIR = path.join(blocker, 'nested')
    const result = ensureRemoteToken()
    expect(result).toEqual({ error: 'remote-token-unwritable' })
  })

  test('local token provider verifies the stored secret and nothing else', () => {
    const provider = getLocalTokenProvider()
    expect(provider.id).toBe('local-token')
    expect(provider.isEnabled()).toBe(false)
    expect(provider.hasSecret()).toBe(false)
    expect(provider.verifySecret('x')).toBe(false)
    const token = writeToken()
    process.env.SPEC_YARD_REMOTE = '1'
    expect(provider.isEnabled()).toBe(true)
    expect(provider.hasSecret()).toBe(true)
    expect(provider.verifySecret(token)).toBe(true)
    expect(provider.verifySecret('wrong')).toBe(false)
  })
})

describe('session cookie', () => {
  test('mint/verify round-trip; expired, truncated, and forged cookies fail', () => {
    expect(mintSessionCookie()).toBeNull()
    expect(verifySessionCookie('nope')).toBe(false)
    writeToken()
    const cookie = mintSessionCookie()
    expect(typeof cookie).toBe('string')
    expect(verifySessionCookie(cookie)).toBe(true)
    expect(verifySessionCookie(cookie, Date.now() + (SESSION_MAX_AGE_SEC + 10) * 1000)).toBe(false)
    expect(verifySessionCookie('abc')).toBe(false)
    expect(verifySessionCookie('abc.')).toBe(false)
    expect(verifySessionCookie(`${cookie}x`)).toBe(false)
    const [payload] = cookie!.split('.')
    expect(verifySessionCookie(`${payload}.aaaa`)).toBe(false)
    const badPayload = Buffer.from(JSON.stringify({ v: 2, exp: Date.now() + 99999 })).toString('base64url')
    expect(verifySessionCookie(`${badPayload}.${cookie!.split('.')[1]}`)).toBe(false)
    const junkPayload = Buffer.from('not-json').toString('base64url')
    const junkMac = cookie!.split('.')[1]
    expect(verifySessionCookie(`${junkPayload}.${junkMac}`)).toBe(false)
  })

  test('token rotation invalidates existing sessions', () => {
    writeToken('first-token')
    const cookie = mintSessionCookie()
    fs.writeFileSync(remoteTokenPath(), 'second-token\n')
    expect(verifySessionCookie(cookie)).toBe(false)
  })

  test('cookie header helpers include Secure only on HTTPS', () => {
    const set = sessionCookieHeader('abc', false)
    expect(set).toContain(`${SESSION_COOKIE_NAME}=abc`)
    expect(set).toContain('HttpOnly')
    expect(set).toContain('SameSite=Lax')
    expect(set).not.toContain('Secure')
    expect(sessionCookieHeader('abc', true)).toContain('Secure')
    expect(clearSessionCookieHeader(false)).toContain('Max-Age=0')
    expect(clearSessionCookieHeader(true)).toContain('Secure')
  })

  test('readCookie decodes values and skips malformed parts', () => {
    expect(readCookie(undefined, SESSION_COOKIE_NAME)).toBeUndefined()
    expect(readCookie('nope', SESSION_COOKIE_NAME)).toBeUndefined()
    expect(readCookie(`${SESSION_COOKIE_NAME}=hello%20x; other=1`, SESSION_COOKIE_NAME)).toBe('hello x')
    expect(readCookie(['a=1', `${SESSION_COOKIE_NAME}=z`], SESSION_COOKIE_NAME)).toBe('z')
    expect(readCookie('broken; =x; foo', 'foo')).toBeUndefined()
    expect(readCookie(`${SESSION_COOKIE_NAME}=%E0%A4%A`, SESSION_COOKIE_NAME)).toBe('%E0%A4%A')
  })

  test('requestIsHttps reads the first X-Forwarded-Proto hop', () => {
    expect(requestIsHttps({})).toBe(false)
    expect(requestIsHttps({ 'x-forwarded-proto': 'https' })).toBe(true)
    expect(requestIsHttps({ 'x-forwarded-proto': 'http, https' })).toBe(false)
    expect(requestIsHttps({ 'x-forwarded-proto': ['HTTPS'] })).toBe(true)
  })
})

describe('host allowlist', () => {
  test('parseHostName strips ports, brackets, and a trailing MagicDNS dot', () => {
    expect(parseHostName(undefined)).toBeNull()
    expect(parseHostName('')).toBeNull()
    expect(parseHostName('Laptop.Tailnet.ts.net.:443')).toBe('laptop.tailnet.ts.net')
    expect(parseHostName('[::1]:3000')).toBe('::1')
    expect(parseHostName('fd7a:115c:a1e0::1')).toBe('fd7a:115c:a1e0::1')
    expect(parseHostName(['100.64.1.2:3000', 'evil'])).toBe('100.64.1.2')
    expect(parseHostName('[')).toBeNull()
  })

  test('local mode accepts only loopback Host values', () => {
    expect(isAllowedHost('localhost:3000')).toBe(true)
    expect(isAllowedHost('evil.example:3000')).toBe(false)
    process.env.SPEC_YARD_REMOTE_HOST = 'laptop.tailnet.ts.net'
    expect(isAllowedHost('laptop.tailnet.ts.net')).toBe(false)
  })

  test('remote mode accepts loopback plus env and detected hosts, not arbitrary Host', () => {
    process.env.SPEC_YARD_REMOTE = '1'
    process.env.SPEC_YARD_REMOTE_HOST = 'laptop.tailnet.ts.net, 100.64.1.2:3000, ,['
    setRemoteHostDetectorForTests(() => ['detected.ts.net.', '100.64.9.9'])
    expect(isAllowedHost('localhost:3000')).toBe(true)
    expect(isAllowedHost('laptop.tailnet.ts.net')).toBe(true)
    expect(isAllowedHost('100.64.1.2:3000')).toBe(true)
    expect(isAllowedHost('detected.ts.net')).toBe(true)
    expect(isAllowedHost('100.64.9.9')).toBe(true)
    expect(isAllowedHost('evil.example.com')).toBe(false)
    expect(isAllowedHost('other.ts.net')).toBe(false)
    expect(isAllowedHost(undefined)).toBe(false)
    expect(getAllowedRemoteHosts()).toEqual([
      'laptop.tailnet.ts.net',
      '100.64.1.2',
      'detected.ts.net',
      '100.64.9.9',
    ])
  })

  test('default Tailscale detector fails closed when the CLI is missing', () => {
    process.env.SPEC_YARD_REMOTE = '1'
    setRemoteHostDetectorForTests(null)
    expect(isAllowedHost('not-a-real-tailscale-host.ts.net')).toBe(false)
  })

  test('default Tailscale detector accepts this machine DNS name and tailnet IPs', () => {
    process.env.SPEC_YARD_REMOTE = '1'
    setRemoteStatusExecForTests(() =>
      JSON.stringify({
        Self: {
          DNSName: 'laptop.tail-scale.ts.net.',
          TailscaleIPs: ['100.64.1.8', 99, '', 'fd7a:115c:a1e0::1'],
        },
      })
    )
    expect(isAllowedHost('laptop.tail-scale.ts.net')).toBe(true)
    expect(isAllowedHost('100.64.1.8')).toBe(true)
    expect(isAllowedHost('[fd7a:115c:a1e0::1]:3000')).toBe(true)
  })

  test('default Tailscale detector ignores a malformed or empty status payload', () => {
    process.env.SPEC_YARD_REMOTE = '1'
    setRemoteStatusExecForTests(() => JSON.stringify({ Self: { DNSName: 1, TailscaleIPs: 'nope' } }))
    expect(getAllowedRemoteHosts()).toEqual([])
    setRemoteStatusExecForTests(() => 'not-json')
    expect(getAllowedRemoteHosts()).toEqual([])
  })
})

describe('gateApiRequest', () => {
  test('local mode still allows loopback without a cookie', () => {
    const result = gateApiRequest({ method: 'GET', headers: { host: 'localhost:3000' } }, 'Project API is loopback-only')
    expect(result).toEqual({ ok: true })
  })

  test('local mode refuses a non-loopback Host with the historical error', () => {
    const result = gateApiRequest({ method: 'GET', headers: { host: 'evil.example' } }, 'Store API is loopback-only')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
      expect(result.body.error).toBe('Store API is loopback-only')
      expect(result.body.code).toBe('loopback-only')
    }
  })

  test('remote mode without a token file fails closed', () => {
    process.env.SPEC_YARD_REMOTE = '1'
    process.env.SPEC_YARD_REMOTE_HOST = 'laptop.ts.net'
    const result = gateApiRequest({ method: 'GET', headers: { host: 'laptop.ts.net' } }, 'x')
    expect(result).toMatchObject({ ok: false, status: 503, body: { code: 'remote-auth-unconfigured' } })
  })

  test('remote mode rejects an unauthenticated store/project request', () => {
    process.env.SPEC_YARD_REMOTE = '1'
    process.env.SPEC_YARD_REMOTE_HOST = 'laptop.ts.net'
    writeToken()
    const result = gateApiRequest({ method: 'GET', headers: { host: 'laptop.ts.net' } }, 'x')
    expect(result).toMatchObject({ ok: false, status: 401, body: { code: 'unauthenticated' } })
  })

  test('remote mode accepts a session cookie on GET and requires CSRF on PUT', () => {
    process.env.SPEC_YARD_REMOTE = '1'
    process.env.SPEC_YARD_REMOTE_HOST = 'laptop.ts.net'
    writeToken()
    const cookie = `${SESSION_COOKIE_NAME}=${mintSessionCookie()}`
    expect(gateApiRequest({ method: 'GET', headers: { host: 'laptop.ts.net', cookie } }, 'x')).toEqual({ ok: true })
    expect(gateApiRequest({ method: 'PUT', headers: { host: 'laptop.ts.net', cookie } }, 'x')).toMatchObject({
      ok: false,
      status: 403,
      body: { code: 'csrf' },
    })
    expect(
      gateApiRequest(
        { method: 'PUT', headers: { host: 'laptop.ts.net', cookie, 'x-spec-yard-csrf': '1' } },
        'x'
      )
    ).toEqual({ ok: true })
  })

  test('remote mode accepts a Bearer token without a CSRF header', () => {
    process.env.SPEC_YARD_REMOTE = '1'
    process.env.SPEC_YARD_REMOTE_HOST = 'laptop.ts.net'
    const token = writeToken()
    expect(
      gateApiRequest(
        { method: 'PUT', headers: { host: 'laptop.ts.net', authorization: `Bearer ${token}` } },
        'x'
      )
    ).toEqual({ ok: true })
    expect(
      gateApiRequest(
        { method: 'PUT', headers: { host: 'laptop.ts.net', authorization: 'Bearer nope' } },
        'x'
      )
    ).toMatchObject({ ok: false, status: 401 })
    expect(
      gateApiRequest(
        { method: 'PATCH', headers: { host: 'laptop.ts.net', cookie: `${SESSION_COOKIE_NAME}=${mintSessionCookie()}`, authorization: 'Basic x' } },
        'x'
      )
    ).toMatchObject({ ok: false, status: 403, body: { code: 'csrf' } })
  })

  test('remote mode still refuses a Host that is not allowlisted', () => {
    process.env.SPEC_YARD_REMOTE = '1'
    writeToken()
    const result = gateApiRequest({ method: 'GET', headers: { host: 'evil.example' } }, 'x')
    expect(result).toMatchObject({ ok: false, status: 403, body: { code: 'host-not-allowed' } })
  })
})

describe('gateAuthEndpoint and page guards', () => {
  test('auth endpoints stay loopback-only when remote mode is off', () => {
    expect(gateAuthEndpoint({ method: 'GET', headers: { host: 'localhost' } })).toEqual({ ok: true })
    expect(gateAuthEndpoint({ method: 'GET', headers: { host: 'evil.example' } })).toMatchObject({
      ok: false,
      status: 403,
      body: { code: 'loopback-only' },
    })
  })

  test('auth endpoints in remote mode use the same Host allowlist', () => {
    process.env.SPEC_YARD_REMOTE = '1'
    process.env.SPEC_YARD_REMOTE_HOST = 'laptop.ts.net'
    expect(gateAuthEndpoint({ method: 'POST', headers: { host: 'laptop.ts.net' } })).toEqual({ ok: true })
    expect(gateAuthEndpoint({ method: 'POST', headers: { host: 'evil.example' } })).toMatchObject({
      ok: false,
      status: 403,
      body: { code: 'host-not-allowed' },
    })
  })

  test('workspace GSSP redirects to login only in remote mode without a session', () => {
    expect(workspacePageGuard({ req: { headers: { host: 'localhost' } } })).toEqual({ props: {} })
    process.env.SPEC_YARD_REMOTE = '1'
    writeToken()
    expect(workspacePageGuard({ req: { headers: { host: 'localhost' } } })).toEqual({
      redirect: { destination: '/login', permanent: false },
    })
    const cookie = `${SESSION_COOKIE_NAME}=${mintSessionCookie()}`
    expect(workspacePageGuard({ req: { headers: { host: 'localhost', cookie } } })).toEqual({ props: {} })
    expect(sessionFromRequest({ headers: { authorization: `Bearer ${readRemoteToken()}` } })).toBe(true)
    expect(sessionFromRequest({ headers: {} })).toBe(false)
  })

  test('login GSSP redirects home in local mode or when already signed in', () => {
    expect(loginPageGuard({ req: { headers: { host: 'localhost' } } })).toEqual({
      redirect: { destination: '/', permanent: false },
    })
    process.env.SPEC_YARD_REMOTE = '1'
    expect(loginPageGuard({ req: { headers: {} }, query: { expired: '1' } })).toEqual({
      props: { tokenMissing: true, expired: true },
    })
    writeToken()
    expect(loginPageGuard({ req: { headers: {} }, query: { expired: ['1'] } })).toEqual({
      props: { tokenMissing: false, expired: true },
    })
    expect(loginPageGuard({ req: { headers: {} }, query: { expired: ['no'] } })).toEqual({
      props: { tokenMissing: false, expired: false },
    })
    const cookie = `${SESSION_COOKIE_NAME}=${mintSessionCookie()}`
    expect(loginPageGuard({ req: { headers: { cookie } } })).toEqual({
      redirect: { destination: '/', permanent: false },
    })
  })
})
