import { describe, test, expect } from 'vitest'
import { lintSpec } from '../lib/linter'
import { reconcileSpec } from '../lib/reconciler'
import yaml from 'yaml'

describe('Connection Labels and Overlap Resolution', () => {
  test('flags connections without labels as missing-connection-label info diagnostics', () => {
    const spec = {
      system: {
        name: 'Connection Label System',
        components: [
          {
            id: 'node_a',
            type: 'Stage',
            connections: [{ target: 'node_b' }] // No label
          },
          {
            id: 'node_b',
            type: 'Stage'
          }
        ]
      }
    }

    const diagnostics = lintSpec(spec)
    const missingLabelDiag = diagnostics.find(d => d.code === 'missing-connection-label')
    expect(missingLabelDiag).toBeDefined()
    expect(missingLabelDiag?.severity).toBe('info')
    expect(missingLabelDiag?.path).toBe('system.components[0].connections[0]')
    expect(missingLabelDiag?.message).toContain('lacks a label')
  })

  test('does NOT flag connection if it has a label', () => {
    const spec = {
      system: {
        name: 'Connection Label System',
        components: [
          {
            id: 'node_a',
            type: 'Stage',
            connections: [{ target: 'node_b', label: 'HTTP' }]
          },
          {
            id: 'node_b',
            type: 'Stage'
          }
        ]
      }
    }

    const diagnostics = lintSpec(spec)
    const missingLabelDiag = diagnostics.find(d => d.code === 'missing-connection-label')
    expect(missingLabelDiag).toBeUndefined()
  })

  test('reconciles missing-connection-label by adding a default [Add Label] label', () => {
    const initialYaml = `system:
  name: Connection Label System
  components:
    - id: node_a
      type: Stage
      connections:
        - target: node_b
    - id: node_b
      type: Stage
`
    const updated = reconcileSpec(initialYaml, {
      type: 'quick-fix',
      payload: { path: 'system.components[0].connections[0]', fixType: 'missing-connection-label' }
    })

    const parsed = yaml.parse(updated)
    expect(parsed.system.components[0].connections[0].label).toBe('[Add Label]')
  })

  test('resolves component-overlap by shifting to the next unoccupied coordinate instead of blindly shifting by 100', () => {
    // Initial spec has nodes at x=100, x=200, and an overlap at x=100
    const initialYaml = `system:
  name: Overlap System
  components:
    - id: node_a
      type: Stage
      x: 100
      y: 100
    - id: node_b
      type: Stage
      x: 200
      y: 100
    - id: node_c
      type: Stage
      x: 100 # Overlaps with node_a
      y: 100
`
    // Shifting node_c should NOT land on node_b (at x=200) but land on x=300 (100 + 100 + 100 = 300)
    const updated = reconcileSpec(initialYaml, {
      type: 'quick-fix',
      payload: { path: 'system.components[2].x', fixType: 'component-overlap' }
    })

    const parsed = yaml.parse(updated)
    expect(parsed.system.components[2].x).toBe(300)
  })
})
