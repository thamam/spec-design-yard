import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import handler from '../pages/api/store/[...path]'
import { resetProjectStateForTests, setStandaloneMode } from '../lib/server-project-config'
import { mockRes, storeReq } from './api-test-doubles'

describe('store API route', () => {
  let projectDir: string
  let configDir: string

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-test-'))
    // Per-test registry: env-var launches seed the config as a side effect,
    // and a shared config dir bleeds a deleted project into later tests.
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-test-cfg-'))
    process.env.SPEC_YARD_CONFIG_DIR = configDir
    process.env.SPEC_YARD_PROJECT_DIR = projectDir
    // Session selections live on globalThis; a leftover one would decide the
    // mode for the next test.
    resetProjectStateForTests()
  })

  afterEach(() => {
    delete process.env.SPEC_YARD_PROJECT_DIR
    resetProjectStateForTests()
    fs.rmSync(projectDir, { recursive: true, force: true })
    fs.rmSync(configDir, { recursive: true, force: true })
  })

  test('non-loopback Host is refused before any read or write (DNS-rebinding guard)', () => {
    const getRes = mockRes()
    handler(storeReq('GET', ['spec', 'main'], undefined, { host: 'evil.example.com:3000' }), getRes)
    expect(getRes.statusCode).toBe(403)

    const putRes = mockRes()
    handler(storeReq('PUT', ['spec', 'main'], { title: 'T', yamlContent: 'x' }, { host: 'evil.example.com:3000' }), putRes)
    expect(putRes.statusCode).toBe(403)
    expect(fs.readdirSync(projectDir)).toEqual([])
  })

  test('responds 200 with enabled:false when no project is active', () => {
    // 200 rather than 501: having no project is a normal state, and an error
    // status would surface in the browser console on every load.
    delete process.env.SPEC_YARD_PROJECT_DIR
    const res = mockRes()
    handler(storeReq('GET', ['spec', 'main']), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.enabled).toBe(false)
  })

  test('a first run is reported as unconfigured, not as browser storage', () => {
    // The two look identical to the store (no project dir either way), but
    // they are different stories to the user: an untouched install has not
    // chosen anything yet, so the workspace must not open the demo spec as
    // though browser-only were a deliberate choice.
    delete process.env.SPEC_YARD_PROJECT_DIR
    const res = mockRes()
    handler(storeReq('GET', ['spec', 'main']), res)
    expect(res.body).toEqual({ enabled: false, mode: 'unconfigured' })
  })

  test('an explicit browser-storage opt-out is reported as standalone', () => {
    delete process.env.SPEC_YARD_PROJECT_DIR
    setStandaloneMode()
    const res = mockRes()
    handler(storeReq('GET', ['spec', 'main']), res)
    expect(res.body).toEqual({ enabled: false, mode: 'standalone' })
  })

  test('spec round-trip: PUT writes main.spec.yaml + spec-index.json, GET reads back', () => {
    const yaml = 'system:\n  name: Client System\n'
    const putRes = mockRes()
    handler(storeReq('PUT', ['spec', 'main'], { title: 'Client System', yamlContent: yaml }), putRes)
    expect(putRes.statusCode).toBe(200)

    expect(fs.readFileSync(path.join(projectDir, 'main.spec.yaml'), 'utf8')).toBe(yaml)

    const index = JSON.parse(fs.readFileSync(path.join(projectDir, '.specyard', 'spec-index.json'), 'utf8'))
    expect(index.main.title).toBe('Client System')
    expect(typeof index.main.updatedAt).toBe('string')

    const getRes = mockRes()
    handler(storeReq('GET', ['spec', 'main']), getRes)
    expect(getRes.statusCode).toBe(200)
    expect(getRes.body.yamlContent).toBe(yaml)
    expect(getRes.body.title).toBe('Client System')
  })

  test('GET spec returns 200 with found:false when the file does not exist', () => {
    // 200-with-marker rather than 404: "nothing stored yet" is a normal state
    // and a 404 would surface as a console error in the browser on every launch.
    const res = mockRes()
    handler(storeReq('GET', ['spec', 'main']), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.found).toBe(false)
    // The response also carries the project epoch (see project-api-route tests).
    expect(typeof res.body.epoch).toBe('string')
  })

  test('meta round-trip for simulation_history and custom_presets', () => {
    const runs = [{ id: 'run-1', path: 'a -> b' }]
    const putRes = mockRes()
    handler(storeReq('PUT', ['meta', 'simulation_history'], runs), putRes)
    expect(putRes.statusCode).toBe(200)

    const getRes = mockRes()
    handler(storeReq('GET', ['meta', 'simulation_history']), getRes)
    expect(getRes.statusCode).toBe(200)
    expect(getRes.body).toEqual(runs)

    const presets = [{ name: 'P', packets: 100, loss: 5 }]
    handler(storeReq('PUT', ['meta', 'custom_presets'], presets), mockRes())
    const presetRes = mockRes()
    handler(storeReq('GET', ['meta', 'custom_presets']), presetRes)
    expect(presetRes.body).toEqual(presets)

    expect(fs.existsSync(path.join(projectDir, '.specyard', 'simulation_history.json'))).toBe(true)
    expect(fs.existsSync(path.join(projectDir, '.specyard', 'custom_presets.json'))).toBe(true)
  })

  test('GET meta returns 200 with null for missing file and for corrupted JSON', () => {
    const missingRes = mockRes()
    handler(storeReq('GET', ['meta', 'simulation_history']), missingRes)
    expect(missingRes.statusCode).toBe(200)
    expect(missingRes.body).toBeNull()

    fs.mkdirSync(path.join(projectDir, '.specyard'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, '.specyard', 'custom_presets.json'), '{not json')
    const corruptRes = mockRes()
    handler(storeReq('GET', ['meta', 'custom_presets']), corruptRes)
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
      handler(storeReq('PUT', segments, { yamlContent: 'x' }), res)
      expect(res.statusCode).toBeGreaterThanOrEqual(400)
    }
    expect(fs.readdirSync(projectDir)).toEqual([])
  })

  test('rejects unsupported methods', () => {
    const res = mockRes()
    handler(storeReq('DELETE', ['spec', 'main']), res)
    expect(res.statusCode).toBe(405)
  })

  test('PUT spec creates .specyard lazily inside an existing project dir only', () => {
    const yaml = 'system:\n  name: Lazy\n'
    handler(storeReq('PUT', ['spec', 'main'], { title: 'Lazy', yamlContent: yaml }), mockRes())
    expect(fs.existsSync(path.join(projectDir, '.specyard'))).toBe(true)
  })
})

