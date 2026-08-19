# Implementation Tasks: File-backed, project-scoped spec storage

- [x] **Task 1: Store API route**
  - Create `pages/api/store/[...path].ts`: `GET`/`PUT` for
    `spec/main` (↔ `<projectDir>/main.spec.yaml` + `.specyard/spec-index.json`)
    and `meta/simulation_history|custom_presets` (↔ `.specyard/*.json`).
  - Read `SPEC_YARD_PROJECT_DIR` server-side; respond `501 {enabled:false}`
    when unset.
  - Whitelist-only key mapping + resolved-path containment check; lazy
    `mkdir` of `.specyard/`; write-tmp-then-rename for writes.
  - Tests: `tests/store-api-route.test.ts` — mock req/res against an
    `fs.mkdtemp` project dir: spec round-trip, meta round-trip, title/updatedAt
    recorded in spec-index, traversal and unknown-key rejection, 501 when env
    unset, corrupted JSON meta treated as missing.

- [x] **Task 2: Remote-sync store**
  - Create `lib/remote-sync-store.ts`: `RemoteSyncSpecStore implements SpecStore`
    delegating to `LocalStorageSpecStore`, mirroring writes via fire-and-forget
    `fetch` (errors logged, never thrown), plus `async loadFromServer(): Promise<boolean>`
    that pulls spec + meta into the local delegate and reports whether file mode
    is active.
  - `lib/spec-store.ts`: default export becomes the remote-sync instance.
    `lib/db.ts`: re-export `loadFromServer`.
  - Tests: `tests/remote-sync-store.test.ts` — mocked `global.fetch`: PUT
    fired with correct body on save, `loadFromServer` overrides local values,
    fetch failure / 501 → local-only behavior unchanged. Existing
    `tests/spec-store.test.ts` stays untouched and green.

- [x] **Task 3: Server-canonical hydration**
  - `components/workspace/workspace-layout.tsx`: in the mount effect, await
    `db.loadFromServer()` before reading `db.getSpec("main")` and before
    `setIsHydrated(true)`.
  - Tests: extend `tests/database-hydration-resilience.test.tsx` /
    `tests/auto-save-spec-title.test.tsx` — mocked-fetch case where server
    content wins over stale localStorage on mount; autosave after hydration
    PUTs to the server.

- [x] **Task 4: Documentation**
  - `docs/getting-started.md`: new "Working on a client repo" section — env
    var, file layout, suggestion to gitignore `.specyard/`.
  - `AGENTS.md` Gotchas: replace the "localStorage-only" line with the
    file-backed mode + sync-store seam description.

- [x] **Task 5: Quality gate**
  - Full `npm test` green (58 files / 395 tests); `npm run build` clean
    (`/api/store/[...path]` route registered). `npm run lint` not run (known
    broken in this repo).
  - E2E smoke: dev server launched with `SPEC_YARD_PROJECT_DIR` against a temp
    dir; PUT then GET round-trip via curl produced `main.spec.yaml` and
    `.specyard/spec-index.json` with correct contents.
