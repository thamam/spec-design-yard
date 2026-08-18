import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { RemoteSyncSpecStore } from '../lib/remote-sync-store'

function mockFetchSequence(handlers: Record<string, { status: number; body?: any }>) {
  return vi.fn(async (input: any, init?: any) => {
    const url = String(input)
    // PUTs: record and ack
    if (init?.method === 'PUT') {
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as any
    }
    const h = handlers[url]
    if (!h) return { ok: false, status: 404, json: async () => ({ found: false }) } as any
    return { ok: h.status >= 200 && h.status < 300, status: h.status, json: async () => h.body } as any
  })
}

describe('RemoteSyncSpecStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('saveSpec mirrors to the server with a PUT', async () => {
    const fetchMock = mockFetchSequence({})
    vi.stubGlobal('fetch', fetchMock)

    const store = new RemoteSyncSpecStore()
    store.saveSpec('main', 'My System', 'system:\n  name: My System\n')

    // Local read stays synchronous
    expect(store.getSpec('main')?.title).toBe('My System')

    await vi.waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter(([, init]: any[]) => init?.method === 'PUT')
      expect(putCalls).toHaveLength(1)
      expect(String(putCalls[0][0])).toBe('/api/store/spec/main')
      expect(JSON.parse(putCalls[0][1].body)).toEqual({
        title: 'My System',
        yamlContent: 'system:\n  name: My System\n',
      })
    })
  })

  test('simulation history and presets mirror to meta endpoints', async () => {
    const fetchMock = mockFetchSequence({})
    vi.stubGlobal('fetch', fetchMock)

    const store = new RemoteSyncSpecStore()
    store.saveSimulationHistory([{ id: 'run-1' }])
    store.saveCustomPresets([{ name: 'P', packets: 100, loss: 5 }])

    await vi.waitFor(() => {
      const putUrls = fetchMock.mock.calls
        .filter(([, init]: any[]) => init?.method === 'PUT')
        .map(([url]: any[]) => String(url))
      expect(putUrls).toContain('/api/store/meta/simulation_history')
      expect(putUrls).toContain('/api/store/meta/custom_presets')
    })
  })

  test('loadFromServer pulls spec + meta into the local delegate', async () => {
    const serverYaml = 'system:\n  name: From Server\n'
    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': {
        status: 200,
        body: { id: 'main', title: 'From Server', yamlContent: serverYaml, updatedAt: '2026-08-18T00:00:00Z' },
      },
      '/api/store/meta/simulation_history': { status: 200, body: [{ id: 'srv-run' }] },
      '/api/store/meta/custom_presets': { status: 200, body: [{ name: 'Srv', packets: 10, loss: 1 }] },
    }))

    // Stale local cache that must be overridden
    localStorage.setItem('spec_main', JSON.stringify({ id: 'main', title: 'Stale', yamlContent: 'system: {}\n', updatedAt: '2020-01-01' }))

    const store = new RemoteSyncSpecStore()
    const active = await store.loadFromServer()

    expect(active).toBe(true)
    expect(store.getSpec('main')?.yamlContent).toBe(serverYaml)
    expect(store.getSpec('main')?.title).toBe('From Server')
    expect(store.getSimulationHistory()).toEqual([{ id: 'srv-run' }])
    expect(store.getCustomPresets()).toEqual([{ name: 'Srv', packets: 10, loss: 1 }])
  })

  test('loadFromServer leaves local cache alone when the server has nothing stored yet', async () => {
    // Real route contract: 200 with {found:false} for the spec, null for meta
    // (200 rather than 404 so the browser console stays clean on fresh repos).
    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': { status: 200, body: { found: false } },
      '/api/store/meta/simulation_history': { status: 200, body: null },
      '/api/store/meta/custom_presets': { status: 200, body: null },
    }))
    localStorage.setItem('spec_main', JSON.stringify({ id: 'main', title: 'Local', yamlContent: 'system: {}\n', updatedAt: '2020-01-01' }))

    const store = new RemoteSyncSpecStore()
    const active = await store.loadFromServer()

    expect(active).toBe(true) // file mode is on, the file just doesn't exist yet
    expect(store.getSpec('main')?.title).toBe('Local')
    expect(store.getSimulationHistory()).toEqual([])
  })

  test('loadFromServer returns false when file mode is off and on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ enabled: false }) }) as any))
    const offStore = new RemoteSyncSpecStore()
    expect(await offStore.loadFromServer()).toBe(false)

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const failStore = new RemoteSyncSpecStore()
    expect(await failStore.loadFromServer()).toBe(false)
    // Local-only behavior still works
    failStore.saveSpec('main', 'Offline', 'system: {}\n')
    expect(failStore.getSpec('main')?.title).toBe('Offline')
  })

  test('mirror failures are swallowed, never thrown into the UI', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom') }))

    const store = new RemoteSyncSpecStore()
    expect(() => store.saveSpec('main', 'T', 'yaml')).not.toThrow()
    expect(store.getSpec('main')?.title).toBe('T')

    await vi.waitFor(() => expect(errSpy).toHaveBeenCalled())
  })
})
