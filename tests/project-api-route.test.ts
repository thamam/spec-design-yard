import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import projectHandler from '../pages/api/project'
import storeHandler from '../pages/api/store/[...path]'
import { resetProjectStateForTests } from '../lib/server-project-config'
import { mockRes, projectReq, storeReq } from './api-test-doubles'

let configDir: string
let projectDir: string
let otherDir: string

beforeEach(() => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-api-cfg-'))
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-proj-'))
  otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-other-'))
  process.env.SPEC_YARD_CONFIG_DIR = configDir
  delete process.env.SPEC_YARD_PROJECT_DIR
  resetProjectStateForTests()
})

afterEach(() => {
  delete process.env.SPEC_YARD_PROJECT_DIR
  resetProjectStateForTests()
  for (const d of [configDir, projectDir, otherDir]) fs.rmSync(d, { recursive: true, force: true })
})

describe('project API route', () => {
  test('GET on a fresh install reports unconfigured with a suggested dir', () => {
    const res = mockRes()
    projectHandler(projectReq('GET'), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.mode).toBe('unconfigured')
    expect(typeof res.body.suggestedDir).toBe('string')
    expect(res.body.recents).toEqual([])
  })

  test('GET under an env-var launch reports the project with source env', () => {
    process.env.SPEC_YARD_PROJECT_DIR = projectDir
    const res = mockRes()
    projectHandler(projectReq('GET'), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.mode).toBe('project')
    expect(res.body.dir).toBe(fs.realpathSync(projectDir))
    expect(res.body.exists).toBe(true)
    expect(res.body.source).toBe('env')
  })

  test('PUT {dir} works WITHOUT any env var — project-first is the default story', () => {
    const res = mockRes()
    projectHandler(projectReq('PUT', { body: { dir: otherDir } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ ok: true, mode: 'project', dir: fs.realpathSync(otherDir) })

    const getRes = mockRes()
    projectHandler(projectReq('GET'), getRes)
    expect(getRes.body.mode).toBe('project')
    expect(getRes.body.dir).toBe(fs.realpathSync(otherDir))
    expect(getRes.body.source).toBe('gui')
    expect(getRes.body.recents).toContain(fs.realpathSync(otherDir))
  })

  test('the store route follows a GUI switch: spec PUT lands in the chosen dir', () => {
    projectHandler(projectReq('PUT', { body: { dir: otherDir } }), mockRes())

    const putRes = mockRes()
    storeHandler(storeReq('PUT', ['spec', 'main'], { title: 'T', yamlContent: 'system: {}\n' }), putRes)
    expect(putRes.statusCode).toBe(200)
    expect(fs.existsSync(path.join(otherDir, 'main.spec.yaml'))).toBe(true)
  })

  test('PUT {mode:"standalone"} opts out of projects; store route goes dormant', () => {
    projectHandler(projectReq('PUT', { body: { dir: otherDir } }), mockRes())
    const res = mockRes()
    projectHandler(projectReq('PUT', { body: { mode: 'standalone' } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ ok: true, mode: 'standalone' })

    const getRes = mockRes()
    projectHandler(projectReq('GET'), getRes)
    expect(getRes.body.mode).toBe('standalone')
    // Recents survive the opt-out so the user can hop back.
    expect(getRes.body.recents).toContain(fs.realpathSync(otherDir))

    const storeRes = mockRes()
    storeHandler(storeReq('GET', ['spec', 'main']), storeRes)
    expect(storeRes.body).toEqual({ enabled: false })

    // And back into a project.
    projectHandler(projectReq('PUT', { body: { dir: otherDir } }), mockRes())
    const backRes = mockRes()
    projectHandler(projectReq('GET'), backRes)
    expect(backRes.body.mode).toBe('project')
  })

  test('PUT rejects a relative path', () => {
    const res = mockRes()
    projectHandler(projectReq('PUT', { body: { dir: 'relative/path' } }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe('not-absolute')
  })

  test('PUT rejects a missing dir with code not-found and keeps the active project', () => {
    projectHandler(projectReq('PUT', { body: { dir: projectDir } }), mockRes())
    const res = mockRes()
    projectHandler(projectReq('PUT', { body: { dir: path.join(otherDir, 'nope') } }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe('not-found')

    const getRes = mockRes()
    projectHandler(projectReq('GET'), getRes)
    expect(getRes.body.dir).toBe(fs.realpathSync(projectDir))
  })

  test('PUT with create:true creates the dir and switches to it', () => {
    const fresh = path.join(otherDir, 'brand-new-project')
    const res = mockRes()
    projectHandler(projectReq('PUT', { body: { dir: fresh, create: true } }), res)
    expect(res.statusCode).toBe(200)
    expect(fs.statSync(fresh).isDirectory()).toBe(true)

    const getRes = mockRes()
    projectHandler(projectReq('GET'), getRes)
    expect(getRes.body.dir).toBe(fs.realpathSync(fresh))
  })

  test('PUT rejects a file path with code not-directory', () => {
    const filePath = path.join(otherDir, 'a-file.txt')
    fs.writeFileSync(filePath, 'x')
    const res = mockRes()
    projectHandler(projectReq('PUT', { body: { dir: filePath } }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe('not-directory')
  })

  test('PUT rejects an unwritable dir with code not-writable', () => {
    const locked = path.join(otherDir, 'locked')
    fs.mkdirSync(locked)
    fs.chmodSync(locked, 0o500)
    try {
      const res = mockRes()
      projectHandler(projectReq('PUT', { body: { dir: locked } }), res)
      expect(res.statusCode).toBe(400)
      expect(res.body.code).toBe('not-writable')
    } finally {
      fs.chmodSync(locked, 0o755)
    }
  })

  test('~ paths expand to the home dir before validation', () => {
    const res = mockRes()
    projectHandler(projectReq('PUT', { body: { dir: '~/specyard-definitely-missing-e2e-xyz' } }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe('not-found')
  })

  test('non-loopback Host is refused on both GET and PUT (DNS-rebinding guard)', () => {
    for (const method of ['GET', 'PUT'] as const) {
      const res = mockRes()
      projectHandler(
        projectReq(method, { host: 'evil.example.com:3000', body: method === 'PUT' ? { dir: otherDir } : undefined }),
        res
      )
      expect(res.statusCode).toBe(403)
    }
    for (const host of ['localhost:3109', '127.0.0.1:3000', '[::1]:3000', 'localhost']) {
      const res = mockRes()
      projectHandler(projectReq('GET', { host }), res)
      expect(res.statusCode).toBe(200)
    }
  })

  test('PUT without a JSON content type is refused (CSRF preflight guard)', () => {
    const res = mockRes()
    projectHandler(projectReq('PUT', { body: { dir: otherDir }, contentType: 'text/plain' }), res)
    expect(res.statusCode).toBe(415)
  })

  test('unsupported methods are 405', () => {
    const res = mockRes()
    projectHandler(projectReq('DELETE'), res)
    expect(res.statusCode).toBe(405)
  })
})

describe('store route project-epoch guard', () => {
  test('GET spec includes the project epoch, for both found and not-found', () => {
    process.env.SPEC_YARD_PROJECT_DIR = projectDir
    const missingRes = mockRes()
    storeHandler(storeReq('GET', ['spec', 'main']), missingRes)
    expect(missingRes.statusCode).toBe(200)
    expect(missingRes.body.found).toBe(false)
    expect(typeof missingRes.body.epoch).toBe('string')

    fs.writeFileSync(path.join(projectDir, 'main.spec.yaml'), 'system: {}\n')
    const foundRes = mockRes()
    storeHandler(storeReq('GET', ['spec', 'main']), foundRes)
    expect(foundRes.statusCode).toBe(200)
    expect(foundRes.body.epoch).toBe(missingRes.body.epoch)
  })

  test('a PUT carrying a stale epoch after a switch is a 409 and writes nothing', () => {
    process.env.SPEC_YARD_PROJECT_DIR = projectDir
    const before = mockRes()
    storeHandler(storeReq('GET', ['spec', 'main']), before)
    const staleEpoch = before.body.epoch

    projectHandler(projectReq('PUT', { body: { dir: otherDir } }), mockRes())

    const putRes = mockRes()
    storeHandler(
      storeReq('PUT', ['spec', 'main'], { title: 'Old Tab', yamlContent: 'system: {}\n' }, { epoch: staleEpoch }),
      putRes
    )
    expect(putRes.statusCode).toBe(409)
    expect(putRes.body.reason).toBe('project-switched')
    expect(fs.existsSync(path.join(otherDir, 'main.spec.yaml'))).toBe(false)

    // Meta PUTs are epoch-guarded too — sidecar bleed is still bleed.
    const metaRes = mockRes()
    storeHandler(storeReq('PUT', ['meta', 'simulation_history'], [{ id: 'old' }], { epoch: staleEpoch }), metaRes)
    expect(metaRes.statusCode).toBe(409)
    expect(fs.existsSync(path.join(otherDir, '.specyard', 'simulation_history.json'))).toBe(false)
  })

  test('a PUT carrying the fresh epoch succeeds after a switch', () => {
    projectHandler(projectReq('PUT', { body: { dir: otherDir } }), mockRes())
    const getRes = mockRes()
    storeHandler(storeReq('GET', ['spec', 'main']), getRes)

    const putRes = mockRes()
    storeHandler(
      storeReq('PUT', ['spec', 'main'], { title: 'New Tab', yamlContent: 'system: {}\n' }, { epoch: getRes.body.epoch }),
      putRes
    )
    expect(putRes.statusCode).toBe(200)
    expect(fs.existsSync(path.join(otherDir, 'main.spec.yaml'))).toBe(true)
  })

  test('switching to standalone also re-mints the epoch (stale tab 409s)', () => {
    process.env.SPEC_YARD_PROJECT_DIR = projectDir
    const before = mockRes()
    storeHandler(storeReq('GET', ['spec', 'main']), before)
    const staleEpoch = before.body.epoch

    projectHandler(projectReq('PUT', { body: { mode: 'standalone' } }), mockRes())
    // Store is dormant in standalone; but if a project is re-selected, the old
    // tab's epoch must still be stale.
    projectHandler(projectReq('PUT', { body: { dir: otherDir } }), mockRes())

    const putRes = mockRes()
    storeHandler(
      storeReq('PUT', ['spec', 'main'], { title: 'Old', yamlContent: 'system: {}\n' }, { epoch: staleEpoch }),
      putRes
    )
    expect(putRes.statusCode).toBe(409)
  })

  test('a PUT with no epoch still works (loopback trust model unchanged)', () => {
    process.env.SPEC_YARD_PROJECT_DIR = projectDir
    const putRes = mockRes()
    storeHandler(storeReq('PUT', ['spec', 'main'], { title: 'T', yamlContent: 'system: {}\n' }), putRes)
    expect(putRes.statusCode).toBe(200)
  })
})
