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
    store.arm()
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
        baseRev: null,
      })
    })
  })

  test('simulation history and presets mirror to meta endpoints', async () => {
    const fetchMock = mockFetchSequence({})
    vi.stubGlobal('fetch', fetchMock)

    const store = new RemoteSyncSpecStore()
    store.arm()
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
    store.arm()
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

    // Mirroring is disabled: no further fetches on save, even once armed
    store.arm()
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
    store.arm()
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
    store.arm()
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
    store.arm()
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

  test('spec PUTs are serialized and chain baseRev from ack', async () => {
    const putBodies: any[] = []
    let ackCounter = 0
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') {
        putBodies.push(JSON.parse(init.body))
        const rev = `r${++ackCounter}`
        // Delay each PUT so parallelism would show up as interleaving
        await new Promise(r => setTimeout(r, 10))
        return { ok: true, status: 200, json: async () => ({ ok: true, rev }) } as any
      }
      return { ok: false, status: 404, json: async () => ({}) } as any
    }))

    const store = new RemoteSyncSpecStore()
    store.arm()
    store.saveSpec('main', 'A', 'yaml-a')
    store.saveSpec('main', 'B', 'yaml-b')
    store.saveSpec('main', 'C', 'yaml-c')

    await vi.waitFor(() => expect(putBodies).toHaveLength(3))
    expect(putBodies[0].baseRev).toBeNull()
    expect(putBodies[1].baseRev).toBe('r1')
    expect(putBodies[2].baseRev).toBe('r2')
  })
})

describe('RemoteSyncSpecStore round-2 protocol fixes', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('authoritative null meta clears the cache (no cross-project metadata bleed)', async () => {
    localStorage.setItem('simulation_history', JSON.stringify([{ id: 'other-project-run' }]))
    localStorage.setItem('custom_simulation_presets', JSON.stringify([{ name: 'Other', packets: 1, loss: 1 }]))
    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': { status: 200, body: { found: false } },
      '/api/store/meta/simulation_history': { status: 200, body: null },
      '/api/store/meta/custom_presets': { status: 200, body: null },
    }))

    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()

    expect(store.getSimulationHistory()).toEqual([])
    expect(store.getCustomPresets()).toEqual([])
  })

  test('a 409 caused by a lost ack reconciles and retries instead of latching off', async () => {
    // Session state: hydrated from server at rev r1 holding yaml X.
    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': {
        status: 200,
        body: { id: 'main', title: 'T', yamlContent: 'yaml-X', updatedAt: 't1', rev: 'r1' },
      },
    }))
    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()
    store.arm()

    // Simulate the lost ack: server advanced to r2 holding exactly our last
    // write (yaml-X), but we never saw the ack. Our next PUT (yaml-Y, baseRev
    // r1) 409s; reconcile should GET, see yaml-X (= what our last PUT sent),
    // adopt r2 and retry — no latch-off, no error log.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let putCount = 0
    const seenBases: (string | null)[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') {
        putCount++
        seenBases.push(JSON.parse(init.body).baseRev ?? null)
        if (putCount === 1) return { ok: false, status: 409, json: async () => ({ conflict: true }) } as any
        return { ok: true, status: 200, json: async () => ({ ok: true, rev: 'r3' }) } as any
      }
      return { ok: true, status: 200, json: async () => ({ id: 'main', title: 'T', yamlContent: 'yaml-X', updatedAt: 't2', rev: 'r2' }) } as any
    }))

    store.saveSpec('main', 'T', 'yaml-Y')
    await vi.waitFor(() => expect(putCount).toBe(2))
    expect(seenBases).toEqual(['r1', 'r2'])
    expect(errSpy).not.toHaveBeenCalled()

    // Mirroring still armed after reconcile
    store.saveSpec('main', 'T', 'yaml-Z')
    await vi.waitFor(() => expect(putCount).toBe(3))
  })

  test('mirrors stay silent until arm() is called', async () => {
    const fetchMock = mockFetchSequence({})
    vi.stubGlobal('fetch', fetchMock)

    const store = new RemoteSyncSpecStore()
    store.saveSpec('main', 'T', 'yaml')
    store.saveSimulationHistory([{ id: 'r' }])
    await new Promise(r => setTimeout(r, 50))
    expect(fetchMock).not.toHaveBeenCalled()

    store.arm()
    store.saveSpec('main', 'T2', 'yaml2')
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]: any[]) => init?.method === 'PUT')).toBe(true)
    })
  })

  test('meta PUTs are serialized per URL', async () => {
    const inFlight: string[] = []
    let maxConcurrent = 0
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') {
        inFlight.push(String(input))
        maxConcurrent = Math.max(maxConcurrent, inFlight.length)
        await new Promise(r => setTimeout(r, 15))
        inFlight.pop()
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as any
      }
      return { ok: false, status: 404, json: async () => ({}) } as any
    }))

    const store = new RemoteSyncSpecStore()
    store.arm()
    store.saveSimulationHistory([{ id: 'a' }])
    store.saveSimulationHistory([{ id: 'a' }, { id: 'b' }])
    store.saveSimulationHistory([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    await vi.waitFor(() => {
      const fetchMock = globalThis.fetch as any
      expect(fetchMock.mock.calls.filter(([, init]: any[]) => init?.method === 'PUT')).toHaveLength(3)
    })
    expect(maxConcurrent).toBe(1)
  })
})

