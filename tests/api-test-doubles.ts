// Minimal NextApiRequest/Response stand-ins shared by the API route tests.
// Both routes are plain functions of (req, res), so a recording res and a
// literal req are all they need — no server, no supertest.

/** Records the last status/json a handler wrote. */
export function mockRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: any) {
      res.body = payload
      return res
    },
  }
  return res
}

/**
 * Both routes refuse non-loopback Host headers (DNS-rebinding guard), so every
 * request needs one — the default is what a browser on localhost sends.
 */
const LOOPBACK_HOST = "localhost:3000"

export function storeReq(
  method: string,
  pathSegments: string[] | string,
  body?: any,
  opts: { host?: string; epoch?: string; contentType?: string | null } = {}
) {
  const query: any = { path: pathSegments }
  if (opts.epoch !== undefined) query.epoch = opts.epoch
  const headers: Record<string, string> = { host: opts.host ?? LOOPBACK_HOST }
  // Writes require a JSON content-type (CSRF-by-preflight), matching the
  // project route. Tests opt out with contentType: null.
  if (method === "PUT" && opts.contentType !== null) {
    headers["content-type"] = opts.contentType ?? "application/json"
  }
  return { method, query, body, headers } as any
}

export function projectReq(
  method: string,
  opts: { body?: any; host?: string; contentType?: string } = {}
) {
  const headers: Record<string, string> = { host: opts.host ?? LOOPBACK_HOST }
  // The route requires a JSON content-type on writes (CSRF-by-preflight).
  if (opts.body !== undefined) headers["content-type"] = opts.contentType ?? "application/json"
  return { method, query: {}, body: opts.body, headers } as any
}
