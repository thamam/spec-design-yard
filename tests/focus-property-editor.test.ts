import { describe, test, expect } from 'vitest'
import { reconcileSpec } from '../lib/reconciler'

describe('Focus Tab Property Editor Reconciliation', () => {
  const initialSpec = `system:
  name: Test System
  components:
    - id: inbox
      type: Store
      name: inbox/
      metadata:
        owner: tom
        status: draft
`

  test('reconciles update-property for top-level component fields', () => {
    // 1. Update name
    const updatedName = reconcileSpec(initialSpec, {
      type: 'update-property',
      payload: { id: 'inbox', path: 'name', value: 'incoming_box' }
    })
    expect(updatedName).toContain('name: incoming_box')
    expect(updatedName).not.toContain('name: inbox/')

    // 2. Update type
    const updatedType = reconcileSpec(initialSpec, {
      type: 'update-property',
      payload: { id: 'inbox', path: 'type', value: 'Gateway' }
    })
    expect(updatedType).toContain('type: Gateway')
    expect(updatedType).not.toContain('type: Store')
  })

  test('reconciles update-property for nested metadata fields', () => {
    // 1. Update metadata owner
    const updatedOwner = reconcileSpec(initialSpec, {
      type: 'update-property',
      payload: { id: 'inbox', path: 'metadata.owner', value: 'sentinel' }
    })
    expect(updatedOwner).toContain('owner: sentinel')
    expect(updatedOwner).not.toContain('owner: tom')

    // 2. Update metadata status
    const updatedStatus = reconcileSpec(initialSpec, {
      type: 'update-property',
      payload: { id: 'inbox', path: 'metadata.status', value: 'active' }
    })
    expect(updatedStatus).toContain('status: active')
    expect(updatedStatus).not.toContain('status: draft')
  })

  test('reconciles nested field when parent metadata is missing', () => {
    const specWithoutMetadata = `system:
  name: Test System
  components:
    - id: inbox
      type: Store
      name: inbox/
`
    const updatedOwner = reconcileSpec(specWithoutMetadata, {
      type: 'update-property',
      payload: { id: 'inbox', path: 'metadata.owner', value: 'sentinel' }
    })
    expect(updatedOwner).toContain('metadata:')
    expect(updatedOwner).toContain('owner: sentinel')
  })
})
