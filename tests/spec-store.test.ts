import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { LocalStorageSpecStore } from '../lib/spec-store'

describe('LocalStorageSpecStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  test('spec save/load round-trip', () => {
    const store = new LocalStorageSpecStore()
    expect(store.getSpec('main')).toBeNull()

    const saved = store.saveSpec('main', 'My System', 'system:\n  name: My System\n')
    expect(saved.yamlContent).toBe('system:\n  name: My System\n')

    const loaded = store.getSpec('main')
    expect(loaded?.yamlContent).toBe('system:\n  name: My System\n')
    expect(loaded?.title).toBe('My System')

    // A fresh store instance reads the same persisted value back from localStorage.
    const rehydrated = new LocalStorageSpecStore()
    expect(rehydrated.getSpec('main')?.yamlContent).toBe('system:\n  name: My System\n')
  })

  test('simulation history save/load/clear round-trip', () => {
    const store = new LocalStorageSpecStore()
    expect(store.getSimulationHistory()).toEqual([])

    const runs = [{ id: 'run-1', path: 'a -> b' }, { id: 'run-2', path: 'b -> c' }]
    store.saveSimulationHistory(runs)
    expect(store.getSimulationHistory()).toEqual(runs)

    const rehydrated = new LocalStorageSpecStore()
    expect(rehydrated.getSimulationHistory()).toEqual(runs)

    store.clearSimulationHistory()
    expect(store.getSimulationHistory()).toEqual([])
    expect(new LocalStorageSpecStore().getSimulationHistory()).toEqual([])
  })

  test('custom presets save/load round-trip', () => {
    const store = new LocalStorageSpecStore()
    expect(store.getCustomPresets()).toEqual([])

    const presets = [{ name: 'My Preset', packets: 200, loss: 15 }]
    store.saveCustomPresets(presets)
    expect(store.getCustomPresets()).toEqual(presets)

    // Presets survive across a fresh store instance the same way simulation history does,
    // fixing the bug where custom presets silently vanished on reload.
    const rehydrated = new LocalStorageSpecStore()
    expect(rehydrated.getCustomPresets()).toEqual(presets)
  })

  test('falls back to in-memory state when localStorage.getItem throws', () => {
    const store = new LocalStorageSpecStore()
    store.saveSpec('main', 'Title', 'yaml-content')
    store.saveSimulationHistory([{ id: 'run-1' }])
    store.saveCustomPresets([{ name: 'p', packets: 100, loss: 0 }])

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('getItem blocked')
    })

    expect(store.getSpec('main')?.yamlContent).toBe('yaml-content')
    expect(store.getSimulationHistory()).toEqual([{ id: 'run-1' }])
    expect(store.getCustomPresets()).toEqual([{ name: 'p', packets: 100, loss: 0 }])
  })

  test('falls back to in-memory state when localStorage.setItem throws', () => {
    const store = new LocalStorageSpecStore()

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(() => store.saveSpec('main', 'Title', 'yaml-content')).not.toThrow()
    expect(store.getSpec('main')?.yamlContent).toBe('yaml-content')

    expect(() => store.saveSimulationHistory([{ id: 'run-1' }])).not.toThrow()
    expect(store.getSimulationHistory()).toEqual([{ id: 'run-1' }])

    expect(() => store.saveCustomPresets([{ name: 'p', packets: 100, loss: 0 }])).not.toThrow()
    expect(store.getCustomPresets()).toEqual([{ name: 'p', packets: 100, loss: 0 }])
  })
})
