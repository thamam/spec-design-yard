# Verification — editor-and-canvas-ergonomics

Verified on branch `feat/backlog-sweep` at `7e92d1d`, against base
`origin/main` @ `3bd0211`. Three hardening rounds followed the first green
gate at `f8f8ee7`: a cross-model review found nine defects (round 1), a second
review returned BLOCK with seven more (round 2), and a third returned BLOCK
with seven more again (round 3). This table is the re-run after all
twenty-three landed.

## Evidence

| Check | Result |
|---|---|
| `npx vitest run --coverage` | **73 files, 646 tests, 0 failures** (round 2 at `4bdf54b`: 73 / 634; round 1 at `2a7bce6`: 73 / 617; at `f8f8ee7`: 72 / 596; baseline at `3bd0211`: 64 / 488) |
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

Every scenario now also **fails closed** before its first page action
(`scripts/e2e_guard.py`): it reads `/api/project` and refuses to run unless the
server is serving that scenario's own throwaway folder — or, for the two that
own no folder, is in the expected mode. These scripts type into the editor and
wait for autosave, which writes `main.spec.yaml` wherever the server points, so
run by hand against a real project the old scripts overwrote it and only
*recorded* the resulting check failures. Demonstrated against a decoy project:
unguarded, the run destroyed its spec and repointed the server; guarded, it
exits 2 having written nothing.

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
- *Line endings* — normalised to LF **once**, at the single seam foreign spec
  text enters app state: `normalizeLineEndings` (`lib/spec-model.ts`) applied
  in the hydration effect of `workspace-layout.tsx`, before `lastLoadedSpecRef`
  is set. From there textarea offsets, the indent handlers, `reconcileSpec` and
  undo/redo all share one coordinate space. design.md Decision 8 records the
  decision, the rejected alternative, and the deliberate user-visible
  consequence (a CRLF-authored spec shows a whole-file diff on first save —
  not a regression, `main` already does this on the first keystroke).
  **This reverses round 1's approach**, which translated between the two
  coordinate spaces to preserve CRLF: `reconcileSpec` is the only spec
  serialisation exit and `yaml`'s `doc.toString()` emits LF only, so every
  quick fix, Auto-Fix All, inspector edit and canvas drag already rewrote a
  CRLF file wholesale — preservation was faithful to a property nothing else
  kept. `domOffsetToRawOffset`, `rawOffsetToDomOffset` and `dominantEol` are
  deleted, as is `tests/editor-crlf-offsets.test.tsx`.
  Covered by `tests/line-ending-normalization.test.tsx` (file mode and
  standalone mode), which asserts on what was **persisted** — the PUT body or
  the localStorage entry — because a textarea normalises its own `value`, so a
  DOM-level assertion passes with or without the fix. Plus a real-browser e2e
  beat: CRLF bytes written to `main.spec.yaml` before the first load, Tab at
  the end of a line, then assertions that the saved file is LF-only and the
  indent landed at the end. The fixture must be seeded before any session
  exists — writing it behind a live session trips the app's external-change
  guard (a 409 and a refusal to overwrite, which is correct).
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
  the editor's, the editor wins: `diagnosticsMaxHeight` returns 0 rather than a
  height below the one-row minimum, and the body is then **unmounted**, not
  merely zero-height. A height-0 body still paints its `border-t` and `p-3`
  under border-box: a 25px empty strip beneath a header offering to "Collapse"
  what is already invisible. The resize handle goes with it, the label reads
  "Expand", and the header click is a no-op carrying a `title` saying the pane
  is too short. 72px remains the drag floor on any pane that can afford it.
  Covered by presence/absence assertions at 200px and 300px, by "a pane one
  pixel above the floor keeps a real one-row panel" (the 333px boundary the
  collapse rule must not eat), and by "at a 340px pane the body mounts at the
  one-row floor and can collapse".
- *Drag mechanism* — window-level `mousedown`/`mousemove`/`mouseup` and
  `touchstart`/`touchmove`/`touchend`/`touchcancel`. No `PointerEvent` and no
  `setPointerCapture` anywhere: jsdom 24 provides neither, and the requirement's
  intent is mouse-and-touch support, not a specific DOM API. design.md
  Decision 4, `tasks.md` and the spec requirement were reworded to describe
  what shipped; the note explaining why is kept.

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
  The invariant is stated precisely: the normalizer guarantees `angle: 0`,
  finite geometry, `opacity: 100` and `lineHeight: 1.25` on text, and
  *defaults* `strokeStyle` to `'solid'` — it spreads the element over that
  default, so the STRIDE threat zones keep their deliberate `'dashed'`. Only
  `angle` and finite geometry affect bounds. Covered by "the normalizer
  defaults strokeStyle without overriding a deliberate one".
