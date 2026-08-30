# Delta for diagnostics-panel

New capability spec for pre-existing code (Brownfield Rule). Baseline
verified against `components/workspace/editor-panel.tsx` (inline JSX, lines
2118-2534) on `main` @ `3bd0211`: the panel sits at the bottom of the
editor pane in a `shrink-0` wrapper (line 2120); clicking anywhere on its
header toggles `showDiagnostics` (state at line 1830, `onClick` at
2127-2129); the body (2161-2164) is capped at `max-h-32` (128px) with
`overflow-y-auto`, so with 5+ issues the list scrolls inside a short box
and action buttons such as ADD DESCRIPTION are clipped out of view.

## ADDED Requirements

### Requirement: Resizable panel height

The diagnostics panel SHALL provide a drag handle on its top edge. Dragging
the handle vertically SHALL grow or shrink the panel body, clamped between
a minimum height (at least one issue row remains visible) and a maximum
height (the spec textarea above SHALL always retain a usable editing area).
The drag SHALL work via pointer events (mouse and touch). Panel height is
session-local; persisting it across mounts is out of scope for this change.

#### Scenario: Dragging up reveals clipped content

- GIVEN a spec producing 5 or more diagnostics, with action buttons clipped
  at the default height
- WHEN the user drags the top-edge handle upward
- THEN the panel body grows and the previously clipped action buttons
  become visible and clickable

#### Scenario: Height is clamped

- GIVEN the user drags the handle far beyond the top or bottom of the pane
- WHEN the drag ends
- THEN the panel height rests at the clamp boundary
- AND the spec textarea is still visible and editable

### Requirement: Test coverage for panel behaviours

Every behaviour added by this change to the diagnostics panel SHALL be
covered by a unit test, and every user-visible behaviour SHALL additionally
be covered by a full-system e2e scenario (real `next dev`, real Chromium,
real project folder, per `scripts/run-e2e.sh`). Diff coverage SHALL be 100%
on lines this change adds or modifies.

#### Scenario: Resize verified end to end

- GIVEN the full-system e2e suite runs with a project seeded to produce 5+
  diagnostics
- WHEN the drag-to-resize scenario executes
- THEN it passes in a real browser against the running app

## MODIFIED Requirements

### Requirement: Collapse toggle

- OLD: Clicking the panel header toggles the panel body between collapsed
  and expanded; the expanded body is fixed at a 128px maximum height.
+ NEW: Clicking the panel header SHALL still toggle the panel body between
  collapsed and expanded. A resize drag SHALL NOT trigger the collapse
  toggle. When expanded, the body SHALL open at the user's last dragged
  height for the session (or the default height before any drag).

#### Scenario: Header click still collapses

- GIVEN the panel is expanded
- WHEN the user clicks the panel header
- THEN the panel body collapses
- AND clicking again expands it

#### Scenario: A drag is not a click

- GIVEN the panel is expanded
- WHEN the user presses on the drag handle, moves the pointer, and releases
- THEN the panel is resized
- AND the panel does not collapse
