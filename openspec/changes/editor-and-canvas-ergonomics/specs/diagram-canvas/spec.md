# Delta for diagram-canvas

New capability spec for pre-existing code (Brownfield Rule). Baseline
verified against `components/workspace/canvas-panel.tsx`,
`components/workspace/excalidraw-canvas.tsx`, and
`components/workspace/workspace-layout.tsx` on `main` @ `3bd0211`.
Zoom-to-fit is partly built already: a toolbar button labelled "Reset view"
with a refresh icon (`canvas-panel.tsx:167-181`) calls
`scrollToContent(els, {fitToViewport: true, viewportZoomFactor: 0.85})`
through the `window.excalidrawAPI` global (mirrored onto `window` at
`excalidraw-canvas.tsx:579`), and the canvas fits itself once on mount
(`excalidraw-canvas.tsx:654-668`) behind a per-mount `hasInitialScrolled`
ref. The gaps: the affordance name/icon do not say "fit", there is no
keyboard shortcut, the button bypasses React data flow via the `window`
global, and the per-mount latch means switching project or spec never
re-fits. The global keyboard handler (`workspace-layout.tsx:126-153`)
handles only undo/redo and deliberately passes the spec textarea through
via `isSpecTextarea`. All elements fed to Excalidraw pass a normalizer
(`excalidraw-canvas.tsx:540-548`) guaranteeing `angle: 0`, `opacity: 100`,
`strokeStyle: 'solid'`, and `lineHeight: 1.25` on text.

## MODIFIED Requirements

### Requirement: Zoom-to-fit affordance

- OLD: The toolbar exposes the fit action as a button labelled "Reset view"
  with a refresh icon, which calls `scrollToContent` with
  `{fitToViewport: true, viewportZoomFactor: 0.85}` by reaching through the
  `window.excalidrawAPI` global.
+ NEW: The toolbar SHALL expose the same fit action as a control named
  "Zoom to fit" with a fit-style icon, invoked through a callback passed by
  prop from the canvas component — not through the `window` global. The fit
  behaviour itself (`scrollToContent` with `fitToViewport: true`,
  `viewportZoomFactor: 0.85`) SHALL be unchanged.

#### Scenario: The control fits the diagram

- GIVEN a diagram panned and zoomed away from its content
- WHEN the user clicks "Zoom to fit"
- THEN the viewport scrolls and zooms so all diagram elements are visible

### Requirement: Fit on content load

- OLD: The canvas fits its content once per component mount, gated by a
  per-mount `hasInitialScrolled` ref; switching to another project or spec
  in the same mounted canvas never triggers a new fit.
+ NEW: The canvas SHALL fit its content once when a spec first renders and
  once each time a different spec/project is loaded into the canvas.
  Ordinary edits to the currently loaded spec SHALL NOT trigger a re-fit.

#### Scenario: Switching projects re-fits

- GIVEN project A is displayed and the user has panned away
- WHEN the user switches to project B
- THEN the canvas fits project B's diagram in the viewport

#### Scenario: Editing does not yank the viewport

- GIVEN the user has manually panned/zoomed the current diagram
- WHEN the user edits the spec YAML (same spec, new content)
- THEN the viewport position and zoom are unchanged

## ADDED Requirements

### Requirement: Fit control in Excalidraw's own footer

The canvas SHALL render a zoom-to-fit control inside Excalidraw's own footer
strip, via the `Footer` named export of `@excalidraw/excalidraw` (public in
0.18.1, pulled from the same dynamic `import()` that already supplies
`WelcomeScreen`). That export is `FooterCenter` and tunnels into
`.footer-center`, so the control sits in the same footer strip as the
`−  100%  +` zoom widget but NOT adjacent to it; the widget's own region,
`.layer-ui__wrapper__footer-left`, has no public API and SHALL NOT be
portalled into. See Decision 7 in `design.md`. The control SHALL carry an
accessible name ("Zoom to fit") and a stable `data-testid`, and SHALL invoke
the same `zoomToFit()` callback as the toolbar control and the keyboard
shortcut — not `window.excalidrawAPI`.

#### Scenario: The footer control fits the diagram

- GIVEN a diagram panned and zoomed away from its content
- WHEN the user clicks the fit control in the canvas footer strip
- THEN the viewport scrolls and zooms so all diagram elements are visible
- AND the resulting scroll and zoom values are finite

#### Scenario: All three routes run one implementation

- GIVEN the footer control, the toolbar control, and Shift+1
- WHEN each is used in turn
- THEN each calls the same `zoomToFit()` callback with
  `{fitToViewport: true, viewportZoomFactor: 0.85}`

### Requirement: Zoom-to-fit keyboard shortcut

The system SHALL bind Shift+1 to the zoom-to-fit action, registered in the
global keyboard handler. The shortcut SHALL NOT fire while the user is
typing in any input or textarea, explicitly including the spec YAML
textarea — it SHALL NOT inherit the `isSpecTextarea` pass-through that the
undo/redo handling uses.

#### Scenario: Shortcut fits the diagram

- GIVEN focus is not in any input or textarea
- WHEN the user presses Shift+1
- THEN the viewport fits all diagram elements

#### Scenario: Typing in the YAML editor never triggers the shortcut

- GIVEN the caret is in the spec YAML textarea
- WHEN the user types `!` (Shift+1)
- THEN the character is inserted into the YAML
- AND the canvas viewport does not move

### Requirement: Element normalization invariant

All elements passed to the fit action SHALL satisfy the canvas normalizer
(`angle: 0`, `opacity: 100`, `strokeStyle: 'solid'`, and `lineHeight: 1.25`
on text elements). The fit action SHALL never set scroll or zoom to a
non-finite value. (Excalidraw 0.18 computes bounds via
`Math.cos(element.angle)`; a missing `angle` yields NaN, poisons
`getCommonBounds`, and blanks the canvas — this has broken zoom-to-fit
before.)

#### Scenario: Fit stays finite

- GIVEN a diagram whose elements passed through the normalizer
- WHEN zoom-to-fit runs
- THEN the resulting scroll and zoom values are finite
- AND the diagram remains visible

### Requirement: Test coverage for canvas behaviours

Every behaviour added by this change to the diagram canvas SHALL be covered
by a unit test, and every user-visible behaviour SHALL additionally be
covered by a full-system e2e scenario (real `next dev`, real Chromium, real
project folder, per `scripts/run-e2e.sh`). Diff coverage SHALL be 100% on
lines this change adds or modifies.

#### Scenario: Fit behaviours verified end to end

- GIVEN the full-system e2e suite runs against a real project folder
- WHEN the fit-control, shortcut, shortcut-suppression, and project-switch
  scenarios execute
- THEN each passes in a real browser against the running app
