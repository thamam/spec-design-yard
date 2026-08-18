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

## Working on a Client Repo

By default everything you create lives in the browser's localStorage. To have
the spec and workspace metadata saved as files inside the project you are
designing for, point the dev server at that repo at launch:

```bash
SPEC_YARD_PROJECT_DIR=/path/to/client-repo npm run dev
```

With the variable set, the app persists into the client repo:

- `<repo>/main.spec.yaml` — the spec itself, raw YAML (committable, diffable,
  hand-editable outside the tool)
- `<repo>/.specyard/spec-index.json` — spec title / updated-at metadata
- `<repo>/.specyard/simulation_history.json` — simulation run history
- `<repo>/.specyard/custom_presets.json` — custom simulator presets

On load, the repo file wins over any stale browser cache. Add `.specyard/` to
the client repo's `.gitignore` if you don't want tool metadata committed (the
spec file itself is meant to be committed).

Without `SPEC_YARD_PROJECT_DIR`, behavior is unchanged: localStorage-only
persistence, no filesystem writes.
