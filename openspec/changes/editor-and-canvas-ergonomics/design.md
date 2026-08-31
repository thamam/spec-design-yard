# Design: Editor and canvas ergonomics

## Decision 1: Tab/Shift+Tab handled inside `handleKeyDown`, before the autocomplete branch

Restructure `CodeTab.handleKeyDown` (`editor-panel.tsx:111-140`) so the
autocomplete branch keeps first claim on Tab/Enter while the popup is open,
and a new default branch handles Tab (insert 2-space indent at caret) and
Shift+Tab (outdent) when it is closed. Multi-line selections indent/outdent
every line the selection touches, preserving the selection. Edits go through
the React `onChange` path (single `onChange` with the new string plus a
`setSelectionRange` after), so undo history and the parse effect see one
atomic change.

The keyboard-accessibility escape hatch is preserved by construction: Esc
already sets `suppressAutocomplete` (`editor-panel.tsx:135-138`), which
empties `autocomplete` — but Tab-indent would then swallow Tab forever. So
Esc additionally arms a one-shot "release focus" state: the next Tab after
Esc performs the browser default (focus moves out), and any other key or
edit disarms it.

- **Rationale**: keyboard users must always have a way out of a
  Tab-swallowing textarea (WCAG 2.1.2 no-keyboard-trap). Esc-then-Tab is
  the established convention, and Esc already exists in this handler.
- **Rejected**: a `document`-level key listener for Tab — the existing
  global handler (`workspace-layout.tsx:126-153`) deliberately handles only
  undo/redo, and textarea-local behaviour belongs on the textarea; a global
  listener would race the autocomplete branch and fire in other inputs.

## Decision 2: Enter auto-indent reuses the detector extracted from `lib/autocomplete.ts`

`lib/autocomplete.ts:123-152` already computes `indentLevel =
currentLine.search(/\S/)` and classifies the parent block
(`metadata`/`connections`/`component`) by scanning backward for the nearest
less-indented non-blank line. Extract that logic into a shared, exported
pure function (e.g. `detectIndentContext(specText, cursorPosition)`), make
autocomplete call it, and have the Enter branch use it to insert
`"\n" + indent` — deepening one level (2 spaces) after a line that opens a
block (ends with `:` or is a list-item parent), otherwise matching the
current line's indent.

- **Rationale**: the detector is proven in production via autocomplete; two
  copies of YAML-context inference would drift and disagree, and the brief
  for this change explicitly mandates reuse via extraction.
- **Rejected**: reimplementing indent detection inside `CodeTab` — the
  backward-scan classification has non-obvious cases (list items at indent
  ≥ 6 are connections) that a second implementation would get subtly wrong.
- **Rejected**: full YAML re-parse on every Enter (`yaml.parseDocument`) to
  find the node path — correct but heavyweight per keystroke, and the text
  is frequently mid-edit invalid YAML exactly when auto-indent matters.

