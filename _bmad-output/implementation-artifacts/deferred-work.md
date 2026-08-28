# Deferred Work

## Deferred from: code review (2026-08-17)

- **Duplicated parse-and-report across WorkspaceLayout and EditorPanel** — both components call `parseSpec` on every keystroke and maintain their own `droppedConnections` state; the layout already passes `parsedSpec` down and could pass the dropped entries along instead of a second derived source. Pre-existing architecture (both already parsed independently before PR #3); refactor is real but out of scope for the bug-fix PR.
- **Timing-fragile auto-save tests** — `tests/auto-save-spec-title.test.tsx` drives the real 1000ms debounce with wall-clock waits (~2.9s of suite time) instead of fake timers. Follows the pre-existing convention of `tests/database-hydration-resilience.test.tsx`; convert together if the suite starts flaking on loaded machines.

## Awaiting user decision (from the 2026-08-17 audit; presented in session, not yet ratified)

- ~~**STRIDE spec-vs-code (6 divergence points)**~~ **DECIDED 2026-08-18 (DEC-001, Fable-reviewed, high confidence):** fix code on substance (STRIDE-only per-diagnostic score in SecurityTab; itemized per-vuln mitigations + secrets check + compliance score in report), amend spec on cosmetics (keep current filename/title/labels; describe export as shared architecture+security audit), hybrid on sections (keep 7 incl. secrets, add collapsibility default-expanded for vulnerable, spec → "seven collapsible"), amend spec to per-category batch Auto-Fix. Implement via openspec change proposal, code + spec + test rewrites together.
- ~~**Auth theater**~~ **RESOLVED 2026-08-18 (DEC-002, user call, Fable concurred):** stripped. `auth-panel.tsx` and dead `prisma/` deleted; `workspace-layout.tsx` now hydrates on mount with always-on debounced autosave (the login was the persistence gate — signed-out users silently lost work); header no longer carries session props. Tests rewritten to mount-and-edit flows.
- **No-op UI** — Terminal/Share/Run/Settings/Preview/Search/word-wrap/Fullscreen buttons do nothing (`workspace-header.tsx:102-145`, `canvas-panel.tsx:92,166`, `editor-panel.tsx:2126-2144`); Save button only plays an animation (`workspace-header.tsx:33-38`); StatusBar is fully hardcoded (`workspace-layout.tsx:355-385`). Recommendation: remove dead buttons, wire or drop Save, wire or trim StatusBar.
- **Dead reconciler branches** — `brick-to-brick` / `gateway-to-gateway` fixes exist but are unreachable (not in FIXABLE_DIAGNOSTIC_CODES). Wire as fixable (recommended) or remove.
- **Top-level `comp.rate_limit`** — `lib/simulation.ts` reads it but the linter's `allowedComponentKeys` rejects it (PR #5 fixed `latency`/`throughput`, left this one since docs only sanction `rate_limit` under `metadata`). Decide schema direction.
- ~~**Login form personal placeholders**~~ **RESOLVED 2026-08-18 with DEC-002** — `auth-panel.tsx` deleted in the auth-theater strip; placeholders gone with it.

## Minor known quirks (no action proposed)

- `lib/simulation.ts:223` — `dropped` counts not-yet-sent packets mid-run; only consumed at completion, where metrics-tab recomputes it anyway.
- `lib/simulation.ts:253` — `formatMilestoneLog` prints `cumulativeLatency * 0.3` labeled "latency accumulated so far" — presentational, deterministic.
- `lib/simulation.ts` packet loss is fully deterministic (`Math.round(added * successProb)`) — simulation is illustrative, not stochastic.

