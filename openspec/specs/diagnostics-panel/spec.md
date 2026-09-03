# diagnostics-panel Specification

## Purpose

The linter's issue list at the bottom of the editor pane: how much of the
pane it occupies, how the user resizes it, and how it collapses — without
ever starving the spec textarea above it of a usable editing area.

## Requirements

### Requirement: Resizable panel height

The diagnostics panel SHALL provide a drag handle on its top edge. Dragging
the handle vertically SHALL grow or shrink the panel body, clamped between
a minimum height (at least one issue row remains visible) and a maximum
height (the spec textarea above SHALL always retain a usable editing area).
When the pane is too short to honour both minimums, the panel SHALL collapse
so the editor keeps its usable area — the panel is either at least one issue
row or collapsed, never a clipped sliver of a row. The drag SHALL work with
mouse and touch input. Panel height is session-local; it is not persisted
across mounts.

#### Scenario: Dragging up reveals clipped content

- GIVEN a spec producing 5 or more diagnostics, with action buttons clipped
  at the default height
- WHEN the user drags the top-edge handle upward
- THEN the panel body grows and the previously clipped action buttons
  become visible and clickable

#### Scenario: A pane too short for both minimums collapses the panel

- GIVEN an editor pane too short to give the panel its minimum height and
  still leave the spec textarea a usable editing area
- WHEN the panel height is resolved, on first paint or after a drag
- THEN the panel is collapsed rather than shown at a height below its
  one-row minimum
- AND the spec textarea keeps every pixel the panel gave up

#### Scenario: Height is clamped

- GIVEN the user drags the handle far beyond the top or bottom of the pane
- WHEN the drag ends
- THEN the panel height rests at the clamp boundary
- AND the spec textarea is still visible and editable

### Requirement: Collapse toggle

Clicking the panel header SHALL toggle the panel body between collapsed and
expanded. A resize drag SHALL NOT trigger the collapse toggle. When expanded,
the body SHALL open at the user's last dragged height for the session (or the
default height before any drag).

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

### Requirement: Test coverage for panel behaviours

Every behaviour added to or modified in the diagnostics panel SHALL be
covered by a unit test, and every user-visible behaviour SHALL additionally
be covered by a full-system e2e scenario (real `next dev`, real Chromium,
real project folder, per `scripts/run-e2e.sh`). Diff coverage SHALL be 100%
on the lines a change adds or modifies.

#### Scenario: Resize verified end to end

- GIVEN the full-system e2e suite runs with a project seeded to produce 5+
  diagnostics
- WHEN the drag-to-resize scenario executes
- THEN it passes in a real browser against the running app
