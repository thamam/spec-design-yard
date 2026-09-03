// SERVER-ONLY request guards shared by the API routes.

/** Hard cap on a spec PUT. Matches Next's default API body limit so a
 *  oversized write is refused with a clear 413 rather than a generic parse
 *  failure — and so a runaway client cannot fill the project disk. */
export const MAX_SPEC_YAML_BYTES = 1_000_000

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

/**
 * DNS-rebinding defense: a rebinding page resolves its own hostname to
 * 127.0.0.1, becoming same-origin with this server — but it still sends its
 * own hostname in Host. Loopback-only Host names cut that off for both the
 * store route (file reads/writes) and the project route (mode switching).
 *
 * Host is case-insensitive (RFC 9110); a client or proxy that sends
 * `LOCALHOST` must not be treated as remote.
 */
export function isLoopbackHost(hostHeader: string | string[] | undefined): boolean {
  const raw = headerValue(hostHeader)
  if (!raw) return false
  // Strip the port; [::1]:3000 keeps its brackets in the Host header.
  const host = raw.startsWith("[")
    ? raw.slice(1, raw.indexOf("]"))
    : raw.split(":")[0]
  const normalized = host.toLowerCase()
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1"
}

/**
 * PUT CSRF-by-preflight: cross-origin JSON needs a CORS preflight (which we
 * never answer). Shared by the project and store write paths so a missing
 * Content-Type cannot sneak a simple-request body through on either route.
 */
export function isJsonContentType(contentType: string | string[] | undefined): boolean {
  const raw = headerValue(contentType)
  if (!raw) return false
  return raw.toLowerCase().includes("application/json")
}