describe('RemoteSyncSpecStore project-epoch guard', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('loadFromServer captures the epoch and spec/meta PUTs carry it as a query param', async () => {
    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': { status: 200, body: { found: false, epoch: 'epoch-A' } },
      '/api/store/meta/simulation_history': { status: 200, body: null },
      '/api/store/meta/custom_presets': { status: 200, body: null },
    }))
    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()
    store.arm()
    store.saveSpec('main', 'T', 'yaml')
    store.saveSimulationHistory([{ id: 'r1' }])

    await vi.waitFor(() => {
      const fetchMock = globalThis.fetch as any
      const putUrls = fetchMock.mock.calls
        .filter(([, init]: any[]) => init?.method === 'PUT')
        .map(([url]: any[]) => String(url))
      expect(putUrls).toContain('/api/store/spec/main?epoch=epoch-A')
      expect(putUrls).toContain('/api/store/meta/simulation_history?epoch=epoch-A')
    })
  })

  test('no epoch from the server: PUT URLs stay bare', async () => {
    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': { status: 200, body: { found: false } },
    }))
    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()
    store.arm()
    store.saveSpec('main', 'T', 'yaml')

    await vi.waitFor(() => {
      const fetchMock = globalThis.fetch as any
      const putUrls = fetchMock.mock.calls
        .filter(([, init]: any[]) => init?.method === 'PUT')
        .map(([url]: any[]) => String(url))
      expect(putUrls).toContain('/api/store/spec/main')
    })
  })

  test('a project-switched 409 latches mirroring off without a reconcile retry', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let gets = 0
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') {
        return { ok: false, status: 409, json: async () => ({ conflict: true, reason: 'project-switched' }) } as any
      }
      gets++
      return { ok: true, status: 200, json: async () => ({ found: false, epoch: 'other' }) } as any
    }))

    const store = new RemoteSyncSpecStore()
    store.arm()
    store.saveSpec('main', 'T', 'yaml')

    await vi.waitFor(() => expect(errSpy).toHaveBeenCalled())
    expect(errSpy.mock.calls.map(c => String(c[0])).join('\n')).toMatch(/project.*(switched|changed)/i)
    // No lost-ack reconcile GET: the session must not adopt the new project.
    expect(gets).toBe(0)

    // Mirroring is latched off.
    const fetchMock = globalThis.fetch as any
    fetchMock.mockClear()
    store.saveSpec('main', 'T2', 'yaml2')
    await new Promise(r => setTimeout(r, 50))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('RemoteSyncSpecStore cache provenance', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('a save made under a project is never tagged as a portable sketch', async () => {
    // Review finding: saveSpec fell back to "standalone" whenever the server
    // sent no epoch, even with a project active — and "standalone" is the one
    // tag the migration path adopts, so that fallback failed OPEN into a
    // cross-project bleed. Its sibling in loadFromServer fails closed.
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') return { ok: true, status: 200, json: async () => ({ ok: true }) } as any
      // File mode on, but the server volunteers no epoch.
      return { ok: true, status: 200, json: async () => ({ found: false }) } as any
    }))
    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()
    store.arm()
    store.saveSpec('main', 'T', 'yaml')
    expect(localStorage.getItem('spec_main_origin')).not.toBe('standalone')
  })

  test('a save made with no project is tagged as a portable sketch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ enabled: false, mode: 'unconfigured' }) }) as any))
    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()
    store.arm()
    store.saveSpec('main', 'T', 'yaml')
    expect(localStorage.getItem('spec_main_origin')).toBe('standalone')
  })
})

