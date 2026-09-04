# Changelog

All notable packaging and product changes are recorded here.
This project does **not** yet cut git tags or GitHub Releases; `package.json`
version is the pinable artifact until a v1 is tagged.

## Unreleased

### Added

- Opt-in remote access (Option A): `npm run dev:remote` / `spec-yard --remote`
  generates a local token, requires a mobile-usable login session, and
  allowlists this machine's Tailscale Host names. Default `npm run dev` /
  `spec-yard` stay loopback and unauthenticated. Tailscale Funnel / public
  URLs are out of scope.

## 0.2.0 — 2026-09-03

Packaging and security-posture release for a first paying-customer local
install. **Not a v1 tag** — open canvas / data-loss work remains out of
this track.

### Install

```bash
git clone https://github.com/thamam/spec-design-yard.git
cd spec-design-yard
npm install
npm run install-cli    # optional: puts `spec-yard` on PATH
npm run dev            # binds 127.0.0.1:3000
```

Open http://127.0.0.1:3000 (or http://localhost:3000). Production:

```bash
npm run build
npm run start          # binds 127.0.0.1:3000
```

See [docs/getting-started.md](./docs/getting-started.md) for project-folder
persistence and the browser-storage opt-out.

### Safety model

- Local architecture workspace, not SaaS. Data stays on disk in the
  project you pick (`main.spec.yaml` + `.specyard/` sidecars).
- Project and store APIs have **no authentication**. Launch paths default
  to loopback (`127.0.0.1`) so those APIs are not reachable from other
  interfaces.
- Host-header and JSON Content-Type guards are extra local hardening,
  not a reason to expose the port.
- Use is granted to licensed customers only. See [LICENSE](./LICENSE)
  (proprietary source-available; not MIT/Apache).

### Known limits

- No multi-user, sharing, or cloud sync.
- Not safe on the public internet or an untrusted LAN.
- Canvas / editor data-loss work is a separate track; do not treat 0.2.0
  as a finished v1.
- `next@15.5.25` is the landed pin. Latest `14.2.35` patches the 14.2.3-era
  CVE-2025-29927 class, but `npm audit` still flags later Next advisories
  that have no 14.x fix (ranges end at 15.5.x). 14.x is also past upstream
  EOL. Pages Router + React 18 are unchanged. A remaining moderate finding
  is Next's bundled `postcss`; clearing it would mean Next 16, which is out
  of this jump.
- No `v1.0.0` git tag or GitHub Release in this change.
- Branch protection is a repo-admin setting and is not configured here.

### Changed

- Add root `LICENSE` (proprietary source-available, all rights reserved).
- Pin `next` `14.2.3` → `15.5.25` (smallest jump that actually clears
  the Next advisory set; 14.2.35 still audited high).
- Default `npm run dev`, `npm run start`, screenshot CI, and e2e servers
  to `-H 127.0.0.1`.
- Document the local-only model above the fold in the README.
- Add `SECURITY.md` and Dependabot config.
