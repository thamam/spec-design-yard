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
    expect(cycleWarn?.path).toBe('system.components[1].connections[0].target') // path should point to the exact connection target completing the cycle
  })

  test('flags duplicate connections as warnings', () => {
    const specWithDuplicateConnections = {
      system: {
        name: 'Duplicate Connections System',
        components: [
          {
            id: 'node_a',
            type: 'Stage',
            name: 'Node A',
            connections: [{ target: 'node_b' }, { target: 'node_b' }]
          },
          {
            id: 'node_b',
            type: 'Stage',
            name: 'Node B'
          }
        ]
      }
    }

    const diagnostics = lintSpec(specWithDuplicateConnections)
    const dupConnWarn = diagnostics.find(d => d.message.includes('duplicate connection targeting'))
    expect(dupConnWarn).toBeDefined()
    expect(dupConnWarn?.severity).toBe('warning')
    expect(dupConnWarn?.code).toBe('duplicate-connection')
    expect(dupConnWarn?.path).toBe('system.components[0].connections[1]')
  })

  test('flags invalid component IDs as warnings', () => {
    const specWithInvalidChars = {
      system: {
        name: 'Invalid ID System',
        components: [
          {
            id: 'node$a',
            type: 'Stage',
            name: 'Node A'
          },
          {
            id: 'node b',
            type: 'Stage',
            name: 'Node B'
          },
          {
            id: 'node_c-1',
            type: 'Stage',
            name: 'Node C'
          }
        ]
      }
    }

    const diagnostics = lintSpec(specWithInvalidChars)
    const invalidIdA = diagnostics.find(d => d.code === 'invalid-id-format' && d.message.includes('node$a'))
    const invalidIdB = diagnostics.find(d => d.code === 'invalid-id-format' && d.message.includes('node b'))
    const invalidIdC = diagnostics.find(d => d.code === 'invalid-id-format' && d.message.includes('node_c-1'))

    expect(invalidIdA).toBeDefined()
    expect(invalidIdA?.severity).toBe('warning')
    expect(invalidIdA?.code).toBe('invalid-id-format')

    expect(invalidIdB).toBeDefined()
    expect(invalidIdB?.severity).toBe('warning')
    expect(invalidIdB?.code).toBe('invalid-id-format')

    // node_c-1 should be valid (alphanumeric, underscore, or hyphen)
    expect(invalidIdC).toBeUndefined()
  })

  test('flags empty connection targets as errors', () => {
    const specWithEmptyTarget = {
      system: {
        name: 'Empty Target System',
        components: [
          {
            id: 'node_a',
            type: 'Stage',
            name: 'Node A',
            connections: [{ target: '' }]
          }
        ]
      }
    }

    const diagnostics = lintSpec(specWithEmptyTarget)
    const emptyTargetError = diagnostics.find(d => d.message.includes('empty target'))
    expect(emptyTargetError).toBeDefined()
    expect(emptyTargetError?.severity).toBe('error')
    expect(emptyTargetError?.code).toBe('empty-connection-target')
  })

  test('flags case-insensitive connection target mismatch as warning', () => {
    const specWithCaseMismatch = {
      system: {
        name: 'Case Mismatch System',
        components: [
          {
            id: 'node_a',
            type: 'Stage',
            name: 'Node A',
            connections: [{ target: 'Node_B' }]
          },
          {
            id: 'node_b',
            type: 'Stage',
            name: 'Node B'
          }
        ]
      }
    }

    const diagnostics = lintSpec(specWithCaseMismatch)
    const caseMismatchWarn = diagnostics.find(d => d.code === 'connection-case-mismatch')
    expect(caseMismatchWarn).toBeDefined()
    expect(caseMismatchWarn?.severity).toBe('warning')
    expect(caseMismatchWarn?.message).toContain('matches component "node_b" with different casing')
    expect(caseMismatchWarn?.path).toBe('system.components[0].connections[0].target')
  })

  test('flags architectural flow pattern violations', () => {
    const specWithViolations = {
      system: {
        name: 'Violations System',
        components: [
          {
            id: 'gate_in',
            type: 'Gateway',
            connections: [{ target: 'db_store' }]
          },
          {
            id: 'db_store',
            type: 'Store'
          },
          {
            id: 'stage_process',
            type: 'Stage',
            connections: [{ target: 'gate_in' }]
          },
          {
            id: 'unreachable_stage',
            type: 'Stage',
            connections: [{ target: 'db_store' }]
          }
        ]
      }
    }

    const diagnostics = lintSpec(specWithViolations)

    // 1. Gateway to Store
    const gatewayToStore = diagnostics.find(d => d.code === 'gateway-to-store')
    expect(gatewayToStore).toBeDefined()
    expect(gatewayToStore?.severity).toBe('warning')
    expect(gatewayToStore?.message).toContain('connects directly to Store')

    // 2. Stage to Gateway
    const stageToGateway = diagnostics.find(d => d.code === 'stage-brick-to-gateway')
    expect(stageToGateway).toBeDefined()
    expect(stageToGateway?.severity).toBe('warning')
    expect(stageToGateway?.message).toContain('connects directly to Gateway')

    // 3. Unreachable component
    const unreachableComponent = diagnostics.find(d => d.code === 'unreachable-component')
    expect(unreachableComponent).toBeDefined()
    expect(unreachableComponent?.severity).toBe('warning')
    expect(unreachableComponent?.message).toContain('is unreachable')
  })

  test('flags cyclic isolated subgraphs as unreachable from gateways', () => {
    const specWithIsolatedCycle = {
      system: {
        name: 'Isolated Cycle System',
        components: [
          {
            id: 'gate_in',
            type: 'Gateway',
            connections: [{ target: 'stage_a' }]
          },
          {
            id: 'stage_a',
            type: 'Stage'
          },
          {
            id: 'isolated_cycle_1',
            type: 'Stage',
            connections: [{ target: 'isolated_cycle_2' }]
          },
          {
            id: 'isolated_cycle_2',
            type: 'Stage',
            connections: [{ target: 'isolated_cycle_1' }]
          }
        ]
      }
    }

    const diagnostics = lintSpec(specWithIsolatedCycle)
    // isolated_cycle_1 and isolated_cycle_2 should both be flagged as unreachable since they are not reachable from gate_in
    const unreachable1 = diagnostics.find(d => d.code === 'unreachable-component' && d.message.includes('isolated_cycle_1'))
    const unreachable2 = diagnostics.find(d => d.code === 'unreachable-component' && d.message.includes('isolated_cycle_2'))

    expect(unreachable1).toBeDefined()
    expect(unreachable1?.severity).toBe('warning')
    expect(unreachable2).toBeDefined()
    expect(unreachable2?.severity).toBe('warning')
  })

  describe('Metadata Validation and Documentation Rules', () => {
    test('flags non-object metadata as an error', () => {
      const invalidSpec = {
        system: {
          name: 'Invalid Metadata',
          components: [
            { id: 'inbox', type: 'Store', metadata: 'not-an-object' }
          ]
        }
      }
      const diagnostics = lintSpec(invalidSpec)
      const err = diagnostics.find(d => d.message.includes('must be an object') && d.path === 'system.components[0].metadata')
      expect(err).toBeDefined()
      expect(err?.severity).toBe('error')
    })

    test('flags unrecognized metadata keys as info', () => {
      const invalidSpec = {
        system: {
          name: 'Invalid Metadata Keys',
          components: [
            { id: 'inbox', type: 'Store', metadata: { owner: 'tom', invalidKey: 'val' } }
          ]
        }
      }
      const diagnostics = lintSpec(invalidSpec)
      const info = diagnostics.find(d => d.code === 'unrecognized-metadata-key')
      expect(info).toBeDefined()
      expect(info?.severity).toBe('info')
      expect(info?.message).toContain('Unrecognized metadata key "invalidKey"')
    })

    test('flags invalid status in metadata as warning', () => {
      const invalidSpec = {
        system: {
          name: 'Invalid Status',
          components: [
            { id: 'inbox', type: 'Store', metadata: { status: 'invalid-status' } }
          ]
        }
      }
      const diagnostics = lintSpec(invalidSpec)
      const warn = diagnostics.find(d => d.code === 'invalid-metadata-status')
      expect(warn).toBeDefined()
      expect(warn?.severity).toBe('warning')
    })

    test('suggests adding description or owner as info when missing', () => {
      const invalidSpec = {
        system: {
          name: 'Missing Metadata',
          components: [
            { id: 'inbox', type: 'Store' }
          ]
        }
      }
      const diagnostics = lintSpec(invalidSpec)
      const infoDesc = diagnostics.find(d => d.code === 'missing-metadata-description')
      expect(infoDesc).toBeDefined()
      expect(infoDesc?.severity).toBe('info')
    })

    test('flags invalid version in metadata as warning', () => {
      const invalidSpec = {
        system: {
          name: 'Invalid Version',
          components: [
            { id: 'inbox', type: 'Store', metadata: { version: 'invalid-v' } }
          ]
        }
      }
      const diagnostics = lintSpec(invalidSpec)
      const warn = diagnostics.find(d => d.code === 'invalid-metadata-version')
      expect(warn).toBeDefined()
      expect(warn?.severity).toBe('warning')
    })
  })

  describe('Sink Stage/Brick and Empty Gateway Rules', () => {
    test('flags stage or brick as warning when it has inbound connections but 0 outbound connections (sink)', () => {
      const spec = {
        system: {
          name: 'Sink Test',
          components: [
            { id: 'inbox', type: 'Store', connections: [{ target: 'process_stage' }] },
            { id: 'process_stage', type: 'Stage' }
          ]
        }
      }
      const diagnostics = lintSpec(spec)
      const sinkWarn = diagnostics.find(d => d.code === 'sink-stage-brick')
      expect(sinkWarn).toBeDefined()
      expect(sinkWarn?.severity).toBe('warning')
      expect(sinkWarn?.message).toContain('incoming connections but no outgoing connections')
    })

    test('flags gateway as warning when it has 0 outbound connections', () => {
      const spec = {
        system: {
          name: 'Empty Gateway Test',
          components: [
            { id: 'gate_in', type: 'Gateway' }
          ]
        }
      }
      const diagnostics = lintSpec(spec)
      const emptyGateWarn = diagnostics.find(d => d.code === 'empty-gateway')
      expect(emptyGateWarn).toBeDefined()
      expect(emptyGateWarn?.severity).toBe('warning')
      expect(emptyGateWarn?.message).toContain('no outgoing connections')
    })
  })

  describe('Unrecognized Component Keys Rule', () => {
    test('flags unrecognized component level keys as warnings', () => {
      const spec = {
        system: {
          name: 'Unrecognized Keys Test',
          components: [
            { id: 'inbox', type: 'Store', typoKey: 'should-flag', anotherTypo: 42 }
          ]
        }
      }
      const diagnostics = lintSpec(spec)
      const unrecognizedWarn = diagnostics.filter(d => d.code === 'unrecognized-component-key')
      expect(unrecognizedWarn.length).toBe(2)
      expect(unrecognizedWarn[0].severity).toBe('warning')
      expect(unrecognizedWarn[0].message).toContain('Unrecognized component key "typoKey"')
      expect(unrecognizedWarn[1].message).toContain('Unrecognized component key "anotherTypo"')
    })
  })

  describe('Component Coordinate Overlap Rule', () => {
    test('flags overlapping components at the exact same coordinate as warnings', () => {
      const spec = {
        system: {
          name: 'Overlap Test',
          components: [
            { id: 'node_a', type: 'Store', x: 100, y: 150 },
            { id: 'node_b', type: 'Stage', x: 100, y: 150 },
            { id: 'node_c', type: 'Brick', x: 200, y: 300 }
          ]
        }
      }
      const diagnostics = lintSpec(spec)
      const overlapWarns = diagnostics.filter(d => d.code === 'component-overlap')
      expect(overlapWarns.length).toBe(2) // Warning for both node_a and node_b
      expect(overlapWarns[0].severity).toBe('warning')
      expect(overlapWarns[0].message).toContain('overlaps with component')
      expect(overlapWarns[0].path).toBe('system.components[0].x')
      expect(overlapWarns[1].path).toBe('system.components[1].x')
    })

    test('ignores components with NaN or non-finite coordinates', () => {
      const spec = {
        system: {
          name: 'NaN Overlap Test',
          components: [
            { id: 'node_a', type: 'Store', x: NaN, y: 150 },
            { id: 'node_b', type: 'Stage', x: NaN, y: 150 },
            { id: 'node_c', type: 'Brick', x: 200, y: Infinity }
          ]
        }
      }
      const diagnostics = lintSpec(spec)
      const overlapWarns = diagnostics.filter(d => d.code === 'component-overlap')
      expect(overlapWarns.length).toBe(0)
    })
  })

  describe('Unrecognized System Keys Rule', () => {
    test('flags unrecognized top-level keys under system as warnings', () => {
      const spec = {
        system: {
          name: 'System Keys Test',
          components: [],
          unrecognized_top_key: 'value'
        }
      }
      const diagnostics = lintSpec(spec)
      const unrecognizedWarn = diagnostics.find(d => d.code === 'unrecognized-system-key')
      expect(unrecognizedWarn).toBeDefined()
      expect(unrecognizedWarn?.severity).toBe('warning')
      expect(unrecognizedWarn?.path).toBe('system.unrecognized_top_key')
    })
  })

  describe('Reachability Validation without Gateways Rule', () => {
    test('flags unreachable components even if there are no gateways', () => {
      const spec = {
        system: {
          name: 'No Gateway Reachability Test',
          components: [
            {
              id: 'entry_node',
              type: 'Stage',
              connections: [{ target: 'reachable_node' }]
            },
            {
              id: 'reachable_node',
              type: 'Stage'
            },
            {
              id: 'isolated_cycle_a',
              type: 'Stage',
              connections: [{ target: 'isolated_cycle_b' }]
            },
            {
              id: 'isolated_cycle_b',
              type: 'Stage',
              connections: [{ target: 'isolated_cycle_a' }]
            }
          ]
        }
      }
      const diagnostics = lintSpec(spec)
      // isolated_cycle_a and isolated_cycle_b should be flagged as unreachable
      const unreachableNodes = diagnostics.filter(d => d.code === 'unreachable-component')
      expect(unreachableNodes.length).toBe(2)
      expect(unreachableNodes[0].message).toContain('no execution path exists from any entry point')
    })
  })
})
