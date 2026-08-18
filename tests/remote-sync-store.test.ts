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
        baseUpdatedAt: null,
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

  test('loadFromServer with nothing stored clears the cached spec (no cross-project bleed)', async () => {
    // Real route contract: 200 with {found:false} for the spec, null for meta.
    // A stale cache from ANOTHER project must not survive — otherwise the first
    // autosave would write project A's spec into project B's repo.
    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': { status: 200, body: { found: false } },
      '/api/store/meta/simulation_history': { status: 200, body: null },
      '/api/store/meta/custom_presets': { status: 200, body: null },
    }))
    localStorage.setItem('spec_main', JSON.stringify({ id: 'main', title: 'Other Project', yamlContent: 'system: {}\n', updatedAt: '2020-01-01' }))

    const store = new RemoteSyncSpecStore()
    const active = await store.loadFromServer()

    expect(active).toBe(true) // file mode is on, the file just doesn't exist yet
    expect(store.getSpec('main')).toBeNull()
    expect(localStorage.getItem('spec_main')).toBeNull()
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

describe('RemoteSyncSpecStore failure policy', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('server 5xx on the spec GET disables file mode and returns false', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'x' }) }) as any))

    const store = new RemoteSyncSpecStore()
    expect(await store.loadFromServer()).toBe(false)
    expect(errSpy).toHaveBeenCalled()

    // Mirroring is disabled: no further fetches on save
    const fetchMock = globalThis.fetch as any
    fetchMock.mockClear()
    store.saveSpec('main', 'T', 'yaml')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(store.getSpec('main')?.title).toBe('T')
  })

  test('a transient meta GET failure does NOT disable file mode', async () => {
    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': { status: 200, body: { found: false } },
      // meta endpoints absent from the map -> the mock would 404; instead make one reject
    }))
    const baseFetch = globalThis.fetch as any
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (String(input).includes('simulation_history') && !init) throw new Error('flaky network')
      return baseFetch(input, init)
    }))

    const store = new RemoteSyncSpecStore()
    expect(await store.loadFromServer()).toBe(true)

    // File mode still active: saves still mirror
    store.saveSpec('main', 'T', 'yaml')
    await vi.waitFor(() => {
      const fetchMock = globalThis.fetch as any
      expect(fetchMock.mock.calls.some(([, init]: any[]) => init?.method === 'PUT')).toBe(true)
    })
  })

  test('mirror logs loudly on non-ok HTTP status (no silent write failures)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as any))

    const store = new RemoteSyncSpecStore()
    store.saveSimulationHistory([{ id: 'r1' }])
    await vi.waitFor(() => expect(errSpy).toHaveBeenCalled())
    const messages = errSpy.mock.calls.map(c => String(c[0])).join('\n')
    expect(messages).toContain('500')
  })

  test('a 409 conflict stops mirroring and tells the user to reload', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') return { ok: false, status: 409, json: async () => ({ conflict: true }) } as any
      return { ok: false, status: 404, json: async () => ({}) } as any
    }))

    const store = new RemoteSyncSpecStore()
    store.saveSpec('main', 'T', 'yaml')
    await vi.waitFor(() => expect(errSpy).toHaveBeenCalled())
    expect(errSpy.mock.calls.map(c => String(c[0])).join('\n')).toContain('Conflict')

    // Mirroring disabled after conflict
    const fetchMock = globalThis.fetch as any
    fetchMock.mockClear()
    errSpy.mockClear()
    store.saveSpec('main', 'T2', 'yaml2')
    await new Promise(r => setTimeout(r, 50))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('spec PUTs are serialized and chain baseUpdatedAt from ack', async () => {
    const putBodies: any[] = []
    let ackCounter = 0
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') {
        putBodies.push(JSON.parse(init.body))
        const updatedAt = `t${++ackCounter}`
        // Delay each PUT so parallelism would show up as interleaving
        await new Promise(r => setTimeout(r, 10))
        return { ok: true, status: 200, json: async () => ({ ok: true, updatedAt }) } as any
      }
      return { ok: false, status: 404, json: async () => ({}) } as any
    }))

    const store = new RemoteSyncSpecStore()
    store.saveSpec('main', 'A', 'yaml-a')
    store.saveSpec('main', 'B', 'yaml-b')
    store.saveSpec('main', 'C', 'yaml-c')

    await vi.waitFor(() => expect(putBodies).toHaveLength(3))
    expect(putBodies[0].baseUpdatedAt).toBeNull()
    expect(putBodies[1].baseUpdatedAt).toBe('t1')
    expect(putBodies[2].baseUpdatedAt).toBe('t2')
  })
})
