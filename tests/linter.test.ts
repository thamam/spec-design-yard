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

  test('gracefully handles non-string and missing component ids without crashing', () => {
    const specWithInvalidIds = {
      system: {
        name: 'Invalid IDs System',
        components: [
          {
            id: 123,
            type: 'Stage',
            name: 'Non-string ID Component'
          },
          {
            id: null,
            type: 'Stage',
            name: 'Null ID Component'
          },
          {
            type: 'Stage',
            name: 'Missing ID Component'
          }
        ]
      }
    }

    expect(() => lintSpec(specWithInvalidIds)).not.toThrow()
    const diagnostics = lintSpec(specWithInvalidIds)
    expect(diagnostics.length).toBeGreaterThan(0)
  })

  test('ignores duplicate component IDs in passes 2, 3, and 4 to avoid state corruption', () => {
    const specWithDuplicateIds = {
      system: {
        name: 'Duplicate ID System',
        components: [
          {
            id: 'node_a',
            type: 'Stage',
            name: 'First A',
            connections: [{ target: 'node_b' }]
          },
          {
            id: 'node_a',
            type: 'Stage',
            name: 'Duplicate A with no connections'
          },
          {
            id: 'node_b',
            type: 'Stage',
            name: 'Node B'
          }
        ]
      }
    }

    // Since node_a is duplicated, 'First A' has a connection but 'Duplicate A' does not.
    // Duplicate ID should not overwrite the outgoing adjacency or outgoing connection mapping of 'node_a'.
    const diagnostics = lintSpec(specWithDuplicateIds)
    
    // There shouldn't be any false "disconnected" warnings on node_a or node_b
    const disconnectedNodeA = diagnostics.find(d => d.message.includes('node_a') && d.message.includes('disconnected'))
    expect(disconnectedNodeA).toBeUndefined()
  })

  test('ensures cycle path checks do not suffer from comma-delimiter collision', () => {
    const specWithCommaInIds = {
      system: {
        name: 'Comma System',
        components: [
          {
            id: 'a,b',
            type: 'Stage',
            name: 'Node A,B',
            connections: [{ target: 'c' }]
          },
          {
            id: 'c',
            type: 'Stage',
            name: 'Node C',
            connections: [{ target: 'a,b' }]
          }
        ]
      }
    }

    const diagnostics = lintSpec(specWithCommaInIds)
    const cycleWarn = diagnostics.find(d => d.message.includes('Circular dependency loop detected'))
    expect(cycleWarn).toBeDefined()
    expect(cycleWarn?.message).toContain('a,b → c → a,b')
  })

  test('ensures cycle diagnostics include path information pointing to components', () => {
    const specWithCycle = {
      system: {
        name: 'Cycle Path System',
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
            connections: [{ target: 'node_a' }]
          }
        ]
      }
    }

    const diagnostics = lintSpec(specWithCycle)
    const cycleWarn = diagnostics.find(d => d.message.includes('Circular dependency loop detected'))
    expect(cycleWarn).toBeDefined()
    expect(cycleWarn?.path).toBe('system.components[0]') // path should point to the origin/starting node of the cycle
  })
})
