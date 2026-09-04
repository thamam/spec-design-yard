# Security Policy

## Product threat model

The Security tab is a static STRIDE review of the drawn architecture, not
vulnerability, CVE, or dependency scanning.

Spec-Design-Yard is a **local architecture IDE**. Specs live on disk in the
project folder you choose. There is no multi-user mode and no cloud backend.
The default launch path (`npm run dev`, `npm run start`, `spec-yard` without
`--remote`) binds loopback (`127.0.0.1`) and has **no authentication** on
the project or store APIs.

Anyone who can reach that HTTP port can read and overwrite files under the
active project directory. Do not bind to `0.0.0.0` and do not expose the
default process on a public or untrusted network.

In-process controls (loopback `Host` checks, JSON Content-Type
requirements, project-epoch 409s) are defense-in-depth for a local tool,
not a substitute for network isolation.

## Opt-in remote access (Option A)

Remote access is **off unless you ask for it**. `SPEC_YARD_REMOTE=1`,
`npm run dev:remote`, or `spec-yard --remote` turns on a local-token login
and relaxes the Host allowlist just enough for this machine's Tailscale
MagicDNS name / tailnet IPs (and `SPEC_YARD_REMOTE_HOST` if you set it).
The process still binds `127.0.0.1`. The intended tunnel is **Tailscale
Serve** (private HTTPS on your tailnet). The phone must be on the same
tailnet.

**Do not use Tailscale Funnel, ngrok, or any public URL.** Funnel is out
of scope. A public URL plus this token is full read/write of the active
project folder.

How to enable:

```bash
npm run dev:remote          # or: spec-yard --remote [project-dir]
# stdout prints the token once (stored at ~/.specyard/remote-token, not in the project)
tailscale serve --bg 3000   # tailnet only — not `tailscale funnel`
```

Open `https://<your-machine>.<tailnet>.ts.net` on the phone, paste the
token, and you get the same workspace. Log out from the header — that
bumps a generation counter under the config dir so every copy of the
session cookie dies, not just this browser. If the session expires
mid-edit you return to login; the in-flight YAML is kept as a crash
draft and restored on the next hydration, and files on disk are not
wiped.

`spec-yard` never sends `~/.specyard/remote-token` to `:3000` until
`GET /api/auth/session` reports `"remote":true`. `spec-yard --remote`
refuses to attach when something else (or a local-mode instance)
already occupies the port.

Rotate the token: delete `~/.specyard/remote-token` (or
`$SPEC_YARD_CONFIG_DIR/remote-token`) and restart with `--remote`. The new
token is printed once. Old sessions die with the old token.

Local mode is unchanged: omit the flag and the APIs stay loopback-only
and unauthenticated.

### Residual risks (Option A)

- Anyone on your tailnet who can reach Serve and knows (or guesses) the
  token has the same power as you: full read/write of the active project.
- A stolen session cookie is full access until expiry (7 days), logout
  (which revokes every session, including copies), or token rotation.
  The cookie is HttpOnly + SameSite=Lax; Serve should be HTTPS so it is
  also Secure. Unauthenticated logout still clears this browser only.
- The token is printed to your terminal. Shell history and scrollback can
  retain it. Do not commit it; it must never live in the project folder.
- `SPEC_YARD_REMOTE=1` without a token file fails closed (APIs 503). It
  does not fall back to unauthenticated remote access.

### Later options (not in this release)

**Option B** — run the same binary on a VPS you control, still file-backed
against a project folder on that host. The auth seam (`lib/server-auth.ts`)
and store routes stay; you point Serve (or equivalent private HTTPS) at
that process. No rewrite.

**Option C** — a cloud backend would replace the file store
(`lib/remote-sync-store.ts` / `pages/api/store`) and can swap the auth
provider (the `AuthProvider` interface) without changing the workspace.
This release does not invent accounts, SaaS, or hosted storage.

## Supported versions

Security fixes land on the current development line (`main`). There is no
long-term support channel yet; do not treat a git tag as a supported
release until a v1 is cut.

## Reporting a vulnerability

Please report security issues privately via GitHub Security Advisories:

https://github.com/thamam/spec-design-yard/security/advisories/new

Do not open a public issue for an exploitable local-data or remote-code
problem. We will acknowledge privately and coordinate disclosure.
