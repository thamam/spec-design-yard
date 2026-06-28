import { describe, test, expect } from 'vitest'
import { lintSpec } from '../lib/linter'
import { reconcileSpec } from '../lib/reconciler'

describe('Comprehensive Diagnostics and Quick-Fixes', () => {
  test('flags missing system name with code and path', () => {
    const spec = {
      system: {
        components: []
      }
    }
    const diagnostics = lintSpec(spec)
    const issue = diagnostics.find(d => d.code === 'missing-system-name')
    expect(issue).toBeDefined()
    expect(issue?.path).toBe('system.name')
  })

  test('flags missing component id with code and path', () => {
    const spec = {
      system: {
        name: 'Test',
        components: [
          { type: 'Stage', name: 'Stage 1' }
        ]
      }
    }
    const diagnostics = lintSpec(spec)
    const issue = diagnostics.find(d => d.code === 'missing-component-id')
    expect(issue).toBeDefined()
    expect(issue?.path).toBe('system.components[0]')
  })

  test('flags missing component type with code and path', () => {
    const spec = {
      system: {
        name: 'Test',
        components: [
          { id: 'node_a', name: 'Node A' }
        ]
      }
    }
    const diagnostics = lintSpec(spec)
    const issue = diagnostics.find(d => d.code === 'missing-component-type')
    expect(issue).toBeDefined()
    expect(issue?.path).toBe('system.components[0].type')
  })

  test('flags invalid metadata object with code and path', () => {
    const spec = {
      system: {
        name: 'Test',
        components: [
          { id: 'node_a', type: 'Stage', metadata: ['not-an-object'] }
        ]
      }
    }
    const diagnostics = lintSpec(spec)
    const issue = diagnostics.find(d => d.code === 'invalid-metadata-object')
    expect(issue).toBeDefined()
    expect(issue?.path).toBe('system.components[0].metadata')
  })

  test('reconciles missing-system-name by setting default', () => {
    const initial = `system:
  components: []
`
    const updated = reconcileSpec(initial, {
      type: 'quick-fix',
      payload: { path: 'system.name', fixType: 'missing-system-name' }
    })
    expect(updated).toContain('name: unnamed_system')
  })

  test('reconciles missing-component-id by setting unique id', () => {
    const initial = `system:
  name: Test System
  components:
    - type: Stage
      name: My Stage
`
    const updated = reconcileSpec(initial, {
      type: 'quick-fix',
      payload: { path: 'system.components[0]', fixType: 'missing-component-id' }
    })
    expect(updated).toContain('id: stage_1')
  })

  test('reconciles missing-component-type by setting to Stage', () => {
    const initial = `system:
  name: Test System
  components:
    - id: node_a
`
    const updated = reconcileSpec(initial, {
      type: 'quick-fix',
      payload: { path: 'system.components[0].type', fixType: 'missing-component-type' }
    })
    expect(updated).toContain('type: Stage')
  })

  test('reconciles invalid-metadata-object by resetting to empty object', () => {
    const initial = `system:
  name: Test System
  components:
    - id: node_a
      type: Stage
      metadata:
        - array_instead
`
    const updated = reconcileSpec(initial, {
      type: 'quick-fix',
      payload: { path: 'system.components[0].metadata', fixType: 'invalid-metadata-object' }
    })
    expect(updated).toContain('metadata: {}')
  })

  test('reconciles invalid-connections-array by resetting to empty array', () => {
    const initial = `system:
  name: Test System
  components:
    - id: node_a
      type: Stage
      connections: "not-an-array"
`
    const updated = reconcileSpec(initial, {
      type: 'quick-fix',
      payload: { path: 'system.components[0].connections', fixType: 'invalid-connections-array' }
    })
    expect(updated).toContain('connections: []')
  })

  test('reconciles invalid-connection-object by deleting the element', () => {
    const initial = `system:
  name: Test System
  components:
    - id: node_a
      type: Stage
      connections:
        - "invalid-string"
`
    const updated = reconcileSpec(initial, {
      type: 'quick-fix',
      payload: { path: 'system.components[0].connections[0]', fixType: 'invalid-connection-object' }
    })
    expect(updated).not.toContain('invalid-string')
  })
})