- *Scene sync* — `updateScene` runs for an empty element list too. Skipping it
  left the previous spec's diagram drawn under a newly loaded empty one. The
  skip guarded nothing: the scene starts empty via `initialData`, and every
  write-back branch in `diffScene` sits behind a non-empty `updatedElements`,
  so an empty scene cannot round-trip back into the spec as a deletion.

**shared vocabularies**

- *One metadata registry* — `ALLOWED_METADATA_KEYS` in `lib/autocomplete.ts`
  is the single source: `lib/linter.ts` validates against it and
  `lib/yaml-highlight.ts` colours from it. Previously the linter accepted
  sixteen keys and the highlighter coloured five, so a valid `latency: 50`
  linted clean and rendered plain. The suggestion popup keeps a **curated
  subset** — six spellings of rate-limit is not a useful popup — and a test
  asserts the subset relationship, so the two lists can shrink or grow but
  cannot become independent registries again. Covered by "…is highlighted as a
  metadata key" (one case per linter-only key), "every key the linter accepts
  is a key the highlighter colours", and "the suggestion list is a curated
  subset of the allowed set".

## The gate's own guard

`tests/coverage-config-sync.test.ts` used to compare `vitest.config.ts`
against the very constant that builds it, so both sides moved together:
reducing `TRACKED_ROOTS` to `['lib/']` left it green while the gate silently
stopped checking `components/` and `pages/`. The required roots and policy
files are now **literals in the test**, independent of the module under test;
the same mutation now fails three assertions. `scripts/tracked-files.mjs`
itself joined the gate's tracked set, so the file that decides what the gate
checks no longer escapes it.

Two further holes in the gate closed in round 2:

- *C-quoted paths* — git quotes any path with non-ASCII bytes or control
  characters (`+++ "b/lib/caf\303\251.ts"`). The quotes survived into
  `isTrackedFile`, failed the extension test, and dropped the file from
  enforcement with no diagnostic — the gate went quiet on exactly the files it
  exists to check. `parseDiffLines` now decodes git's C-style quoting, and the
  CLI passes `-c core.quotePath=false` so the common case never quotes.
- *A self-passing verdict* — the whole of `main()` sat inside a `v8 ignore`
  block: base selection, the git call, the tracked-file filter, the coverage
  read and every exit code. Changing the range to `HEAD...HEAD` made the gate
  print "nothing to check" and exit 0, and neither the gate nor its own tests
  could notice, because the changed lines were the ignored ones. The decision
  now lives in an exported, side-effect-free `runGate(...)` returning an exit
  code, with a test per exit path and two asserting the range actually handed
  to git. The same mutation now fails two tests.
- *…and what the shim still owned* (round 3) — that first pass left the base
  default, the real `git diff` closure and the real coverage read inside the
  ignored block, so changing the default to `'HEAD'` would have reproduced the
  same silent pass. `runGate` now takes `argv` and resolves the base itself,
  and `gitDiff` / `readCoverageFile` are exported and tested for real against
  a temporary `git init` repo and a real report file. The ignored region is now
  the `import.meta.url` entry guard and the `process.exit` call, nothing else.
- *Mangled non-ASCII paths* (round 3) — the round-2 decoder pushed a literal
  character with `charCodeAt`, one byte. Real git under `core.quotePath=false`
  still quotes a path containing `"` and emits its non-ASCII characters
  literally inside those quotes, so `"b/lib/sa\"y-café.ts"` decoded to a
  mangled key: `isTrackedFile` still said true, `findCoverageEntry` could never
  match, and the gate failed closed on a fully covered file naming a path
  nobody could find. Literal characters are now UTF-8 encoded, iterating by
  code point so surrogate pairs survive; an emoji and a CJK path are asserted.

## What is not covered by the coverage number

