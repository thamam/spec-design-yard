# Design: Progressive disclosure in Focus; quieter autocomplete

## Decision 1: Disclosure is session-local `useState` inside `FocusTab`

Each disclosure (Details, Connections, compiled spec, add-outgoing,
add-incoming, expanded connection row) is a boolean or id-or-null in
`FocusTab`. Selecting a different component resets Details / compiled
spec / add-forms / expanded rows to their defaults (Connections stays
open; Details and compiled spec stay closed) so a new selection starts
thin. Nothing is written to the store, localStorage, or the project
folder.

- **Rationale**: the brief asks for session-local state and forbids
  persisting disclosure in the project folder. `useState` is the
  project convention (`_bmad-output/project-context.md`); no state
  library.
- **Rejected**: persisting in `.specyard/*.json` or localStorage —
  explicitly out of scope, and a collapsed-by-accident reload would
  hide fields the user thought they had opened for good.

## Decision 2: Hidden-by-default fields are not mounted

Details fields (owner, status, color, version, description, latency,
throughput, ID rename) and the compiled-spec `<pre>` are rendered only
while their disclosure is open. Compact connection rows do not mount
the label `<input>` or Disconnect until that row is expanded. The add
forms stay unmounted until their compact control is activated.

- **Rationale**: "not in the document (or inside a collapsed region
  not visible)" — not mounting is the stronger reading, keeps the
  accessibility tree honest, and makes the default-view tests
  (`queryByTestId` is null) unambiguous. Fields that are merely
  `hidden` still sit in tab order on some browsers.
- **Rejected**: always-mounted + `hidden`/`display:none` — cheaper to
  implement, but the ID input would remain the first focusable field
  in source order (today it is), which is exactly the "ID rename is
  the first input" problem.
- **Rejected**: extracting `FocusTab` into its own file in this change
  — the function is large, but a move would churn every import and
  every existing test path for no behaviour win. Stay in
  `editor-panel.tsx`.

## Decision 3: One Connections section; chips only expand it

Outgoing and incoming become two sublists inside a single Connections
disclosure that starts open. Header chips (`N outgoing`, `M incoming`)
are real buttons; activating either sets Connections open (a no-op
when it already is) and does not toggle it closed — chips are
wayfinding, not a second toggle. Compact rows show target + label
text; an "Edit" control (or activating the row) reveals the existing
label input and Disconnect. "Add connection" / "Add incoming" are
single compact buttons that reveal the existing select + label +
submit form.

- **Rationale**: the brief allows incoming/outgoing as two sublists
  inside one section, and forbids a second full form always on
  screen. Keeping the existing testids on the inner controls
  (`add-connection-select`, `focus-conn-label-input-*`,
  `disconnect-inbound-*`, …) means existing tests adapt by expanding
  one more control rather than being rewritten.
- **Rejected**: two always-open cards (today) — that is the density
  problem.
- **Rejected**: chips that toggle Connections closed — a misclick on
  a count would hide the lists the user just opened.

## Decision 4: Real buttons with accessible names, not clickable divs

Every disclosure is a `<button type="button">` with an accessible
name ("Details", "Connections", "Show compiled spec", "N outgoing",
"M incoming") and `aria-expanded`. Keyboard users activate them with
Enter/Space like any button. No `onClick` on a `<div>`.

- **Rationale**: the brief requires this for a11y; it is also what
  Testing Library's `getByRole('button', { name })` needs, so the
  keyboard unit test and the e2e can share the same query.
- **Rejected**: `<details>`/`<summary>` — native and free, but the
  existing header already uses lucide chevrons and we need chips that
  open Connections without being the section's own summary. One
  button pattern everywhere is simpler than mixing native details
  with custom chips.

## Decision 5: Autocomplete stays quiet until a closed vocabulary is in play

Two changes in `getAutocompleteSuggestions`, nothing in CodeTab's
key handler except what falls out of an empty suggestion list:

1. **Key suggestions require a non-empty query.** `field`,
   `metadata-key`, and `connection-key` return no suggestions when
   the query is `""`. A blank indented line (Enter's landing place)
   no longer opens the popup, so Tab-indent / Shift+Tab / Enter
   auto-indent from editor-and-canvas-ergonomics run without a
   competing accept. Enum completions (`type:`, `status:`, `color:`,
   `target:`) still offer the full closed set on an empty query —
   the user has already typed the key.
2. **Free-text value contexts return empty.** After
   `description:` / `owner:` / `name:` / `version:` / `label:` /
   `id:` on the same line; on a comment line; and inside a block
   scalar (the nearest less-indented parent ends with `|` / `>`).
   This closes the leak where typing `owner` inside
   `description: |` offered `owner:`.

Esc still sets `suppressAutocomplete`. Tab-with-highlight still
accepts. The textarea stays the textarea.

- **Rationale**: verified against the code, not the hunch. The popup
  is already scoped to vocabularies for same-line enum/key
  completions; the real eager cases are empty-query key spam and
  block-scalar prefix matches. A real, tested quieting of those two
  is better than a no-op note.
- **Rejected**: requiring a typed prefix for enum values too —
  `type: ` with the full Store/Stage/Brick/Gateway list is the
  closed-set help the brief wants to keep.
- **Rejected**: changing CodeTab's `handleKeyDown` ordering — the
  editor-ergonomics contract (popup-open Tab accepts; popup-closed
  Tab indents) is correct; we just stop opening the popup when it
  has nothing useful to say.
- **Rejected**: Monaco / CodeMirror — already rejected; still
  rejected.

## Decision 6: Canvas/tree → Focus auto-switch is left alone

`useEffect` at `editor-panel.tsx:1998-2003` already calls
`setActiveTab("focus")` whenever `selectedUnit` is set. Canvas
(`canvas-panel.tsx:534, 547`) and the tree set `selectedUnit`. The
hunch is confirmed; the path is not touched.

- **Rationale**: the brief says if it already switches, leave it
  alone. Touching it would be a fake change and risk a loop with
  the existing effect.
- **Rejected**: also switching on diagnostics-panel clicks or
  metrics-directory clicks that do not set `selectedUnit` — out of
  scope; those already set it.

## Decision 7: Invariants carried as requirements

- YAML writes keep using `yaml.parseDocument`, never `parse`.
  Focus edits already go through `reconcileSpec`; this change adds
  no new write path.
- No state library.
- 100% diff coverage on added/modified executable lines
  (`scripts/check-diff-coverage.mjs`).
- Existing Focus behaviours (diagnostics + quick-fix, connection
  label/disconnect/add, ID rename validation, system-metadata init,
  latency/throughput integer write-back, focus-guard on
  `data-focus-field`) stay, reached via one extra disclosure click
  where the field moved behind one.
