# Implementation Tasks: Editor and canvas ergonomics

Each task is a vertical slice: behaviour + unit tests + (where user-visible)
an e2e scenario, independently verifiable with the full suite green before
it is checked off. Diff coverage must be 100% on lines each task adds or
modifies.

- [x] **Task 1: Tab / Shift+Tab indentation**
  - Restructure `CodeTab.handleKeyDown` (`editor-panel.tsx:111-140`):
    popup-open branch unchanged (Tab still accepts the highlighted
    suggestion); popup-closed branch inserts a 2-space indent at the caret
    on Tab, outdents up to 2 leading spaces on Shift+Tab, and applies
    both per-line across multi-line selections (selection preserved).
  - Esc arms a one-shot focus release: the very next Tab performs the
    browser default and moves focus out; any other key/edit disarms it.
  - Unit tests: caret indent, caret outdent, multi-line indent/outdent,
    selection preservation, popup-open Tab still applies a suggestion,
    Esc-then-Tab moves focus, single undo step per gesture.
  - E2E: type nested YAML, press Tab mid-line, assert 2 spaces inserted
    and focus retained; Esc then Tab, assert focus left the textarea.

- [x] **Task 2: Enter auto-indent (detector extraction first)**
  - Extract the indent + parent-block detector from
    `lib/autocomplete.ts:123-152` into an exported pure function; switch
    autocomplete to consume it. Behaviour-neutral: existing autocomplete
    tests stay green unmodified.
  - Enter inserts `"\n"` plus the indent the detector reports for the new
    line — one level deeper after a block-opening line, else the current
    line's indent. Applies when the popup is closed or open-but-unnavigated;
    the popup-open `hasNavigated` accept (`editor-panel.tsx:127-134`) is
    unchanged.
  - Unit tests: detector extraction parity (same outputs as before on the
    autocomplete fixtures), Enter after `metadata:` indents one level
    deeper, Enter on a `- key: value` list-item line aligns under the key
    (design.md Decision 2), Enter on a top-level line stays at column 0,
    popup-navigated Enter still applies the suggestion.
  - E2E: press Enter inside a component block, assert the new line starts
    at the block's indent.

- [x] **Task 3: Syntax colour overlay**
  - Add the scroll-synced highlight backdrop behind the now
    transparent-text textarea (`editor-panel.tsx:144-155`); line-based
    tokeniser colouring component ids, connection targets, and metadata
    keys; invalid YAML degrades to uncoloured text.
  - The textarea keeps its id, test ids, `data-focus-field`, `disabled`
    lockout, and all input behaviour.
  - Unit tests: tokeniser classifies ids/targets/keys on representative
    spec text, unparseable text yields plain tokens, overlay text content
    equals textarea value.
  - E2E: load a spec, assert distinct computed colours on an id, a target,
    and a metadata key; type text and assert overlay stays in sync while
    scrolled.

- [x] **Task 4: Resizable diagnostics panel**
  - Drag handle on the panel's top edge (above the header at
    `data-testid="diagnostics-header"`); a mouse-and-touch drag sets a clamped
    height that replaces the `max-h-32` cap on `data-testid="diagnostics-body"`.
  - Collapse toggle (`showDiagnostics`, the header's own onClick) keeps
    working; a drag never triggers a collapse.
  - Unit tests: drag changes height within clamps, clamp floor/ceiling
    respected, header click still collapses/expands, drag gesture does not
    toggle collapse.
  - E2E: seed a spec with 5+ diagnostics, drag the handle up, assert
    previously clipped action buttons (e.g. ADD DESCRIPTION) become
    visible and clickable.

- [x] **Task 5: Zoom to fit — affordance, prop plumbing, shortcut, re-fit**
  - Rename the `canvas-panel.tsx:167-181` button to "Zoom to fit" with a
    fit icon; route it through a `zoomToFit()` callback exposed by
    `excalidraw-canvas.tsx` instead of `window.excalidrawAPI` (the window
    mirror remains but gains no new callers).
  - Replace the per-mount `hasInitialScrolled` ref
    (`excalidraw-canvas.tsx:655`) with a latch keyed on the loaded
    spec/project identity: new spec → one fresh fit; edits to the same
    spec → no re-fit.
  - Register `Shift+1` in the global handler
    (`workspace-layout.tsx:126-153`) with an explicit skip for all
    inputs/textareas including the spec textarea (it must NOT inherit the
    `isSpecTextarea` undo/redo pass-through).
  - Elements fed to fit keep passing the normalizer
    (`excalidraw-canvas.tsx:540-548`) — no NaN scroll/zoom.
  - Unit tests: button invokes the prop callback, shortcut fires on canvas
    focus, shortcut suppressed while typing in the spec textarea, latch
    re-fits on spec-identity change and not on same-spec edits, normalized
    elements produce finite fit bounds.
  - E2E: open a project, pan/zoom away, press Shift+1, assert the diagram
    is fitted; switch to another project, assert the canvas arrives fitted;
    type `!` (Shift+1) in the YAML textarea, assert the canvas viewport did
    not move.

- [x] **Task 6: Quality gate**
  - Full `npm test` green; `npm run build` clean; full-system e2e run per
    `scripts/run-e2e.sh` green.
  - Diff coverage report shows 100% on added/modified lines.
  - Confirm no YAML write path introduced by this change uses `yaml.parse`
    (grep the diff for `parse(`; `parseDocument` only).
  - Record verification results in `verification.md`; re-flag (do not
    delete) the dead code listed in the proposal's out-of-scope section.