describe('RemoteSyncSpecStore sync-state visibility', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('adoptStandalone flips to local-only without wiping the spec', async () => {
    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': { status: 200, body: { found: false, epoch: 'e1' } },
    }))
    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()
    store.arm()
    store.saveSpec('main', 'Keep Me', 'system:\n  name: Keep Me\n')
    expect(store.getSyncState().status).toBe('synced')
    store.adoptStandalone()
    expect(store.getSyncState().status).toBe('local-only')
    expect(store.getSpec('main')?.yamlContent).toContain('Keep Me')
    expect(localStorage.getItem('spec_main_origin')).toBe('standalone')
  })

  test('standalone is a calm local-only state, not an alarm', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ enabled: false }) }) as any))
    const store = new RemoteSyncSpecStore()
    expect(store.getSyncState().status).toBe('local-only')
    await store.loadFromServer()
    expect(store.getSyncState().status).toBe('local-only')
  })

  test('a successful project load reports synced', async () => {
    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': { status: 200, body: { found: false, epoch: 'e1' } },
    }))
    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()
    expect(store.getSyncState().status).toBe('synced')
  })

  test('a project-switched 409 halts with a reload instruction and notifies subscribers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') {
        return { ok: false, status: 409, json: async () => ({ conflict: true, reason: 'project-switched' }) } as any
      }
      return { ok: true, status: 200, json: async () => ({ found: false, epoch: 'e1' }) } as any
    }))

    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()
    store.arm()

    const seen: any[] = []
    const unsubscribe = store.subscribeSyncState((s) => seen.push(s))
    store.saveSpec('main', 'T', 'yaml')

    await vi.waitFor(() => {
      expect(store.getSyncState().status).toBe('halted')
    })
    expect(store.getSyncState().reason).toMatch(/reload/i)
    expect(store.getSyncState().haltKind).toBe('rejoin')
    expect(seen.some((s) => s.status === 'halted')).toBe(true)
    unsubscribe()
  })

  test('a thrown fetch on save is visible, not a fake synced state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') throw new Error('network down')
      return { ok: true, status: 200, json: async () => ({ found: false, epoch: 'e1' }) } as any
    }))
    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()
    store.arm()
    expect(store.getSyncState().status).toBe('synced')

    store.saveSpec('main', 'T', 'yaml')
    await vi.waitFor(() => {
      expect(store.getSyncState().status).toBe('halted')
    })
    expect(store.getSyncState().reason).toMatch(/network/i)
    expect(store.getSyncState().haltKind).toBe('retry')
  })

  test('a failed save is visible, not console-only', async () => {
    // Review finding: a non-409 failure (project dir deleted mid-session,
    // disk full, permissions) logged and returned, leaving the status bar
    // still claiming "Synced to project" while nothing reached the file.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') return { ok: false, status: 500, json: async () => ({}) } as any
      return { ok: true, status: 200, json: async () => ({ found: false, epoch: 'e1' }) } as any
    }))
    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()
    store.arm()
    expect(store.getSyncState().status).toBe('synced')

    store.saveSpec('main', 'T', 'yaml')
    await vi.waitFor(() => {
      expect(store.getSyncState().status).toBe('halted')
    })
    expect(store.getSyncState().reason).toMatch(/browser storage/i)
    expect(store.getSyncState().haltKind).toBe('retry')
  })

  test('a transient save failure clears once a save lands again', async () => {
    // Unlike a conflict, a transient failure does not latch file mode off —
    // the next autosave still tries, and success must un-alarm the UI.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let failNext = true
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') {
        if (failNext) {
          failNext = false
          return { ok: false, status: 500, json: async () => ({}) } as any
        }
        return { ok: true, status: 200, json: async () => ({ ok: true, rev: 'r2' }) } as any
      }
      return { ok: true, status: 200, json: async () => ({ found: false, epoch: 'e1' }) } as any
    }))
    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()
    store.arm()

    store.saveSpec('main', 'T', 'one')
    await vi.waitFor(() => expect(store.getSyncState().status).toBe('halted'))

    store.saveSpec('main', 'T', 'two')
    await vi.waitFor(() => expect(store.getSyncState().status).toBe('synced'))
  })

  test('a reconcile GET that throws still latches a real fork', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = new RemoteSyncSpecStore()
    store.arm()
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') return { ok: false, status: 409, json: async () => ({ conflict: true }) } as any
      throw new Error('reconcile GET down')
    }))
    store.saveSpec('main', 'T', 'mine')
    await vi.waitFor(() => expect(store.getSyncState().haltKind).toBe('adopt'))
  })

  test('a genuine external-edit conflict halts with a reload instruction', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') return { ok: false, status: 409, json: async () => ({ conflict: true }) } as any
      // Reconcile GET sees content that differs from our last write.
      return { ok: true, status: 200, json: async () => ({ id: 'main', title: 'T', yamlContent: 'external', rev: 'rX', epoch: 'e1' }) } as any
    }))
    const store = new RemoteSyncSpecStore()
    store.arm()
    store.saveSpec('main', 'T', 'mine')
    await vi.waitFor(() => expect(store.getSyncState().status).toBe('halted'))
    expect(store.getSyncState().haltKind).toBe('adopt')
    expect(store.getSyncState().reason).toMatch(/differs from this session/i)
    expect(store.getSyncState().reason).toMatch(/discards this session/i)
  })

  test('a 409 while disk still holds our baseline is buffer-ahead, not an external adopt', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const seed = 'system:\n  name: Seed\n'
    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': {
        status: 200,
        body: { id: 'main', title: 'T', yamlContent: seed, rev: 'r1', epoch: 'e1' },
      },
    }))
    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()
    store.arm()

    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') return { ok: false, status: 409, json: async () => ({ conflict: true }) } as any
      return { ok: true, status: 200, json: async () => ({ id: 'main', title: 'T', yamlContent: seed, rev: 'r1', epoch: 'e1' }) } as any
    }))

    store.saveSpec('main', 'T', `${seed}  # session connect\n`)
    await vi.waitFor(() => expect(store.getSyncState().status).toBe('halted'))
    expect(store.getSyncState().haltKind).toBe('retry')
    expect(store.getSyncState().reason).toMatch(/have not reached disk/i)
    expect(store.getSyncState().reason).not.toMatch(/changed outside/i)

    // Mirroring stays armed so Retry save can still PUT — and a second 409
    // must stay buffer-ahead, not flip to "disk won" / adopt.
    const fetchMock = globalThis.fetch as any
    fetchMock.mockClear()
    store.saveSpec('main', 'T', `${seed}  # session connect\n`)
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]: any[]) => init?.method === 'PUT')).toBe(true)
    })
    await vi.waitFor(() => expect(store.getSyncState().haltKind).toBe('retry'))
  })

  test('a 409 whose disk already equals this session write is treated as a win', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const ours = 'system:\n  name: Connected\n'
    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': {
        status: 200,
        body: { id: 'main', title: 'T', yamlContent: 'system:\n  name: Seed\n', rev: 'r1', epoch: 'e1' },
      },
    }))
    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()
    store.arm()

    // Leave the bar halted so the win path must explicitly restore "synced"
    // (hydration already reports synced, which hid an uncovered reconcile).
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') return { ok: false, status: 500, json: async () => ({}) } as any
      return { ok: true, status: 200, json: async () => ({ id: 'main', title: 'T', yamlContent: 'system:\n  name: Seed\n', rev: 'r1' }) } as any
    }))
    store.saveSpec('main', 'T', 'system:\n  name: Seed\n')
    await vi.waitFor(() => expect(store.getSyncState().status).toBe('halted'))

    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') return { ok: false, status: 409, json: async () => ({ conflict: true }) } as any
      return { ok: true, status: 200, json: async () => ({ id: 'main', title: 'T', yamlContent: ours, rev: 'r2', epoch: 'e1' }) } as any
    }))

    store.saveSpec('main', 'T', ours)
    await vi.waitFor(() => expect(store.getSyncState().status).toBe('synced'))
    expect(store.getSyncState().haltKind).toBeUndefined()
  })

  test('CRLF on disk still matches an LF baseline so a lost-ack retry can land', async () => {
    const seedLf = 'system:\n  name: Seed\n'
    const seedCrLf = 'system:\r\n  name: Seed\r\n'
    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': {
        status: 200,
        body: { id: 'main', title: 'T', yamlContent: seedCrLf, rev: 'r1', epoch: 'e1' },
      },
    }))
    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()
    store.arm()

    let putCount = 0
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') {
        putCount++
        if (putCount === 1) return { ok: false, status: 409, json: async () => ({ conflict: true }) } as any
        return { ok: true, status: 200, json: async () => ({ ok: true, rev: 'r3' }) } as any
      }
      return { ok: true, status: 200, json: async () => ({ id: 'main', title: 'T', yamlContent: seedCrLf, rev: 'r2', epoch: 'e1' }) } as any
    }))

    store.saveSpec('main', 'T', `${seedLf}  # connect\n`)
    await vi.waitFor(() => expect(putCount).toBe(2))
    expect(store.getSyncState().status).toBe('synced')
  })

  test('a buffer-ahead 409 with no rev to chain still offers retry, not adopt', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const seed = 'system:\n  name: Seed\n'
    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': {
        status: 200,
        body: { id: 'main', title: 'T', yamlContent: seed, rev: 'r1', epoch: 'e1' },
      },
    }))
    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()
    store.arm()

    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') return { ok: false, status: 409, json: async () => ({ conflict: true }) } as any
      return { ok: true, status: 200, json: async () => ({ id: 'main', title: 'T', yamlContent: seed, epoch: 'e1' }) } as any
    }))

    store.saveSpec('main', 'T', `${seed}  # session\n`)
    await vi.waitFor(() => expect(store.getSyncState().status).toBe('halted'))
    expect(store.getSyncState().haltKind).toBe('retry')
  })

  test('a broken store (5xx on load) halts loudly rather than posing as standalone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as any))
    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()
    expect(store.getSyncState().status).toBe('halted')
    expect(store.getSyncState().haltKind).toBe('rejoin')
  })
})

