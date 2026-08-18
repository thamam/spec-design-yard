# Verification: file-backed-project-storage

Date: 2026-08-18. Verified against the delta spec
(`specs/spec-persistence/spec.md`) with the full test suite
(58 files / 395 tests green), a clean `npm run build`, and a live end-to-end
smoke (dev server + curl round-trip).

## Requirement: Project-scoped file persistence — PASS

- *Scenario: Autosave writes the spec file* — PASS.
  - Unit: `tests/store-api-route.test.ts` › "spec round-trip" asserts
    `main.spec.yaml` contents and `.specyard/spec-index.json` title/updatedAt.
  - Client path: `tests/remote-sync-store.test.ts` › "saveSpec mirrors to the
    server with a PUT" asserts the PUT body; `tests/file-backed-hydration.test.tsx`
    › "autosave after hydration mirrors the edit to the server via PUT".
  - E2E: live `next dev` with `SPEC_YARD_PROJECT_DIR`, curl PUT → GET
    round-trip produced both files with correct contents.

## Requirement: Server-canonical hydration — PASS

- *Scenario: Repo file wins over stale cache* — PASS.
  `tests/file-backed-hydration.test.tsx` › "server spec wins over stale
  localStorage cache on mount" and "no stale-cache PUT is fired during
  hydration". Implementation: `workspace-layout.tsx` awaits
  `db.loadFromServer()` before `setIsHydrated(true)`; autosave is gated on
  `isHydrated`, so stale cache cannot be pushed over the file.
- *Scenario: First launch against a repo with no spec file* — PASS.
  `tests/remote-sync-store.test.ts` › "loadFromServer leaves local cache alone
  when the server has no spec file (404)"; `tests/database-hydration-resilience.test.tsx`
  › "saves edits from a fresh mount with no prior stored spec" (baseline path).

## Requirement: Metadata sidecar — PASS

- *Scenario: Simulation history survives across browsers* — PASS.
  - Route: `tests/store-api-route.test.ts` › "meta round-trip for
    simulation_history and custom_presets" (files land under `.specyard/`).
  - Client: `tests/remote-sync-store.test.ts` › "simulation history and
    presets mirror to meta endpoints" and "loadFromServer pulls spec + meta
    into the local delegate" (fresh-session restore path).

## Requirement: LocalStorage fallback when file mode is off — PASS

- *Scenario: Standalone launch unchanged* — PASS.
  `tests/remote-sync-store.test.ts` › "loadFromServer returns false on 501 and
  on fetch failure" + "mirror failures are swallowed, never thrown into the UI".
  After a 501/unreachable response the store disables mirroring, so standalone
  mode performs no further fetches. All 395 pre-existing + new tests pass,
  including the untouched `tests/spec-store.test.ts` baseline.

## Requirement: Path safety — PASS

- *Scenario: Traversal attempt rejected* — PASS.
  `tests/store-api-route.test.ts` › "rejects unknown keys and traversal
  attempts without writing" (asserts the project dir stays empty) and
  "rejects unsupported methods". Keys are whitelisted (`spec/main`,
  `meta/simulation_history`, `meta/custom_presets`); resolved paths are
  containment-checked against `SPEC_YARD_PROJECT_DIR`.

## Deviations from design.md

- The app-wide store instance is exported from `lib/remote-sync-store.ts`
  (not as `lib/spec-store.ts`'s default export) to avoid a circular import;
  `lib/db.ts` and `metrics-tab.tsx` were repointed. `spec-store.ts` no longer
  has a default export. Behavior is as designed.
- `workspace-layout.tsx`: during the async hydration window, user keystrokes
  win over the arriving server/local snapshot (guarded by `specTextRef`) —
  a fix for a race the async boundary introduced, caught by
  `tests/database-hydration-resilience.test.tsx`.

## Incident note

Mid-implementation, `git checkout` was mistakenly used to clear debug
instrumentation and reverted `components/workspace/workspace-layout.tsx` to
HEAD, clobbering a pre-existing uncommitted refactor (auth removal). The file
was reconstructed from a verbatim codegraph dump captured earlier in the
session plus HEAD's unchanged `StatusBar`; the full suite (395 tests) and
`tsc --noEmit` confirm the reconstruction is consistent with the rest of the
working tree.

## Addendum (2026-08-19): browser E2E, run from the user's chair

Drove the real app in headless Chromium (Playwright) against two live dev
servers — one with `SPEC_YARD_PROJECT_DIR` set (file mode), one without
(standalone) — with screenshots eyeballed at every key state.

**File mode — 12/12 checks passed:**

- Fresh mount with no repo file → built-in initial spec, canvas renders
- YAML edit in the editor → after the 1s debounce, `main.spec.yaml` and
  `.specyard/spec-index.json` exist in the client repo with the edit
- Broken connection target → linter diagnostic surfaces (issue count 16→17,
  red edge on canvas)
- Metrics tab → trace `web_client → orders_db` → "Run Performance Simulation"
  → run completes (50/50 packets) → `.specyard/simulation_history.json`
  contains the run
- Brand-new browser profile (empty localStorage) → editor loads the spec from
  the repo file, not the built-in default
- Zero console/page errors across the session

**Standalone mode — 5/5 checks passed:**

- API answers `{enabled:false}`; edit → localStorage; reload → spec restored;
  zero console/page errors

**Contract change forced by E2E** (recorded in design.md Decision 4): the
route's empty states moved from 404/501 to 200-with-marker
(`{found:false}` / `null` / `{enabled:false}`) because error statuses log to
the browser console on every normal launch. Client tolerates both shapes.

Full unit gate re-run after the change: 395/395 tests, clean `npm run build`.

## Addendum 2 (2026-08-19): adversarial + code review remediation

PR #10 underwent two review rounds — adversarial review (Claude Code) and
regular code review (Codex), both run against the pushed branch.

**Round 1 (both: CHANGES REQUIRED)** — fixed in commit `d6f26a7`:
cross-project spec bleed, keystroke-during-hydration wipe, silent mirror
failures, transient meta failure latching file mode off, no write-concurrency
control, symlink escape (verified by reviewer), prototype-chain key crash
(verified), EACCES masked as missing, MetricsTab pre-hydration staleness,
test singleton pollution, docs/spec wording drift.

**Round 2 (both: CHANGES REQUIRED)** — fixed in the follow-up remediation:
hydration lockout now gates ALL mutation paths (`guardedSetSpecText` +
`handleCanvasChange`), not just the textarea; the spec-index read/write path
gets the same realpath containment check as targets; the concurrency token is
a collision-free `rev` UUID (ms-granularity `updatedAt` made the round-1
token collidable and its test flaky); external deletion of a tracked file is
a 409, not a silent recreate; lost-ack 409s reconcile (GET → adopt fresh rev
→ retry once) instead of latching file mode off; meta PUTs are serialized
per URL; mirrors stay silent until `arm()` at hydration completion;
authoritative-null meta clears the cache (no cross-project metadata bleed);
write errors are structured 500s and tmp files stage in `.specyard/`;
`readSpecIndex` throws on non-ENOENT faults; docs recommend loopback binding.

**Post-round-2 gate:** 409+ unit tests green (see final suite run), clean
`npm run build`, browser E2E 17/17 re-run in both modes.
