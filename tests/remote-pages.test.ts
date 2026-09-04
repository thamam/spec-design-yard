import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getServerSideProps as workspaceGssp } from '../pages/index'
import { getServerSideProps as loginGssp } from '../pages/login'
import { resetAuthStateForTests } from '../lib/server-auth'

let configDir: string

beforeEach(() => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specyard-pages-'))
  process.env.SPEC_YARD_CONFIG_DIR = configDir
  delete process.env.SPEC_YARD_REMOTE
  resetAuthStateForTests()
})

afterEach(() => {
  delete process.env.SPEC_YARD_REMOTE
  resetAuthStateForTests()
  fs.rmSync(configDir, { recursive: true, force: true })
})

describe('page guards', () => {
  test('index stays on the workspace in local mode', async () => {
    const result = await workspaceGssp({ req: { headers: { host: 'localhost:3000' } } } as any)
    expect(result).toEqual({ props: {} })
  })

  test('login redirects home in local mode', async () => {
    const result = await loginGssp({ req: { headers: { host: 'localhost:3000' } }, query: {} } as any)
    expect(result).toEqual({ redirect: { destination: '/', permanent: false } })
  })
})
