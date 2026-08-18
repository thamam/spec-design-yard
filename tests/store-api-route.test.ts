import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import handler from '../pages/api/store/[...path]'

function mockReq(method: string, pathSegments: string[] | string, body?: any) {
  return { method, query: { path: pathSegments }, body } as any
}

function mockRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: any) {
      res.body = payload
      return res
    },
  }
  return res
}

describe('store API route', () => {
  let projectDir: string

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-test-'))
    process.env.SPEC_YARD_PROJECT_DIR = projectDir
  })

  afterEach(() => {
    delete process.env.SPEC_YARD_PROJECT_DIR
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  test('responds 200 with enabled:false when SPEC_YARD_PROJECT_DIR is unset', () => {
    // 200 rather than 501: standalone mode is normal, and an error status
    // would surface in the browser console on every load.
    delete process.env.SPEC_YARD_PROJECT_DIR
    const res = mockRes()
    handler(mockReq('GET', ['spec', 'main']), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ enabled: false })
  })

  test('spec round-trip: PUT writes main.spec.yaml + spec-index.json, GET reads back', () => {
    const yaml = 'system:\n  name: Client System\n'
    const putRes = mockRes()
    handler(mockReq('PUT', ['spec', 'main'], { title: 'Client System', yamlContent: yaml }), putRes)
    expect(putRes.statusCode).toBe(200)

    expect(fs.readFileSync(path.join(projectDir, 'main.spec.yaml'), 'utf8')).toBe(yaml)

    const index = JSON.parse(fs.readFileSync(path.join(projectDir, '.specyard', 'spec-index.json'), 'utf8'))
    expect(index.main.title).toBe('Client System')
    expect(typeof index.main.updatedAt).toBe('string')

    const getRes = mockRes()
    handler(mockReq('GET', ['spec', 'main']), getRes)
    expect(getRes.statusCode).toBe(200)
    expect(getRes.body.yamlContent).toBe(yaml)
    expect(getRes.body.title).toBe('Client System')
  })

  test('GET spec returns 200 with found:false when the file does not exist', () => {
    // 200-with-marker rather than 404: "nothing stored yet" is a normal state
    // and a 404 would surface as a console error in the browser on every launch.
    const res = mockRes()
    handler(mockReq('GET', ['spec', 'main']), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ found: false })
  })

  test('meta round-trip for simulation_history and custom_presets', () => {
    const runs = [{ id: 'run-1', path: 'a -> b' }]
    const putRes = mockRes()
    handler(mockReq('PUT', ['meta', 'simulation_history'], runs), putRes)
    expect(putRes.statusCode).toBe(200)

    const getRes = mockRes()
    handler(mockReq('GET', ['meta', 'simulation_history']), getRes)
    expect(getRes.statusCode).toBe(200)
    expect(getRes.body).toEqual(runs)

    const presets = [{ name: 'P', packets: 100, loss: 5 }]
    handler(mockReq('PUT', ['meta', 'custom_presets'], presets), mockRes())
    const presetRes = mockRes()
    handler(mockReq('GET', ['meta', 'custom_presets']), presetRes)
    expect(presetRes.body).toEqual(presets)

    expect(fs.existsSync(path.join(projectDir, '.specyard', 'simulation_history.json'))).toBe(true)
    expect(fs.existsSync(path.join(projectDir, '.specyard', 'custom_presets.json'))).toBe(true)
  })

  test('GET meta returns 200 with null for missing file and for corrupted JSON', () => {
    const missingRes = mockRes()
    handler(mockReq('GET', ['meta', 'simulation_history']), missingRes)
    expect(missingRes.statusCode).toBe(200)
    expect(missingRes.body).toBeNull()

    fs.mkdirSync(path.join(projectDir, '.specyard'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, '.specyard', 'custom_presets.json'), '{not json')
    const corruptRes = mockRes()
    handler(mockReq('GET', ['meta', 'custom_presets']), corruptRes)
    expect(corruptRes.statusCode).toBe(200)
    expect(corruptRes.body).toBeNull()
  })

  test('rejects unknown keys and traversal attempts without writing', () => {
    for (const segments of [
      ['spec', 'other'],
      ['meta', 'evil'],
      ['..', '..', 'etc', 'passwd'],
      ['meta', '..'],
      ['spec'],
    ]) {
      const res = mockRes()
      handler(mockReq('PUT', segments, { yamlContent: 'x' }), res)
      expect(res.statusCode).toBeGreaterThanOrEqual(400)
    }
    expect(fs.readdirSync(projectDir)).toEqual([])
  })

  test('rejects unsupported methods', () => {
    const res = mockRes()
    handler(mockReq('DELETE', ['spec', 'main']), res)
    expect(res.statusCode).toBe(405)
  })

  test('PUT spec creates .specyard lazily inside an existing project dir only', () => {
    const yaml = 'system:\n  name: Lazy\n'
    handler(mockReq('PUT', ['spec', 'main'], { title: 'Lazy', yamlContent: yaml }), mockRes())
    expect(fs.existsSync(path.join(projectDir, '.specyard'))).toBe(true)
  })
})

