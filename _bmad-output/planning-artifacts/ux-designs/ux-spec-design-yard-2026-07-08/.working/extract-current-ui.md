# Spec-Design-Yard — Current UI Survey (as-built, 2026-07-08)

A dark-themed, desktop-oriented "visual IDE" for authoring system-architecture specs in YAML, with a live Excalidraw diagram, an architectural linter, and a packet-traffic simulator. Next.js 14 Pages Router, Tailwind + inline CSS-vars, localStorage/Prisma persistence.

## 1. Routes / Screens

Only three pages exist (`pages/`):

- **`pages/index.tsx`** — the entire product. Renders `<WorkspaceLayout />` and nothing else. This is the app.
- **`pages/hello-sentinel.tsx`** — a standalone dev/smoke "Hello from Sentinel — first run, 2026-06-25" splash on a purple gradient. Unrelated to the product UI, self-contained inline styles. Effectively dead/diagnostic.
- **`pages/_app.tsx`** — imports `@excalidraw/excalidraw/index.css` and `styles/globals.css`. No layout wrapper, no theme provider.

There is no routing, no multi-document navigation, no settings page, no auth route. `components/Workspace.tsx` just re-exports `WorkspaceLayout` (a shim).

## 2. Layout & Information Architecture

Defined in `components/workspace/workspace-layout.tsx`. Full-viewport (`h-screen w-screen overflow-hidden`) vertical stack:

1. **Header bar** (`workspace-header.tsx`), fixed 44px (`h-11`).
2. **Split-pane body** — two horizontally-resizable columns with a drag handle between them.
   - **Left = Editor panel** — starts at 42% (`DEFAULT_SPLIT`, layout:15), min width 280px (`MIN_PANEL_WIDTH`, layout:14).
   - **Right = Canvas panel** — remaining width, min 280px.
3. **Status bar footer** (`StatusBar`, layout:378), fixed 24px (`h-6`).

The **drag handle** (layout:319) is a 5px vertical bar (`role="separator"`, `aria-orientation="vertical"`) that reveals a 5-dot grip on hover and turns accent-colored while dragging. Split is clamped so neither panel goes below 280px (layout:260-266). Resize is mouse-only (`onMouseDown`/`mousemove`); no touch handlers.

**Left panel = tabbed editor** (`editor-panel.tsx`, EditorPanel:3899). Structure top-to-bottom:
- Tab bar (36px) with 4 tabs: **Code / Tree / Focus / Metrics** (`TABS`, editor-panel:3703), each with a lucide icon; active tab has accent underline. When Code tab is active, a right-aligned mini-toolbar appears (word-wrap toggle, Search, Copy — editor-panel:3948).
- File-path breadcrumb strip (28px): `workspace / specs / main.spec.yaml` + a "YAML" pill (editor-panel:3983).
- Active tab panel (all four are always mounted, toggled via `hidden` attribute — editor-panel:4006-4067).
- **Diagnostics panel** pinned to the bottom of the editor (editor-panel:4069) — collapsible, shows a status dot (red/amber/emerald), issue count or "all checks passing", and the full diagnostic list with per-code quick-fix buttons.

**Right panel = canvas** (`canvas-panel.tsx`, CanvasPanel:116). Structure:
- Toolbar (36px): left = 3-way **view switcher** (`role="tablist"`) Diagram / Grid / Layers (canvas-panel:62); right = 4 tool buttons: Preview (dead), Reset view, Re-layout (Sparkles/auto-layout), Fullscreen toggle (canvas-panel:201).
- Canvas breadcrumb strip (28px): `{systemName} / Architecture Diagram` + an "Excalidraw" pill (canvas-panel:232).
- Content: one of `<ExcalidrawCanvas>`, `<GridView>`, or `<LayersView>`.

**Movement between areas:** Clicking a component anywhere (canvas node, Tree row, Grid card, SPOF list, hotspot) sets `selectedUnit`, which auto-switches the editor to the **Focus** tab (`useEffect` in EditorPanel:3780, and again in layout). Grid cards explicitly call `setActiveTab("focus")` (canvas-panel:556). This is the primary cross-panel navigation. State (`selectedUnit`, `activeTab`, `pathSource/Target`) is lifted to `WorkspaceLayout` and shared between both panels.

