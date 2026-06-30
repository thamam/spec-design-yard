import { describe, test, expect } from 'vitest'
import { lintSpec } from '../lib/linter'
import { reconcileSpec } from '../lib/reconciler'
import yaml from 'yaml'

describe('Unused Store Architectural Warning and Disconnected Refinements', () => {
  test('flags Store with no incoming connections as unused-store warning', () => {
    const spec = {
      system: {
        name: 'Unused Store System',
        components: [
          {
            id: 'gateway_a',
            type: 'Gateway',
            connections: [{ target: 'stage_a' }]
          },
          {
            id: 'stage_a',
            type: 'Stage'
          },
          {
            id: 'store_b',
            type: 'Store' // No one connects to store_b
          }
        ]
      }
    }

    const diagnostics = lintSpec(spec)
    const unusedStoreWarn = diagnostics.find(d => d.code === 'unused-store')
    expect(unusedStoreWarn).toBeDefined()
    expect(unusedStoreWarn?.severity).toBe('warning')
    expect(unusedStoreWarn?.path).toBe('system.components[2].type')
    expect(unusedStoreWarn?.message).toContain('Store component "store_b" has no incoming connections')
  })

  test('does NOT flag Store if it has at least one incoming connection', () => {
    const spec = {
      system: {
        name: 'Used Store System',
        components: [
          {
            id: 'stage_a',
            type: 'Stage',
            connections: [{ target: 'store_b' }]
          },
          {
            id: 'store_b',
            type: 'Store' // Connected from stage_a
          }
        ]
      }
    }

    const diagnostics = lintSpec(spec)
    const unusedStoreWarn = diagnostics.find(d => d.code === 'unused-store')
    expect(unusedStoreWarn).toBeUndefined()
  })

  test('reconciles unused-store by connecting a stage to it', () => {
    const initialYaml = `system:
  name: Connect Store System
  components:
    - id: stage_a
      type: Stage
    - id: store_b
      type: Store
`
    // The warning targets the type path system.components[1].type or components[1]
    const updated = reconcileSpec(initialYaml, {
      type: 'quick-fix',
      payload: { path: 'system.components[1]', fixType: 'connect-to-store' }
    })

    const parsed = yaml.parse(updated)
    expect(parsed.system.components[0].connections).toBeDefined()
    expect(parsed.system.components[0].connections[0].target).toBe('store_b')
  })
})