describe('store API route — adversarial hardening', () => {
  let projectDir: string

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-adv-'))
    process.env.SPEC_YARD_PROJECT_DIR = projectDir
  })

  afterEach(() => {
    delete process.env.SPEC_YARD_PROJECT_DIR
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  test('rejects prototype-chain keys without crashing', () => {
    for (const key of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
      const res = mockRes()
      handler(mockReq('GET', ['meta', key]), res)
      expect(res.statusCode).toBe(400)
    }
  })

  test('symlinked .specyard cannot escape the project root', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-outside-'))
    try {
      fs.symlinkSync(outside, path.join(projectDir, '.specyard'), 'dir')
      const res = mockRes()
      handler(mockReq('PUT', ['meta', 'simulation_history'], [{ id: 'x' }]), res)
      expect(res.statusCode).toBe(400)
      expect(fs.readdirSync(outside)).toEqual([])
    } finally {
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })

  test('symlinked main.spec.yaml cannot be written outside the root', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-outside-'))
    try {
      const outsideFile = path.join(outside, 'stolen.yaml')
      fs.writeFileSync(outsideFile, 'original')
      fs.symlinkSync(outsideFile, path.join(projectDir, 'main.spec.yaml'))
      const res = mockRes()
      handler(mockReq('PUT', ['spec', 'main'], { title: 'T', yamlContent: 'hacked' }), res)
      expect(res.statusCode).toBe(400)
      expect(fs.readFileSync(outsideFile, 'utf8')).toBe('original')
    } finally {
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })

  test('unreadable-but-present spec file is a 500, not found:false', () => {
    const specFile = path.join(projectDir, 'main.spec.yaml')
    fs.writeFileSync(specFile, 'system: {}')
    fs.chmodSync(specFile, 0o000)
    try {
      const res = mockRes()
      handler(mockReq('GET', ['spec', 'main']), res)
      expect(res.statusCode).toBe(500)
    } finally {
      fs.chmodSync(specFile, 0o644)
    }
  })

  test('external edit between load and save is rejected with 409, not clobbered', () => {
    // First save establishes the index (adopt: no index entry yet)
    handler(mockReq('PUT', ['spec', 'main'], { title: 'V1', yamlContent: 'v: 1\n', baseUpdatedAt: null }), mockRes())
    const getRes = mockRes()
    handler(mockReq('GET', ['spec', 'main']), getRes)
    const base = getRes.body.updatedAt
    expect(typeof base).toBe('string')

    // External edit: rewrite the file directly (mtime changes, index doesn't)
    fs.writeFileSync(path.join(projectDir, 'main.spec.yaml'), 'v: EXTERNAL\n')

    const conflictRes = mockRes()
    handler(mockReq('PUT', ['spec', 'main'], { title: 'V2', yamlContent: 'v: 2\n', baseUpdatedAt: base }), conflictRes)
    expect(conflictRes.statusCode).toBe(409)
    expect(fs.readFileSync(path.join(projectDir, 'main.spec.yaml'), 'utf8')).toBe('v: EXTERNAL\n')
  })

  test('stale baseUpdatedAt (second tab) is rejected with 409; correct base succeeds', () => {
    handler(mockReq('PUT', ['spec', 'main'], { title: 'V1', yamlContent: 'v: 1\n', baseUpdatedAt: null }), mockRes())
    const getRes = mockRes()
    handler(mockReq('GET', ['spec', 'main']), getRes)
    const base = getRes.body.updatedAt

    // Tab A saves, advancing the index
    const putA = mockRes()
    handler(mockReq('PUT', ['spec', 'main'], { title: 'V2', yamlContent: 'v: 2\n', baseUpdatedAt: base }), putA)
    expect(putA.statusCode).toBe(200)
    const newBase = putA.body.updatedAt

    // Tab B saves with the stale base
    const putB = mockRes()
    handler(mockReq('PUT', ['spec', 'main'], { title: 'V3', yamlContent: 'v: 3\n', baseUpdatedAt: base }), putB)
    expect(putB.statusCode).toBe(409)

    // Tab B with the fresh base succeeds
    const putB2 = mockRes()
    handler(mockReq('PUT', ['spec', 'main'], { title: 'V3', yamlContent: 'v: 3\n', baseUpdatedAt: newBase }), putB2)
    expect(putB2.statusCode).toBe(200)
  })

  test('hand-authored spec file (no index) is adopted on first save', () => {
    fs.writeFileSync(path.join(projectDir, 'main.spec.yaml'), 'system:\n  name: Hand Made\n')
    const res = mockRes()
    handler(mockReq('PUT', ['spec', 'main'], { title: 'Hand Made', yamlContent: 'system:\n  name: Hand Made\n  # edit\n', baseUpdatedAt: null }), res)
    expect(res.statusCode).toBe(200)
  })
})
