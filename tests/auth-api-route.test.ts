import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import sessionHandler from '../pages/api/auth/session'
import loginHandler from '../pages/api/auth/login'
import logoutHandler from '../pages/api/auth/logout'
import * as serverAuth from '../lib/server-auth'
import { mintSessionCookie, resetAuthStateForTests, verifySessionCookie } from '../lib/server-auth'
import { REMOTE_TOKEN_FILENAME, SESSION_COOKIE_NAME } from '../lib/remote-access'
import { authReq, mockRes } from './api-test-doubles'

let configDir: string

beforeEach(() => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-auth-api-'))
  process.env.SPEC_YARD_CONFIG_DIR = configDir
  delete process.env.SPEC_YARD_REMOTE
  delete process.env.SPEC_YARD_REMOTE_HOST
  resetAuthStateForTests()
})

afterEach(() => {
  delete process.env.SPEC_YARD_REMOTE
  delete process.env.SPEC_YARD_REMOTE_HOST
  resetAuthStateForTests()
  vi.restoreAllMocks()
  fs.rmSync(configDir, { recursive: true, force: true })
})

function writeToken(token = 'route-token-secret') {
  fs.writeFileSync(path.join(configDir, REMOTE_TOKEN_FILENAME), token + '\n')
  return token
}

describe('GET /api/auth/session', () => {
  test('local mode reports remote:false without requiring a cookie', () => {
    const res = mockRes()
    sessionHandler(authReq('GET'), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ remote: false, authenticated: true, tokenConfigured: true })
  })

  test('remote mode reports authenticated only with a valid session', () => {
    process.env.SPEC_YARD_REMOTE = '1'
    process.env.SPEC_YARD_REMOTE_HOST = 'laptop.ts.net'
    writeToken()
    const anon = mockRes()
    sessionHandler(authReq('GET', { host: 'laptop.ts.net' }), anon)
    expect(anon.body).toEqual({ remote: true, authenticated: false, tokenConfigured: true })

    const cookie = `${SESSION_COOKIE_NAME}=${mintSessionCookie()}`
    const authed = mockRes()
    sessionHandler(authReq('GET', { host: 'laptop.ts.net', cookie }), authed)
    expect(authed.body.authenticated).toBe(true)
  })

  test('refuses a non-allowlisted Host and unsupported methods', () => {
    const local = mockRes()
    sessionHandler(authReq('GET', { host: 'evil.example' }), local)
    expect(local.statusCode).toBe(403)

    process.env.SPEC_YARD_REMOTE = '1'
    const remote = mockRes()
    sessionHandler(authReq('GET', { host: 'evil.example' }), remote)
    expect(remote.statusCode).toBe(403)

    const method = mockRes()
    sessionHandler(authReq('POST'), method)
    expect(method.statusCode).toBe(405)
  })

  test('a throwing json write is a 500', () => {
    const res = mockRes()
    let n = 0
    res.json = (payload: any) => {
      n += 1
      if (n === 1) throw new Error('boom')
      res.body = payload
      return res
    }
    sessionHandler(authReq('GET'), res)
    expect(res.statusCode).toBe(500)
  })
})

