# Proposal: Progressive disclosure in Focus; quieter autocomplete

## Problem

Two related UX problems, verified against `main` @ `ef5922f`:

1. **Focus is a wall of fields.** Selecting a component (`FocusTab` in
   `components/workspace/editor-panel.tsx:1066-1543`) dumps every schema
   field at once: Component ID + rename, display name, type, owner, status,
   color, version, latency, throughput, description, a full outgoing-
   connection editor (every row already showing a label input and
   Disconnect), a full incoming-connection editor (same), and a live
   "AST-Reconciled Spec" YAML dump. Nothing-selected is the same shape:
   Global System Settings forces name, version, status, owner, and
   description open together (`:1546-1660`). Sight is overwhelming; the
   ordinary architecture loop (name, type, who talks to whom) is buried
   under metadata and a compiled dump.

2. **The Code-tab suggestion popup competes with ordinary typing.**
   `getAutocompleteSuggestions` (`lib/autocomplete.ts`) already scopes
   enum completions (`type:`, `status:`, `color:`, `target:`) and key
   completions (component fields, metadata keys, connection keys). It does
   **not** already stay out of the way: an empty query on an indented
   blank line (the line Enter just created) returns every key in that
   block, so the popup opens on every new line and the next Tab accepts
   `id:` / `owner:` instead of indenting. Typing inside a block-scalar
   description can also prefix-match a metadata key (`owner` → `owner:`).
   Free-text values on the same line (`description:`, `owner:`, `name:`)
   are already silent — the leak is blank-line key spam and block-scalar
   content.

Canvas / tree selection already switches the left pane to Focus
(`editor-panel.tsx:1998-2003`). That path is left alone.

## Proposed solution

Progressive disclosure in Focus, then a scoped autocomplete quieting —
not a YAML-as-source-of-truth rewrite and not an editor swap.

- **`focus-inspector`**: when a component is selected, always show display
  name + type, compact connection-count chips, diagnostics (when this
  component has issues; existing quick-fix behaviour preserved), and
  Duplicate / Clear in the header. Connections open by default as one
  section with compact outgoing/incoming sublists (target + label);
  expanding a row reveals disconnect / label edit; "Add connection" is a
  single compact control. Details (owner, status, color, version,
  description, latency, throughput) and the compiled-spec dump start
  collapsed. Component ID rename lives in Details, not as the first
  input. Nothing-selected: system name visible; other system metadata
  behind disclosure. Disclosure state is session-local `useState`.
- **`spec-editor`**: do not open the suggestion popup for an empty key
  query (blank indented line) or while the caret is in a free-text value
  (description / owner / name / version / label / id values, comments,
  block-scalar content). Keep enum/key completions when the user has
  typed into a closed vocabulary. Esc, Tab-indent, Shift+Tab outdent,
  Enter auto-indent, and autocomplete-accept on Tab when a suggestion is
  highlighted stay exactly as `editor-and-canvas-ergonomics` specified.

## Scope

- `FocusTab` layout and disclosure state in
  `components/workspace/editor-panel.tsx`
- `getAutocompleteSuggestions` in `lib/autocomplete.ts` (popup trigger
  only — no CodeTab rewrite, no third-party editor)
- Unit/component tests in `tests/` (new disclosure suite; adapt existing
  Focus tests that assumed every field was mounted; new autocomplete
  cases)
- Full-system e2e scenario `focus-disclosure` via `scripts/run-e2e.sh`
- 100% diff coverage on added/modified lines

## Out of scope

- Merging open PRs #17 / #18 (crash loop, arrow edge ports)
- Custom connection anchors / snap-to-anchor on drop
- Replacing YAML as the source of truth
- Monaco / CodeMirror (already rejected in editor-and-canvas-ergonomics)
- Canvas HUD aesthetic (`sketches/004-excalidraw-hud`)
- Dead Preview / fullscreen chrome
- Persisting disclosure state in the project folder
- Changing the canvas/tree → Focus auto-switch (already correct)
- Adding a new Focus-header Delete action (none exists today; Duplicate
  stays in the header; canvas delete is untouched)
