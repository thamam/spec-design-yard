# Verification — editor-and-canvas-ergonomics

Verified on branch `feat/backlog-sweep` at `f8f8ee7`, against base
`origin/main` @ `3bd0211`.

## Evidence

| Check | Result |
|---|---|
| `npx vitest run --coverage` | **72 files, 596 tests, 0 failures** (baseline at `3bd0211`: 64 files, 488 tests) |
| `npm run test:coverage-gate -- origin/main` | **exit 0** — every added or modified executable line covered |
| `npm run build` | **Compiled successfully**, exit 0 |
| `npm run test:e2e` | **4/4 scenarios PASS** — `file-mode`, `first-run`, `standalone`, `editor-ergonomics` |

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
  "Esc then Tab moves focus out of the textarea".
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
  merely fitted, so an empty spec's first component is an ordinary edit. e2e
  switches projects for real and asserts project B is already framed on load.
- *NaN invariant* — asserted at unit level ("every compiled element carries the
  normalizer fields and finite geometry") and at e2e level, where every fit
  route asserts zoom and scroll are finite. The NaN-bounds failure presents as a
  silently blank canvas, never an error, so it needs an explicit assertion.

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

Two reviewer findings were **rejected** after verification: a claim that the
metadata highlighter ignores a separate schema registry (no such registry
exists; `METADATA_KEYS` is the single source and the highlighter imports it),
and a claim that `"use client"` in the new overlay is a stray directive (four
existing components already carry it).
