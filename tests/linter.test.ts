import { describe, test, expect } from 'vitest'
import { lintSpec } from '../lib/linter'

describe('Advanced Linter Features', () => {
  test('flags self-connections as errors', () => {
    const specWithSelfConnection = {
      system: {
        name: 'Self Connect System',
        components: [
          {
            id: 'node_a',
            type: 'Stage',
            name: 'Node A',
            connections: [{ target: 'node_a' }]
          }
        ]
      }
    }

    const diagnostics = lintSpec(specWithSelfConnection)
    const selfConnError = diagnostics.find(d => d.message.includes('self-connection'))
    expect(selfConnError).toBeDefined()
    expect(selfConnError?.severity).toBe('error')
    expect(selfConnError?.path).toBe('system.components[0].connections[0].target')
  })

  test('flags disconnected/isolated components as warnings', () => {
    const specWithDisconnected = {
      system: {
        name: 'Disconnected System',
        components: [
          {
            id: 'node_a',
            type: 'Stage',
            name: 'Node A',
            connections: [{ target: 'node_b' }]
          },
          {
            id: 'node_b',
            type: 'Stage',
            name: 'Node B'
          },
          {
            id: 'node_c',
            type: 'Stage',
            name: 'Isolated Node C'
          }
        ]
      }
    }

    const diagnostics = lintSpec(specWithDisconnected)
    const disconnectedWarn = diagnostics.find(d => d.message.includes('is disconnected'))
    expect(disconnectedWarn).toBeDefined()
    expect(disconnectedWarn?.severity).toBe('warning')
    expect(disconnectedWarn?.path).toBe('system.components[2]')
  })

  test('flags circular dependencies / loops as warnings with cycle paths', () => {
    const specWithCycle = {
      system: {
        name: 'Cycle System',
        components: [
          {
            id: 'node_a',
            type: 'Stage',
            name: 'Node A',
            connections: [{ target: 'node_b' }]
          },
          {
            id: 'node_b',
            type: 'Stage',
            name: 'Node B',
            connections: [{ target: 'node_c' }]
          },
          {
            id: 'node_c',
            type: 'Stage',
            name: 'Node C',
            connections: [{ target: 'node_a' }]
          }
        ]
      }
    }

    const diagnostics = lintSpec(specWithCycle)
    const cycleWarn = diagnostics.find(d => d.message.includes('Circular dependency loop detected'))
    expect(cycleWarn).toBeDefined()
    expect(cycleWarn?.severity).toBe('warning')
    expect(cycleWarn?.message).toContain('node_a → node_b → node_c → node_a')
  })
})
