import type { NextApiRequest, NextApiResponse } from "next"
import {
  gateAuthEndpoint,
  isRemoteMode,
  sessionFromRequest,
  getLocalTokenProvider,
} from "../../../lib/server-auth"

export default function sessionHandler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" })
    }
    const access = gateAuthEndpoint(req)
    if (!access.ok) return res.status(access.status).json(access.body)
    const remote = isRemoteMode()
    return res.status(200).json({
      remote,
      authenticated: remote ? sessionFromRequest(req) : true,
      tokenConfigured: remote ? getLocalTokenProvider().hasSecret() : true,
    })
  } catch (e) {
    console.error("[spec-yard] auth session error", e)
    return res.status(500).json({ error: "Session probe failed" })
  }
}
