# Verification — editor-and-canvas-ergonomics

Verified on branch `feat/backlog-sweep` at `2a7bce6`, against base
`origin/main` @ `3bd0211`. This supersedes the `f8f8ee7` record: a
cross-model review of the merged diff found nine defects the per-lane
reviews missed, and this table is the re-run after all nine landed.

## Evidence

| Check | Result |
|---|---|
| `npx vitest run --coverage` | **73 files, 617 tests, 0 failures** (at `f8f8ee7`: 72 / 596; baseline at `3bd0211`: 64 / 488) |
| `npm run test:coverage-gate -- origin/main` | **exit 0** — every added or modified executable line covered |
| `npm run build` | **Compiled successfully**, exit 0 |
| `npm run test:e2e` | **4/4 scenarios PASS** — `file-mode`, `first-run`, `standalone`, `editor-ergonomics` |

All four steps were run through
`.orchestrator/bin/lane-verify.sh integration <worktree> 3140 origin/main`,
which records each step's exit code independently:
`STEP_UNIT=0 STEP_COVERAGE_GATE=0 STEP_BUILD=0 STEP_E2E=0`, `EXIT_CODE=0`.

The e2e run is full-system: a real `next dev` server per scenario on its own
port, a real headless Chromium, real project folders on disk, and assertions on
both the DOM and the files written. Every scenario asserts zero console and page
errors.

## Requirement coverage

**spec-editor**

- *Tab key behaviour* — `lib/editor-indent.ts` (`applyIndent`), unit
  `tests/editor-indent.test.ts`, e2e beats "Tab inserts a 2-space indent at the
  caret", "focus stays in the spec textarea after Tab", "Shift+Tab outdents the
  current line", "Tab over a multi-line selection indents every selected line",
  "Esc then Tab moves focus out of the textarea". A Tab over a selection that
  spans a newline, and every Shift+Tab, route to the indent handler **before**
  the suggestion popup is consulted; a collapsed caret with the popup open
  still accepts. Covered by "Tab routing when the suggestion popup is open" in
  `tests/editor-indent.test.ts`, whose fixture sits at a 4-space indent so
  component-field autocomplete is genuinely live.
- *Line endings* — the textarea's offsets index an LF-normalised view of the
  text; the spec text is the file's own, CRLF included. Every handler that
  splices at an offset (Tab, Shift+Tab, Enter, suggestion accept) converts
  first, via `domOffsetToRawOffset` / `rawOffsetToDomOffset` in
  `lib/editor-indent.ts`. CRLF is preserved rather than normalised away —
  reading `textarea.value` would have been simpler but would push an LF-only
  string through autosave, rewriting the user's file just as silently as the
  bug did. Enter inserts the file's own EOL. Unit
  `tests/editor-crlf-offsets.test.tsx`, whose first test asserts that jsdom
  really does report the LF-normalised view, so the fixture cannot rot into a
  no-op. No e2e beat: the browser normalises a typed or filled value to LF
  before anything observable happens, so an honest e2e would need a CRLF
  fixture written to disk and carried in by hydration — recorded as carried
  forward in `.orchestrator/integration/status`.
- *Enter key behaviour* — `detectIndentContext` extracted from
  `lib/autocomplete.ts` and shared with autocomplete, unit
  `tests/editor-enter-indent.test.ts`, e2e beat "Enter after a block-opening
  line indents one level deeper". The scenario expecting sibling indent inside
  `connections:` was **amended** during the change: the maintainer ruled for
  align-under-the-key (`- target: db` → 8, `- id: inbox` → 6), recorded in
  design.md Decision 2 with the rejected alternative.
- *Syntax colour* — `lib/yaml-highlight.ts` + `components/workspace/yaml-highlight-overlay.tsx`,
  unit `tests/yaml-highlight.test.ts` and `tests/yaml-highlight-overlay.test.tsx`,
  e2e beats for computed colour distinctness, pixel alignment, scroll sync, and
  typing while scrolled.

**diagnostics-panel**

- *Resizable panel* — `components/workspace/editor-panel.tsx`, unit
  `tests/diagnostics-panel-resize.test.tsx`, e2e beats that record which
  ADD DESCRIPTION rows are clipped **before** the drag and then click one from
  that recorded set. The collapse toggle is unchanged and covered by "the header
  click still collapses and re-expands at the dragged height".
- *Floor conflict* — on a pane too short to pay both the diagnostics floor and
  the editor's, the editor wins: `diagnosticsMaxHeight` floors at 0, so the
  panel collapses rather than leaving the textarea a box smaller than its own
  padding. 72px remains the drag floor on any pane that can afford it. Covered
  by "a pane too short for both floors gives the space to the editor" and "a
  pane that misses the floors only just still prefers the editor".

**diagram-canvas**

- *Zoom to fit, three routes to one implementation* —
  `components/workspace/excalidraw-canvas.tsx`, `canvas-panel.tsx`,
  `workspace-layout.tsx`; unit `tests/canvas-zoom-to-fit.test.tsx`; e2e beats
  asserting the footer button, the toolbar button and `Shift+1` all produce the
  same zoom **and** the same scroll position.
