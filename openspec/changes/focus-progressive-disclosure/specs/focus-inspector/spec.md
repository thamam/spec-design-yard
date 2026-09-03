# Delta for focus-inspector

## ADDED Requirements

### Requirement: Progressive disclosure of component fields

When a component is selected, Focus SHALL always show its display name
and component type. Owner, status, color, version, description, latency,
and throughput SHALL NOT be shown until the user expands a Details
disclosure. Component ID rename SHALL NOT be a primary field: it is
available from Details, not as the first input. Duplicate and Clear
Selection SHALL remain in the header.

#### Scenario: Default view shows name and type only

- GIVEN a component is selected and Focus is visible
- WHEN the tab renders with every disclosure at its default
- THEN the display-name input and type select are visible
- AND the owner, status, color, version, description, latency, and
  throughput inputs are not in the document
- AND the ID rename input is not in the document

#### Scenario: Expanding Details reveals the hidden fields

- GIVEN the default Focus view of a selected component
- WHEN the user activates the Details disclosure (mouse or keyboard)
- THEN owner, status, color, version, description, latency, throughput,
  and ID rename become visible
- AND the Details button reports `aria-expanded` true

### Requirement: Compact connections with progressive edit

When a component is selected, Focus SHALL show compact connection
summary chips (outgoing count, incoming count) that open the
Connections section. Connections SHALL be open by default and SHALL
list outgoing and incoming as two sublists of compact rows (target +
label). Disconnect and label editing SHALL appear only after the user
expands a row. Adding a connection SHALL take a single compact control
that reveals the add form; the full add form SHALL NOT be on screen
by default.

#### Scenario: Chips report counts and open Connections

- GIVEN a selected component with 1 outgoing and 3 incoming connections
- WHEN Focus renders
- THEN a chip labelled with the outgoing count and a chip labelled
  with the incoming count are visible
- AND activating either chip opens the Connections section

#### Scenario: Compact rows hide the edit form

- GIVEN Connections is open on a component that has an outgoing
  connection
- WHEN no row has been expanded
- THEN the row shows the target and label text
- AND the label input and Disconnect control are not in the document
- AND the add-connection target select is not in the document

#### Scenario: Expanding a row reveals disconnect and label edit

- GIVEN a compact outgoing row
- WHEN the user activates that row's Edit control
- THEN the label input and Disconnect control for that connection
  become visible

### Requirement: Compiled spec is hidden until asked for

The live AST-reconciled YAML dump SHALL NOT be in the document until
the user opens a "Show compiled spec" disclosure.

#### Scenario: Dump is absent by default

- GIVEN a component is selected
- WHEN Focus renders at defaults
- THEN the compiled-spec dump is not in the document

#### Scenario: Opening the disclosure shows the dump

- GIVEN the default Focus view
- WHEN the user activates "Show compiled spec"
- THEN the dump is visible and contains the selected component's YAML

### Requirement: Diagnostics stay on the default view

When the selected component has linter issues, Focus SHALL show those
diagnostics and their quick-fix actions without requiring a
disclosure. When it has none, the diagnostics block SHALL NOT appear.

#### Scenario: Quick-fix still applies from the default view

- GIVEN a selected component with an unrecognized type
- WHEN Focus renders
- THEN the diagnostics container and the unrecognized-type quick-fix
  are visible without expanding Details
- AND activating the quick-fix updates the spec

### Requirement: Global settings use the same disclosure

When nothing is selected, Focus SHALL show the system name. System
version, status, owner, and description SHALL NOT all be forced open;
they live behind a Details disclosure. Disclosure controls SHALL be
real buttons with accessible names.

#### Scenario: System name visible, extra metadata collapsed

- GIVEN Focus is visible and no component is selected
- AND the spec already has system metadata
- WHEN the tab renders at defaults
- THEN the system-name input is visible
- AND the system version, status, owner, and description fields are
  not in the document

### Requirement: Disclosure state is session-local

Focus disclosure state SHALL live in component state for the session.
It SHALL NOT be written to the project folder or to the spec store.

#### Scenario: A reload starts collapsed again

- GIVEN the user expanded Details on a selected component
- WHEN the workspace remounts
- THEN Details is collapsed and the dense fields are not in the
  document
