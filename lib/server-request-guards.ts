// SERVER-ONLY request guards shared by the API routes.

/**
 * DNS-rebinding defense: a rebinding page resolves its own hostname to
 * 127.0.0.1, becoming same-origin with this server — but it still sends its
 * own hostname in Host. Loopback-only Host names cut that off for both the
 * store route (file reads/writes) and the project route (mode switching).
 */
export function isLoopbackHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false
  // Strip the port; [::1]:3000 keeps its brackets in the Host header.
  const host = hostHeader.startsWith("[")
    ? hostHeader.slice(1, hostHeader.indexOf("]"))
    : hostHeader.split(":")[0]
  return host === "localhost" || host === "127.0.0.1" || host === "::1"
}
