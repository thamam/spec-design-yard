# Design: File-backed, project-scoped spec storage

## Decision 1: Launch contract is an env var, read server-side only

`SPEC_YARD_PROJECT_DIR=<path> npm run dev`. The value is read only by the API
route (`process.env.SPEC_YARD_PROJECT_DIR`), never shipped to the client
bundle.

- **Rationale**: `next dev` does not forward extra CLI args cleanly; an env
  var works with the stock `npm run dev` script and requires no wrapper
  script or package.json change. Keeping it server-side means the browser
  learns only "file mode on/off" from the route's responses, not a local
  filesystem path.
- **Rejected**: a `scripts/dev-with-project.mjs` wrapper parsing argv — more
  moving parts for the same outcome.

## Decision 2: File layout in the client repo

- `<projectDir>/main.spec.yaml` — raw YAML text at the repo root, matching the
  editor tab label. Pure YAML (no envelope) so it stays hand-editable and
  diffs cleanly.
- `<projectDir>/.specyard/` — sidecar directory for tool metadata:
  `spec-index.json` (title/updatedAt/rev keyed by spec id), `simulation_history.json`,
  `custom_presets.json`. Users can commit or gitignore it per preference.

- **Rationale**: the spec is the artifact of value and gets prime placement;
  metadata is tool state and stays out of the way in one dot-directory.
- **Rejected**: a single JSON envelope holding yaml + metadata — would make
  the spec non-YAML on disk and awkward to edit by hand.

## Decision 3: Keep the synchronous `SpecStore` interface

Add `RemoteSyncSpecStore implements SpecStore` (new `lib/remote-sync-store.ts`)
that delegates all sync reads/writes to the existing `LocalStorageSpecStore`
and mirrors every write to the server via fire-and-forget `fetch` (errors are
logged, never thrown into the UI). A separate `async loadFromServer()` pulls
server state into the local delegate; `workspace-layout.tsx` awaits it in the
mount effect before `setIsHydrated(true)`.

- **Rationale**: `SpecStore`'s sync methods have 6+ call sites in
  `metrics-tab.tsx` (used in render-time state initializers). A write-through
  cache keeps all of them untouched; on localhost the fetch latency is
  irrelevant because the cache serves reads. The existing `SpecStore`
  interface was explicitly designed as this seam.
- **Rejected**: making `SpecStore` fully async — purer, but churns
  `metrics-tab.tsx` and `workspace-layout.tsx` for no behavioral gain.

## Decision 4: One catch-all API route with a whitelist

`pages/api/store/[...path].ts` (pages router, matching the app):

- `GET/PUT /api/store/spec/main` ↔ `main.spec.yaml` (+ `spec-index.json` on PUT)
- `GET/PUT /api/store/meta/simulation_history` ↔ `.specyard/simulation_history.json`
- `GET/PUT /api/store/meta/custom_presets` ↔ `.specyard/custom_presets.json`

Only whitelisted keys resolve to files; the resolved path is verified to stay
inside `SPEC_YARD_PROJECT_DIR`. Quiet-by-design status contract (revised after
E2E testing showed 404/501 statuses log to the browser console on every normal
launch): missing spec → `200 {found:false}`, missing/corrupt meta → `200 null`,
file mode off → `200 {enabled:false}`. The client tolerates both marker bodies
and error statuses, and the client stays in localStorage-only mode when file
mode is off.

- **Rationale**: a whitelist (not arbitrary path mapping) makes traversal
  impossible by construction; the catch-all keeps it to one file.
- **Rejected**: passing arbitrary relative paths from the client — needless
  attack surface even for local dev.

## Decision 5: Hydration order — server wins on mount

`loadFromServer()` runs before the existing localStorage hydration in
`workspace-layout.tsx`. If the server returns a spec, it overwrites the local
cache and the editor seeds from it; autosave then can't push stale cache over
the repo file.

- **Rationale**: the repo file is the source of truth when file mode is on;
  localStorage is only a cache and a fallback for when the write mirror fails.
- **Rejected**: last-write-wins by timestamp — clock skew and cross-machine
  edge cases for zero benefit in a local, single-user tool.

## Decision 6: Optimistic concurrency and mirror discipline (post-review)

Added during adversarial-review remediation (rounds 1-3 on PR #10):

- Every mirrored write checks `res.ok`; HTTP failures are logged loudly and
  never thrown into the UI.
- Spec PUTs are serialized through a promise chain and carry a `baseRev`
  token (a `randomUUID` minted per server write, echoed in the PUT ack) —
  millisecond-granularity timestamps proved collidable. The index also
  records file mtime so raw external edits (which don't touch the index)
  are caught. External deletion of a tracked file 409s.
- A 409 caused by a lost ack reconciles: re-GET, and if the server holds
  exactly what our previous PUT sent, adopt the fresh rev and retry once.
  Genuine divergence latches mirroring off with a reload instruction.
- Meta PUTs are serialized per URL; mirrors stay silent until `arm()` fires
  at hydration completion, and pre-hydration meta writes are stashed and
  flushed (local + server) on arm.
- Legacy index entries without a `rev` self-heal on GET (a rev is minted);
  a bare PUT against a rev-less entry is refused (409 `legacy-index`).
- All mirrored paths — spec, meta, and the spec-index itself — pass the
  realpath containment check, not just the request target.

- **Rationale**: file mode must never silently lose or clobber user data;
  every failure either heals (reconcile, migration) or stops loudly
  (latch + reload instruction).
- **Rejected**: ETag/If-Match headers and mtime-only tokens — the rev UUID
  is simpler, collision-free, and portable across filesystems.
