# Proposal: Editor and canvas ergonomics

## Problem

Five small but constant frictions make the core editing loop feel broken.
All verified against the code on `main` @ `3bd0211`:

1. **Tab throws you out of the editor.** `CodeTab`'s `handleKeyDown`
   (`components/workspace/editor-panel.tsx:111-140`) is entirely nested
   inside `if (autocomplete && autocomplete.suggestions.length > 0)`. With
   the suggestion popup closed the handler is a no-op, so Tab falls through
   to the browser default and moves focus out of the textarea. Indenting
   YAML — the one thing YAML is made of — requires typing spaces by hand.
2. **Enter lands at column 0.** Enter applies a suggestion only when the
   user has arrow-navigated the popup (`editor-panel.tsx:127-134`);
   otherwise it falls through to the browser's plain newline. Every new
   line inside a nested block starts un-indented.
3. **The spec is a wall of monochrome text.** The editor is a bare
   `<textarea>` (`editor-panel.tsx:144-155`) with flat `text-zinc-300`.
   Component ids, connection targets, and metadata keys are visually
   indistinguishable.
4. **The diagnostics panel cannot grow.** Its body is capped at `max-h-32`
   (128px, `editor-panel.tsx:2162`) inside a `shrink-0` wrapper. With 5+
   issues the list scrolls inside a short box and action buttons such as
   ADD DESCRIPTION are clipped.
5. **Zoom-to-fit exists but is unusable.** A "Reset view" button
   (`components/workspace/canvas-panel.tsx:167-181`) already calls
   `scrollToContent(els, {fitToViewport: true, viewportZoomFactor: 0.85})`,
   and the canvas fits once on mount
   (`components/workspace/excalidraw-canvas.tsx:654-668`). But the
   affordance is named "Reset view" with a refresh icon (undiscoverable),
   there is no keyboard shortcut, the button reaches through a
   `window.excalidrawAPI` global, and the `hasInitialScrolled` latch is
   per-mount — switching project or spec never re-fits.

## Proposed solution

One change, three capabilities:

- **`spec-editor`**: make Tab insert a 2-space indent (Shift+Tab outdents;
  multi-line selections indent/outdent every selected line) while keeping
  the existing autocomplete-accept on Tab and the Esc-then-Tab keyboard
  escape hatch; make Enter auto-indent the new line by reusing the
  indent/parent-block detector already working in
  `lib/autocomplete.ts:123-152` (extracted, not reimplemented); add syntax
  colour for component ids, connection targets, and metadata keys via a
  highlight overlay behind a transparent-text textarea — not a third-party
  editor swap.
- **`diagnostics-panel`**: add a drag handle on the panel's top edge so the
  user can grow/shrink it. The existing header-click collapse toggle keeps
  working, and a drag must not trigger it.
- **`diagram-canvas`**: turn the existing fit logic into a discoverable
  "Zoom to fit" control with a keyboard shortcut, reach the Excalidraw API
  through a prop instead of the `window` global, and re-fit when a new
  spec/project loads.

## Scope

- `CodeTab` key handling (Tab / Shift+Tab / Enter) and a highlight overlay
  in `components/workspace/editor-panel.tsx`
- Extraction of the indent/parent-block detector from `lib/autocomplete.ts`
  into a shared function consumed by both autocomplete and the Enter handler
- Diagnostics panel resize handle in `components/workspace/editor-panel.tsx`
- Zoom-to-fit affordance, shortcut, API prop, and re-fit latch across
  `canvas-panel.tsx`, `excalidraw-canvas.tsx`, `workspace-layout.tsx`
- Unit tests for every added behaviour; full-system e2e scenarios (real
  `next dev` + real Chromium + real project folder, per
  `scripts/run-e2e.sh`) for every user-visible behaviour; 100% diff
  coverage on added/modified lines

## Out of scope

- **Canvas snap-to-anchor on connection drop.** The maintainer resolved the
  ambiguous backlog item as the Enter-auto-indent reading. Recorded as a
  follow-up, not fixed here: `lib/canvas-diff.ts:322-346` requires *both*
  `startBinding.elementId` and `endBinding.elementId`, so a connection
  dropped slightly short of a node is filtered out, emits no `connect`
  change, and the drawn line vanishes on the next `updateScene`.
- **Persisting the diagnostics panel height across mounts.** The height is
  session-local; persistence is a separate change if wanted.
- **Deleting pre-existing dead code**, flagged here but deliberately left
  in place: the unused `fullscreen` state (`canvas-panel.tsx:92`), the
  no-op Preview button (`canvas-panel.tsx:166`), and the dead `wordWrap`
  toggle (`editor-panel.tsx:1811`).
