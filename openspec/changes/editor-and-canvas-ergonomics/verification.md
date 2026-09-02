# Verification — editor-and-canvas-ergonomics

Verified on branch `feat/backlog-sweep` against base `origin/main` @
`3bd0211`. The gated commit is the one on the `HEAD=` line of
`.orchestrator/integration/status`, filled in below from that line and from
nothing else. Four rounds running, this paragraph named a commit the gate had
not run against — three times by reasoning about which it must have been, and
once by inventing a second run the file cannot hold (`lane-verify.sh`
truncates `status` on every run, so it records exactly one).

<!-- GATED COMMIT: copy the HEAD= line from status verbatim, nothing more. -->
**Gate: `HEAD=e57fed1a9c4827dc58531364a7c2f5a6763abf8a`**, STEP_UNIT=0 STEP_COVERAGE_GATE=0
STEP_BUILD=0 STEP_E2E=0, EXIT_CODE=0.
This file's own commit is one later and changes only the line above; the gate
was re-run on it too, and `.orchestrator/integration/status` holds that run.

Seven hardening rounds followed the first green gate at `f8f8ee7`: nine
defects (round 1), seven (round 2), seven (round 3), nine (round 4), eleven
(round 5), eight (round 6) and eight (round 7), each a BLOCK from an
independent cross-model review of the merged diff.

Five of those are defects **this work introduced**, recorded as regressions
rather than finds: round-3 FIX M's caret restore left its pending-selection
ref armed after a no-op indent, so the stale range stole focus on the next
unrelated commit (fixed in round 4); round-4 FIX U tied the panel's floor to
the Auto-Fix-All strip, which made the panel's *existence* depend on the
spec's content (fixed in round 5 by FIX JJ) and its *height* likewise when
dragged small (fixed in round 6 by FIX RR); and round-5 FIX HH shipped with a
test that passed on the pre-fix code, so the effect it added was unevidenced
until round 6 rewrote the test to drive the case it exists for; and round-6 FIX RR, hiding the
Auto-Fix-All strip on a short panel, removed the only route to the bulk fix,
which round 7 restored as a compact header button (the record's claim that
"the row's own action button remains" was true per issue and false for the
bulk action).

## Evidence

| Check | Result |
|---|---|
| `npx vitest run --coverage` | **73 files, 691 tests, 0 failures** (round 6: 73 / 681; round 5: 73 / 674; round 4: 73 / 658; round 3: 73 / 646; round 2: 73 / 634; round 1: 73 / 617; at `f8f8ee7`: 72 / 596; baseline at `3bd0211`: 64 / 488) |
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

Every scenario **fails closed** before it writes anything
(`scripts/e2e_guard.py`, itself covered by `scripts/test_e2e_guard.py`, which
`run-e2e.sh` runs before it starts any server). These scripts type into the
editor and wait for autosave, which writes `main.spec.yaml` wherever the server
points, so run by hand against a real project the old scripts overwrote it and
only *recorded* the resulting check failures.

Round 3 added the server-side guard; round 4 found three scenarios that wrote
*before* theirs and closed each hole:

- `editor-ergonomics` and `file-mode` require `mode == "project"` with a
  realpath match on their own folder, before the first page action.
- The project-B beat seeds a spec into a folder no server-side check can see
  (it is not yet the folder being served), so it refuses to overwrite any
  `main.spec.yaml` lacking this harness's marker comment.
- `standalone` used to PUT the browser-storage opt-out and *then* check the
  mode — validating the state it had just created. Against a real project-mode
  server it flipped the live session, persisted standalone into `config.json`,
  and exited 0. It now requires `unconfigured` before the PUT.
- `first-run` and `standalone` mutate server-side config, and `/api/project`
  cannot tell a throwaway config dir from a real install that has simply never
  been configured. Both now refuse unless `SPEC_YARD_E2E_CONFIG_WRITES_OK=1`,
  which only `run-e2e.sh` sets.