**Carried forward, not covered by this change.** FIX 4's safety — that an
emptied scene never round-trips as component deletions — rests on
`@excalidraw/excalidraw` 0.18.1's `replaceAllElements` being a hard replace
(removed elements dropped, not soft-deleted). The deletion branch in
`lib/canvas-diff.ts` has no `compiledIds` guard, so a future release inside
the `^0.18.1` range that soft-deleted on replace could emit deletes into the
YAML if a non-empty `elements` prop had already been restored. The FIX 4 test
asserts against a spy, never a real Excalidraw. Also carried forward: the
suggestion popup opens on an empty prefix at column 0, and accepting there
splices a key ahead of the indentation and yields YAML the parser rejects —
pre-existing on `main`, deliberately not asserted by any test (see the comment
in `tests/editor-indent.test.ts`).

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
- **Merged diff, round 2** — a second Codex review returned BLOCK with seven
  findings, each verified by the orchestrator before being actioned: the
  coverage gate silently skipping git C-quoted paths; the gate's own verdict
  path being untestable and self-passing; ordinary typing rewriting a CRLF
  spec to LF (which reopened the round-1 line-ending decision and reversed
  it — Decision 8); a new test enshrining YAML the parser rejects; a 39px
  panel sliver that was neither one row nor collapsed; the metadata registry
  drift above; and three documents describing a pointer-capture drag that was
  never implemented.
- **Record correction (round 2)** — an independent red/green replay against
  `3657f52` found round 1's evidence overstated. "an updateScene failure is
  logged instead of tearing the canvas down" **passes on the pre-fix code**
  (the try/catch already existed; the rewrite only dropped a condition and
  re-indented, which is why the coverage gate wanted the line covered), as do
  two fixture self-checks; all are Group 2 guards, not evidence for a fix. And
  `tests/diagnostics-panel-resize.test.tsx` lost "a pane so short the reserve
  exceeds it never clamps below the minimum" — removed-superseded by FIX 7 and
  then FIX E — which round 1 did not record at all. The corrected
  classification is in `.orchestrator/integration/status`; the commit messages
  stand as written.
- **Merged diff, round 3** — a third Codex review returned BLOCK with seven
  findings: the e2e scenarios could autosave over a real project; a short pane
  still rendered a padded sliver labelled "Collapse"; the gate's base default
  and real closures were still ignored; the e2e never checked selection bounds
  after a multi-line Tab and had no multi-line Shift+Tab beat; the spec
  over-stated the normalizer invariant; a dead guard; and a decoder that
  truncated literal non-ASCII characters. **The selection finding turned out to
  be a behaviour defect, not a test gap**: in a real browser React commits the
  edited value asynchronously, so the `setTimeout(0)` caret restore ran against
  the old value, was clamped to the old length, and the commit then dropped the
  caret at the end — a multi-line Tab lost the selection over the block it had
  just indented. jsdom's fake timers hid it. The restore now records a pending
  selection and applies it in a layout effect after the commit.
- **Record correction (round 3)** — the round-2 record repeated round 1's
  Group-2 omission and carried stale coordinates. Three round-2 cases are
  green on base and are now filed as guards ("a pane one pixel above the floor
  keeps a real one-row panel", the `normalizeLineEndings` unit self-check, and
  the metadata suggestion-subset test); FIX F's red count was 5 in the record
  and is 7 in fact; FIX C's fifth case and two of FIX A's four were import-red,
  not behavioural; and every line number in the round-2 choke-point audit came
  from one commit before the code it described. The audit's conclusions were
  re-derived at HEAD and hold. Coordinates in the record now cite enclosing
  function and test names, because line numbers rot on the next commit — as
  these did twice inside one round.

One reviewer finding was **rejected** after verification: a claim that
`"use client"` in the new overlay is a stray directive (four existing
components already carry it).

A second rejection was **wrong and has been reversed**. Round 1 dismissed a
metadata-registry finding with "no such registry exists; `METADATA_KEYS` is the
single source and the highlighter imports it". That was false: `lib/linter.ts`
carried its own sixteen-key allow-list — `rate_limit` among them — while
`METADATA_KEYS` held five, so a valid `latency: 50` linted clean and rendered
plain. Round 2 consolidated them into `ALLOWED_METADATA_KEYS` (FIX F). The
lesson for the record: that rejection was written from the importing file
without grepping the linter, and a rejection is a claim needing the same
evidence as a fix.
