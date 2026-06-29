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

  test('getAutocompleteSuggestions suggests component keys when typing at the start of a component property line', () => {
    const spec = `system:
  components:
    - id: inbox
      type: Store
      m`
    const cursor = spec.length
    const result = getAutocompleteSuggestions(spec, cursor)

    expect(result.type).toBe('field')
    expect(result.query).toBe('m')
    expect(result.suggestions).toContain('metadata:')
  })

  test('getAutocompleteSuggestions suggests metadata keys when typing inside metadata block', () => {
    const spec = `system:
  components:
    - id: inbox
      type: Store
      metadata:
        o`
    const cursor = spec.length
    const result = getAutocompleteSuggestions(spec, cursor)

    expect(result.type).toBe('metadata-key')
    expect(result.query).toBe('o')
    expect(result.suggestions).toContain('owner:')
  })

  test('getAutocompleteSuggestions suggests metadata status values when typing status: ', () => {
    const spec = `system:
  components:
    - id: inbox
      type: Store
      metadata:
        status: d`
    const cursor = spec.length
    const result = getAutocompleteSuggestions(spec, cursor)

    expect(result.type).toBe('metadata-status')
    expect(result.query).toBe('d')
    expect(result.suggestions).toContain('draft')
  })

  test('getAutocompleteSuggestions suggests color: as a metadata key', () => {
    const spec = `system:
  components:
    - id: inbox
      type: Store
      metadata:
        c`
    const cursor = spec.length
    const result = getAutocompleteSuggestions(spec, cursor)

    expect(result.type).toBe('metadata-key')
    expect(result.query).toBe('c')
    expect(result.suggestions).toContain('color:')
  })

  test('getAutocompleteSuggestions suggests metadata color values when typing color: ', () => {
    const spec = `system:
  components:
    - id: inbox
      type: Store
      metadata:
        color: i`
    const cursor = spec.length
    const result = getAutocompleteSuggestions(spec, cursor)

    expect(result.type).toBe('metadata-color')
    expect(result.query).toBe('i')
    expect(result.suggestions).toContain('indigo')
  })

  test('getAutocompleteSuggestions suggests target: and label: when typing under connections block', () => {
    const spec = `system:
  components:
    - id: inbox
      type: Store
      connections:
        - target: digest_stage
          l`
    const cursor = spec.length
    const result = getAutocompleteSuggestions(spec, cursor)

    expect(result.type).toBe('connection-key')
    expect(result.query).toBe('l')
    expect(result.suggestions).toContain('label:')
  })
})