describe('POST /api/auth/login', () => {
  test('404s when remote mode is off', () => {
    const res = mockRes()
    loginHandler(authReq('POST', { body: { token: 'x' } }), res)
    expect(res.statusCode).toBe(404)
    expect(res.body.code).toBe('local-mode')
  })

  test('rejects a missing token file, a bad token, and a non-JSON body', () => {
    process.env.SPEC_YARD_REMOTE = '1'
    process.env.SPEC_YARD_REMOTE_HOST = 'laptop.ts.net'
    const missing = mockRes()
    loginHandler(authReq('POST', { host: 'laptop.ts.net', body: { token: 'x' } }), missing)
    expect(missing.statusCode).toBe(503)

    writeToken('correct-token')
    const bad = mockRes()
    loginHandler(authReq('POST', { host: 'laptop.ts.net', body: { token: 'nope' } }), bad)
    expect(bad.statusCode).toBe(401)

    const empty = mockRes()
    loginHandler(authReq('POST', { host: 'laptop.ts.net', body: {} }), empty)
    expect(empty.statusCode).toBe(401)

    const ctype = mockRes()
    loginHandler(authReq('POST', { host: 'laptop.ts.net', body: { token: 'correct-token' }, contentType: 'text/plain' }), ctype)
    expect(ctype.statusCode).toBe(415)
  })

  test('sets an HttpOnly session cookie and uses Secure behind HTTPS', () => {
    process.env.SPEC_YARD_REMOTE = '1'
    process.env.SPEC_YARD_REMOTE_HOST = 'laptop.ts.net'
    writeToken('correct-token')
    const res = mockRes()
    loginHandler(authReq('POST', { host: 'laptop.ts.net', body: { token: 'correct-token' }, proto: 'https' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true })
    const setCookie = String(res.getHeader('set-cookie'))
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Secure')
  })

  test('fails closed if a session cannot be minted after a valid token', () => {
    process.env.SPEC_YARD_REMOTE = '1'
    process.env.SPEC_YARD_REMOTE_HOST = 'laptop.ts.net'
    writeToken('correct-token')
    vi.spyOn(serverAuth, 'mintSessionCookie').mockReturnValue(null)
    const res = mockRes()
    loginHandler(authReq('POST', { host: 'laptop.ts.net', body: { token: 'correct-token' } }), res)
    expect(res.statusCode).toBe(503)
    expect(res.body.code).toBe('remote-auth-unconfigured')
  })

  test('unsupported methods are 405; host refusal is 403; handler faults are 500', () => {
    const method = mockRes()
    loginHandler(authReq('GET'), method)
    expect(method.statusCode).toBe(405)

    process.env.SPEC_YARD_REMOTE = '1'
    const host = mockRes()
    loginHandler(authReq('POST', { host: 'evil.example', body: { token: 'x' } }), host)
    expect(host.statusCode).toBe(403)

    const boom = mockRes()
    let n = 0
    boom.status = (code: number) => {
      n += 1
      boom.statusCode = code
      if (n === 1) throw new Error('boom')
      return boom
    }
    loginHandler(authReq('POST', { body: { token: 'x' } }), boom)
    expect(boom.statusCode).toBe(500)
  })
})

describe('POST /api/auth/logout', () => {
  test('clears the cookie in local mode without CSRF', () => {
    const res = mockRes()
    logoutHandler(authReq('POST'), res)
    expect(res.statusCode).toBe(200)
    expect(String(res.getHeader('set-cookie'))).toContain('Max-Age=0')
  })

  test('cookie session in remote mode requires the CSRF header; Bearer does not', () => {
    process.env.SPEC_YARD_REMOTE = '1'
    process.env.SPEC_YARD_REMOTE_HOST = 'laptop.ts.net'
    writeToken('tok')
    const cookieValue = mintSessionCookie() as string
    const cookie = `${SESSION_COOKIE_NAME}=${cookieValue}`
    const csrf = mockRes()
    logoutHandler(authReq('POST', { host: 'laptop.ts.net', cookie }), csrf)
    expect(csrf.statusCode).toBe(403)
    expect(csrf.body.code).toBe('csrf')
    expect(verifySessionCookie(cookieValue)).toBe(true)

    const ok = mockRes()
    logoutHandler(authReq('POST', { host: 'laptop.ts.net', cookie, csrf: true, proto: 'https' }), ok)
    expect(ok.statusCode).toBe(200)
    expect(String(ok.getHeader('set-cookie'))).toContain('Secure')
    expect(verifySessionCookie(cookieValue)).toBe(false)

    const next = mintSessionCookie() as string
    expect(verifySessionCookie(next)).toBe(true)
    const bearer = mockRes()
    logoutHandler(authReq('POST', { host: 'laptop.ts.net', cookie: `${SESSION_COOKIE_NAME}=${next}`, authorization: 'Bearer tok' }), bearer)
    expect(bearer.statusCode).toBe(200)
    expect(verifySessionCookie(next)).toBe(false)
  })

  test('logout without a session still clears the cookie but does not revoke others', () => {
    process.env.SPEC_YARD_REMOTE = '1'
    process.env.SPEC_YARD_REMOTE_HOST = 'laptop.ts.net'
    writeToken('tok')
    const surviving = mintSessionCookie()
    const res = mockRes()
    logoutHandler(authReq('POST', { host: 'laptop.ts.net' }), res)
    expect(res.statusCode).toBe(200)
    expect(verifySessionCookie(surviving)).toBe(true)
  })

  test('unsupported methods and bad hosts are refused; faults are 500', () => {
    const method = mockRes()
    logoutHandler(authReq('GET'), method)
    expect(method.statusCode).toBe(405)

    const host = mockRes()
    logoutHandler(authReq('POST', { host: 'evil.example' }), host)
    expect(host.statusCode).toBe(403)

    const boom = mockRes()
    let n = 0
    boom.status = (code: number) => {
      n += 1
      boom.statusCode = code
      if (n === 1) throw new Error('boom')
      return boom
    }
    logoutHandler(authReq('POST'), boom)
    expect(boom.statusCode).toBe(500)
  })
})
