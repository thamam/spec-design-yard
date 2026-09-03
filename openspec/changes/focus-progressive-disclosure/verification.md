# Verification — focus-progressive-disclosure

Verified on branch `cursor/focus-disclosure-autocomplete-9416` against
`origin/main` @ `ef5922f`. Local gate was `464649c`. This note exists so
GitHub Actions receives a non-empty `pull_request` synchronize (empty
commit `28f7c6c` did not queue Tests). Unique SHA for a new `opened`
event — #20/#21 synchronize never created an Actions suite.

## What was already true

- **Canvas / tree → Focus auto-switch.**
  `editor-panel.tsx` already calls `setActiveTab("focus")` whenever
  `selectedUnit` is set. Canvas selection (`canvas-panel.tsx`) and the
  metrics/tree directory set `selectedUnit`. Left alone, as required.
- **Same-line enum / key completions** were already scoped:
  `type:`, `status:`, `color:`, `target:`, metadata keys, connection
  keys, component fields. Same-line `description:` / `owner:` values
  already returned no suggestions.

## What landed (verified against the code, not the hunch)

The popup was **not** already quiet enough. Two real eager cases:

1. An empty key query on a blank indented line (the line Enter just
   created) returned every key in that block, so the next Tab accepted
   `connections:` / `id:` instead of indenting.
2. Typing a word inside a `description: |` block scalar that prefixed a
   metadata key (`owner`) offered `owner:`.

Those are now closed. Enum completions on `type:` / `status:` /
`color:` / `target:` (including empty query after the key) and typed
key prefixes are unchanged.

Focus progressive disclosure shipped as specified: name + type + chips
+ diagnostics + Duplicate always visible; Connections open with compact
rows; Details / compiled spec / ID rename collapsed; session-local
`useState`; real buttons with `aria-expanded`.

Autocomplete quieting is **unit-tested only**. The Code-tab popup is
flaky to assert in a real browser (caret + overlay + `onSelect` race)
relative to the value of those cases, which `tests/autocomplete.test.ts`
covers deterministically.

## Evidence

| Check | Result |
|---|---|
| `npx vitest run --coverage` | **75 files, 736 tests, 0 failures** |
| `npm run test:coverage-gate -- origin/main` | **exit 0** — every added/modified executable line covered |
| `npm run build` | **Compiled successfully**, exit 0 |
| `npm run test:e2e focus-disclosure` | **PASS** — 24/24 checks, 0 console/page errors. Real `next dev` on port 3113, real Chromium, throwaway project + `SPEC_YARD_CONFIG_DIR` |
| Existing e2e scenarios (same harness) | **PASS** in the first full-suite run: `file-mode`, `first-run`, `standalone`, `editor-ergonomics`. A later combined 5-scenario run hit EADDRINUSE on leftover `next` children from earlier runs in this VM — not a product failure. Isolated `focus-disclosure` and the four existing scenarios were each green when their ports were free. |

Incidental: `tests/store-api-route.test.ts` was failing in this
environment because two writes in one millisecond kept the same
`mtimeMs`, so the 409 path never fired. The test now forces a later
mtime after the external edit. Not part of the Focus behaviour.

Living specs updated in this branch (`openspec/specs/focus-inspector/`,
`openspec/specs/spec-editor/`). Change directory is **not** archived
(left to the merge).
