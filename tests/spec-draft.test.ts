import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { rememberSpecDraft, persistSpecDraft, readCrashDraft, clearCrashDraft } from '../lib/spec-draft'

describe('spec draft (crash recovery)', () => {
  beforeEach(() => {
    localStorage.clear()
    clearCrashDraft()
  })

  afterEach(() => {
    localStorage.clear()
    clearCrashDraft()
  })

  test('remember + persist writes localStorage; read returns it; clear drops it', () => {
    rememberSpecDraft('system:\n  name: Draft\n')
    expect(persistSpecDraft()).toBe('system:\n  name: Draft\n')
    expect(localStorage.getItem('spec_main_crash_draft')).toBe('system:\n  name: Draft\n')
    expect(readCrashDraft()).toBe('system:\n  name: Draft\n')
    clearCrashDraft()
    expect(readCrashDraft()).toBeNull()
    expect(localStorage.getItem('spec_main_crash_draft')).toBeNull()
  })

  test('persist with nothing remembered is a no-op', () => {
    expect(persistSpecDraft()).toBeNull()
    expect(readCrashDraft()).toBeNull()
  })

  test('read falls back to memory when storage throws after a persist', () => {
    rememberSpecDraft('in-memory')
    persistSpecDraft()
    const proto = Object.getPrototypeOf(localStorage)
    const spy = vi.spyOn(proto, 'getItem').mockImplementation(() => { throw new Error('quota') })
    expect(readCrashDraft()).toBe('in-memory')
    spy.mockRestore()
  })

  test('persist and clear swallow storage failures', () => {
    rememberSpecDraft('x')
    const proto = Object.getPrototypeOf(localStorage)
    const setSpy = vi.spyOn(proto, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(persistSpecDraft()).toBe('x')
    setSpy.mockRestore()
    const removeSpy = vi.spyOn(proto, 'removeItem').mockImplementation(() => { throw new Error('quota') })
    expect(() => clearCrashDraft()).not.toThrow()
    removeSpy.mockRestore()
  })
})
