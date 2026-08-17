import { describe, test, expect } from 'vitest'
import { FIXABLE_DIAGNOSTIC_CODES, isFixable, fixTypeForCode } from '../lib/quick-fixes'
import { lintSpec } from '../lib/linter'
import { reconcileSpec } from '../lib/reconciler'
import yaml from 'yaml'

const HANDLED_FIX_TYPES = new Set([
  'missing-system-name',
  'empty-system-name',
  'missing-system-metadata',
  'invalid-system-metadata-object',
  'invalid-system-metadata-status',
  'invalid-system-metadata-version',
  'placeholder-system-metadata-description',
  'missing-system-metadata-description',
  'placeholder-system-metadata-owner',
  'missing-system-metadata-owner',
  'missing-component-id',
  'missing-component-type',
  'invalid-metadata-object',
  'invalid-connections-array',
  'invalid-connection-object',
  'unrecognized-metadata-key',
  'unrecognized-component-key',
  'unrecognized-system-key',
  'unrecognized-connection-key',
  'unrecognized-system-metadata-key',
  'connection-case-mismatch',
  'invalid-metadata-status',
  'invalid-metadata-color',
  'invalid-connection-label',
  'component-overlap',
  'missing-metadata-description',
  'missing-metadata-owner',
  'unrecognized-type',
  'set-default-version',
  'convert-to-store',
  'connect-to-store',
  'connect-to-stage',
  'self-connection',
  'empty-connection-target',
  'duplicate-connection',
  'circular-dependency',
  'brick-to-brick',
  'gateway-to-gateway',
  'missing-connection-label',
  'duplicate-connection-label',
  'invalid-id-format',
  'duplicate-id',
  'orphan-connection',
  'delete-component',
  'connect-from-gateway',
  'insert-stage',
  'stride-spoofing',
  'stride-tampering',
  'stride-repudiation',
  'stride-information-disclosure',
  'stride-elevation-of-privilege',
  'stride-denial-of-service',
  'stride-secret-leak',
])

describe('quick-fixes: single source of truth', () => {
  test('every mapped code resolves to a fixType reconcileSpec actually handles', () => {
    Array.from(FIXABLE_DIAGNOSTIC_CODES).forEach((code) => {
      const mapped = fixTypeForCode(code)
      const fixType = mapped ?? code
      expect(HANDLED_FIX_TYPES.has(fixType)).toBe(true)
    })
  })

  test('stride-* codes are reported fixable even though absent from the explicit set', () => {
    expect(isFixable({ code: 'stride-spoofing' })).toBe(true)
    expect(isFixable({ code: 'stride-tampering' })).toBe(true)
    expect(FIXABLE_DIAGNOSTIC_CODES.has('stride-spoofing')).toBe(false)
  })

  test('codes in the explicit set are fixable', () => {
    Array.from(FIXABLE_DIAGNOSTIC_CODES).forEach((code) => {
      expect(isFixable({ code })).toBe(true)
    })
  })

  test('unknown codes are not fixable', () => {
    expect(isFixable({ code: 'not-a-real-code' })).toBe(false)
    expect(isFixable({})).toBe(false)
  })

  test('fixTypeForCode only overrides the documented codes, otherwise returns null', () => {
    expect(fixTypeForCode('empty-system-name')).toBe('missing-system-name')
    expect(fixTypeForCode('invalid-metadata-version')).toBe('set-default-version')
    expect(fixTypeForCode('disconnected-component')).toBe('delete-component')
    expect(fixTypeForCode('unreachable-component')).toBe('connect-from-gateway')
    expect(fixTypeForCode('gateway-to-store')).toBe('insert-stage')
    expect(fixTypeForCode('store-to-store')).toBe('insert-stage')
    expect(fixTypeForCode('sink-stage-brick')).toBe('connect-to-store')
    expect(fixTypeForCode('empty-gateway')).toBe('connect-to-stage')
    expect(fixTypeForCode('unused-store')).toBe('connect-to-store')
    expect(fixTypeForCode('missing-component-id')).toBeNull()
    expect(fixTypeForCode('stride-spoofing')).toBeNull()
  })
})

describe('quick-fixes: editor and canvas share one source', () => {
  test('editor-panel and canvas-panel both import isFixable/FIXABLE_DIAGNOSTIC_CODES from lib/quick-fixes, so they cannot diverge', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')

    const editorSource = await fs.readFile(
      path.join(process.cwd(), 'components/workspace/editor-panel.tsx'),
      'utf-8'
    )
    const canvasSource = await fs.readFile(
      path.join(process.cwd(), 'components/workspace/canvas-panel.tsx'),
      'utf-8'
    )

    expect(editorSource).toMatch(/from ["']\.\.\/\.\.\/lib\/quick-fixes["']/)
    expect(canvasSource).toMatch(/from ["']\.\.\/\.\.\/lib\/quick-fixes["']/)
    expect(editorSource).not.toMatch(/const FIXABLE_DIAGNOSTIC_CODES = new Set/)
    expect(canvasSource).not.toMatch(/const FIXABLE_DIAGNOSTIC_CODES = new Set/)
  })
})

describe('quick-fixes: STRIDE fixes are reachable end-to-end', () => {
  test('reconcileSpec applies a stride fixType surfaced as fixable by isFixable', () => {
    const spec = yaml.stringify({
      system: {
        name: 'Test System',
        components: [
          { id: 'gw', type: 'Gateway', name: 'Gateway', connections: [{ target: 'svc' }] },
          { id: 'svc', type: 'Stage', name: 'Service', connections: [] },
        ],
      },
    })

    const diagnostic = { code: 'stride-spoofing', path: 'system.components[0]' }
    expect(isFixable(diagnostic)).toBe(true)

    const updated = reconcileSpec(spec, {
      type: 'quick-fix',
      payload: { path: diagnostic.path, fixType: 'stride-spoofing' as any },
    })
    expect(updated).not.toBe(spec)
  })
})

describe('quick-fixes: empty-system-name is reachable end-to-end', () => {
  test('linter emits empty-system-name and the mapped fix sets a default name', () => {
    const spec = 'system:\n  name: ""\n  components: []\n'

    const diagnostic = lintSpec(yaml.parse(spec)).find(d => d.code === 'empty-system-name')
    expect(diagnostic).toBeDefined()
    expect(diagnostic?.path).toBe('system.name')
    expect(isFixable(diagnostic!)).toBe(true)

    const fixType = fixTypeForCode(diagnostic!.code!)
    expect(fixType).toBe('missing-system-name')
    const updated = reconcileSpec(spec, {
      type: 'quick-fix',
      payload: { path: diagnostic!.path!, fixType: fixType! },
    })
    expect(updated).toContain('name: "unnamed_system"')
  })
})
