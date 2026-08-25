import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  getActiveProjectDir,
  getProjectEpoch,
  getProjectStatus,
  getSuggestedProjectDir,
  resetProjectStateForTests,
  setActiveProject,
  setStandaloneMode,
} from '../lib/server-project-config'

// Project-first persistence model: the active project lives in a small
// registry at SPEC_YARD_CONFIG_DIR/config.json so a bare launch reopens the
// last project. SPEC_YARD_PROJECT_DIR seeds/overrides it for the session.

let configDir: string

function readConfigFile(): any {
  return JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf8'))
}

beforeEach(() => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-cfg-'))
  process.env.SPEC_YARD_CONFIG_DIR = configDir
  delete process.env.SPEC_YARD_PROJECT_DIR
  resetProjectStateForTests()
})

afterEach(() => {
  delete process.env.SPEC_YARD_PROJECT_DIR
  resetProjectStateForTests()
  fs.rmSync(configDir, { recursive: true, force: true })
})

describe('project config registry', () => {
  test('first run (no env, no config) is unconfigured with a suggested dir', () => {
    const status = getProjectStatus()
    expect(status.mode).toBe('unconfigured')
    expect(status.dir).toBeNull()
    expect(getActiveProjectDir()).toBeNull()
    expect(getSuggestedProjectDir()).toContain('spec-yard-projects')
    expect(path.isAbsolute(getSuggestedProjectDir())).toBe(true)
  })

  test('setActiveProject persists: a fresh session resumes the last project', () => {
    setActiveProject('/tmp/proj-a')
    expect(getProjectStatus()).toMatchObject({ mode: 'project', dir: '/tmp/proj-a', source: 'gui' })

    // Simulate a server restart: session state gone, config file remains.
    resetProjectStateForTests()
    const status = getProjectStatus()
    expect(status.mode).toBe('project')
    expect(status.dir).toBe('/tmp/proj-a')
    expect(status.source).toBe('config')
  })

  test('SPEC_YARD_PROJECT_DIR wins for the session and seeds the config (validated + realpathed)', () => {
    const envDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-env-'))
    try {
      setActiveProject('/tmp/previous')
      resetProjectStateForTests()
      process.env.SPEC_YARD_PROJECT_DIR = envDir

      const status = getProjectStatus()
      expect(status).toMatchObject({ mode: 'project', dir: envDir, source: 'env' })

      // Seeded with the resolved real path: the next bare launch continues there.
      resetProjectStateForTests()
      delete process.env.SPEC_YARD_PROJECT_DIR
      expect(getProjectStatus()).toMatchObject({
        mode: 'project',
        dir: fs.realpathSync(envDir),
        source: 'config',
      })
    } finally {
      fs.rmSync(envDir, { recursive: true, force: true })
    }
  })

  test('an env dir that does not exist is NOT persisted (session still uses it)', () => {
    setActiveProject('/tmp/previous')
    resetProjectStateForTests()
    process.env.SPEC_YARD_PROJECT_DIR = '/tmp/specyard-missing-env-dir-xyz'

    // Session resolution still honors the env var (the store route will 500
    // loudly on the missing dir), but the registry must not be poisoned.
    expect(getProjectStatus()).toMatchObject({ mode: 'project', dir: '/tmp/specyard-missing-env-dir-xyz', source: 'env' })
    expect(readConfigFile().activeProject).toBe('/tmp/previous')
  })

  test('a GUI switch overrides the env var within the session', () => {
    process.env.SPEC_YARD_PROJECT_DIR = '/tmp/env-project'
    setActiveProject('/tmp/picked')
    expect(getProjectStatus()).toMatchObject({ mode: 'project', dir: '/tmp/picked', source: 'gui' })
  })

  test('standalone is an explicit persisted opt-out', () => {
    setActiveProject('/tmp/proj-a')
    setStandaloneMode()
    expect(getProjectStatus().mode).toBe('standalone')
    expect(getActiveProjectDir()).toBeNull()

    // Persists across restart.
    resetProjectStateForTests()
    expect(getProjectStatus().mode).toBe('standalone')

    // Opting back into a project flips the mode back.
    setActiveProject('/tmp/proj-b')
    expect(getProjectStatus()).toMatchObject({ mode: 'project', dir: '/tmp/proj-b' })
  })

  test('recents: most-recent first, deduped, capped at 8', () => {
    for (let i = 1; i <= 10; i++) setActiveProject(`/tmp/p${i}`)
    setActiveProject('/tmp/p3')
    const { recents } = getProjectStatus()
    expect(recents[0]).toBe('/tmp/p3')
    expect(recents).toHaveLength(8)
    expect(new Set(recents).size).toBe(8)
    expect(readConfigFile().recentProjects).toEqual(recents)
  })

  test('a corrupted config file is treated as unconfigured, not a crash', () => {
    fs.writeFileSync(path.join(configDir, 'config.json'), '{not json')
    expect(getProjectStatus().mode).toBe('unconfigured')
    // And recovers on the next switch.
    setActiveProject('/tmp/fresh')
    expect(readConfigFile().activeProject).toBe('/tmp/fresh')
  })

  test('epoch derives from project identity: distinct per project, stable across restarts', () => {
    const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-epoch-a-'))
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-epoch-b-'))
    try {
      setActiveProject(dirA)
      const epochA = getProjectEpoch()
      expect(typeof epochA).toBe('string')

      // A dev-server restart (session state gone, config remembered) must NOT
      // change the epoch — otherwise every restart silently latches open tabs
      // to local-only.
      resetProjectStateForTests()
      expect(getProjectEpoch()).toBe(epochA)

      setActiveProject(dirB)
      const epochB = getProjectEpoch()
      expect(epochB).not.toBe(epochA)

      setStandaloneMode()
      expect(getProjectEpoch()).not.toBe(epochB)

      // Returning to a project restores its epoch (same project = same identity).
      setActiveProject(dirA)
      expect(getProjectEpoch()).toBe(epochA)
    } finally {
      fs.rmSync(dirA, { recursive: true, force: true })
      fs.rmSync(dirB, { recursive: true, force: true })
    }
  })
})