describe('store API route — adversarial hardening', () => {
  let projectDir: string
  let configDir: string

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-adv-'))
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-adv-cfg-'))
    process.env.SPEC_YARD_CONFIG_DIR = configDir
    process.env.SPEC_YARD_PROJECT_DIR = projectDir
  })

  afterEach(() => {
    delete process.env.SPEC_YARD_PROJECT_DIR
    fs.rmSync(projectDir, { recursive: true, force: true })
    fs.rmSync(configDir, { recursive: true, force: true })
  })

  test('rejects prototype-chain keys without crashing', () => {
    for (const key of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
      const res = mockRes()
      handler(storeReq('GET', ['meta', key]), res)
      expect(res.statusCode).toBe(400)
    }
  })

  test('symlinked .specyard cannot escape the project root', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-outside-'))
    try {
      fs.symlinkSync(outside, path.join(projectDir, '.specyard'), 'dir')
      const res = mockRes()
      handler(storeReq('PUT', ['meta', 'simulation_history'], [{ id: 'x' }]), res)
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
      handler(storeReq('PUT', ['spec', 'main'], { title: 'T', yamlContent: 'hacked' }), res)
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
      handler(storeReq('GET', ['spec', 'main']), res)
      expect(res.statusCode).toBe(500)
    } finally {
      fs.chmodSync(specFile, 0o644)
    }
  })

  test('external edit between load and save is rejected with 409, not clobbered', () => {
    // First save establishes the index (adopt: no index entry yet)
    handler(storeReq('PUT', ['spec', 'main'], { title: 'V1', yamlContent: 'v: 1\n', baseRev: null }), mockRes())
    const getRes = mockRes()
    handler(storeReq('GET', ['spec', 'main']), getRes)
    const baseRev = getRes.body.rev
    expect(typeof baseRev).toBe('string')

    // External edit: rewrite the file directly (mtime changes, index doesn't).
    // utimes: this environment can assign the same mtimeMs to two writes in
    // the same millisecond, which would make the conflict look like a no-op.
    const specPath = path.join(projectDir, 'main.spec.yaml')
    fs.writeFileSync(specPath, 'v: EXTERNAL\n')
    fs.utimesSync(specPath, new Date(Date.now() + 1000), new Date(Date.now() + 1000))

    const conflictRes = mockRes()
    handler(storeReq('PUT', ['spec', 'main'], { title: 'V2', yamlContent: 'v: 2\n', baseRev }), conflictRes)
    expect(conflictRes.statusCode).toBe(409)
    expect(fs.readFileSync(path.join(projectDir, 'main.spec.yaml'), 'utf8')).toBe('v: EXTERNAL\n')
  })

  test('external deletion of a tracked spec is a 409, not a silent recreate', () => {
    handler(storeReq('PUT', ['spec', 'main'], { title: 'V1', yamlContent: 'v: 1\n', baseRev: null }), mockRes())
    fs.unlinkSync(path.join(projectDir, 'main.spec.yaml'))

    const res = mockRes()
    handler(storeReq('PUT', ['spec', 'main'], { title: 'V2', yamlContent: 'v: 2\n', baseRev: 'whatever' }), res)
    expect(res.statusCode).toBe(409)
    expect(fs.existsSync(path.join(projectDir, 'main.spec.yaml'))).toBe(false)
  })

  test('stale baseRev (second tab) is rejected with 409; correct base succeeds', () => {
    handler(storeReq('PUT', ['spec', 'main'], { title: 'V1', yamlContent: 'v: 1\n', baseRev: null }), mockRes())
    const getRes = mockRes()
    handler(storeReq('GET', ['spec', 'main']), getRes)
    const base = getRes.body.rev

    // Tab A saves, advancing the index
    const putA = mockRes()
    handler(storeReq('PUT', ['spec', 'main'], { title: 'V2', yamlContent: 'v: 2\n', baseRev: base }), putA)
    expect(putA.statusCode).toBe(200)
    const newBase = putA.body.rev

    // Tab B saves with the stale base
    const putB = mockRes()
    handler(storeReq('PUT', ['spec', 'main'], { title: 'V3', yamlContent: 'v: 3\n', baseRev: base }), putB)
    expect(putB.statusCode).toBe(409)

    // Tab B with the fresh base succeeds
    const putB2 = mockRes()
    handler(storeReq('PUT', ['spec', 'main'], { title: 'V3', yamlContent: 'v: 3\n', baseRev: newBase }), putB2)
    expect(putB2.statusCode).toBe(200)
  })

  test('spec-index write is containment-checked too (spec PUT with symlinked .specyard)', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-outside-'))
    try {
      fs.symlinkSync(outside, path.join(projectDir, '.specyard'), 'dir')
      const res = mockRes()
      handler(storeReq('PUT', ['spec', 'main'], { title: 'T', yamlContent: 'system: {}\n', baseRev: null }), res)
      expect(res.statusCode).toBe(400)
      expect(fs.readdirSync(outside)).toEqual([])
    } finally {
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })

  test('hand-authored spec file (no index) is adopted on first save', () => {
    fs.writeFileSync(path.join(projectDir, 'main.spec.yaml'), 'system:\n  name: Hand Made\n')
    const res = mockRes()
    handler(storeReq('PUT', ['spec', 'main'], { title: 'Hand Made', yamlContent: 'system:\n  name: Hand Made\n  # edit\n', baseRev: null }), res)
    expect(res.statusCode).toBe(200)
  })
})

