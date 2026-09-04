import type { NextApiRequest, NextApiResponse } from "next"
import { isJsonContentType } from "../../../lib/server-request-guards"
import {
  gateAuthEndpoint,
  isRemoteMode,
  getLocalTokenProvider,
  mintSessionCookie,
  requestIsHttps,
  sessionCookieHeader,
} from "../../../lib/server-auth"

export default function loginHandler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" })
    }
    const access = gateAuthEndpoint(req)
    if (!access.ok) return res.status(access.status).json(access.body)
    if (!isRemoteMode()) {
      return res.status(404).json({ error: "Remote mode is off", code: "local-mode" })
    }
    if (!isJsonContentType(req.headers["content-type"])) {
      return res.status(415).json({ error: "POST requires Content-Type: application/json" })
    }
    const provider = getLocalTokenProvider()
    if (!provider.hasSecret()) {
      return res.status(503).json({ error: "Remote token is not configured", code: "remote-auth-unconfigured" })
    }
    const body = req.body
    const token = body && typeof body.token === "string" ? body.token.trim() : ""
    if (!token || !provider.verifySecret(token)) {
      return res.status(401).json({ error: "Invalid token", code: "invalid-token" })
    }
    const cookie = mintSessionCookie()
    if (!cookie) {
      return res.status(503).json({ error: "Remote token is not configured", code: "remote-auth-unconfigured" })
    }
    res.setHeader("Set-Cookie", sessionCookieHeader(cookie, requestIsHttps(req.headers)))
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error("[spec-yard] auth login error", e)
    return res.status(500).json({ error: "Login failed" })
  }
}
