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
})
