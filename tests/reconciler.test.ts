import { describe, test, expect } from 'vitest'
import { reconcileSpec } from '../lib/reconciler'

describe('AST Reconciliation Layer', () => {
  const initialSpec = `system:
  name: Test System
  components:
    - id: inbox
      type: Store
      name: inbox/
      connections:
        - target: digest_stage
    - id: digest_stage
      type: Stage
      name: digest
`

  test('reconciles coordinates changes only when coordinates differ', () => {
    // If coordinates are unchanged, reconciled output should be equal to initial spec text
    const unchanged = reconcileSpec(initialSpec, {
      type: 'coords',
      payload: [
        { id: 'inbox', x: undefined as any, y: undefined as any }
      ]
    })
    expect(unchanged).toBe(initialSpec)

    const updated = reconcileSpec(initialSpec, {
      type: 'coords',
      payload: [
        { id: 'inbox', x: 200, y: 150 },
        { id: 'digest_stage', x: 400, y: 250 }
      ]
    })

    expect(updated).toContain('x: 200')
    expect(updated).toContain('y: 150')
    expect(updated).toContain('x: 400')
    expect(updated).toContain('y: 250')
  })

  test('reconciles deleting multiple components and prunes incoming connections', () => {
    const updated = reconcileSpec(initialSpec, {
      type: 'delete',
      payload: { ids: ['digest_stage'] }
    })

    // digest_stage should be deleted from components
    expect(updated).not.toContain('id: digest_stage')
    
    // The connection from inbox to digest_stage should be pruned
    expect(updated).not.toContain('target: digest_stage')
    expect(updated).toContain('id: inbox')
  })

  test('reconciles renaming a component and updating its type', () => {
    const updated = reconcileSpec(initialSpec, {
      type: 'rename',
      payload: { id: 'inbox', newName: 'incoming_mailbox', newType: 'Gateway' }
    })

    expect(updated).toContain('name: incoming_mailbox')
    expect(updated).toContain('type: Gateway')
    expect(updated).toContain('id: inbox') // ID remains the same to preserve references
  })

  test('gracefully handles null and invalid components in YAML parsed spec', () => {
    const corruptedSpec = `system:
  name: Corrupted
  components:
    - 
    - id: stage1
      type: Stage
      name: stage1
`
    const updated = reconcileSpec(corruptedSpec, {
      type: 'coords',
      payload: [
        { id: 'stage1', x: 100, y: 100 }
      ]
    })
    expect(updated).toContain('x: 100')
  })

  test('preserves user comments and custom formatting during reconciliation', () => {
    const specWithComments = `# System Spec with Comments
system:
  name: Comments Test
  # This section lists all nodes
  components:
    - id: inbox # Inbox store
      type: Store
      name: inbox/
`
    const updated = reconcileSpec(specWithComments, {
      type: 'coords',
      payload: [{ id: 'inbox', x: 120, y: 180 }]
    })

    expect(updated).toContain('# System Spec with Comments')
    expect(updated).toContain('# This section lists all nodes')
    expect(updated).toContain('# Inbox store')
    expect(updated).toContain('x: 120')
    expect(updated).toContain('y: 180')
  })

  test('quick-fix unrecognized component type', () => {
    const invalidSpec = `system:
  name: Invalid Type
  components:
    - id: node1
      type: InvalidType
      name: Node 1
`
    const updated = reconcileSpec(invalidSpec, {
      type: 'quick-fix',
      payload: {
        path: 'system.components[0].type',
        fixType: 'unrecognized-type',
        extraData: { type: 'Store' }
      }
    })

    expect(updated).toContain('type: Store')
    expect(updated).not.toContain('type: InvalidType')
  })

  test('quick-fix orphan connection target', () => {
    const specWithOrphan = `system:
  name: Orphan Test
  components:
    - id: node1
      type: Stage
      connections:
        - target: missing_node
`
    const updated = reconcileSpec(specWithOrphan, {
      type: 'quick-fix',
      payload: {
        path: 'system.components[0].connections[0].target',
        fixType: 'orphan-connection'
      }
    })

    expect(updated).toContain('id: missing_node')
    expect(updated).toContain('type: Stage') // default type for new node
  })

  test('quick-fix self-connection', () => {
    const specWithSelfConn = `system:
  name: Self Connection Test
  components:
    - id: node1
      type: Stage
      connections:
        - target: node1
        - target: node2
`
    const updated = reconcileSpec(specWithSelfConn, {
      type: 'quick-fix',
      payload: {
        path: 'system.components[0].connections[0].target',
        fixType: 'self-connection'
      }
    })

    expect(updated).not.toContain('target: node1')
    expect(updated).toContain('target: node2')
  })

  test('quick-fix duplicate component ID', () => {
    const duplicateSpec = `system:
  name: Duplicate Test
  components:
    - id: node1
      type: Store
    - id: node1
      type: Stage
`
    const updated = reconcileSpec(duplicateSpec, {
      type: 'quick-fix',
      payload: {
        path: 'system.components[1].id',
        fixType: 'duplicate-id'
      }
    })

    expect(updated).toContain('id: node1_1')
  })

  test('quick-fix invalid component ID', () => {
    const invalidIdSpec = `system:
  name: Invalid ID Test
  components:
    - id: node$1
      type: Stage
      connections:
        - target: node2
    - id: node2
      type: Stage
      connections:
        - target: node$1
`
    const updated = reconcileSpec(invalidIdSpec, {
      type: 'quick-fix',
      payload: {
        path: 'system.components[0].id',
        fixType: 'invalid-id-format'
      }
    })

    expect(updated).toContain('id: node_1')
    expect(updated).toContain('target: node_1') // should update the connection target pointing to it too!
  })

  test('quick-fix duplicate connection', () => {
    const dupConnSpec = `system:
  name: Duplicate Conn Test
  components:
    - id: node1
      type: Stage
      connections:
        - target: node2
        - target: node2
    - id: node2
      type: Stage
`
    const updated = reconcileSpec(dupConnSpec, {
      type: 'quick-fix',
      payload: {
        path: 'system.components[0].connections[1]',
        fixType: 'duplicate-connection'
      }
    })

    // Should remove the second connection
    expect(updated).toContain('- target: node2')
    // Wait, let's verify if there is only one connection remaining.
    // We can count occurrences of 'target: node2'
    const occurrences = (updated.match(/target: node2/g) || []).length
    expect(occurrences).toBe(1)
  })

  test('quick-fix empty connection target', () => {
    const emptyConnSpec = `system:
  name: Empty Conn Test
  components:
    - id: node1
      type: Stage
      connections:
        - target: ""
`
    const updated = reconcileSpec(emptyConnSpec, {
      type: 'quick-fix',
      payload: {
        path: 'system.components[0].connections[0]',
        fixType: 'empty-connection-target'
      }
    })

    expect(updated).not.toContain('connections:')
    expect(updated).not.toContain('target:')
  })

  test('reconciles adding a new component', () => {
    const updated = reconcileSpec(initialSpec, {
      type: 'add',
      payload: { id: 'new_component', x: 500, y: 350, type: 'Stage', name: 'New Component' }
    })

    expect(updated).toContain('id: new_component')
    expect(updated).toContain('type: Stage')
    expect(updated).toContain('name: New Component')
    expect(updated).toContain('x: 500')
    expect(updated).toContain('y: 350')
  })

  test('reconciles adding a connection between components', () => {
    const updated = reconcileSpec(initialSpec, {
      type: 'connect',
      payload: { source: 'digest_stage', target: 'inbox' }
    })

    // digest_stage should now have a connection targeting inbox
    expect(updated).toContain('id: digest_stage')
    expect(updated).toContain('connections:')
    expect(updated).toContain('target: inbox')
  })

  test('quick-fix delete-component', () => {
    const specWithIsolated = `system:
  name: Isolated Test
  components:
    - id: inbox
      type: Store
    - id: isolated_node
      type: Stage
`
    const updated = reconcileSpec(specWithIsolated, {
      type: 'quick-fix',
      payload: {
        path: 'system.components[1]',
        fixType: 'delete-component'
      }
    })

    expect(updated).not.toContain('id: isolated_node')
    expect(updated).toContain('id: inbox')
  })

  test('quick-fix connect-from-gateway', () => {
    const specWithUnreachable = `system:
  name: Unreachable Test
  components:
    - id: main_gateway
      type: Gateway
    - id: unreachable_node
      type: Stage
`
    const updated = reconcileSpec(specWithUnreachable, {
      type: 'quick-fix',
      payload: {
        path: 'system.components[1]',
        fixType: 'connect-from-gateway'
      }
    })

    expect(updated).toContain('id: main_gateway')
    expect(updated).toContain('connections:')
    expect(updated).toContain('target: unreachable_node')
  })

  test('quick-fix insert-stage between gateway and store', () => {
    const specWithDirect = `system:
  name: Direct Test
  components:
    - id: api_gateway
      type: Gateway
      connections:
        - target: db_store
    - id: db_store
      type: Store
`
    const updated = reconcileSpec(specWithDirect, {
      type: 'quick-fix',
      payload: {
        path: 'system.components[0].connections[0].target',
        fixType: 'insert-stage'
      }
    })

    expect(updated).toContain('id: api_gateway_to_db_store')
    expect(updated).toContain('type: Stage')
    expect(updated).toContain('target: api_gateway_to_db_store')
    expect(updated).toContain('target: db_store')
  })
})
