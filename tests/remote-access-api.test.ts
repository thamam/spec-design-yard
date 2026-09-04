import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import projectHandler from '../pages/api/project'
import storeHandler from '../pages/api/store/[...path]'
import { mintSessionCookie, resetAuthStateForTests } from '../lib/server-auth'
import { resetProjectStateForTests } from '../lib/server-project-config'
import { REMOTE_TOKEN_FILENAME, SESSION_COOKIE_NAME } from '../lib/remote-access'
import { mockRes, projectReq, storeReq } from './api-test-doubles'

let configDir: string
let projectDir: string

beforeEach(() => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-remote-cfg-'))
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-remote-proj-'))
  process.env.SPEC_YARD_CONFIG_DIR = configDir
  process.env.SPEC_YARD_PROJECT_DIR = projectDir
  delete process.env.SPEC_YARD_REMOTE
  delete process.env.SPEC_YARD_REMOTE_HOST
  resetAuthStateForTests()
  resetProjectStateForTests()
})

afterEach(() => {
  delete process.env.SPEC_YARD_REMOTE
  delete process.env.SPEC_YARD_REMOTE_HOST
  delete process.env.SPEC_YARD_PROJECT_DIR
  resetAuthStateForTests()
  resetProjectStateForTests()
  fs.rmSync(configDir, { recursive: true, force: true })
  fs.rmSync(projectDir, { recursive: true, force: true })
})

function writeToken(token = 'remote-api-token') {
  fs.writeFileSync(path.join(configDir, REMOTE_TOKEN_FILENAME), token + '\n')
  return token
}

function sessionCookie() {
  return `${SESSION_COOKIE_NAME}=${mintSessionCookie()}`
}

describe('local mode is unchanged', () => {
  test('loopback store and project still work without a cookie', () => {
    const get = mockRes()
    projectHandler(projectReq('GET'), get)
    expect(get.statusCode).toBe(200)
    expect(get.body.mode).toBe('project')

    const put = mockRes()
    storeHandler(storeReq('PUT', ['spec', 'main'], { title: 'T', yamlContent: 'system: {}\n' }), put)
    expect(put.statusCode).toBe(200)
    expect(fs.existsSync(path.join(projectDir, 'main.spec.yaml'))).toBe(true)
  })
})

describe('remote mode on project and store APIs', () => {
  test('rejects unauthenticated reads and writes; writes nothing', () => {
    process.env.SPEC_YARD_REMOTE = '1'
    process.env.SPEC_YARD_REMOTE_HOST = 'laptop.ts.net'
    writeToken()

    const projectGet = mockRes()
    projectHandler(projectReq('GET', { host: 'laptop.ts.net' }), projectGet)
    expect(projectGet.statusCode).toBe(401)

    const storeGet = mockRes()
    storeHandler(storeReq('GET', ['spec', 'main'], undefined, { host: 'laptop.ts.net' }), storeGet)
    expect(storeGet.statusCode).toBe(401)

    const storePut = mockRes()
    storeHandler(
      storeReq('PUT', ['spec', 'main'], { title: 'T', yamlContent: 'hacked\n' }, { host: 'laptop.ts.net' }),
      storePut
    )
    expect(storePut.statusCode).toBe(401)
    expect(fs.existsSync(path.join(projectDir, 'main.spec.yaml'))).toBe(false)
  })

  test('token missing in remote mode fails closed with 503', () => {
    process.env.SPEC_YARD_REMOTE = '1'
    process.env.SPEC_YARD_REMOTE_HOST = 'laptop.ts.net'
    const res = mockRes()
    storeHandler(storeReq('GET', ['spec', 'main'], undefined, { host: 'laptop.ts.net' }), res)
    expect(res.statusCode).toBe(503)
    expect(res.body.code).toBe('remote-auth-unconfigured')
  })

  test('session + CSRF can read and write; Host allowlist still applies', () => {
    process.env.SPEC_YARD_REMOTE = '1'
    process.env.SPEC_YARD_REMOTE_HOST = 'laptop.ts.net'
    writeToken()
    const cookie = sessionCookie()

    const denied = mockRes()
    storeHandler(
      storeReq('GET', ['spec', 'main'], undefined, { host: 'evil.example', cookie }),
      denied
    )
    expect(denied.statusCode).toBe(403)

    const get = mockRes()
    storeHandler(storeReq('GET', ['spec', 'main'], undefined, { host: 'laptop.ts.net', cookie }), get)
    expect(get.statusCode).toBe(200)
    expect(get.body.found).toBe(false)

    const noCsrf = mockRes()
    storeHandler(
      storeReq('PUT', ['spec', 'main'], { title: 'T', yamlContent: 'system: {}\n' }, { host: 'laptop.ts.net', cookie }),
      noCsrf
    )
    expect(noCsrf.statusCode).toBe(403)
    expect(noCsrf.body.code).toBe('csrf')

    const put = mockRes()
    storeHandler(
      storeReq(
        'PUT',
        ['spec', 'main'],
        { title: 'T', yamlContent: 'system: {}\n' },
        { host: 'laptop.ts.net', cookie, csrf: true }
      ),
      put
    )
    expect(put.statusCode).toBe(200)
    expect(fs.readFileSync(path.join(projectDir, 'main.spec.yaml'), 'utf8')).toBe('system: {}\n')

    const projectPut = mockRes()
    projectHandler(
      projectReq('PUT', { host: 'laptop.ts.net', cookie, csrf: true, body: { dir: projectDir } }),
      projectPut
    )
    expect(projectPut.statusCode).toBe(200)
  })

  test('Bearer token from the CLI can switch projects without a CSRF header', () => {
    process.env.SPEC_YARD_REMOTE = '1'
    const token = writeToken()
    process.env.SPEC_YARD_REMOTE_HOST = '127.0.0.1'
    const res = mockRes()
    projectHandler(
      projectReq('PUT', {
        host: '127.0.0.1:3000',
        authorization: `Bearer ${token}`,
        body: { dir: projectDir },
      }),
      res
    )
    expect(res.statusCode).toBe(200)
  })
})