Demonstrated against decoy servers in both rounds: unguarded, the runs
destroyed a project's spec, repointed its configured project, and flipped a
project-mode install to standalone while reporting success; guarded, each
exits 2 with the decoy byte-identical.

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
- *IME composition* — Enter and Tab belong to an in-flight IME composition:
  they commit or cycle a candidate. `handleKeyDown` returns immediately on
  `isComposing` (and the legacy `keyCode === 229`), so a Japanese or Chinese
  user's Enter no longer throws the composition away and inserts an indented
  newline instead.
- *Enter mid-line* — the text after the caret moves to the new line, so it
  cannot decide whether the line being split opens a block.
  `detectIndentContext` takes `upToCursor`, which Enter passes and autocomplete
  does not: `  metadata:|owner: Tomer` now nests `owner:` instead of making it
  a sibling.
- *Blank-line indent* — `detectIndentContext` reports a whitespace-only line's
  literal indent, which Enter needs so a blank line inside a block keeps its
  indentation. `origin/main`'s inline autocomplete detector reported 0, so
  sharing one implementation silently changed what the popup offers. The
  detector takes a `blankLine` option; autocomplete passes `"zero"` and Enter
  keeps the literal default. The proposal promised extraction, not
  reimplementation. Covered by "autocomplete offers nothing at the end of a
  whitespace-only line".
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
- *Floor conflict* — the panel is one whole issue row or nothing. On a pane
  that cannot pay that floor it is unmounted, not merely zero-height: a
  height-0 body still paints its border and padding as an empty strip beneath
  a header offering to "Collapse" what is already invisible. The resize handle
  goes with it, the label reads "Expand", and the header click is a no-op
  carrying a `title` saying the pane is too short.
- *The Auto-Fix-All strip* — chrome above the scrollable body, not a row
  inside it (inside, it ate the whole floor and clipped the first issue row),
  and paid for out of the panel's own height rather than added to it (added,
  the panel's height moved with the spec's content, which resized the editor
  mid-edit and desynchronised the highlight overlay from the textarea's
  scroll). It shows only when the panel is ALREADY tall enough to carry it and
  a whole issue row, so it can never push the panel taller: gating it on the
  pane's ceiling instead meant a panel the user had dragged small still grew
  when a fixable issue appeared. Neither the panel's presence nor its height
  depends on what the spec contains; only the strip's does.
  While the strip is hidden a compact **Auto-Fix All (N)** button appears in
  the panel header. `handleFixAll` is wired to exactly one element, so hiding
  the strip otherwise removed the bulk fix from the UI entirely — each issue
  row keeps its own action either way, which covers the per-issue fix and not
  the bulk one, and this record said otherwise until round 7.
  Covered by "the panel appears at the same pane height whatever the spec
  contains", "a pane that fits the row but not the strip drops the STRIP, not
  the panel", "a clean spec and a fixable one occupy the same panel height",
  "below the threshold the header carries a compact stand-in", "above the
  threshold only the strip carries it, never both", and the real-browser beats
  "at the floor the strip is gone, not squeezing the row" and "dragging back
  up past the threshold brings the strip back". Every jsdom height in that
  suite is derived in a comment from the two constants rather than from a
  remembered number.
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
  merely fitted, so an empty spec's first component is an ordinary edit. A
  scheduled fit is cancelled when the identity changes **and** when the spec is
  emptied under the same identity — the second case was missed until round 4
  and left a timer calling `scrollToContent([])`, whose `getCommonBounds` is
  non-finite: the blank canvas this change names as its top risk. The callback
  also refuses to fit an empty scene. The derivation feeding all of it
  (`loadedSpecId` → `specIdentity`) is now covered against the real
  `WorkspaceLayout` with a hand-released hydration response, so deleting it
  fails a test; until round 4 every fit test handed the canvas a fabricated
  identity. A fit for a previous identity is cancelled the moment the identity
  changes — including on the empty-spec path, which used to return
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
  missing coordinate does — and so does one beyond `MAX_COORD` (1e7). Finite
  is not sufficient: `1e308` and `-1e308` both pass `Number.isFinite`, but the
  arrow between two such components has a `dx` of `-Infinity`, and its width
  and points poison `getCommonBounds` exactly as a NaN would. Fixture
  `POISONED_YAML` in
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
in `tests/editor-indent.test.ts`). Added in round 4:
`extractComponentIds` in `lib/autocomplete.ts` accepts only unquoted component
ids while `lib/yaml-highlight.ts` recognises quoted ones — the regex is
identical on `origin/main`, so this predates the change and is not drift of
the kind FIX F fixed. Added in round 6: `lib/yaml-highlight.ts` recognises
quoted *values* (`id: "api"`) but not quoted *keys* (`"id": api`), which
render plain — valid but rare YAML; and `unquoteGitPath` throws a
`RangeError` on a path ending in a lone backslash, unreachable from real git
output (which escapes a backslash as two) and pre-existing rather than
introduced by the round-5 escape work.

