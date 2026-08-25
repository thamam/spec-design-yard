# Getting Started with Spec-Design-Yard

Welcome to the **spec-design-yard** (Spec-Yard)! This project is an interactive, visual, and analytical workspace for system architecture design and evaluation. It reads a clean system specification written in standard YAML, validates it against logical and architectural rules using an integrated linter, and renders it as an interactive diagram.

---

## Prerequisites

Ensure you have the following installed on your machine:
- **Node.js** (v18+ or v20+ recommended)
- **npm** or **yarn** or **pnpm**

---

## Installation

To set up the project locally, clone the repository, navigate into the project directory, and install its dependencies:

```bash
# Navigate to the project folder
cd spec-design-yard

# Install npm dependencies
npm install
```

---

## Available Scripts

In the project directory, you can run the following commands:

### `npm run dev`
Runs the app in development mode.
- Open [http://localhost:3000](http://localhost:3000) to view it in your browser.
- The page will hot-reload automatically if you make changes to the workspace code.

### `npm run build`
Builds the Next.js application for production.
- Optimizes code, packages page bundles, and compiles statically generated routes into the `.next` directory.
- This command performs thorough type checking and linting of the TypeScript/React code.

### `npm run start`
Starts the Next.js production server.
- Must be run *after* executing `npm run build`.
- Serves the compiled production-ready bundles.

### `npm run test`
Runs the entire Vitest test suite once.
- Validates linter diagnostics, reconciler outputs, database hydration, simulation runs, autocomplete behavior, workspace state preservation, and more.

### `npm run test:watch`
Runs Vitest in watch mode.
- Re-runs tests automatically as soon as any test file or underlying source file is edited.

---

## Quick-Start Workflow

1. **Install dependencies:** `npm install`
2. **Launch the development server:** `npm run dev`
3. **Open the browser:** Go to `http://localhost:3000`
4. **Make adjustments:** Edit the system architecture spec directly inside the Editor's **Code Tab** using YAML syntax, watch the live linter update inline, and view the visual graph adjust in real time on the canvas.
5. **Verify stability:** Run `npm run test` to confirm all system unit and integration tests are passing perfectly.

---

## Working in a Project (the default)

Spec-Yard is project-first: your spec lives as files in a project folder you
choose, and the app remembers that choice (in `~/.specyard/config.json`) so
every later launch reopens the same project.

**First launch:** the workspace opens with the project prompt showing a
suggested folder (`~/spec-yard-projects/my-system`). One click creates it and
you're working on files. You can type any absolute path instead — for example
the repo of the system you are designing.

**Every launch after that:** `npm run dev` reopens your last project. The
header badge always shows the active project folder; click it to see the full
path, switch to another project, create a new one, or pick from your recent
projects. Switching reloads the workspace against the new folder's files, and
any tab still open on the previous project has its saves refused (reload it
to join the new project).

The active project persists as:

- `<project>/main.spec.yaml` — the spec itself, raw YAML (committable,
  diffable, hand-editable outside the tool)
- `<project>/.specyard/spec-index.json` — spec title / updated-at metadata
- `<project>/.specyard/simulation_history.json` — simulation run history
- `<project>/.specyard/custom_presets.json` — custom simulator presets

On load, the project file wins over any stale browser cache. Add `.specyard/`
to the project's `.gitignore` if you don't want tool metadata committed (the
spec file itself is meant to be committed). A project with no
`main.spec.yaml` yet opens a labeled blank spec (`# New project …`) — never
the built-in demo — and writes nothing until your first edit.

### Launching against a specific repo from the terminal

The `spec-yard` launcher (installed once with `npm run install-cli`) opens the
workspace on a given folder from anywhere:

```bash
cd /path/to/client-repo
spec-yard            # or: spec-yard /path/to/client-repo
```

If no server is running it starts one bound to loopback; if one is already
running it switches that instance to the folder via the project API — same as
using the header picker. The equivalent manual command seeds the project via
an environment variable:

```bash
SPEC_YARD_PROJECT_DIR=/path/to/client-repo npm run dev -- -H 127.0.0.1
```

Either way the folder is recorded as the active project for future launches.

### Working without a project (opt-out)

If you just want to sketch without touching the filesystem, the picker offers
"Use browser storage instead": specs then live only in the browser's
localStorage (this is also where the built-in demo spec lives). The choice is
remembered; opt back in by picking a project folder from the same panel — a
sketch made in browser storage carries over into the first project you pick
(it lands in `main.spec.yaml` on your next edit).

### Safety notes

**Editing the spec file outside the tool:** safe only while the workspace is
closed, or before the workspace's first save. The app reads the file on
mount; if the file changes underneath an open session (external edit,
`git checkout`, a second app instance), the next autosave is rejected with a
conflict instead of overwriting — reload the workspace to adopt the external
version.

**Network exposure:** the store and project APIs have no authentication by
design — this is a local-dev tool, and any launch can write into the chosen
project folder. Keep the dev server bound to loopback (`-H 127.0.0.1`; the
launcher does this) and never expose it on an untrusted network: anyone who
can reach the port can read and overwrite files under the active project
directory. The project API additionally refuses non-loopback `Host` headers
and non-JSON writes.