## 3. Feature Inventory (as-built)

**YAML editing (Code tab, `CodeTab` editor-panel:43):**
- Plain `<textarea>` (no CodeMirror/Monaco) with monospace styling, `spellCheck=false`. No line numbers despite the docs claiming "line numbers" (`features-and-workspace.md:22`) — none are rendered.
- **Autocomplete** (`lib/autocomplete.ts`): a floating pill bar anchored bottom-of-editor (editor-panel:147) suggesting IDs / Keys / Values. Arrow keys navigate, Tab/Enter apply, Esc dismisses (editor-panel:103).
- Word-wrap toggle exists in the toolbar but the `wordWrap` state is **not wired to the textarea** (editor-panel:3793, 3950) — dead toggle. The toolbar Search button has no handler (editor-panel:3962) — dead.

**Tree tab (`TreeTab` editor-panel:184):** collapsible hierarchy (System → components → per-component name/connections), a search input with clear button, a type filter dropdown, and a "Matched: X of Y" stat. Emoji glyphs (📄 ❖ →) as tree icons. Empty state present ("Awaiting valid YAML input…").

**Focus tab (`FocusTab` editor-panel:411):** deep single-component inspector:
- Duplicate / Deselect actions (editor-panel:543).
- Per-component diagnostics box with quick-fix buttons (editor-panel:564).
- Property editor: Component ID (with rename button + validation error), Display Name, Type select, Owner, Deployment Status select, Theme/Color select, Semantic Version, Latency (ms), Throughput (req/s), Architectural Description textarea (editor-panel:609-770).
- **Outbound connections** manager + **Add Connection** (target select + optional label) (editor-panel:776-877).
- **Inbound connections** manager + **Add Incoming Connection** (editor-panel:884-985).
- "Live AST-Reconciled Spec" read-only preview (editor-panel:994).
- When nothing is selected, it becomes a **system-level** editor (System Name / Version / Status / Owner / Description + init-metadata button) (editor-panel:490, 1004+).

**Metrics tab (`MetricsTab` editor-panel:1560):** the largest surface. Contains:
- System metadata card (editor-panel:2622).
- Aggregate stats: Total Connections, Connection Density, Independent Subgraphs (editor-panel:2729-2748).
- Breakdown by Type (editor-panel:2757).
- **Architectural Hotspots** (by degree, editor-panel:2792).
- **Single Points of Failure (SPOFs)** — clickable, selects the node (editor-panel:2831).
- **Architectural Recommendations** incl. **STRIDE security threat** insights with fix buttons ("Apply Spoofing Guard", "Inject Central Audit Logger", "Apply Rate Limiting Guard", etc. — editor-panel:2021-2035, 2867).
- **Interactive Flow & Path Tracer** (editor-panel:2914): Trace Start/End selects, Simulation Environment **Preset** dropdown (Standard Dev / High Traffic / Flaky Wireless / Extreme Stress / Sanity / Custom — editor-panel:2966), Simulated Packets select, Additional Packet Loss **slider**, save-custom-preset input.
- Per-path **Run Performance Simulation** with: progress bar, packet counters, **playback controls** (0.5x/1x/2x/5x speed, Pause/Resume ▶️⏸️, single Step 🦶 — editor-panel:3203-3231), a **"Tracing Logs Terminal"** console (editor-panel:3241), and a completion **Performance Diagnostic Report** with recommendations (editor-panel:3252).
- **Path comparison panel** (compare checkboxes, editor-panel:3338).
- **Simulation history panel** with Export-all JSON / CSV / Clear, plus per-run JSON/CSV export (editor-panel:3456-3520). History persisted to localStorage.
- **Component Directory** with search + type filter + severity filter (editor-panel:3558).

