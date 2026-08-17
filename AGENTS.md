# AGENTS.md — spec-design-yard

Single-page Next.js app: a visual IDE for editing a YAML "system spec" (components + connections) with live linting, an Excalidraw canvas, quick-fixes, and a packet-flow simulator. Edits on the YAML side and the canvas side reconcile bidirectionally.

## Commands

- `npm run dev` — dev server
- `npm test` — vitest run (jsdom, `globals: true`, setup in `tests/setup.ts`)
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
  - `quick-fixes.ts`, `autocomplete.ts`, `canvas-diff.ts` (Excalidraw scene diffing), `simulation.ts` (packet sim), `spec-store.ts` (persistence seam: localStorage + in-memory fallback)
  - `db.ts` — thin delegate onto spec-store; **not a real DB** despite the name
- `components/workspace/` — `workspace-layout.tsx` owns all cross-panel state; `editor-panel.tsx` (left pane), `canvas-panel.tsx` + `excalidraw-canvas.tsx` (right pane), `metrics-tab.tsx` (simulator UI), `auth-panel.tsx` (**cosmetic only — no auth backend**)
- `pages/index.tsx` → `<WorkspaceLayout/>` (the only routed page)

## Conventions (enforce, don't dilute)

- YAML write paths must use `yaml.parseDocument`, never `parse` — comment preservation is a product invariant
- State: plain React `useState`/props. No state library — do not add one
- Tests: flat `tests/` dir, kebab-case, `.test.ts` for lib, `.test.tsx` for components; strict TDD
- tsconfig `@/*` alias is mirrored in `vitest.config.ts` — keep them in sync
- Conventional Commits (scopes seen: `workspace`, `metrics`, `layers`, `grid-view`)

## Gotchas

- `prisma/schema.prisma` exists but **Prisma is not installed or wired** — persistence is localStorage-only
- The canvas is Excalidraw only — do not add a second canvas library
- No `next.config.*`, no ESLint/Prettier configs — match existing style manually
- `components/Workspace.tsx` (PascalCase) is a legacy re-export stub — new components go in `components/workspace/`, kebab-case
- `_bmad-output/project-context.md` is the detailed agent rulebook (43 rules: dep pins, Excalidraw sync guards, undo semantics, NaN/ghost-component traps) — read it before non-trivial canvas/reconciler work
- CI (`.github/workflows/screenshot-validation.yml`) does pixel validation only; it does **not** run tests — run `npm test` yourself

## Repo overlays (not app code)

- `openspec/` — spec-driven workflow; one living spec (`specs/stride-security/`), completed changes under `changes/archive/`
- `_bmad/`, `.agent/`, `.agents/`, `.claude/`, `.codex/`, `.bmad-loop/` — agent-framework installs and orchestration state; excluded from the codegraph index
- `sketches/` — 4 static HTML design explorations; `design-artifacts/` — empty scaffold dirs
- `scripts/` — legacy agent tooling (Playwright pixel validation used by CI, v0.dev utilities); not wired into npm scripts