**Touch resize is covered in a real browser** as of round 6, through a CDP
`Input.dispatchTouchEvent` sequence on the handle — Playwright exposes no
touch-drag helper, so the beat drives the protocol directly and detaches the
session afterwards (left attached it puts the page in touch-emulation mode and
the later keyboard beats stop landing). Invalid-YAML fallback is covered too:
a beat types a broken spec and asserts the overlay still renders the text, the
diagnostics panel reports the syntax error, and the editor stays usable.

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
- **Merged diff, round 4** — a fourth review returned BLOCK with nine
  findings, two of them reproduced by the orchestrator with probes before
  briefing. The two blockers: a no-op Shift+Tab left round-3 FIX M's
  pending-selection ref armed, so the stale range stole focus and re-selected
  an abandoned block on the next unrelated commit (a regression **this work
  introduced**, not a pre-existing defect); and the standalone e2e scenario
  validated the server state it had itself just created, flipping a real
  project-mode install to standalone and exiting 0. The rest: a spec emptied
  under its own identity still fired a fit at an empty scene; the panel floor
  forgot the Auto-Fix-All banner; no test covered the `loadedSpecId` →
  `specIdentity` derivation; a window resize destroyed the dragged height; the
  extracted indent detector silently changed autocomplete on a blank line; and
  three OpenSpec tasks were unchecked while this file called them done.
- **Record correction (round 4)** — the round-3 record had nine errors, each
  re-verified before correction: FIX K's red count (six behavioural, not
  three), three `gitDiff`/`readCoverageFile` cases misfiled as green-on-base
  when they were import-red, one that passed *vacuously* on base (calling
  `undefined` satisfies `.toThrow()`), two `resolveBase` cases in neither
  group, three unrecorded behavioural reds for FIX L, an unnamed test for FIX
  P, a HEAD attributed to the wrong commit, and the FIX J e2e claim that every
  scenario "exits 2 having written nothing" — untrue for three of them until
  round 4 fixed it. That claim has been rewritten above rather than deleted.
- **Merged diff, round 5** — a fifth review returned BLOCK with eight
  findings, and an independent proof of the round-4 tests added three more.
  Three are user-facing: Enter was intercepted during IME composition, Enter
  mid-line decided the block from the whole line rather than the half being
  left behind, and a pair of absurd-but-finite coordinates produced infinite
  arrow geometry. One is a regression from round-4 FIX U (see the header). The
  rest close harness and gate holes: the ergonomics scenario switched projects
  — a config write — without the opt-in the other two scenarios demand; the
  path decoder was missing four of git's C escapes, so a BEL in a filename was
  attributed to a different file's coverage; a window blur mid-drag could
  leave the panel resizing; and the Esc escape hatch survived edits the user
  did not type.
- **Record correction (round 5)** — the round-4 record had eight errors, each
  re-verified before correction: a test filed as green-on-base that is red on
  base, one green-on-base test in neither group, two jsdom reds omitted from
  FIX U (which recorded only its real-browser red), a FIX W red quotation that
  does not reproduce (the test fails first on a FIX U number, so the quoted
  assertion was never the one that failed), two renamed and re-anchored tests
  with no supersession recorded, a *Floor conflict* bullet citing both
  superseded test names and both old numbers, a HEAD attributed to a commit
  the gate never ran against, and FIX X filed as mutation-only when it is
  behaviour-red on base. The header and the floor bullet above are the
  rewrites; the rest are in `.orchestrator/integration/status`.