**Canvas — Diagram view (`excalidraw-canvas.tsx`):** live Excalidraw scene compiled from the spec (dynamic import, SSR off, with a custom shimmer skeleton — canvas-panel:29). `theme="dark"`, grid size 20, selection tool default, background-color action disabled (excalidraw-canvas:691). Supports: click-to-select (writes back to `selectedUnit`), drag-to-reposition (debounced 450ms write-back of x/y to YAML — excalidraw-canvas:644), delete, connect (draw arrow), rename. Node color by type: Store=indigo `#6366f1`, Stage=purple `#c084fc`, Brick=emerald `#34d399`, Gateway=amber `#f59e0b` (excalidraw-canvas:235-243); error nodes red, active-path nodes neon indigo.

**Canvas — Grid view (`GridView` canvas-panel:304):** card grid with search, type filter, issue filter, sort. Per-card: type badge, hover Duplicate/Delete actions, diagnostics badge, inline diagnostics with per-code **Fix** buttons, and double-click **inline rename** with validation (canvas-panel:671).

**Canvas — Layers view (`LayersView` canvas-panel:795):** lists component types with counts and per-type **visibility toggles** (eye icon) that hide those types across Diagram/Grid via `hiddenTypes`.

**Linting/quick-fixes:** `lib/linter.ts` emits ~60 distinct rule codes, severity `error | warning | info`. Quick-fixes surface in three places: the bottom Diagnostics panel (per-code buttons + "Auto-Fix All" — editor-panel:4133), the Focus tab, and Grid cards. Reconciler change types in `lib/reconciler.ts:3` cover coords/delete/rename/rename-id/quick-fix/quick-fix-all/add/connect/disconnect/connection-label/update-property/duplicate.

**Undo/redo:** `use-undo-redo.ts` — 100-entry history, 800ms debounced commits while typing, immediate commits for canvas edits. Wired to header Undo/Redo buttons and Cmd/Ctrl+Z, Cmd+Shift+Z / Ctrl+Y (layout:130).

**Auto-layout / reset view:** canvas toolbar Sparkles (auto-layout via `autoLayoutDiagram`) and RefreshCw (scroll-to-fit via `window.excalidrawAPI`) — canvas-panel:203-222.

**Persistence/auth:** `AuthPanel` sign-in modal (email + optional name, fake auth). When "signed in", spec auto-saves to `lib/db.ts` (debounced 1s, layout:190). No real backend call in the client path.

## 4. Visual Identity

**CSS custom properties** — the *only* defined tokens live in `styles/globals.css:5-15`, all dark:
```
--background: #09090b;   --surface: #18181b;      --surface-overlay: #27272a;
--border: #27272a;       --border-subtle: #3f3f46;
--foreground: #f4f4f5;   --foreground-muted: #a1a1aa; --foreground-dim: #52525b;
--accent: #6366f1;
```
This is essentially Tailwind **zinc** for surfaces + **indigo-500** accent.

**Undefined-but-referenced tokens (bug):** components reference `--surface-elevated` (9×), `--success` (2×), `--warning` (1×), `--accent-dim` (2×) which are **not declared anywhere** (verified by grep). So active-tab backgrounds (`--surface-elevated`), the status-bar "Ready" dot (`--success`), the file icon color (`--warning`), and active tool-button backgrounds (`--accent-dim`) resolve to nothing / transparent — silent visual degradation.

**Theme handling:** dark-only. `body` background is `var(--background)` (globals.css:17). No `prefers-color-scheme`, no `dark:` variants, no theme toggle, no light palette. Excalidraw is hard-pinned `theme="dark"` (excalidraw-canvas:691). The "Theme/Color" select in Focus (editor-panel:1113) is per-component *node* color, not app theming.

**Type-semantic color system** (repeated across canvas, grid, layers): Store/default indigo `#6366f1`, Stage purple `#c084fc`, Brick emerald `#34d399`, Gateway amber `#f59e0b`; errors red `#ef4444`, warnings amber `#f59e0b`, success emerald `#10b981/#34d399`, SPOF/critical rose. Defined redundantly in each file (e.g. GridView canvas-panel:388, LayersView canvas-panel:806, excalidraw-canvas:16-22) rather than centralized.