describe('RemoteSyncSpecStore cache provenance (standalone sketch migration)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('a standalone sketch survives into a freshly chosen project', async () => {
    // Sketch in standalone mode: no server, saves are cache-only and tagged
    // as standalone work.
    const standalone = new RemoteSyncSpecStore()
    standalone.saveSpec('main', 'My Sketch', 'system:\n  name: My Sketch\n')
    expect(localStorage.getItem('spec_main_origin')).toBe('standalone')

    // User picks an empty project folder -> reload -> {found:false}.
    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': { status: 200, body: { found: false, epoch: 'epoch-new' } },
    }))
    const store = new RemoteSyncSpecStore()
    expect(await store.loadFromServer()).toBe(true)

    // The user's only copy is adopted, not deleted.
    expect(store.getSpec('main')?.yamlContent).toContain('My Sketch')
  })

  test('another project\'s cache is still dropped on {found:false}', async () => {
    localStorage.setItem('spec_main', JSON.stringify({
      id: 'main', title: 'Project A', yamlContent: 'system:\n  name: Project A\n', updatedAt: '2026-01-01',
    }))
    localStorage.setItem('spec_main_origin', 'epoch-project-a')

    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': { status: 200, body: { found: false, epoch: 'epoch-project-b' } },
    }))
    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()

    expect(store.getSpec('main')).toBeNull()
    expect(localStorage.getItem('spec_main_origin')).toBeNull()
  })

  test('a legacy cache with no origin tag is dropped (conservative bleed guard)', async () => {
    localStorage.setItem('spec_main', JSON.stringify({
      id: 'main', title: 'Unknown Origin', yamlContent: 'system: {}\n', updatedAt: '2026-01-01',
    }))

    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': { status: 200, body: { found: false, epoch: 'epoch-new' } },
    }))
    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()

    expect(store.getSpec('main')).toBeNull()
  })

  test('project-mode saves and loads tag the cache with the project epoch', async () => {
    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': {
        status: 200,
        body: { id: 'main', title: 'T', yamlContent: 'system: {}\n', updatedAt: 't1', rev: 'r1', epoch: 'epoch-1' },
      },
    }))
    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()
    expect(localStorage.getItem('spec_main_origin')).toBe('epoch-1')

    store.arm()
    store.saveSpec('main', 'T', 'system:\n  name: Edited\n')
    expect(localStorage.getItem('spec_main_origin')).toBe('epoch-1')
  })

  test('removeSpec clears the origin tag too', () => {
    const store = new RemoteSyncSpecStore()
    store.saveSpec('main', 'T', 'yaml')
    expect(localStorage.getItem('spec_main_origin')).toBe('standalone')
    store.removeSpec('main')
    expect(localStorage.getItem('spec_main_origin')).toBeNull()
  })
})

