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

  test('SPEC_YARD_PROJECT_DIR wins for the session and seeds the config', () => {
    setActiveProject('/tmp/previous')
    resetProjectStateForTests()
    process.env.SPEC_YARD_PROJECT_DIR = '/tmp/env-project'

    const status = getProjectStatus()
    expect(status).toMatchObject({ mode: 'project', dir: '/tmp/env-project', source: 'env' })

    // Seeded: the next bare launch continues in the env project.
    resetProjectStateForTests()
    delete process.env.SPEC_YARD_PROJECT_DIR
    expect(getProjectStatus()).toMatchObject({ mode: 'project', dir: '/tmp/env-project', source: 'config' })
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

  test('epoch re-mints on every project or mode change', () => {
    const e1 = getProjectEpoch()
    expect(getProjectEpoch()).toBe(e1)
    setActiveProject('/tmp/a')
    const e2 = getProjectEpoch()
    expect(e2).not.toBe(e1)
    setStandaloneMode()
    const e3 = getProjectEpoch()
    expect(e3).not.toBe(e2)
  })
})
