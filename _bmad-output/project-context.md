---
project_name: 'spec-design-yard'
user_name: 'Dox'
date: '2026-07-07'
sections_completed:
  [
    'technology_stack',
    'language_specific',
    'framework_specific',
    'testing',
    'code_quality',
    'development_workflow',
    'critical_dont_miss',
  ]
existing_patterns_found: 13
status: 'complete'
rule_count: 43
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- **Next.js 14.2.3** (exact pin) — **Pages Router** (`pages/`), NOT App Router: no RSC, no server actions. Stray `"use client"` directives in components are inert — don't add more or assume RSC semantics.
- **React 18.3.1 / react-dom 18.3.1** (exact pins, no caret).
- **TypeScript ^5.4.5** — `strict: true`, `noEmit`; path alias `@/*` → repo root, declared in BOTH `tsconfig.json` and `vitest.config.ts` — keep them in sync manually.
- **@excalidraw/excalidraw ^0.18.1** — the only canvas library, client-only. Its CSS is imported in `pages/_app.tsx` (`@excalidraw/excalidraw/index.css`) BEFORE `globals.css`; Pages Router allows global CSS only there.
- **yaml ^2.4.5** — every YAML write path uses `parseDocument` (never `parse`) — comment and formatting preservation is a core product invariant.
- **@xyflow/react ^12.4.2** — declared but UNUSED in source. Do not import or build on it.
- **Tailwind ^3.4.4** — content globs cover `pages/`, `components/`, `sketches/` only; utility classes in `lib/` or `styles/` won't be picked up.
- **Vitest ^1.6.0** + @testing-library/react ^15.0.7 + jsdom; `globals: true` (no describe/it/expect imports needed); setup = `tests/setup.ts` (jest-dom only).
- **npm** (package-lock.json), Node 20 in CI. Scripts: `dev`, `build`, `test` (=`vitest run`), `test:watch`. `npm run lint` has no ESLint config and prompts interactively — don't rely on it.
- Persistence is **project-first** (`lib/db.ts` → `lib/remote-sync-store.ts` wrapping `lib/spec-store.ts`): specs live as files in the active project folder, resolved server-side by `lib/server-project-config.ts` (session switch > `SPEC_YARD_PROJECT_DIR` > registry at `~/.specyard/config.json`; `SPEC_YARD_CONFIG_DIR` relocates it for tests). GUI switching via `pages/api/project.ts`; browser-localStorage is an explicit opt-out, and localStorage doubles as a write-through cache in project mode. The store answers `{enabled:false, mode}` when no project is active, because a first run (`unconfigured`) and a deliberate opt-out (`standalone`) get different starting specs — only the opt-out sees the built-in demo. `SyncState` (`unconfigured`/`local-only`/`synced`/`halted`) drives the status bar, so a save that does not reach the file is never console-only. Cached specs carry a `spec_<id>_origin` provenance tag: only `standalone` migrates into the first project picked, everything else is dropped rather than bled across projects. Hydrate-on-mount + debounced autosave armed only after hydration; browser scenarios run via `npm run test:e2e`. There is no auth, real backend, or Prisma — the APIs are unauthenticated loopback-only by design.

## Critical Implementation Rules

### Language-Specific Rules

- `parsedSpec` is deliberately typed `any` everywhere — it is untyped user YAML. Do not "fix" it with interfaces; guard at runtime instead.
- Named PascalCase exports for components (`export function WorkspaceLayout`); default exports only for Next pages.
- No `types/` directory — types are co-located: `Diagnostic` in `lib/linter.ts`, `CanvasChange`/`SpecDocument` in `lib/reconciler.ts`/`lib/db.ts`.
- All browser-API access is `typeof window !== "undefined"`-guarded; every `localStorage` read/write is wrapped in try/catch.
- Prototype-pollution hardening is load-bearing: `parsePath` drops `__proto__`/`constructor`/`prototype` (`lib/reconciler.ts:24-31`); lookup registries use `Object.create(null)` (`excalidraw-canvas.tsx:15,86,140,175`). Follow the same pattern for any new registry keyed by user input.

### Framework-Specific Rules

- All cross-panel state lives in `components/workspace/workspace-layout.tsx`; `editor-panel.tsx` and `canvas-panel.tsx` receive props. No state-management library — do not introduce one.
- Excalidraw is client-only and **double-guarded**: `next/dynamic({ ssr: false })` in `canvas-panel.tsx:21-27` AND a runtime `import("@excalidraw/excalidraw")` inside `useEffect` (`excalidraw-canvas.tsx:531-540`). Keep both.
- The Excalidraw API handle arrives via the `excalidrawAPI={...}` **prop** (not a ref) and is also exposed on `window.excalidrawAPI` — `canvas-panel.tsx:207-217` (Reset view) depends on the global.
- `compileSpecToExcalidrawElements(parsedSpec, pathSource?, pathTarget?, hiddenTypes?)` (`excalidraw-canvas.tsx:53`) is a **pure function** — no side effects, no API calls inside it.
- Two spec-write paths with different undo semantics: keyboard edits call `setSpecText(val, { isTyping: true })` (history commit debounced 800ms — one undo step per typing burst, `use-undo-redo.ts:87-92`); canvas-originated changes use `{ immediate: true }` (`workspace-layout.tsx:218,223`). Undo/redo flush the pending timer first; history caps at 100. Never mix the two up.