describe('store API route — legacy index migration', () => {
  let projectDir: string
  let configDir: string

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-legacy-'))
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-legacy-cfg-'))
    process.env.SPEC_YARD_CONFIG_DIR = configDir
    process.env.SPEC_YARD_PROJECT_DIR = projectDir
  })

  afterEach(() => {
    delete process.env.SPEC_YARD_PROJECT_DIR
    fs.rmSync(projectDir, { recursive: true, force: true })
    fs.rmSync(configDir, { recursive: true, force: true })
  })

  test('legacy entry without rev: GET mints one, bare PUT 409s, PUT with minted rev succeeds', () => {
    // Simulate a pre-rev index entry
    fs.writeFileSync(path.join(projectDir, 'main.spec.yaml'), 'system:\n  name: Legacy\n')
    fs.mkdirSync(path.join(projectDir, '.specyard'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, '.specyard', 'spec-index.json'),
      JSON.stringify({ main: { title: 'Legacy', updatedAt: '2026-08-18T00:00:00.000Z', mtimeMs: fs.statSync(path.join(projectDir, 'main.spec.yaml')).mtimeMs } }))

    // Bare PUT against a rev-less entry is refused (no silent adoption)
    const barePut = mockRes()
    handler(storeReq('PUT', ['spec', 'main'], { title: 'Legacy', yamlContent: 'system: {}\n', baseRev: null }), barePut)
    expect(barePut.statusCode).toBe(409)
    expect(barePut.body.reason).toBe('legacy-index')

    // GET self-heals: mints a rev
    const getRes = mockRes()
    handler(storeReq('GET', ['spec', 'main']), getRes)
    expect(getRes.statusCode).toBe(200)
    expect(typeof getRes.body.rev).toBe('string')

    // PUT chained on the minted rev succeeds
    const putRes = mockRes()
    handler(storeReq('PUT', ['spec', 'main'], { title: 'Legacy', yamlContent: 'system: {}\n', baseRev: getRes.body.rev }), putRes)
    expect(putRes.statusCode).toBe(200)
  })

  test('PUT without a JSON content type is refused (CSRF preflight guard)', () => {
    const res = mockRes()
    handler(storeReq('PUT', ['spec', 'main'], { title: 'T', yamlContent: 'x' }, { contentType: 'text/plain' }), res)
    expect(res.statusCode).toBe(415)
    expect(fs.readdirSync(projectDir)).toEqual([])
  })

  test('PUT with JSON smuggled in a text/plain parameter is refused', () => {
    const res = mockRes()
    handler(
      storeReq('PUT', ['spec', 'main'], { title: 'T', yamlContent: 'x' }, { contentType: 'text/plain;foo=application/json' }),
      res
    )
    expect(res.statusCode).toBe(415)
    expect(fs.readdirSync(projectDir)).toEqual([])
  })

  test('PUT spec larger than 1 MB is refused', () => {
    const yaml = 'x'.repeat(1_000_001)
    const res = mockRes()
    handler(storeReq('PUT', ['spec', 'main'], { title: 'Huge', yamlContent: yaml }), res)
    expect(res.statusCode).toBe(413)
    expect(fs.existsSync(path.join(projectDir, 'main.spec.yaml'))).toBe(false)
  })
})
