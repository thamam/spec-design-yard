import { vi } from 'vitest'

// The workspace talks to three endpoints on mount (/api/store/spec/main,
// /api/store/meta/*, /api/project) and PUTs back through the same store.
// Each test only cares about one or two of those answers, so this double takes
// per-route replies with sane defaults and records every PUT.

export interface Reply {
  /** Defaults to `status < 300`. */
  ok?: boolean
  /** Defaults to 200. */
  status?: number
  /** Parsed body the route's `json()` resolves to. Defaults to null. */
  body?: any
}

export interface WorkspaceRoutes {
  /** GET /api/store/spec/main — the answer that decides file vs browser mode. */
  spec: Reply
  /** GET /api/project — what the header picker shows. Default: standalone. */
  project?: Reply
  /** GET /api/store/meta/* — default: 200 null (nothing stored yet). */
  meta?: Reply
  /** Every PUT. Default: a successful ack with a rev. */
  put?: Reply
}

function respond(reply: Reply) {
  const status = reply.status ?? 200
  return {
    ok: reply.ok ?? status < 300,
    status,
    json: async () => reply.body ?? null,
  } as any
}

export function installWorkspaceFetch(routes: WorkspaceRoutes) {
  const puts: { url: string; body: any }[] = []
  const fetchMock = vi.fn(async (input: any, init?: any) => {
    const url = String(input)
    if (init?.method === 'PUT') {
      puts.push({ url, body: JSON.parse(init.body) })
      return respond(routes.put ?? { body: { ok: true, rev: 'r1' } })
    }
    if (url.startsWith('/api/store/spec/main')) return respond(routes.spec)
    if (url.startsWith('/api/store/meta/')) return respond(routes.meta ?? { body: null })
    if (url.startsWith('/api/project')) {
      return respond(routes.project ?? { body: { mode: 'standalone', recents: [] } })
    }
    return respond({ status: 404, body: {} })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { puts, fetchMock }
}

/** GET /api/project for a workspace bound to a project folder. */
export function projectReply(dir: string): Reply {
  return { body: { mode: 'project', dir, exists: true, source: 'config', recents: [] } }
}