**Typography:** body font `system-ui` stack (globals.css:21). Code textarea, badges, tree, and many labels use `font-mono`; UI chrome uses `font-sans`. Excalidraw nodes use the hand-drawn "Virgil" font (`currentItemFontFamily: 1`). Font sizes are very small and hardcoded: `text-[9px]`–`text-[13px]` dominate; section headings are `text-[10px]/[11px] uppercase tracking-wider font-bold`.

**Iconography:** `lucide-react` throughout for chrome (Code/Network/Focus/BarChart2, GitBranch/Play/Save/Share/Settings/Terminal/Undo/Redo, Eye/Grid/Layers/Maximize/Sparkles/RefreshCw, Copy/Trash2, LogIn/LogOut/User/ShieldAlert). Mixed with **emoji** used as functional glyphs in data-heavy areas: ❌⚠️ℹ️✓ in diagnostics (editor-panel:4163), 📄❖→ in Tree, 🚀⚙️📦✅📊 in sim logs, ▶️⏸️🦶 in playback. Inconsistent icon language between chrome (vector) and content (emoji).

**Spacing:** dense, IDE-like. Fixed bar heights (44/36/28/24px), gaps of `0.5`–`2`, rounded corners `rounded`/`rounded-lg`/`rounded-xl`. Dot-grid SVG overlays behind canvas skeleton and grid view for a "blueprint" feel.

## 5. Component Inventory (reusable pieces)

- **`HeaderButton`** (workspace-header.tsx:170) — the header's icon+label button, with hover handlers set via inline JS style mutation (not CSS classes). Supports `accent`/`active`/`disabled`.
- **`CanvasToolButton`** (canvas-panel.tsx:888) — square 28px icon button for the canvas toolbar.
- Tab buttons — two near-identical implementations (editor tabs at editor-panel:3919 and canvas views at canvas-panel:170), copy-pasted rather than shared.
- **`AuthPanel`** (auth-panel.tsx) — sign-in pill + modal.
- **`StatusBar`** (layout:378) and **`CanvasSkeleton`** (canvas-panel:29).
- Quick-fix buttons — dozens of nearly-identical inline `<button>`s (editor-panel:4175-4471) rather than one reusable component.

**Consistency:** low-to-medium. There is **no shared Button/Modal/Badge/Input component library**. Styling is applied three different ways, often mixed within one element: (a) CSS-var inline `style={{...}}`, (b) Tailwind zinc/indigo utility classes (e.g. `bg-zinc-900 border-zinc-800`), and (c) JS-driven hover state. The header/canvas/layout use the CSS-var system; the tab *contents* (Focus, Metrics, Tree, Grid, Auth) mostly use raw Tailwind `zinc-*`/`indigo-*` classes — two parallel systems that only coincidentally match. Modals: only the auth modal exists (fixed overlay `bg-black/60 backdrop-blur-sm`, uses `animate-fade-in` — inert, see rough edges). "Terminals" are styled `<div>` log consoles (sim logs at editor-panel:3241), not real terminals. No toast/notification system — transient feedback is done via `setTimeout` state flips (Save "Saving…", Copy checkmark).

## 6. Interaction Patterns (as-built, user's view)

- **Typing → canvas:** YAML parses on every keystroke (layout:229) with a `sanitizeParsedSpec` guard against mid-keystroke null list entries (layout:93) so the workspace doesn't crash. The diagram recompiles live. History commits are **debounced 800ms** so one undo reverses a "burst" of typing, not each character (use-undo-redo:88).
- **Canvas → YAML:** drag reposition is **debounced 450ms after drag stop** then written back as `coords` with `immediate: true` (excalidraw-canvas:648, layout:214). Delete/connect/rename on canvas write back immediately. Property edits in Focus use a **200ms per-field debounce** with instant local echo for "zero-lag typing" (editor-panel:529).
- **Selection is bidirectional:** canvas click ↔ list selection ↔ Focus tab, all via shared `selectedUnit`; selecting also scroll-centers the node on canvas (excalidraw-canvas:580).
- **Rename flows differ by surface:** Focus tab = ID input + explicit rename button with validation error; Grid = double-click inline input (Enter commit / Esc cancel) with duplicate-ID and format validation (canvas-panel:332); canvas = edit node text.
- **Undo/redo semantics:** Cmd/Ctrl+Z undo, Cmd+Shift+Z or Ctrl+Y redo (layout:141). Redo stack is pruned on new typing; a pending debounced edit is force-committed before an undo (use-undo-redo:96). Shortcuts are suppressed when typing in inputs *except* the spec textarea (layout:133).
- **Keyboard shortcuts:** only undo/redo globally. Autocomplete has its own Arrow/Tab/Enter/Esc handling. No command palette, no save shortcut (Cmd+S not captured), no delete-key handling outside Excalidraw's own.

