import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REMOTE_TOKEN_FILENAME } from '../lib/remote-access'

const ROOT = resolve(__dirname, '..')

describe('remote launch paths stay loopback-bound', () => {
  test('npm run dev:remote sets the flag and still binds 127.0.0.1', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
    expect(pkg.scripts.dev).toMatch(/-H 127\.0\.0\.1/)
    expect(pkg.scripts.dev).not.toMatch(/SPEC_YARD_REMOTE/)
    expect(pkg.scripts['dev:remote']).toMatch(/SPEC_YARD_REMOTE=1/)
    expect(pkg.scripts['dev:remote']).toMatch(/-H 127\.0\.0\.1/)
    expect(pkg.scripts['dev:remote']).toMatch(/ensure-remote-token/)
    expect(pkg.scripts.start).toMatch(/-H 127\.0\.0\.1/)
  })

  test('spec-yard --remote is opt-in and still launches with -H 127.0.0.1', () => {
    const cli = readFileSync(resolve(ROOT, 'bin/spec-yard'), 'utf8')
    expect(cli).toMatch(/--remote/)
    expect(cli).toMatch(/SPEC_YARD_REMOTE=1/)
    expect(cli).toMatch(/-H 127\.0\.0\.1/)
    expect(cli).toMatch(/tailscale serve/)
    expect(cli).toMatch(/funnel/)
    expect(cli).toMatch(/Authorization: Bearer/)
    expect(cli).not.toMatch(/-H 0\.0\.0\.0/)
  })

  test('attach probes /api/auth/session before sending the remote token', () => {
    const cli = readFileSync(resolve(ROOT, 'bin/spec-yard'), 'utf8')
    const sessionIdx = cli.indexOf('/api/auth/session')
    const bearerIdx = cli.indexOf('Authorization: Bearer')
    expect(sessionIdx).toBeGreaterThan(-1)
    expect(bearerIdx).toBeGreaterThan(sessionIdx)
    expect(cli).toMatch(/session_is_remote/)
    expect(cli).toMatch(/"remote"/)
    expect(cli).toMatch(/without remote mode/)
    expect(cli).toMatch(/exit 1/)
    // Token file is read only after the probe reports remote:true.
    const tokenRead = cli.indexOf("tr -d '[:space:]' < \"$TOKEN_FILE\"")
    expect(tokenRead).toBeGreaterThan(sessionIdx)
  })

  test('ensure-remote-token writes the same filename the server reads', () => {
    const script = readFileSync(resolve(ROOT, 'scripts/ensure-remote-token.mjs'), 'utf8')
    expect(script).toContain(REMOTE_TOKEN_FILENAME)
    expect(script).toContain('Generated remote token')
    expect(script).toContain('already exists')
  })
})
