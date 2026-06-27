import { describe, test, expect } from 'vitest'
import { extractComponentIds, getAutocompleteSuggestions } from '../lib/autocomplete'

describe('Autocomplete Utility', () => {
  const mockSpec = `system:
  name: External Brain
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

  test('extractComponentIds extracts all unique component IDs correctly', () => {
    const ids = extractComponentIds(mockSpec)
    expect(ids).toEqual(['inbox', 'digest_stage'])
  })

  test('getAutocompleteSuggestions suggests types when cursor is after type:', () => {
    // Let's place the cursor at the end of "type: S"
    const spec = `system:
  components:
    - id: inbox
      type: S`
    const cursor = spec.length // Cursor at the end of "S"
    const result = getAutocompleteSuggestions(spec, cursor)

    expect(result.type).toBe('type')
    expect(result.query).toBe('S')
    expect(result.suggestions).toEqual(['Store', 'Stage'])
    expect(result.replaceRange).toEqual([spec.length - 1, spec.length])
  })

  test('getAutocompleteSuggestions suggests component IDs when cursor is after target:', () => {
    const spec = `system:
  components:
    - id: inbox
      type: Store
      connections:
        - target: d
    - id: digest_stage
      type: Stage`
    const cursor = spec.indexOf('target: d') + 'target: d'.length
    const result = getAutocompleteSuggestions(spec, cursor)

    expect(result.type).toBe('id')
    expect(result.query).toBe('d')
    expect(result.suggestions).toEqual(['digest_stage'])
  })

  test('getAutocompleteSuggestions returns empty when cursor is not in an autocomplete context', () => {
    const spec = `system:
  name: External Brain`
    const cursor = spec.length
    const result = getAutocompleteSuggestions(spec, cursor)

    expect(result.type).toBeNull()
    expect(result.suggestions).toEqual([])
  })

  test('getAutocompleteSuggestions does not suggest on substring matches like prototype or on_target', () => {
    const spec = `system:
  prototype: S
  on_target: i`
    
    // Test on prototype
    const protoCursor = spec.indexOf('prototype: S') + 'prototype: S'.length
    const protoRes = getAutocompleteSuggestions(spec, protoCursor)
    expect(protoRes.type).toBeNull()

    // Test on on_target
    const targetCursor = spec.indexOf('on_target: i') + 'on_target: i'.length
    const targetRes = getAutocompleteSuggestions(spec, targetCursor)
    expect(targetRes.type).toBeNull()
  })

  test('getAutocompleteSuggestions suppresses exact suggestions', () => {
    const spec = `system:
  components:
    - id: inbox
      type: Store`
    const cursor = spec.length
    const result = getAutocompleteSuggestions(spec, cursor)
    // "Store" is already typed exactly, so suggestion list should be empty to close HUD
    expect(result.suggestions).toEqual([])
  })

  test('getAutocompleteSuggestions supports cursor-inside-word replaceRange', () => {
    const spec = `system:
  components:
    - id: inbox
      type: St`
    // Let's say user had "type: Stage" and cursor was at "St|age"
    const specWithStage = `system:
  components:
    - id: inbox
      type: Stage`
    const cursor = specWithStage.indexOf('type: St') + 'type: St'.length // Cursor between 't' and 'a'
    const result = getAutocompleteSuggestions(specWithStage, cursor)

    expect(result.type).toBe('type')
    expect(result.query).toBe('St')
    // Replace range should span from 'St' start to the end of 'Stage' (length 5)
    const expectedStart = specWithStage.indexOf('Stage')
    const expectedEnd = expectedStart + 'Stage'.length
    expect(result.replaceRange).toEqual([expectedStart, expectedEnd])
  })
})