- **Merged diff, round 7** — a seventh review returned BLOCK with seven
  findings and an independent proof added four. One user-facing: three YAML
  shapes the block detector read wrongly (block-scalar openers, a `#` inside a
  key, a quoted list scalar). One user-facing corner introduced by round 6:
  hiding the Auto-Fix-All strip removed the only route to the bulk fix. Two
  harness overwrite paths where a freshness check recorded a failure and let
  the run continue to the autosave. The rest are test quality: a Shift+1
  dispatch that never reached its handler, an alignment beat that never
  wrapped a line, a touch beat that had lost its precondition, and a
  hand-kept scenario list with nothing binding it to the call sites.
- **Record correction (round 7)** — the round-6 record had five errors: a
  quoted red inverted, a fix credited with one red when it had four, a
  non-existent commit hash, a corrections count off by two, and the
  **fourth consecutive** wrong commit attribution — this time by claiming two
  gate runs are recorded in a file that holds one, since `lane-verify.sh`
  truncates it. The header no longer reasons about the gated commit at all;
  it carries the `HEAD=` line.
- **Merged diff, round 6** — a sixth review returned BLOCK with six findings
  and an independent proof added two more. One reachable blocker: the three
  MANUAL fit routes had no empty-scene guard, so an empty spec plus any fit
  control blanked the canvas. One user-facing edge: a throwing fit left its
  identity unhandled, so the next ordinary edit re-fitted and reset the
  viewport. One harness hole that made the suite lie: a mistyped scenario
  selector ran nothing and printed "all e2e scenarios passed". Plus the
  `"use client"` directive above, two e2e gaps now closed rather than
  excused, and two regressions of this work's own (FIX RR, FIX SS — see the
  header).
- **Record correction (round 6)** — the round-5 record had a boundary pair
  inverted (the green-on-base and red-on-base halves swapped), a test count
  off by one, an unclassified red, and a **third** consecutive commit
  attribution error: this file claimed a gated commit the gate had not run
  against. The rule adopted, and followed here, is to copy the `HEAD=` line
  out of the gate's own `status` file rather than reason about which commit it
  must have been — and, because the docs commit necessarily follows the code
  commit, to run the gate again on the docs commit so the two agree.

Two classes of never-red assertion the review flagged are deliberate and
recorded as such: the Group-2 regression guards, each labelled in its own
source with why it is kept and that it is not evidence; and the fourteen cases
in `scripts/test_e2e_guard.py`, which are new-surface tests of a module this
work introduced, not evidence of a behaviour change.
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

Round 1 recorded two **rejections**. Both have since been overturned, and
both for the same reason: the rejection was argued from the code alone
without checking the project's own stated rules or the other file involved.

- The metadata-registry finding, rejected with "no such registry exists" —
  false; `lib/linter.ts` carried its own sixteen-key allow-list. Overturned in
  round 2 (FIX F).
- The `"use client"` finding, rejected because four existing components carry
  the directive. That was the wrong test: `_bmad-output/project-context.md`
  says this is the Pages Router, that such directives are inert, and — in
  those words — "don't add more". The new overlay had added one. Overturned in
  round 6 (FIX PP); the directive is removed, with no behaviour change.

A second rejection was **wrong and has been reversed**. Round 1 dismissed a
metadata-registry finding with "no such registry exists; `METADATA_KEYS` is the
single source and the highlighter imports it". That was false: `lib/linter.ts`
carried its own sixteen-key allow-list — `rate_limit` among them — while
`METADATA_KEYS` held five, so a valid `latency: 50` linted clean and rendered
plain. Round 2 consolidated them into `ALLOWED_METADATA_KEYS` (FIX F). The
lesson for the record: that rejection was written from the importing file
without grepping the linter, and a rejection is a claim needing the same
evidence as a fix.