describe('RemoteSyncSpecStore round-3 fixes', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('valid-but-non-array meta JSON clears the cache too', async () => {
    localStorage.setItem('simulation_history', JSON.stringify([{ id: 'other-project-run' }]))
    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': { status: 200, body: { found: false } },
      '/api/store/meta/simulation_history': { status: 200, body: { unexpected: 'object' } },
      '/api/store/meta/custom_presets': { status: 200, body: 'a string' },
    }))

    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()

    expect(store.getSimulationHistory()).toEqual([])
    expect(store.getCustomPresets()).toEqual([])
  })

  test('pre-arm meta writes are queued and flushed on arm (local + server)', async () => {
    const fetchMock = mockFetchSequence({})
    vi.stubGlobal('fetch', fetchMock)

    const store = new RemoteSyncSpecStore()
    // Early write (pre-arm): applied locally, not yet mirrored
    store.saveSimulationHistory([{ id: 'early-run' }])
    expect(store.getSimulationHistory()).toEqual([{ id: 'early-run' }])
    expect(fetchMock).not.toHaveBeenCalled()

    store.arm()
    await vi.waitFor(() => {
      const puts = fetchMock.mock.calls.filter(([u, init]: any[]) => init?.method === 'PUT' && String(u).includes('simulation_history'))
      expect(puts).toHaveLength(1)
      expect(JSON.parse(puts[0][1].body)).toEqual([{ id: 'early-run' }])
    })
    expect(store.getSimulationHistory()).toEqual([{ id: 'early-run' }])
  })

  test('a 401 on loadFromServer redirects to login and does not latch local-only', async () => {
    const replace = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/', replace, href: '/' },
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Sign in required' }) })))
    const store = new RemoteSyncSpecStore()
    expect(await store.loadFromServer()).toBe(false)
    expect(replace).toHaveBeenCalledWith('/login?expired=1')
    expect(store.getSyncState().status).toBe('local-only')
  })

  test('a 401 on spec or meta PUT redirects to login instead of treating it as a save failure', async () => {
    const replace = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/', replace, href: '/' },
    })
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') return { ok: false, status: 401, json: async () => ({}) } as any
      return { ok: true, status: 200, json: async () => ({ found: false, epoch: 'e1' }) } as any
    }))
    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()
    store.arm()
    store.saveSpec('main', 'T', 'system: {}\n')
    store.saveSimulationHistory([{ id: 'r' }])
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/login?expired=1'))
    expect(store.getSyncState().status).not.toBe('halted')
    expect(localStorage.getItem('spec_main_crash_draft')).toBe('system: {}\n')
  })

  test('a 401 during conflict reconcile redirects instead of adopting disk', async () => {
    const replace = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/', replace, href: '/' },
    })
    let puts = 0
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') {
        puts += 1
        if (puts === 1) return { ok: false, status: 409, json: async () => ({ conflict: true }) } as any
        return { ok: false, status: 401, json: async () => ({}) } as any
      }
      return { ok: false, status: 401, json: async () => ({}) } as any
    }))
    const store = new RemoteSyncSpecStore()
    store.arm()
    store.saveSpec('main', 'T', 'system: {}\n')
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/login?expired=1'))
    expect(localStorage.getItem('spec_main_crash_draft')).toBe('system: {}\n')
  })

  test('a 401 on the lost-ack retry PUT still keeps the in-flight YAML', async () => {
    const replace = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/', replace, href: '/' },
    })
    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': {
        status: 200,
        body: { id: 'main', title: 'T', yamlContent: 'yaml-X', updatedAt: 't1', rev: 'r1' },
      },
    }))
    const store = new RemoteSyncSpecStore()
    await store.loadFromServer()
    store.arm()
    localStorage.removeItem('spec_main_crash_draft')

    let putCount = 0
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      if (init?.method === 'PUT') {
        putCount += 1
        if (putCount === 1) return { ok: false, status: 409, json: async () => ({ conflict: true }) } as any
        return { ok: false, status: 401, json: async () => ({}) } as any
      }
      return { ok: true, status: 200, json: async () => ({ id: 'main', title: 'T', yamlContent: 'yaml-X', updatedAt: 't2', rev: 'r2' }) } as any
    }))
    store.saveSpec('main', 'T', 'yaml-Y\n')
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/login?expired=1'))
    expect(localStorage.getItem('spec_main_crash_draft')).toBe('yaml-Y\n')
  })

  test('a successful loadFromServer resets a previous failure latch', async () => {
    const store = new RemoteSyncSpecStore()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    expect(await store.loadFromServer()).toBe(false)

    vi.stubGlobal('fetch', mockFetchSequence({
      '/api/store/spec/main': { status: 200, body: { found: false } },
    }))
    expect(await store.loadFromServer()).toBe(true)
    store.arm()
    store.saveSpec('main', 'T', 'yaml')
    await vi.waitFor(() => {
      const fetchMock = globalThis.fetch as any
      expect(fetchMock.mock.calls.some(([, init]: any[]) => init?.method === 'PUT')).toBe(true)
    })
  })
})
