import { describe, test, expect } from 'vitest'
import { isJsonContentType, isLoopbackHost, MAX_SPEC_YAML_BYTES } from '../lib/server-request-guards'

describe('isLoopbackHost', () => {
  test('accepts the Host values a browser on this machine actually sends', () => {
    for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000', 'localhost', '127.0.0.1']) {
      expect(isLoopbackHost(host)).toBe(true)
    }
  })

  test('Host comparison is case-insensitive (RFC 9110)', () => {
    expect(isLoopbackHost('LOCALHOST:3000')).toBe(true)
    expect(isLoopbackHost('LocalHost')).toBe(true)
    expect(isLoopbackHost('LocalHost:3110')).toBe(true)
  })

  test('reads the first value when Next hands Host as an array', () => {
    expect(isLoopbackHost(['localhost:3000', 'evil.example'])).toBe(true)
    expect(isLoopbackHost(['evil.example', 'localhost:3000'])).toBe(false)
  })

  test('refuses missing, empty, and non-loopback hosts', () => {
    expect(isLoopbackHost(undefined)).toBe(false)
    expect(isLoopbackHost('')).toBe(false)
    expect(isLoopbackHost('evil.example.com:3000')).toBe(false)
    expect(isLoopbackHost('localhost.attacker.com')).toBe(false)
    expect(isLoopbackHost('127.0.0.1.evil.com')).toBe(false)
  })
})

describe('isJsonContentType', () => {
  test('accepts JSON content types, including a charset suffix', () => {
    expect(isJsonContentType('application/json')).toBe(true)
    expect(isJsonContentType('application/json; charset=utf-8')).toBe(true)
    expect(isJsonContentType('APPLICATION/JSON')).toBe(true)
  })

  test('reads the first value when the header is an array', () => {
    expect(isJsonContentType(['application/json', 'text/plain'])).toBe(true)
    expect(isJsonContentType(['text/plain'])).toBe(false)
  })

  test('refuses missing and non-JSON types', () => {
    expect(isJsonContentType(undefined)).toBe(false)
    expect(isJsonContentType('')).toBe(false)
    expect(isJsonContentType('text/plain')).toBe(false)
    expect(isJsonContentType('application/x-www-form-urlencoded')).toBe(false)
    // CORS-safelisted smuggle: the JSON token is a parameter, not the type.
    expect(isJsonContentType('text/plain;foo=application/json')).toBe(false)
    expect(isJsonContentType('text/plain;charset=utf-8;type=application/json')).toBe(false)
  })
})

describe('MAX_SPEC_YAML_BYTES', () => {
  test('is a one-megabyte cap', () => {
    expect(MAX_SPEC_YAML_BYTES).toBe(1_000_000)
  })
})