**On a `- key: value` list-item line specifically** (e.g. `- id: inbox`,
`- target: digest_stage`), Enter aligns the new line one level **under the
key**, not under the dash — `'    - id: inbox'` + Enter → 6 spaces
(`type:`'s column); `'      - target: digest'` + Enter → 8 spaces
(`label:`'s column). The maintainer ruled on this deliberately (round 4):
the line immediately after `- id: inbox` is almost always `type:`, and
after `- target: db` almost always `label:` — both belong to the same
mapping as the key, so the common case is a sibling key, not a new list
item.

- **Rejected**: a sibling-indent rule, where Enter after a list-item line
  matches the dash's own indent (so `- target: digest` + Enter → 6 spaces,
  ready for another `- target:` entry). Simpler, and never adds
  indentation the user did not ask for — but it makes the overwhelmingly
  common next line (a sibling mapping key) cost an extra Tab every time,
  while the less common case (another list item) is only a Shift+Tab away
  under the align-under-the-key rule. The maintainer chose
  align-under-the-key and had the spec amended to match the already-shipped
  behaviour, rather than changing the code to match the sibling-indent
  reading an earlier spec draft implied.

## Decision 3: Syntax colour via a highlight overlay, not an editor swap

Keep the `<textarea>` (`editor-panel.tsx:144-155`) as the single source of
input events. Behind it, render an aligned `<pre>`/`<div>` backdrop that
shows the same text tokenised into spans — component ids, connection
targets, metadata keys in distinct colours — while the textarea's own text
becomes transparent (`text-transparent` + explicit `caret-color`). Both
layers share identical font, padding, line-height, and whitespace handling;
the overlay mirrors the textarea's `scrollTop`/`scrollLeft` on the scroll
event. Tokenisation is line-based regex over the YAML shape (id/target/key
positions), not a full parse, so invalid mid-edit YAML degrades to plain
text rather than erroring.

- **Rationale (maintainer's chosen approach)**: preserves every existing
  behaviour and contract for free — the `spec-textarea` id and test ids,
  the autocomplete popup positioning, `data-focus-field` special-casing in
  the global undo/redo handler, the hydration `disabled` lockout, and all
  existing tests that type into a real textarea.
- **Rejected**: CodeMirror or Monaco. Either would bring real syntax
  highlighting for a large dependency and a rewrite: the autocomplete UI,
  key handling, undo/redo integration (the app has its own undo history via
  `useUndoRedo`), the `spec-textarea` DOM contract used by tests and the
  global key handler, and the hydration lockout would all need porting.
  That is a platform migration, not an ergonomics fix — out of proportion
  to colouring three token classes.

## Decision 4: Diagnostics panel resizes via a pointer-event drag handle; drag and click stay distinct

Add a thin drag-handle strip on the panel's top edge (above the header at
`editor-panel.tsx:2127`). Pointer-down captures the pointer and tracks
vertical movement; the panel body's height becomes a state-driven inline
height (replacing the `max-h-32` cap at `editor-panel.tsx:2162`), clamped
to a minimum (~one row) and a maximum (a fraction of the editor pane so the
textarea can never be squeezed out). The existing collapse toggle — state
`showDiagnostics` at line 1830, header `onClick` at 2127-2129 — is
untouched; the handle is a separate element outside the header's click
target, and a drag gesture (movement beyond a small threshold) never
synthesises a click on the header.

- **Rationale**: pointer events with capture are the one drag mechanism
  that works for mouse and touch without a document-level listener
  teardown dance; keeping the handle out of the header's DOM makes
  "drag must not collapse" true structurally instead of via event
  gymnastics.
- **Rejected**: CSS `resize: vertical` on the panel — free, but the browser
  puts the grip on the bottom-right corner while this panel is anchored to
  the bottom edge and must resize from its *top*; no control over clamps;
  inconsistent rendering across browsers.
- **Rejected**: making the whole header draggable and distinguishing
  click-vs-drag by movement threshold on the same element — workable but
  fragile (threshold tuning, accidental collapses), and it overloads one
  element with two opposing gestures.

## Decision 5: Zoom-to-fit becomes a named control + shortcut, API travels by prop, and the fit latch keys on the loaded spec

Three coordinated moves:

1. **Affordance**: rename the `canvas-panel.tsx:167-181` button from
   "Reset view" (refresh icon) to "Zoom to fit" with a fit-style icon.
2. **API plumbing**: `excalidraw-canvas.tsx` already holds the API in state
   (line 573) and mirrors it onto `window.excalidrawAPI` (line 579). Expose
   a `zoomToFit()` callback to the parent via prop/ref; the button and the
   shortcut call that, not the global. The `window` mirror stays (other
   code and tests use it) but gains no new callers.
3. **Re-fit on new content**: replace the per-mount `hasInitialScrolled`
   boolean ref (`excalidraw-canvas.tsx:655`) with a latch keyed on the
   loaded spec/project identity, so switching project or spec triggers one
   fresh fit while ordinary edits to the same spec never re-fit under the
   user.
4. **Shortcut**: `Shift+1` — Excalidraw's own zoom-to-fit binding, so it
   matches what canvas-literate users already expect — registered in the
   global handler in `workspace-layout.tsx`, with an explicit skip when the
   event target is any input/textarea *including* the spec textarea. The
   existing handler (`workspace-layout.tsx:126-153`) deliberately
   special-cases the spec textarea via `isSpecTextarea` so undo/redo works
   while typing; the new shortcut must NOT inherit that pass-through, or
   typing `!` in the YAML would yank the canvas.

- **Rationale**: the fit logic is proven; the failures are naming,
  reachability, and lifetime. Fixing those three without touching the fit
  math is the minimal change. Prop plumbing (not the global) is the
  direction the codebase wants to go and makes the call testable.
- **Rejected**: `Cmd/Ctrl+0` as the shortcut — collides with the browser's
  own zoom-reset, which cannot be reliably preempted.
- **Rejected**: remounting `ExcalidrawCanvas` on project switch to reset
  the latch — nukes canvas-local state and is exactly the remount-churn the
  `updateScene` sync path (line 671-679) exists to avoid.
- **Rejected**: removing `window.excalidrawAPI` in this change — it has
  existing consumers; deleting it is cleanup beyond this change's scope.

## Decision 6: Invariants carried as requirements, not implementation notes

Two standing product invariants are encoded as spec requirements so the
implementation session cannot miss them:

- **Canvas normalizer**: every element reaching Excalidraw keeps passing
  the normalizer at `excalidraw-canvas.tsx:540-548` (`angle: 0`,
  `opacity: 100`, `strokeStyle: 'solid'`, `lineHeight: 1.25` on text).
  Excalidraw 0.18 computes bounds via `Math.cos(element.angle)`; a missing
  `angle` yields NaN, poisons `getCommonBounds`, and makes `scrollToContent`
  set scroll/zoom to NaN — a blank canvas. This has broken zoom-to-fit
  before.
- **YAML writes**: any code path in this change that writes YAML uses
  `yaml.parseDocument`, never `parse` — comment preservation is a product
  invariant (`AGENTS.md`).

- **Rationale**: both invariants have bitten this codebase already; a
  requirement with a scenario forces a test, a note in a design doc forces
  nothing.
- **Rejected**: relying on the existing normalizer call sites and code
  review — that is how it broke last time.

### What "100% diff coverage" means precisely

The gate (`scripts/check-diff-coverage.mjs`) uses v8/istanbul **line** coverage:
it checks every added or modified line on which a statement *starts*. Lines that
carry no statement start — continuation lines of a multi-line expression, a bare
`} else {`, a closing brace — are not executable points in the coverage map and
are therefore not checked.

So the requirement is enforceable and enforced, but it means "every added
executable line is exercised", not "every added character is exercised". A
change confined to the middle of a multi-line ternary can pass the gate without
a test touching that branch. Reviewers should read the requirement that way, and
lanes must not treat a green gate as proof that a branch is tested — that is
what the red-before-green rule is for.

## Decision 7: The fit control lives in Excalidraw's own `Footer`, not floating over the canvas

Issued by the binding amendment
(`.orchestrator/canvas/AMENDMENT-zoom-to-fit-placement.md`) after the
maintainer approved the gate: *"verify that on top of the keyboard shortcut,
there is also a clickable icon next to the current zoom in/out that does the
zoom-to-fit"*. This **overrides Decision 5 item 1 where the two conflict** —
Decision 5 relabelled only the app's own top-right toolbar button, which sits
at the top of the canvas pane, not beside the zoom widget the maintainer
meant. The zoom in/out control a user actually looks at is Excalidraw's own
`−  100%  +` widget in the bottom-left of the canvas, so the fit affordance
must also be there.

Mechanism: `@excalidraw/excalidraw@0.18.1` exports **`Footer`** as a public
named export (confirmed against the shipped bundle, which exports
`Excalidraw, Footer, MainMenu, Sidebar, WelcomeScreen, useHandleLibrary`).
Excalidraw renders `<Footer>`'s children into its footer region — see
*Placement* below for exactly where in that region. The repo already uses this
pattern for `WelcomeScreen`: `excalidraw-canvas.tsx` dynamically `import()`s
the module
and pulls the component into state, rendering it as a child of
`<ExcalidrawComponent>`. `Footer` is pulled in the same effect and rendered as
a sibling child.

Decision 5 items 2-4 stand unchanged: the toolbar button is kept and
relabelled (removing a control people already use would be a regression), the
shortcut stays `Shift+1`, and all three routes call one `zoomToFit()` plumbed
by prop while `window.excalidrawAPI` keeps its existing consumers and gains no
new callers.

- **Rationale**: the affordance belongs where the user already looks for zoom.
  Using Excalidraw's own extension point means its layout owns the placement,
  so the control reflows with the footer instead of fighting it.
- **Rejected**: a floating, absolutely-positioned button over the canvas near
  the widget — fragile against Excalidraw's own layout, and it breaks when the
  footer reflows on a narrow pane (the widget moves; a hard-coded offset does
  not).
- **Rejected**: replacing the toolbar button with the footer one — the
  amendment is explicit that both stay, and one implementation behind two
  affordances is the point.

### Placement within the footer: centre, not adjacent to the zoom widget

Decided by the maintainer after review. **The button stays in Excalidraw's
footer centre, reached through the public `Footer` export. No code change.**

The public export named `Footer` is `FooterCenter`: it tunnels its children
into `.footer-center`. The `−  100%  +` zoom widget is not there — it lives in
`.layer-ui__wrapper__footer-left`, and Excalidraw ships **no public API for
that region**. Both class names are confirmed in the shipped bundle
(`node_modules/@excalidraw/excalidraw/dist/prod/index.js`).

So, plainly: the fit button sits in the same footer strip as the zoom controls,
but it is **not adjacent to them**. Decision 7's rationale above — "the
affordance belongs where the user already looks for zoom" — is satisfied at the
level of the strip, not of the neighbouring control.

- **Rejected**: portalling into `.layer-ui__wrapper__footer-left` to sit beside
  the zoom widget. That class is Excalidraw's internal markup, not a supported
  extension point. An upgrade could rename it or move the region, the portal
  target would resolve to nothing, and the button would **silently vanish** —
  no error, no failing build, just a missing control that only a human looking
  at the footer would notice.

This is a **deliberate trade: exact placement for upgrade safety.** We accept a
button one region away from the zoom widget in exchange for a placement that
survives an Excalidraw upgrade, because a fit control in a slightly less
obvious spot is strictly better than one that disappears without warning. The
keyboard shortcut and the top-right toolbar button remain as the other two
routes to the same `zoomToFit()`.

### Note on Decision 4 and pointer events

Decision 4 specifies "pointer events with capture" for the diagnostics resize
drag. jsdom 24 — this repo's test environment — ships **no `PointerEvent`
constructor and no `Element.prototype.setPointerCapture`**; a synthetic
`pointerdown` arrives with `clientY` null, so a pointer-capture drag cannot be
unit-tested here at all. Since the same change requires 100% diff coverage and
red-before-green on every behaviour, the implementation delivers the
requirement's stated intent — "the drag SHALL work via pointer events (mouse
and touch)" — with parallel `mousedown`/`mousemove`/`mouseup` and
`touchstart`/`touchmove`/`touchend` listeners, which is also the mechanism the
existing pane splitter in `workspace-layout.tsx` uses. Both paths are covered
by tests.
