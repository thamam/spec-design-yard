"use client"

import { useState } from "react"
import { apiFetch } from "../../lib/api-client"

export function RemoteLoginPage({
  tokenMissing = false,
  expired = false,
}: {
  tokenMissing?: boolean
  expired?: boolean
}) {
  const [token, setToken] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || token.trim() === "") return
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body && typeof body.error === "string" ? body.error : `Sign-in failed (${res.status})`)
        setBusy(false)
        return
      }
      window.location.replace("/")
    } catch {
      setError("Could not reach the workspace")
      setBusy(false)
    }
  }

  return (
    <div
      className="min-h-screen w-screen flex items-start justify-center px-4 pt-16"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <main
        className="w-full max-w-[360px] rounded-md p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div
            className="flex items-center justify-center w-7 h-7 rounded"
            style={{ background: "var(--accent)" }}
            aria-hidden="true"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5" height="5" rx="1" fill="white" fillOpacity="0.9" />
              <rect x="8" y="1" width="5" height="5" rx="1" fill="white" fillOpacity="0.5" />
              <rect x="1" y="8" width="5" height="5" rx="1" fill="white" fillOpacity="0.5" />
              <rect x="8" y="8" width="5" height="5" rx="1" fill="white" fillOpacity="0.9" />
            </svg>
          </div>
          <h1 className="text-[16px] font-medium">Spec-Yard remote sign-in</h1>
        </div>

        {tokenMissing ? (
          <p className="text-[13px]" style={{ color: "var(--foreground-muted)" }}>
            Remote mode is on but no token file exists. On the host, restart with
            {" "}<span className="font-mono">npm run dev:remote</span> or
            {" "}<span className="font-mono">spec-yard --remote</span> and use the
            token printed to the terminal. Project files on disk are unchanged.
          </p>
        ) : (
          <>
            <p className="text-[13px] mb-3" style={{ color: "var(--foreground-muted)" }}>
              This workspace is on your laptop. Enter the remote token printed
              when you started with <span className="font-mono">--remote</span>.
              Your phone must be on the same Tailscale tailnet — this is not a
              public URL.
            </p>
            {expired && (
              <p
                data-testid="login-expired"
                className="text-[13px] mb-3"
                style={{ color: "var(--warning)" }}
              >
                Session expired. Sign in again — your project files were not
                wiped.
              </p>
            )}
            <form onSubmit={submit}>
              <label htmlFor="remote-token" className="block text-[12px] mb-1" style={{ color: "var(--foreground-muted)" }}>
                Remote token
              </label>
              <input
                id="remote-token"
                data-testid="remote-token-input"
                type="password"
                autoComplete="current-password"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={token}
                onChange={(e) => {
                  setToken(e.target.value)
                  setError(null)
                }}
                className="w-full rounded px-3 py-3 mb-3 font-mono text-[16px] outline-none"
                style={{
                  background: "var(--surface-overlay)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--foreground)",
                }}
              />
              <button
                type="submit"
                data-testid="remote-login-submit"
                disabled={busy || token.trim() === ""}
                className="w-full rounded px-3 py-3 text-[15px] font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
            {error && (
              <p data-testid="remote-login-error" className="mt-3 text-[13px]" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  )
}
