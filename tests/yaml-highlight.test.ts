import { describe, test, expect } from 'vitest'
import { tokenizeLine, tokenizeSpec } from '../lib/yaml-highlight'

describe('yaml-highlight tokenizer', () => {
  test('classifies a component id value distinctly from its field key', () => {
    const tokens = tokenizeLine('    - id: inbox')
    const idToken = tokens.find((t) => t.text === 'inbox')
    const keyToken = tokens.find((t) => t.text === 'id')
    expect(idToken?.className).toBe('component-id')
    expect(keyToken?.className).toBe('field-key')
  })

  test('classifies a connection target value distinctly', () => {
    const tokens = tokenizeLine('        - target: digest_stage')
    const targetToken = tokens.find((t) => t.text === 'digest_stage')
    expect(targetToken?.className).toBe('connection-target')
  })

  test('classifies a known metadata key and its recognized value', () => {
    const tokens = tokenizeLine('        status: active')
    const keyToken = tokens.find((t) => t.text === 'status')
    const valueToken = tokens.find((t) => t.text === 'active')
    expect(keyToken?.className).toBe('metadata-key')
    expect(valueToken?.className).toBe('value')
  })

  test('component id, connection target, and metadata key each get a distinct class', () => {
    const idClass = tokenizeLine('    - id: inbox').find((t) => t.text === 'inbox')?.className
    const targetClass = tokenizeLine('        - target: digest_stage').find((t) => t.text === 'digest_stage')?.className
    const keyClass = tokenizeLine('        status: active').find((t) => t.text === 'status')?.className
    expect(new Set([idClass, targetClass, keyClass]).size).toBe(3)
  })

  test('a line with no recognizable tokens renders as a single plain token', () => {
    const line = 'this is not YAML at all !!! ###'
    expect(tokenizeLine(line)).toEqual([{ text: line, className: 'plain' }])
  })

  test('an unparseable / mid-edit line never throws and stays fully visible', () => {
    const weird = 'id: : : broken :: yaml ["'
    expect(() => tokenizeLine(weird)).not.toThrow()
    const tokens = tokenizeLine(weird)
    expect(tokens.map((t) => t.text).join('')).toBe(weird)
  })

  test('tokenizeSpec round-trips: concatenated token text per line equals the original text', () => {
    const spec = `system:
  name: External Brain
  components:
    - id: inbox
      type: Store
      connections:
        - target: digest_stage
      metadata:
        status: active
`
    const lines = tokenizeSpec(spec)
    const rebuilt = lines.map((tokens) => tokens.map((t) => t.text).join('')).join('\n')
    expect(rebuilt).toBe(spec)
  })

  test('a blank line tokenizes to a single empty plain token', () => {
    expect(tokenizeLine('')).toEqual([{ text: '', className: 'plain' }])
  })

  test('a double-quoted component id is still classified as component-id', () => {
    const tokens = tokenizeLine('- id: "api"')
    const idToken = tokens.find((t) => t.text === 'api')
    expect(idToken?.className).toBe('component-id')
  })

  test('a single-quoted connection target is still classified as connection-target', () => {
    const tokens = tokenizeLine("- target: 'db'")
    const targetToken = tokens.find((t) => t.text === 'db')
    expect(targetToken?.className).toBe('connection-target')
  })

  test('an unterminated quote mid-edit degrades to plain instead of throwing', () => {
    const line = '- id: "api'
    expect(() => tokenizeLine(line)).not.toThrow()
    const tokens = tokenizeLine(line)
    expect(tokens.map((t) => t.text).join('')).toBe(line)
  })

  test('an unterminated double-quoted id is not classified as a valid component-id', () => {
    const tokens = tokenizeLine('- id: "api')
    const apiToken = tokens.find((t) => t.text.includes('api'))
    expect(apiToken?.className).toBe('plain')
  })

  test('an unterminated single-quoted target is not classified as a valid connection-target', () => {
    const tokens = tokenizeLine("- target: 'db")
    const dbToken = tokens.find((t) => t.text.includes('db'))
    expect(dbToken?.className).toBe('plain')
  })

  test('a recognized value is classified case-insensitively, matching the linter', () => {
    const tokens = tokenizeLine('  type: store')
    const valueToken = tokens.find((t) => t.text === 'store')
    expect(valueToken?.className).toBe('value')
  })
})
