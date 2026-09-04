import { describe, test, expect, afterEach, vi } from 'vitest'
import { apiFetch, redirectToLoginOnUnauthorized } from '../lib/api-client'
import { REMOTE_CSRF_HEADER, REMOTE_CSRF_VALUE } from '../lib/remote-access'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('apiFetch', () => {
  test('adds the CSRF header to a headers object, a Headers instance, and a tuple list', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as any)
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/api/store/spec/main', { method: 'PUT', headers: { 'Content-Type': 'application/json' } })
    expect(fetchMock.mock.calls[0][1].headers[REMOTE_CSRF_HEADER]).toBe(REMOTE_CSRF_VALUE)
    expect(fetchMock.mock.calls[0][1].headers['Content-Type']).toBe('application/json')

    await apiFetch('/x', { headers: new Headers({ Accept: 'application/json' }) })
    expect(fetchMock.mock.calls[1][1].headers[REMOTE_CSRF_HEADER]).toBe(REMOTE_CSRF_VALUE)
    expect(fetchMock.mock.calls[1][1].headers.accept).toBe('application/json')

    await apiFetch('/y', { headers: [['X-A', '1']] })
    expect(fetchMock.mock.calls[2][1].headers['X-A']).toBe('1')

    await apiFetch('/z')
    expect(fetchMock.mock.calls[3][1].headers[REMOTE_CSRF_HEADER]).toBe(REMOTE_CSRF_VALUE)
  })
})

describe('redirectToLoginOnUnauthorized', () => {
  test('ignores non-401 and does not navigate when already on /login', () => {
    const replace = vi.fn()
    vi.stubGlobal('window', { location: { pathname: '/login', replace, href: '/login' } })
    expect(redirectToLoginOnUnauthorized(403)).toBe(false)
    expect(redirectToLoginOnUnauthorized(401)).toBe(true)
    expect(replace).not.toHaveBeenCalled()
  })

  test('returns true without navigating when window is undefined', () => {
    const previous = globalThis.window
    // @ts-expect-error — exercise the server-side branch
    delete globalThis.window
    expect(redirectToLoginOnUnauthorized(401)).toBe(true)
    globalThis.window = previous
  })

  test('replaces to /login?expired=1 and falls back to href', () => {
    const replace = vi.fn()
    vi.stubGlobal('window', { location: { pathname: '/', replace, href: '/' } })
    expect(redirectToLoginOnUnauthorized(401)).toBe(true)
    expect(replace).toHaveBeenCalledWith('/login?expired=1')

    const loc: { pathname: string; href: string; replace?: undefined } = { pathname: '/workspace', href: '' }
    vi.stubGlobal('window', { location: loc })
    redirectToLoginOnUnauthorized(401)
    expect(loc.href).toBe('/login?expired=1')
  })
})
