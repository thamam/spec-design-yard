# AGENTS.md — spec-design-yard

Single-page Next.js app: a visual IDE for editing a YAML "system spec" (components + connections) with live linting, an Excalidraw canvas, quick-fixes, and a packet-flow simulator. Edits on the YAML side and the canvas side reconcile bidirectionally.

## Commands

- `npm run dev` — dev server
- `npm run install-cli` — one-time setup: symlinks `bin/spec-yard` into `~/.local/bin`; afterwards `spec-yard [client-repo]` launches file-backed mode from anywhere
- `npm test` — vitest run (jsdom, `globals: true`, setup in `tests/setup.ts`)
- `npm run test:e2e` — real-browser scenarios (`scripts/run-e2e.sh`; add a scenario name to run just one: `file-mode`, `first-run`, `standalone`, `editor-ergonomics`, `focus-disclosure`). Needs `playwright` + `playwright install chromium`. Each scenario gets its own dev server on 3109-3113, its own project folders, and its own `SPEC_YARD_CONFIG_DIR` under a temp root — never point it at your own registry or at port 3000. Failing scenarios leave their screenshots in `.e2e-failures/`.
- `npm run build` — production build; must stay clean
- `npm run lint` — **do not rely on it**: no ESLint config exists, it prompts interactively

## Code index (codegraph)

A local codegraph index is initialized in `.codegraph/` (config: `codegraph.json`, which excludes the agent-skill mirrors). Prefer it over grep-and-read loops for structural questions:

- MCP: `mcp__codegraph__*` tools (configured in `.kimi-code/mcp.json`; auto-approved via user `config.toml`)
- CLI: `codegraph explore "<question>"`, `codegraph callers <symbol>`, `codegraph impact <symbol>`, `codegraph status` (binary at `~/.hermes/node/bin/codegraph`)
- The index auto-syncs on file changes while the MCP server runs; `codegraph sync` otherwise

## Architecture

- `lib/` — pure logic, **no React imports allowed here**:
  - `spec-model.ts` — `Spec` types + `parseSpec(text)`; tolerant of partial/invalid YAML (survives mid-keystroke)
  - `reconciler.ts` — canvas↔YAML mediator: `reconcileSpec`, `parsePath` (prototype-pollution guarded), `autoLayoutDiagram`, ~40 `FixType`s
  - `linter.ts` — `lintSpec()` → `Diagnostic[]` (incl. STRIDE rules)
  - `quick-fixes.ts`, `autocomplete.ts`, `canvas-diff.ts` (Excalidraw scene diffing), `simulation.ts` (packet sim), `spec-store.ts` (persistence seam: `SpecStore` interface + localStorage/in-memory implementation)
  - `remote-sync-store.ts` — the app-wide store instance: wraps `LocalStorageSpecStore` as a write-through cache and mirrors writes to `pages/api/store/[...path].ts` when file mode is on; all consumers must import the store from here, not from `spec-store.ts`
  - `db.ts` — thin delegate onto the store (incl. `loadFromServer`); **not a real DB** despite the name
- `components/workspace/` — `workspace-layout.tsx` owns all cross-panel state; `editor-panel.tsx` (left pane), `canvas-panel.tsx` + `excalidraw-canvas.tsx` (right pane), `metrics-tab.tsx` (simulator UI)
- `pages/index.tsx` → `<WorkspaceLayout/>` (the only routed page)

## Conventions (enforce, don't dilute)

- YAML write paths must use `yaml.parseDocument`, never `parse` — comment preservation is a product invariant
- State: plain React `useState`/props. No state library — do not add one
- Tests: flat `tests/` dir, kebab-case, `.test.ts` for lib, `.test.tsx` for components; strict TDD
- tsconfig `@/*` alias is mirrored in `vitest.config.ts` — keep them in sync
- Conventional Commits (scopes seen: `workspace`, `metrics`, `layers`, `grid-view`)

## Gotchas

- Persistence is project-FIRST. The active project folder (`<project>/main.spec.yaml` + `<project>/.specyard/*.json`, written by `pages/api/store/[...path].ts`) resolves via `lib/server-project-config.ts`: session switch > `SPEC_YARD_PROJECT_DIR` (seeds the config) > persisted registry at `~/.specyard/config.json` (`SPEC_YARD_CONFIG_DIR` overrides the location — tests set it in `tests/setup.ts`; NEVER let a test touch the real one) > "unconfigured" (first-run prompt). Standalone/browser-only is an explicit persisted opt-out, not the default. On mount the project file wins over the browser cache (`loadFromServer` before `setIsHydrated` in `workspace-layout.tsx`). No auth on the routes by design — local-dev only; never expose the dev server on an untrusted network.
- Project selection is GUI-first: header picker (`components/workspace/project-picker.tsx` → `pages/api/project.ts`; loopback-Host + JSON-content-type guarded, absolute/exists/writable validation). `lib/server-project-config.ts` keeps session state on globalThis (plain module state would be duplicated per API-route bundle) and is server-only (imports node `crypto`/`fs`) — never import it from client code. Every switch re-mints a project "epoch"; client PUTs echo it (`?epoch=`) and a stale one 409s (`project-switched`), so a tab on the old project can't clobber the new one. `bin/spec-yard <dir>` retargets a running instance through the same API.
- Fresh projects (`{found:false}`) open with the labeled blank `FRESH_PROJECT_SPEC`, never the `INITIAL_SPEC` demo, and nothing is autosaved until the user edits. So does a first run, which the store distinguishes from an opt-out via `{enabled:false, mode}` — the demo appears only after the user explicitly chooses browser storage, and must never be written into a project folder uninvited.
- The canvas is Excalidraw only — do not add a second canvas library
- No `next.config.*`, no ESLint/Prettier configs — match existing style manually
- `components/Workspace.tsx` (PascalCase) is a legacy re-export stub — new components go in `components/workspace/`, kebab-case
- `_bmad-output/project-context.md` is the detailed agent rulebook (43 rules: dep pins, Excalidraw sync guards, undo semantics, NaN/ghost-component traps) — read it before non-trivial canvas/reconciler work
- CI runs two workflows on every PR. `.github/workflows/tests.yml` runs vitest with coverage, the diff-scoped coverage gate (`npm run test:coverage-gate`, which requires 100% coverage of the lines a branch adds or modifies), `npm run build`, and the full e2e suite. `.github/workflows/screenshot-validation.yml` does pixel validation only. Still run `npm test` yourself before pushing, and `npm run test:e2e` after anything touching persistence, hydration, or the project picker (mocked fetches have missed real first-run regressions)

## Repo overlays (not app code)

- `openspec/` — spec-driven workflow; living specs under `specs/` (`stride-security`, `spec-persistence`), completed changes under `changes/archive/`
- `_bmad/`, `.agent/`, `.agents/`, `.claude/`, `.codex/`, `.bmad-loop/` — agent-framework installs and orchestration state; excluded from the codegraph index
- `sketches/` — 4 static HTML design explorations; `design-artifacts/` — empty scaffold dirs
- `bin/spec-yard` — the standard CLI launcher (file-backed mode from any client repo); installed to PATH by `scripts/install-cli.sh`
- `scripts/` — legacy agent tooling (Playwright pixel validation used by CI, v0.dev utilities); only `install-cli.sh` is wired into npm scripts