- *Shortcut suppression* — `Shift+1` is registered in the capture phase so it
  wins against Excalidraw's own `Shift+1` binding, and is suppressed inside any
  input or textarea. Covered by "typing ! in the YAML textarea never yanks the
  canvas" and, as a regression guard, "undo still reaches the spec textarea".
- *One fit per loaded spec* — the latch records an identity as **handled**, not
  merely fitted, so an empty spec's first component is an ordinary edit. A fit
  already scheduled for a previous identity is cancelled the moment the
  identity changes — including on the empty-spec path, which used to return
  with the old timer still armed, letting it fire and rewind the latch. e2e
  switches projects for real and asserts project B is already framed on load;
  that beat covers the **reloaded** path only (the picker calls
  `window.location.reload()`, so the canvas remounts), which its own comment
  now says plainly. Same-mount identity change is covered at unit level.
- *NaN invariant* — asserted at unit level ("every compiled element carries the
  normalizer fields and finite geometry") and at e2e level, where every fit
  route asserts zoom and scroll are finite. The NaN-bounds failure presents as a
  silently blank canvas, never an error, so it needs an explicit assertion.
  The invariant now covers the **coordinates** as well as `angle`: YAML spells
  NaN and the infinities as `.nan` / `.inf`, both of which pass a
  `typeof === 'number'` check, so a component's `x`/`y` must be
  `Number.isFinite` or it falls back to the computed layout exactly as a
  missing coordinate does. Fixture `POISONED_YAML` in
  `tests/canvas-zoom-to-fit.test.tsx` is parsed through `parseSpec`, and a
  companion test asserts the fixture really does yield non-finite numbers.
- *Scene sync* — `updateScene` runs for an empty element list too. Skipping it
  left the previous spec's diagram drawn under a newly loaded empty one. The
  skip guarded nothing: the scene starts empty via `initialData`, and every
  write-back branch in `diffScene` sits behind a non-empty `updatedElements`,
  so an empty scene cannot round-trip back into the spec as a deletion.

## The gate's own guard

`tests/coverage-config-sync.test.ts` used to compare `vitest.config.ts`
against the very constant that builds it, so both sides moved together:
reducing `TRACKED_ROOTS` to `['lib/']` left it green while the gate silently
stopped checking `components/` and `pages/`. The required roots and policy
files are now **literals in the test**, independent of the module under test;
the same mutation now fails three assertions. `scripts/tracked-files.mjs`
itself joined the gate's tracked set, so the file that decides what the gate
checks no longer escapes it.

## What is not covered by the coverage number

`bin/spec-yard` and `scripts/*.py` cannot appear in a v8 coverage map. They are
exercised by the e2e suite, not by the gate. The gate also enforces **line**
coverage: an added line carrying no statement start is not a checkable point.
Both limits are stated in design.md.

## Review

Cross-model, non-Claude reviewers throughout (Claude implemented every lane):

- **Lane 0** — GLM 5.3 and Kimi. Both independently found the coverage gate
  failing **open**: `+++ ` header detection could not distinguish a file header
  from an added line whose content began `++ `, silently dropping a file from
  enforcement. Fixed by gating header recognition on hunk state.
- **Lane A** — Codex, three rounds. Found Enter block detection missing
  comment-terminated and list-item openers, multi-line outdent collapsing the
  selection, quoted and unterminated identifiers mishandled, case-sensitive
  value highlighting, and blank-line indent loss. All reproduced by the
  orchestrator before being actioned.
- **Lane B** — Codex, three rounds. Found `Shift+1` being swallowed by
  Excalidraw's own binding, the fit latch advancing before its own timer and
  losing the fit outright, an empty spec never marking its identity handled, the
  initial panel height escaping the pane clamp, a `touchcancel` leak, and an e2e
  beat that clicked whichever button was visible rather than one that had been
  clipped.

- **Merged diff** — a final cross-model review of the integrated branch, after
  both lanes were green, found nine defects the per-lane reviews had missed.
  The orchestrator reproduced the two most serious by executing the code
  before they were actioned: Tab and Enter splicing LF-based DOM offsets into
  a CRLF spec (then autosaving the corruption), and `.nan` / `.inf`
  coordinates reaching Excalidraw through a `typeof === 'number'` guard. The
  other seven: autocomplete outranking a multi-line indent, an emptied spec
  leaving the old diagram drawn, a stale fit timer resurrecting the previous
  identity, a coverage-policy guard that could not detect its own drift, a
  panel clamp that honoured neither floor on a short pane, and two e2e
  assertions that could not fail. All nine are fixed at `2a7bce6`; the
  per-fix red/green evidence, in three groups (behaviour-red then green;
  green-on-base regression guards; changes with no unit-level red), is in
  `.orchestrator/integration/status`.

Two reviewer findings were **rejected** after verification: a claim that the
metadata highlighter ignores a separate schema registry (no such registry
exists; `METADATA_KEYS` is the single source and the highlighter imports it),
and a claim that `"use client"` in the new overlay is a stray directive (four
existing components already carry it).
