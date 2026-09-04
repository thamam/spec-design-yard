import type { NextApiRequest, NextApiResponse } from "next"
import {
  bumpSessionGeneration,
  clearSessionCookieHeader,
  gateAuthEndpoint,
  getLocalTokenProvider,
  isRemoteMode,
  readCookie,
  requestIsHttps,
  verifySessionCookie,
} from "../../../lib/server-auth"
import { REMOTE_CSRF_HEADER, REMOTE_CSRF_VALUE, SESSION_COOKIE_NAME } from "../../../lib/remote-access"

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export default function logoutHandler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" })
    }
    const access = gateAuthEndpoint(req)
    if (!access.ok) return res.status(access.status).json(access.body)

    if (isRemoteMode()) {
      const cookie = readCookie(req.headers.cookie, SESSION_COOKIE_NAME)
      const auth = headerValue(req.headers.authorization)
      const bearer = auth && /^Bearer\s+(\S+)/i.exec(auth.trim())
      const bearerOk = !!(bearer && getLocalTokenProvider().verifySecret(bearer[1]))
      const cookieOk = verifySessionCookie(cookie)
      if (cookieOk && !bearerOk) {
        if (headerValue(req.headers[REMOTE_CSRF_HEADER]) !== REMOTE_CSRF_VALUE) {
          return res.status(403).json({ error: "CSRF header required", code: "csrf" })
        }
      }
      // Only a proven session (cookie or Bearer) may revoke every copy.
      // An unauthenticated POST still clears *this* browser's cookie.
      if (cookieOk || bearerOk) bumpSessionGeneration()
    }

    res.setHeader("Set-Cookie", clearSessionCookieHeader(requestIsHttps(req.headers)))
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error("[spec-yard] auth logout error", e)
    return res.status(500).json({ error: "Logout failed" })
  }
}
