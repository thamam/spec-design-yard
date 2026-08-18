# Delta for spec-persistence

New capability. Baseline (brownfield, verified against `lib/spec-store.ts`,
`lib/db.ts`, `components/workspace/workspace-layout.tsx`): today the app
persists only to browser localStorage under keys `spec_main`,
`simulation_history`, and `custom_simulation_presets`, with an in-memory
fallback when localStorage is unavailable; hydration happens on mount and
autosave is debounced at 1s. There is no server, no project concept, and no
filesystem writes.

## ADDED Requirements

### Requirement: Project-scoped file persistence

When launched with `SPEC_YARD_PROJECT_DIR` set, the system SHALL persist the
spec as raw YAML text at `<projectDir>/main.spec.yaml` and SHALL record
`{id, title, updatedAt}` metadata in `<projectDir>/.specyard/spec-index.json`
on every save.

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

- GIVEN `<projectDir>/main.spec.yaml` does not exist
- WHEN the workspace mounts
- THEN the editor falls back to the localStorage spec or the built-in
  initial spec, exactly as in baseline behavior

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

When `SPEC_YARD_PROJECT_DIR` is unset, the system SHALL behave exactly as the
baseline: localStorage persistence with in-memory fallback, and SHALL NOT
surface errors to the user about file mode being unavailable.

#### Scenario: Standalone launch unchanged

- GIVEN the app is running without `SPEC_YARD_PROJECT_DIR`
- WHEN the user edits the spec and runs simulations
- THEN all persistence behaves exactly as the current localStorage baseline
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