### Testing Rules

- Flat `tests/` dir, kebab-case: `<feature>.test.ts` for pure logic (`lib/*`), `<feature>.test.tsx` for components. 33 test files, 225+ tests.
- Vitest globals are on — no `describe/it/expect` imports. jsdom environment; `tests/setup.ts` wires jest-dom only, no global mocks.
- Convention is strict TDD (README/SENTINEL.md): specs and edge cases first, then implementation.
- **CI does NOT run tests** — the only automated gate is a PR screenshot/pixel check (`.github/workflows/screenshot-validation.yml`). "All tests pass + clean `npm run build`" is enforced by convention, so run both locally before declaring work done.

### Code Quality & Style Rules

- Component files kebab-case (`editor-panel.tsx`); hooks `use-<name>.ts` exporting `useName`. (`Workspace.tsx` is a legacy 2-line re-export stub — don't copy that pattern.)
- No ESLint/Prettier configs exist — match surrounding style manually; don't add configs as a drive-by.
- `lib/` is pure logic: no React imports there.
- Styling = Tailwind utilities + CSS custom properties from `styles/globals.css` (`--surface`, `--accent`, `--surface-overlay`); no CSS-in-JS.
- Comments in this codebase explain load-bearing guards (why a check exists); keep that density near sync/guard code and don't strip existing guard comments.

### Development Workflow Rules

- Conventional Commits, strictly: `feat(scope):`, `fix(scope):`, `chore:`, `refactor:`, `docs:`, `perf:`, `merge:`. Scopes in use: `workspace`, `metrics`, `layers`, `grid-view`.
- Feature branches merge into `main`; the project runs an adversarial review loop before merging (`chore: address adversarial reviewer feedback ...`).
- Only CI job: PR screenshot validation (build → `next start -p 3001` → Playwright capture → pixel analysis). Keep the app bootable with `npm run build && npx next start` or CI fails.

### Critical Don't-Miss Rules

- **Element normalizer (blank-canvas NaN trap)** — every compiled element must pass through the final `.map` at `excalidraw-canvas.tsx:486-498` injecting `angle: 0, opacity: 100, strokeStyle: 'solid'` (+ `lineHeight: 1.25` on text). A missing `angle` → `Math.cos(undefined) = NaN` → poisoned bounds → silently blank canvas. New element types MUST go through it.
- **Canvas→YAML sync guards** — `compiledIdsRef`/`compiledTextsRef` (`excalidraw-canvas.tsx:549-573`) distinguish compiled elements (deterministic ids: `arrow-<src>-<tgt>`, `text-<id>-<idx>`) from user-drawn shapes (random ids). Removing the `.has()` checks in the add/connect/rename sync (`:808-843`, `:870`) writes **ghost components** into the YAML while the user types.
- **Gesture + debounce discipline** — syncs are suppressed while `draggingElement/resizingElement/editingElement` is active (`:729-733`, `:804`); coordinate write-back is debounced **450ms** after drag stop (`:643-650`); renames are loop-guarded by `pendingRenameRef` (`:920-934`) and only written if the value actually changed against `parsedSpec` (`:880-918`).
- **Label format contract** — labels render as `` `${name}${marker}\n[${type}]` `` (`:284`) and the rename reverse-parser strips the exact ` ❌`/` ⚠️` suffixes and `[Type]` line (`:901-909`). Change the format and the parser **in lockstep** or renames corrupt names.
- **Dark theme by inversion** — colors are authored for a light canvas (`strokeColor: '#1e1e1e'` renders near-white); Excalidraw's `theme="dark"` filter inverts them. Never set `viewBackgroundColor` (`:700-701`) — inversion would flip it back to light.
- **Parse-boundary safety** — `sanitizeParsedSpec` (`workspace-layout.tsx:90-109`) strips `null`/array/non-object entries produced by mid-keystroke YAML (a bare `- ` parses to `null`); the parse effect (`:229-238`) swallows errors and keeps the last valid `parsedSpec`. Invalid intermediate YAML must never clear the diagram or crash a consumer.
- **Metrics math guards** — keep the division-by-zero patterns (`editor-panel.tsx:1749, 3194, 3268`), the `Math.max` denominator in path comparison (`:3360`), and the `Infinity → 200` capacity fallback (`:2168, :2288`); commit `b9146dc` exists because these were once missing.
- **Determinism** — Excalidraw seeds/versions come from `getDeterministicSeed(id)` (`excalidraw-canvas.tsx:7-13`) so recompiles don't churn the scene. The only random id allowed is the simulation-run id (`editor-panel.tsx:2182`).
- **Prefix-safe id resolution** — arrow/label id parsing sorts component ids by **descending length** before prefix-matching (`:27-28, :41-42`); preserve this when touching id-derived element names.
- **Batch quick-fixes** — `quick-fix-all` applies fixes sorted by descending array index (deletes don't shift earlier indices), `delete-component` forced last per index (`lib/reconciler.ts:376-405`).
- **Domain invariants** — component `id` matches `[A-Za-z0-9_-]` and is unique; connection `target` is case-sensitive and must resolve; the only component types are `Gateway`, `Stage`, `Store`, `Brick` (case-insensitive input, canonical PascalCase); path highlighting caps at 20 paths / 8 hops.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules
- Remove rules that become obvious over time

Last Updated: 2026-07-07
