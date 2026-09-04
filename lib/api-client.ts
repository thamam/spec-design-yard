// Browser fetch helper for project/store/auth APIs. Adds the CSRF custom
// header the remote-mode cookie path requires. Local mode ignores the
// header. No React — lib stays framework-free.

import { REMOTE_CSRF_HEADER, REMOTE_CSRF_VALUE } from "./remote-access"

function mergeHeaders(init?: HeadersInit): Record<string, string> {
  const headers: Record<string, string> = { [REMOTE_CSRF_HEADER]: REMOTE_CSRF_VALUE }
  if (!init) return headers
  if (init instanceof Headers) {
    init.forEach((value, key) => {
      headers[key] = value
    })
    return headers
  }
  if (Array.isArray(init)) {
    for (const [key, value] of init) headers[key] = value
    return headers
  }
  return { ...headers, ...init }
}

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, headers: mergeHeaders(init?.headers) })
}

/** Session expiry: send the operator back to login. Disk files are not
 *  touched — the project folder stays the source of truth. */
export function redirectToLoginOnUnauthorized(status: number): boolean {
  if (status !== 401) return false
  if (typeof window === "undefined") return true
  if (window.location.pathname === "/login") return true
  const dest = "/login?expired=1"
  if (typeof window.location.replace === "function") window.location.replace(dest)
  else window.location.href = dest
  return true
}
