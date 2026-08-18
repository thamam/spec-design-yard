# spec-persistence Specification

## Purpose

Persists the workspace's spec, simulation history, and custom presets —
to browser localStorage by default, or as files inside a client repo when the
app is launched against one — so work survives reloads and, in file mode,
lives with the project it describes.

## Requirements

### Requirement: Project-scoped file persistence

When launched with `SPEC_YARD_PROJECT_DIR` set, the system SHALL persist the
spec as raw YAML text at `<projectDir>/main.spec.yaml` and SHALL record
title/updatedAt metadata keyed by spec id in
`<projectDir>/.specyard/spec-index.json` on every save.

#### Scenario: Autosave writes the spec file

- GIVEN the app is running with `SPEC_YARD_PROJECT_DIR=/repo/client-x`
- WHEN the spec autosave fires (1s debounce after an edit)
- THEN `/repo/client-x/main.spec.yaml` contains the current YAML text
- AND `/repo/client-x/.specyard/spec-index.json` records the title and an
  updated `updatedAt` timestamp

### Requirement: Server-canonical hydration

When file mode is active, the system SHALL load the spec from the project
file on mount, overriding any stale localStorage cache, before enabling
autosave.

#### Scenario: Repo file wins over stale cache

- GIVEN `<projectDir>/main.spec.yaml` contains spec version B
- AND localStorage `spec_main` contains older spec version A
- WHEN the workspace mounts
- THEN the editor shows version B
- AND no autosave of version A is written back to the file

#### Scenario: First launch against a repo with no spec file

- GIVEN file mode is active and `<projectDir>/main.spec.yaml` does not exist
- WHEN the workspace mounts
- THEN the editor shows the built-in initial spec
- AND any localStorage-cached spec (which may belong to a different project)
  is discarded, never written into this repo

### Requirement: Hydration input lockout

The editor SHALL refuse user input until hydration (including the server pull)
has completed, so a keystroke during the hydration window can never be
autosaved over the canonical project file.

#### Scenario: Typing during hydration

- GIVEN the workspace is still hydrating
- WHEN the user types in the spec editor
- THEN the input is refused (editor disabled)
- AND once hydration completes the editor shows the hydrated spec and accepts
  input

### Requirement: Write conflict protection

When file mode is active, a spec write SHALL be rejected with a conflict
(HTTP 409) when the file changed since the writer's base — whether by another
app instance (stale `baseRev`), an external edit (file mtime mismatch), or
external deletion — and no bytes are written. On conflict the client SHALL
reconcile first (if the server holds exactly what its previous write sent,
it adopts the fresh `rev` and retries once); a genuine divergence stops
mirroring and logs a reload instruction.

#### Scenario: External edit during an open session

- GIVEN the workspace is open on a repo spec
- WHEN the file is edited outside the app
- THEN the next autosave PUT is rejected with 409
- AND the external content remains on disk

#### Scenario: Hand-authored file adoption

- GIVEN `<projectDir>/main.spec.yaml` exists but was never written by the app
  (no index entry)
- WHEN the app first saves
- THEN the write succeeds and the file comes under conflict protection

### Requirement: Metadata sidecar

When file mode is active, simulation history and custom simulation presets
SHALL persist under `<projectDir>/.specyard/` as
`simulation_history.json` and `custom_presets.json`.

#### Scenario: Simulation history survives across browsers

- GIVEN the app is running with `SPEC_YARD_PROJECT_DIR` set
- WHEN a simulation run is saved
- THEN `<projectDir>/.specyard/simulation_history.json` contains the run
- AND a fresh browser session (empty localStorage) loading the workspace
  sees the run in history

### Requirement: LocalStorage fallback when file mode is off

When `SPEC_YARD_PROJECT_DIR` is unset, the system SHALL persist to browser
localStorage (keys `spec_main`, `simulation_history`,
`custom_simulation_presets`) with an in-memory fallback when localStorage is
unavailable, and SHALL NOT surface errors to the user about file mode being
unavailable.

#### Scenario: Standalone launch unchanged

- GIVEN the app is running without `SPEC_YARD_PROJECT_DIR`
- WHEN the user edits the spec and runs simulations
- THEN all persistence behaves exactly as the localStorage baseline
- AND no file-mode error is shown in the UI

### Requirement: Path safety

The store API SHALL reject any request whose resolved file path escapes
`SPEC_YARD_PROJECT_DIR` or whose key is not in the whitelist
(`spec/main`, `meta/simulation_history`, `meta/custom_presets`).

#### Scenario: Traversal attempt rejected

- GIVEN the app is running with `SPEC_YARD_PROJECT_DIR` set
- WHEN a request targets a key outside the whitelist or a path containing
  traversal segments
- THEN the API responds with an error status and writes nothing to disk
