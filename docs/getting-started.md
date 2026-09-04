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
git clone https://github.com/thamam/spec-design-yard.git
cd spec-design-yard
npm install
```

---

## Available Scripts

In the project directory, you can run the following commands:

### `npm run dev`
Runs the app in development mode, bound to loopback (`127.0.0.1`) only.
- Open [http://127.0.0.1:3000](http://127.0.0.1:3000) (or [http://localhost:3000](http://localhost:3000)) to view it in your browser.
- Another port: `npm run dev -- -p 3011` (then open that port). Do not point customer checks at a leftover `:3000` if you launched with `-p`.
- The page will hot-reload automatically if you make changes to the workspace code.
- The project and store APIs have no authentication in this default mode. Do not re-bind with `-H 0.0.0.0` or expose the port on an untrusted network. Opt-in remote access is a separate flag; see below.

### `npm run build`
Builds the Next.js application for production.
- Optimizes code, packages page bundles, and compiles statically generated routes into the `.next` directory.
- This command performs thorough type checking and linting of the TypeScript/React code.

### `npm run start`
Starts the Next.js production server, also bound to loopback (`127.0.0.1`) only.
- Must be run *after* executing `npm run build`.
- Serves the compiled production-ready bundles.
- Same network warning as `npm run dev`: this is a local tool, not a public service.

### `npm run test`
Runs the entire Vitest test suite once.
- Validates linter diagnostics, reconciler outputs, database hydration, simulation runs, autocomplete behavior, workspace state preservation, and more.

### `npm run test:watch`
Runs Vitest in watch mode.
- Re-runs tests automatically as soon as any test file or underlying source file is edited.

---

## Quick-Start Workflow

1. **Clone and install:** `git clone https://github.com/thamam/spec-design-yard.git && cd spec-design-yard && npm install`
2. **Launch the development server:** `npm run dev` (listens on `127.0.0.1:3000`; use `npm run dev -- -p <port>` to pick another port)
3. **Open the browser:** Go to `http://127.0.0.1:3000` (or the port you passed)
4. **Pick a project folder** when the first-run prompt appears, then edit the YAML spec in the **Code** tab and watch the canvas update.

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
SPEC_YARD_PROJECT_DIR=/path/to/client-repo npm run dev
```

(`npm run dev` already passes `-H 127.0.0.1`. You can still append the flag; it is redundant, not a different bind.)

### Opt-in remote access (Option A)

To open the same project files from a phone on your Tailscale tailnet:

```bash
npm run dev:remote
# or, from a client repo: spec-yard --remote
```

The process still listens on `127.0.0.1`. A remote token is generated once
under `~/.specyard/remote-token` (not in the project folder) and printed to
stdout. Then expose **Serve, not Funnel**:

```bash
tailscale serve --bg 3000
```

On the phone (signed into the same tailnet) open the MagicDNS HTTPS URL,
paste the token, and you get the existing workspace. `SPEC_YARD_REMOTE_HOST`
can add an extra allowed Host if Tailscale CLI detection is unavailable.

Rotate by deleting `~/.specyard/remote-token` and restarting with the remote
flag. Log out revokes every session cookie (including copies). If a session
expires mid-edit, the YAML is restored from a crash draft after you sign
in again. `spec-yard` does not send the token to an unverified `:3000`
occupant; `spec-yard --remote` exits if a local-mode server is already up.
Local `npm run dev` / `spec-yard` without `--remote` is unchanged
(loopback, no login).

Do not use `tailscale funnel` or any public URL. See [SECURITY.md](../SECURITY.md).

Either way the folder is recorded as the active project for future launches.

### Working without a project (opt-out)

If you just want to sketch without touching the filesystem, the picker offers
"Use browser storage instead". The workspace stays on screen (no white reload
flash) and **keeps the spec you were looking at** — it does not surprise-load
the External Brain demo. A later standalone launch with nothing saved in the
browser opens the same labeled blank slate a fresh project gets. The choice is
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

**Network exposure:** the default store and project APIs have no
authentication — this is a local-dev tool, and any launch can write into
the chosen project folder. Default launch paths (`npm run dev`,
`npm run start`, `spec-yard`) already bind loopback (`-H 127.0.0.1`).
Never re-bind to all interfaces. Remote access is an explicit
`SPEC_YARD_REMOTE=1` / `--remote` mode that requires a login session and
still does not bind `0.0.0.0`. Anyone who can authenticate in that mode
can read and overwrite files under the active project directory.
