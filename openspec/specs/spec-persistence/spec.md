# spec-persistence Specification

## Purpose

Persists the workspace's spec, simulation history, and custom presets.
Project-first: specs live as files inside a chosen project directory, and the
choice of project is itself persisted so every launch resumes where the user
left off. Browser-localStorage persistence exists as an explicit opt-out (and
as the write-through cache in project mode).

## Requirements

### Requirement: Project-first resolution and registry

The system SHALL resolve the active project directory server-side in this
order: (1) a switch made in the current session via the project API, (2) the
`SPEC_YARD_PROJECT_DIR` environment variable, (3) the persisted registry at
`<SPEC_YARD_CONFIG_DIR|~/.specyard>/config.json` (last active project, or an
explicit standalone opt-out), (4) otherwise "unconfigured". An env-var launch
SHALL be recorded into the registry so a later bare launch resumes the same
project. Every project switch SHALL update the registry's active project and
its most-recent-first, deduplicated, capped recent-projects list.

#### Scenario: Bare launch resumes the last project

- GIVEN a previous session worked in project `/repo/client-x`
- WHEN the app is launched with no `SPEC_YARD_PROJECT_DIR`
- THEN the workspace opens against `/repo/client-x`

#### Scenario: First run prompts instead of assuming

- GIVEN no env var and an empty registry
- WHEN the workspace mounts
- THEN the project picker opens by itself with a suggested folder prefilled
- AND one confirmation creates the folder and activates it as the project

### Requirement: GUI project selection

The system SHALL expose a loopback-only project API: GET returns the current
mode (`project` with directory/existence/source/recents, `standalone`, or
`unconfigured` with a suggested directory); PUT switches the active project
(`{dir, create?}`) or opts out to browser storage (`{mode:"standalone"}`).
PUT SHALL require an absolute path to an existing, writable directory
(optionally creating it when `create` is set), SHALL refuse non-loopback
`Host` headers and non-JSON content types, and SHALL NOT require any launch
flag — selecting projects is the primary, always-available flow. The header
UI SHALL always show the active mode and project at a glance.

#### Scenario: Switching projects from the workspace

- GIVEN the workspace is open on project A
- WHEN the user picks directory B in the header project picker
- THEN the app records B as the active project and reloads the workspace
  against B's files, with no server restart

#### Scenario: Non-loopback request refused

- GIVEN a request whose `Host` header is not a loopback name
- WHEN it hits the project API
- THEN it is refused and no mode or project changes

### Requirement: Project switch isolation (epoch)

The server SHALL maintain an opaque project epoch, re-minted on every project
or mode change. Spec GET responses SHALL carry it, clients SHALL echo it on
store writes, and a write carrying a stale epoch SHALL be rejected (HTTP 409,
reason `project-switched`) with no bytes written, so a tab still open on a
previously active project can never write into the newly selected one. On
receiving that rejection the client SHALL stop mirroring and instruct a
reload rather than reconcile-retry.

#### Scenario: Stale tab after a switch

- GIVEN tab 1 and tab 2 are open on project A
- WHEN tab 1 switches the app to project B and tab 2 then autosaves
- THEN tab 2's write is rejected with 409 `project-switched`
- AND project B's files are unchanged by tab 2

### Requirement: Project-scoped file persistence

When a project is active, the system SHALL persist the spec as raw YAML text
at `<projectDir>/main.spec.yaml` and SHALL record title/updatedAt metadata
keyed by spec id in `<projectDir>/.specyard/spec-index.json` on every save.

#### Scenario: Autosave writes the spec file

- GIVEN the app is running with active project `/repo/client-x`
- WHEN the spec autosave fires (1s debounce after an edit)
- THEN `/repo/client-x/main.spec.yaml` contains the current YAML text
- AND `/repo/client-x/.specyard/spec-index.json` records the title and an
  updated `updatedAt` timestamp

### Requirement: Server-canonical hydration

When a project is active, the system SHALL load the spec from the project
file on mount, overriding any stale localStorage cache, before enabling
autosave.

#### Scenario: Repo file wins over stale cache

- GIVEN `<projectDir>/main.spec.yaml` contains spec version B
- AND localStorage `spec_main` contains older spec version A
- WHEN the workspace mounts
- THEN the editor shows version B
- AND no autosave of version A is written back to the file

#### Scenario: Fresh project with no spec file opens a clean slate

- GIVEN a project is active and `<projectDir>/main.spec.yaml` does not exist
- WHEN the workspace mounts
- THEN the editor shows a clearly-labeled blank new spec — never the built-in
  demo content
- AND nothing is written to the project until the user's first edit
- AND any localStorage-cached spec (which may belong to a different project)
  is discarded, never written into this project

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

When a project is active, a spec write SHALL be rejected with a conflict
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

When a project is active, simulation history and custom presets SHALL
persist under `<projectDir>/.specyard/` as `simulation_history.json` and
`custom_presets.json`.

#### Scenario: Simulation history survives across browsers

- GIVEN the app is running with an active project
- WHEN a simulation run is saved
- THEN `<projectDir>/.specyard/simulation_history.json` contains the run
- AND a fresh browser session (empty localStorage) loading the workspace
  sees the run in history

### Requirement: Browser-storage opt-out

The system SHALL persist to browser localStorage when the user has explicitly
opted out of projects (standalone mode) or no project has been configured yet
(keys `spec_main`, `simulation_history`, `custom_simulation_presets`), with
an in-memory fallback when localStorage is unavailable; in these states it
SHALL NOT write to the filesystem and SHALL NOT surface file-mode errors to
the user. The built-in demo spec SHALL appear only in these no-project
states.

#### Scenario: Standalone opt-out

- GIVEN the user chose "use browser storage instead" in the picker
- WHEN they edit the spec and run simulations
- THEN all persistence behaves as the localStorage baseline
- AND the opt-out is remembered across launches until a project is selected
  again

### Requirement: Path safety

The store API SHALL reject any request whose resolved file path escapes the
active project directory or whose key is not in the whitelist
(`spec/main`, `meta/simulation_history`, `meta/custom_presets`).

#### Scenario: Traversal attempt rejected

- GIVEN the app is running with an active project
- WHEN a request targets a key outside the whitelist or a path containing
  traversal segments
- THEN the API responds with an error status and writes nothing to disk