## 7. UX Rough Edges (evidenced)

- **Dead buttons:** header **Terminal, Share, Run, Settings** all `onClick={() => {}}` (workspace-header.tsx:105/128/138/144); canvas **Preview** eye button is a no-op (canvas-panel:202); Code-tab **Search** button has no handler (editor-panel:3962); Code-tab **word-wrap** toggle flips state that is never applied (editor-panel:3950).
- **Fake affordances:** header **Save** just shows "Saving…" for 1.2s then "Save" with no real save (workspace-header.tsx:35); real persistence happens invisibly via the 1s auto-save effect only when signed in. The auth modal advertises "Postgres Integration Active" / "sync to the Postgres cloud database" (auth-panel.tsx:70,118) but client login is local-only state.
- **Undefined design tokens** degrade silently: `--surface-elevated`, `--success`, `--warning`, `--accent-dim` are used but never declared (see §4).
- **Missing animation:** the auth modal uses `animate-fade-in` (auth-panel.tsx:64) but no such keyframe/class is defined (`tailwind.config.js` has empty `extend`) — the class is inert.
- **Docs overstate the product:** `features-and-workspace.md:22` promises "line numbers" and "click-to-highlight links pointing to the error site" — neither is implemented (plain textarea; diagnostic paths are text badges, not clickable jumps).
- **Accessibility gaps:** tab bars use `role="tab"`/`aria-selected` but lack roving focus/arrow keys. Grid cards and SPOF rows have `tabIndex`/`onKeyDown`, but Tree rows are click-only `<div>`s (editor-panel:331) with no keyboard support. Hover on `HeaderButton` is JS-driven — no focus-visible styling. Emoji as status indicators (❌⚠️) with text alongside (partial mitigation).
- **Contrast/density:** pervasive `text-[9px]`/`text-[10px]` on `text-zinc-500` against near-black surfaces is low-contrast and very small. The Metrics tab crams a large number of stacked sections into a ~min-280px column.
- **Empty/loading states:** present in several places (canvas skeleton, Tree "Awaiting valid YAML", Grid "Awaiting valid specification components", Layers, "No components match", SPOF/hotspot "none detected"). No global error boundary UI beyond the parse-sanitizer; YAML syntax errors surface only as a red diagnostics-panel entry.
- **Redundant color/type maps** duplicated across ≥3 files invite drift.

## 8. Form Factor

**Desktop-only, mouse-first.** Evidence:
- `h-screen w-screen overflow-hidden` shell with two ≥280px panels side-by-side; no stacked/mobile fallback (layout:281, 300, 356).
- Panel resize is `mousedown`/`mousemove`/`mouseup` only — no touch/pointer events (layout:244).
- Breakpoints exist only to *hide* chrome on narrow screens (header branch pill `hidden sm:flex`, center title `hidden md:flex`, button labels `hidden sm:inline` — workspace-header.tsx:80/94/212) and to widen the Grid to 3 columns on `lg` (canvas-panel:548).
- Canvas relies on `window.excalidrawAPI` and Excalidraw's desktop interaction model.
- Assumes modern browser: `navigator.clipboard` (editor-panel:3894), localStorage.

**Reference assets:** `v0-workspace-screenshot.png` (repo root) and `docs/demo/spec-yard-demo.mp4` exist as prior-state captures of this same workspace; no other screenshots in `docs/`.
