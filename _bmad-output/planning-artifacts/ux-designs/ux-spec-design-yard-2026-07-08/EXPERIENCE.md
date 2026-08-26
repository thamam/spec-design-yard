---
name: spec-design-yard
status: final
updated: 2026-07-09
sources:
  - ../../prds/prd-spec-design-yard-2026-07-07/prd.md
design_ref: ./DESIGN.md
---

# spec-design-yard — Experience Spine

> Behavior and flows. Visual identity lives in [`./DESIGN.md`](./DESIGN.md); token references below use
> `{path.to.token}` and resolve there. **Where any mock, wireframe, or direction board conflicts with
> these spines, the spines win.** Composition references linked inline are illustrative only.
>
> Glossary terms are mirrored verbatim from the PRD: *Spec · Component (Gateway / Stage / Store / Brick) ·
> Connection · Module / submodule · Interface / exposed member · Encapsulation violation · Quick-fix ·
> Dirty state · Project folder · Collapse / expand.*
>
> **Encapsulation clarifier (carried verbatim from the PRD):** modules and submodules are the **two
> encapsulation boundaries**; the **system root and leaf components are not encapsulation boundaries**. The
> hierarchy is therefore **system → module → submodule**, and it **bottoms out at submodule**: descend goes
> at most two levels deep, and **components are not descendable**.

## Foundation

**Desktop-only, mouse + keyboard-first.** A local-first visual IDE for system architecture, built on
Next.js + Excalidraw and run as a single local command over one **project folder** at a time.
`[ASSUMPTION]` launch = `npx spec-yard <folder>` (PRD FR1). It operates entirely locally — no telemetry,
no network calls with spec content, no accounts. Narrow windows degrade gracefully; they are not a
designed experience.

The **top principle is LEAN DESIGN**: the user sees only what they need, in both menus and diagram, and
chooses how much they see at any moment. Anti-overwhelm is the core value — the complaint against existing
tools this product answers. Every capability below is disclosed lean-by-default and summoned on demand.

The core loop is a **two-pane** contract: a YAML **editor** (left) and a live Excalidraw **canvas** (right)
of the same spec, bidirectionally synced — typing YAML re-renders the diagram; dragging, connecting,
renaming, or deleting on the canvas writes back into the YAML without destroying comments or formatting.
The spec↔diagram pair is a single honest contract; neither side is allowed to drift from the other.
`{colors.foreground}` names, `{colors.foreground-body}` body — visual specifics in `DESIGN.md`.

**View state vs. spec (resolves PRD OQ4).** Structural data and coordinates live in the **spec** (the
honest contract). View state — collapsed/expanded modules, dismissed tips, drawer dock position, lint
severity threshold — lives in a **project-folder config** (`.spec-yard/`, keyed per spec file), never in
the spec, so it produces no PR diff noise. `[DELEGATED]`

## Information Architecture

The **lean default** puts **two primary panes to work — the editor and the canvas — plus a collapsed
diagnostics strip**; a thin band of persistent status and navigation furniture frames them, and everything
else is summoned. This resolves PRD FR14's core-vs-advanced grouping. Stated honestly, the **at-rest chrome**
is: the **editor**, the **canvas**, the **collapsed diagnostics strip**, the **status bar**, the
**breadcrumb**, the **sync-health chip**, and the **collapsed file rail** (a thin toggle, not the list). That
is the floor; no drawer, palette, view switcher, layers control, library flyout, or metrics view shows until
summoned.

**At-rest status indicators — four, each earning its place, none a look-alike of another.** At rest the
product can show up to four small signifiers; they are deliberately differentiated by **location, shape, and
label** so they never read as four identical dots:
- **Dirty dot** (`{colors.accent}`) — **in the status bar**, paired with an **"Unsaved" label**. Meaning:
  *the buffer is ahead of disk.* Earns its place: the one persistent write-state signal; the label carries it
  so color is never the sole cue.
- **Sync-health chip** (`{components.sync-health-chip}`) — **a corner pill**, silent (`success-dim`) when
  honest, `warning-dim` **with a drift count** on drift. Meaning: *the diagram and spec have drifted.* Earns
  its place: the only surface that reports spec↔diagram divergence; a pill with a number, not a bare dot.
- **Diagnostics-strip dot** (`{components.diagnostics-strip}`) — **in the bottom strip**, with a
  **count**. Meaning: *lint status* (worst open severity, or `success` when clean). Earns its place: the
  collapsed home of the whole diagnostics list; distinguished by its strip position and count.
- **Per-module diagnostic badge** (`{components.diagnostic-badge}`) — **on a module symbol on the canvas**,
  a `{rounded.sm}` badge with a **severity glyph + count**. Meaning: *the worst severity rolled up inside
  that collapsed module.* Earns its place: it localizes a problem to a node; it lives on the canvas, not the
  chrome, and carries a glyph, not just a hue.

| Surface | Default state | Summoned by | Purpose |
|---|---|---|---|
| Editor | Visible (left pane) | — | Author the spec as YAML |
| Canvas | Visible (right pane) | — | Live diagram; **Grid = the canvas graph itself** — module membership (FR11) is shown by the module symbols on the canvas, not a separate switcher entry |
| Diagnostics strip | Collapsed dot-strip | Click to expand | Lint status; expands to per-code list + quick-fixes |
| Detail drawer / inspector | Hidden | Select a unit | Component form or module interface/members; dockable |
| View switcher | Static view active | Canvas toolbar | A single **dropdown** (combobox, not a tab bar): Static / Simulation / Aspects (Sequence/Pipeline/State grayed) |
| Layers (visibility control) | Hidden | Canvas toolbar | Per-type show/hide — folds the old "Layers view" into a control |
| Metrics (analysis view) | Hidden | View / command palette | SPOFs, hotspots, path comparison, STRIDE detail — on demand |
| Breadcrumb (Tree navigation) | Shows current scope | Always present in canvas | system → module → submodule; folds the old "Tree view" into navigation |
| Library palette | Edge flyout, closed | Canvas edge / editor action | Insert template modules/components |
| Command palette | Hidden | `⌘P` | Search-any-command; keyboard entry to everything (backed by the Command Inventory in Interaction Primitives) |
| File rail | Collapsible | Toggle / command palette | Discovered `*.spec.yaml` files; open, switch, create |
| Settings | Hidden | `⌘,` / command palette | Small surface for the user-tunable subset of view-state config: lint severity threshold, default drawer dock side, re-enable onboarding |
| Status bar | Visible (bottom) | — | True file path + **dirty dot with "Unsaved" label** |

**Summoned-surface mapping** (memlog): the prototype's parallel surfaces are demoted to summoned forms —
**Grid = the canvas graph itself** (module membership shown by the module symbols, FR11), **Layers = a
visibility control** on the canvas toolbar, **Metrics = an analysis view** on demand, **Focus = the detail
drawer's module interface/members editor** (FR11's membership/exposure editing), **Tree = the breadcrumb**
navigation. Fewer surfaces visible; each visible one is comfortable (chunky density).

**Whole-hierarchy view — an acknowledged trade, not a lossless fold.** Folding **Tree → breadcrumb** does
drop the prototype's always-on full-hierarchy list: the breadcrumb shows only the current path. The
replacement is deliberate and two-part — (1) the **collapsed top-level canvas** *is* the at-a-glance
structural map (the system as a handful of module symbols, each with its member count and worst diagnostic),
and (2) **"Go to node…"** fuzzy search in the command palette jumps to any module or member by name across
the whole hierarchy regardless of current scope. Together they cover UJ3's "start at the top, dive
progressively" need; the breadcrumb tracks depth. If a persistent tree proves necessary post-MVP it re-homes
into the file rail, which is designed to hold it.

**Status bar** shows the **true file path** (`{components.status-bar}` — replacing the decorative
"main.spec.yaml" label) and a **dirty dot** in `{colors.accent}` when the buffer is ahead of disk.

→ IA composition references: the lean-default screen
[`key-lean-default.html`](./mockups/key-lean-default.html), and the three navigation wireframes
[expand-in-place](./wireframes/flow-variant-a-expand-in-place-2026-07-08.excalidraw),
[descend](./wireframes/flow-variant-b-descend-2026-07-08.excalidraw),
[hybrid](./wireframes/flow-variant-c-hybrid-2026-07-08.excalidraw).

## Voice and Tone

Plain, precise, calm. **No exclamation marks. No jargon in UI copy.** The banned-term precedent: **never
say "scope-bound"** — it failed comprehension with the primary user; say *"shows the module you are in"*.
Terminology is standardized: **"connection"** never "flow"; **"project folder"** never "workspace"; the
panel is **"Diagnostics"** with severities **error / warning / info**. `[DELEGATED]`

| Do | Don't |
|---|---|
| "Shows the module you are in." | "Scope-bound view." |
| "6 members · 1 warning" | "6 members!! ⚠ Action needed!" |
| "Changed on disk. Reload or keep your edits?" | "Conflict detected." |
| "This connection targets a member the module doesn't expose." | "Encapsulation violation error 0x9." |
| "All checks passing." | "Congrats — you're all good! 🎉" |
| "Diagram has content the spec doesn't — it will be lost on reload." | "Unsynced elements." |
| "connection" · "project folder" · "Diagnostics" | "flow" · "workspace" · "lint errors panel" |

## Component Patterns

Behavioral rules. Visual specs live in `DESIGN.md.Components`.

### Module symbol — tiered navigation gestures

A **module** appears on the canvas as a compact **module symbol** (`{components.module-symbol}`) showing
only its **interface** (exposed members as pins), a **member-count chip**, and a rolled-up **diagnostic
badge** — the honest outside face, never its internals. **Four intents, tiered** (memlog 2026-07-09) — each
answers a different question, so the set is not redundant: *select* = "which one," *glance* = "what's
inside, briefly," *study-in-context* = "show me inside without leaving," *work* = "take me inside to work":

- **Select = single-click.** Selection only, never navigation; opens the detail drawer (interface/members).
- **Glance = peek.** With the module selected, `Space` — or a **hover-pause (~500ms)** over the symbol —
  opens a read-only **peek card** (`{components.peek-card}`) overlaying the module's internals with **zero
  layout shift**; `Esc` dismisses and returns focus to the module. (Peek uses a manual pointer hit-test
  against scene elements — a build task — since Excalidraw exposes no per-element hover event.)
- **Study-in-context = expand-in-place.** An explicit **corner control, context-menu, or palette command**
  reveals members inline; a collapse control seals it again. A deliberate act, not a hover.
- **Work = descend.** The canvas reframes to the module's internals. Trigger: **`Enter` on a selected
  module**, a small **enter-icon affordance on the module symbol**, or the **command palette
  ("Descend into <module>")**. A **breadcrumb** appears; `Esc` ascends; connections from outside enter via
  **boundary pins**. *Double-click descend is a progressive enhancement only:* an implementation **MAY** add
  it **only if** it cleanly intercepts Excalidraw's native double-click; where it does not, double-click
  keeps its **native meaning** (edit/rename the label), and module-rename is defined on that gesture.

**Descend coordinate model (resolves the scene-swap gap; keeps NFR2 determinism).** Descend is **not a
scene swap and not a second layout.** The descended view renders the **same spec coordinates** as the full
system, **filtered** to the module's members (plus any submodule symbols), with the **viewport auto-fitted
to their bounding box**. **Boundary pins render at the viewport edge nearest their external counterpart**
(real scene-space elements at the fitted bounding box, so they pan/zoom with the content and native
connectors bind to them). There is **no per-scope coordinate state** and no second compile — the compiler
does one flat, deterministic layout, and descend is a filter + fit over it. Consequently **spatial memory is
identical between expand-in-place and descend**: a component sits in the same place either way; only the
framing and the boundary pins differ.

**The rule, verbatim:** *peek never edits, expand-in-place never navigates, descend does both.* Collapse/
expand and descend/ascend state persist per spec **in the project-folder config**, not the spec.

### Canvas display elements (component node, chips, badges, buttons)

Passive elements — no gesture of their own beyond selection:

- **Component node** (`{components.component-node}`) — an atomic **Component**. Single-click selects it
  (opening the detail drawer); its **type chip** and border tint carry its type (Gateway / Stage / Store /
  Brick). It takes a `{colors.danger}` border when it has an error, and an `{colors.accent}` glow while it
  is on an active simulation path.
- **Type chip** (`{components.type-chip}`) — non-interactive; always shows the `[Type]` **text label**
  beside the hue (the color-never-sole-carrier contract).
- **Member-count chip** (`{components.member-count-chip}`) — non-interactive readout on a module symbol
  ("6 members"); updates as membership changes.
- **Diagnostic badge** (`{components.diagnostic-badge}`) — non-interactive; shows a severity glyph + count,
  and on a collapsed module **rolls up the worst contained severity** (FR11).
- **Primary button** (`{components.button-primary}`) — the single emphasized action in a surface
  (e.g. "Create your first component," conflict-prompt confirm); at most one per surface.

### Detail drawer — dockable, adaptive

Selecting any unit opens the **detail drawer** (`{components.detail-drawer}`). It ships as an **adaptive
drawer under the editor**; the user can **dock it right** as a persistent inspector column (VS Code
panel-style; a stored preference). Content adapts to the selection — a **component** form vs. a **module**
interface/members editor (which members are **exposed**). Both geometries carry both content shapes. The
component form carries the **full canonical component metadata**, including the fields the **simulator**
consumes: id, name, type, owner, status, description, latency, throughput, connections, **`rate_limit`,
`buffer`, `throttled`, and `color`** — the drawer is the editing surface for simulation parameters (there is
no separate Focus tab). `[ASSUMPTION]` field-level debounce and instant local echo carried from the current
build. **On selection, focus moves to the drawer's first field** so a keyboard user lands in the form, not
hunting for it. The drawer in its descended, dock-right form is mocked at
[`key-descended-module.html`](./mockups/key-descended-module.html).

### Editor leash-follow + line-jump

On **descend**, the editor **follows with a leash**: it auto-scrolls to and highlights the module's YAML
block (`{components.editor}` line-highlight), but never locks — the user scrolls freely afterward. A
courtesy scroll, not a cage.

**Line-jump is bidirectional and MVP** (memlog SCOPE): click a diagram element → the editor scrolls to and
highlights its YAML line; place the cursor on a YAML line → the canvas highlights and centers the
corresponding element.

**Cross-scope target rule** (line-jump "works across scopes" made precise): when the cursor's line maps to
an element **not currently rendered** — it lives in a different scope than the one you are descended in, or
inside a collapsed module symbol — the canvas **auto-navigates to the scope that contains it** (ascending or
descending as needed) and centers there. If the element is sealed inside a collapsed module that is not
being entered, the canvas instead **highlights the enclosing module symbol as a proxy** and the breadcrumb
reflects where it lives. Line-jump never silently no-ops.

**Implementation prerequisite (shared with `DESIGN.md.Editor`):** line-highlight, the gutter, per-line
syntax coloring, and programmatic scroll-to-line require a **line-addressable editor component**. The
current build's plain `<textarea>` cannot deliver them; a line-addressable editor is a **prerequisite** for
line-jump and the editor visual spec. The specific component is architecture's call — this spine only fixes
that the capability is real, not faked by a textarea overlay.

### Sync-health chip + data-loss toast

A corner **sync-health chip** (`{components.sync-health-chip}`) runs a **silent check when honest** and
turns **stateful on drift**; clicking it (or focusing it and pressing `Enter`) expands a popover with
**per-drift resolve actions**. The check runs **debounced after each write (~1s, the save cadence)**, not on
every keystroke. MVP designs three cheap detectors (memlog SCOPE): **unmapped canvas content**, **stale
positions**, and a **partial-picture indicator** (the current view hides spec content). Drifts that risk
**data loss** — e.g. canvas content not in the spec that would vanish on reload — additionally raise a
**dismissible toast** (`{components.toast}`). Consultative by default, interruptive only when loss is at
stake. ("Layout implies unstated grouping" inference is directional — see Scope & Trajectory.)

**Precedence when several surfaces fire at once (the common case: an agent edits the open file).** A single
external-edit event can trip the modal **conflict prompt**, a **data-loss toast**, and a **drift** on the
chip together. Order is fixed: the **conflict prompt is modal and wins** — it shows alone. The data-loss
toast and the drift-chip update **queue behind it** and are re-evaluated **after** the user's reload/keep
choice (a reload may resolve or change them). The chip never competes with the modal for attention.

**Stale scope on reload / deletion.** If a reload (or a fix-all) **replaces the buffer** while a peek card is
open or you are **descended into a scope that no longer exists** (deleted, or its id changed via
`rename-id`): the canvas **auto-ascends to the nearest surviving ancestor**, and per-module view state
(collapsed/expanded, descend) is **re-keyed to the new id or dropped**; any open peek card is **dismissed or
refreshed** against the new buffer. No view is left "standing in" a scope that is gone.

### View switcher — follows where you stand

A single **dropdown** (`{components.view-switcher}` — a combobox, not a tab bar): **Static / Simulation /
Aspects** live now; **Sequence / Pipeline / State** present but grayed (future). **Aspects** renders the
spec's **free-text prose as a legitimate representation** (echoing VHDL behavioral description): a scrollable
read panel in place of the diagram, showing the current scope's **per-component `description` fields** and any
**system- or module-level narrative field**, each headed by its component/module name and type — text as the
view when text is the honest content. **Views follow where you stand:** descended into a module, every view —
including Simulation and Aspects — renders **only that module's internals**, with traffic entering via
boundary pins; the whole-system view means *ascend first*. No widen toggle. Copy says *"shows the module you
are in,"* never "scope-bound." The descended Simulation view is mocked at
[`key-simulation-view.html`](./mockups/key-simulation-view.html).

### Metrics view + Layers control

**Metrics** is a summoned **analysis view** (not a live diagram renderer): it lists the current scope's
**SPOFs, hotspots, path comparisons, and STRIDE** findings as a scannable panel, each row linking back to the
node it concerns. **Layers** is a canvas-toolbar **visibility control**: a small panel of **per-type**
show/hide toggles (Gateway / Stage / Store / Brick); a focused row toggles with `Space`/`Enter`. Both are
lean-by-default (hidden until summoned); deeper visual/interaction detail is **spec-deferred** beyond these
behaviors.

### Library palette — dual entry

One template registry, **two entry points** (memlog): on the **canvas**, drag a template from the edge
flyout onto the canvas — it lands in the current module when descended, wired through interface pins; in the
**editor**, an equivalent **"Insert template"** action writes the same boilerplate YAML at the cursor. This
is the Virtuoso authoring soul — drag-drop, copy-paste, quick-wiring of reusable (especially **library**)
modules. The **template picker IS the palette** — there is no separate picker surface.

**Drop feedback is ghost-only:** a translucent copy of the dragged card follows the cursor; the canvas
invents no snap line, drop-zone highlight, or insertion marker. Any richer drop-preview is `[DELEGATED]` to
implementation.

**Open trigger (reconciled).** The flyout is **closed by default**, opened by a **labeled handle on the
canvas edge** (click, or the "Insert template" command). It is **auto-opened and prominent in the empty
state** only — where there is nothing to do but add — and returns to closed-by-default once the project has
content. Mocked at [`key-library-palette.html`](./mockups/key-library-palette.html).

### Command palette + keybindings

`⌘P` opens the **command palette** (`{components.command-palette}`) — search for any command instead of
navigating menus (VS Code kin). Core keybindings:

- `⌘P` — command palette
- `⌘J` — toggle the detail drawer
- `⇧1` — fit diagram to screen (Visio-style)
- `⌘,` — settings
- `Enter` (module selected, canvas focused) — descend
- `Space` (with a module selected, canvas focused) — peek; `Esc` — dismiss peek / ascend / close
- `⌘S` — flush save now
- `⌘Z` / `⌘⇧Z` — undo / redo

**Command Inventory — the palette is exhaustive.** "Keyboard entry to everything" is backed by a commitment:
**every mouse-reachable action, including every canvas-spatial one, has a command-palette command** (so no
operation is mouse-only; this is also what makes the canvas fully reachable — see Accessibility Floor). The
inventory, at minimum:

- **Navigation:** Descend into <module> · Ascend one level · **Go to node…** (fuzzy search, jumps focus to
  any module/member by name across scopes) · Peek <module> · Expand in place / Collapse · Fit to screen.
- **Layout & panes:** Toggle detail drawer · Dock drawer left/right · Toggle file rail · Switch view
  (Static / Simulation / Aspects) · Toggle layer visibility (per type).
- **Simulation:** Run · Pause · Step · Set speed.
- **Diagnostics & sync:** Resolve drift… (per drift) · Run quick-fix… (per diagnostic) · Fix all.
- **Files & authoring:** Open file · Create spec file · Insert template… · Save / flush · Export diagram ·
  Open settings.

If a new mouse action is added later, its palette command is added with it — the "everything" claim stays
honest (zero lying UI).

### Save semantics (resolves PRD FR3)

**Auto-save to disk, debounced ~1s.** Every write is preceded by an **mtime/content-hash check** (FR4);
a mismatch triggers the **conflict prompt** instead of writing — no silent clobbering. The **dirty dot**
means *the buffer is ahead of disk* (during the debounce window or when a write is blocked). `⌘S` flushes
immediately. The status bar shows the **true file path + dirty dot**; when the buffer matches disk it shows a
quiet **clean/saved state** — no dirty dot, no "Unsaved" label. `[DELEGATED]`

### Conflict prompt (FR4)

When the open file changes on disk while local edits are pending: *"Changed on disk. Reload or keep your
edits?"* — reload discards the buffer for the disk copy; keep-and-overwrite writes the buffer over disk.
Agents editing while the workspace is open is the **common case**, so this prompt is designed for, not an
edge.

**Focus management (both choices are irreversible, so this is legislated).** The prompt is a **focus-trapped
modal**. **Initial focus lands on the non-destructive path** — a **Cancel** action that keeps editing and
writes nothing (the buffer stays ahead of disk, dirty dot remains, and the prompt re-raises before the next
write). **`Esc` maps to that safe Cancel**, never to a data-losing default. The two destructive buttons
(**Reload — discards your edits**, **Keep and overwrite — replaces the disk file**) are keyboard-operable and
**labeled distinctly in words, not by color alone**, so a low-vision user is not choosing by hue. On close,
**focus returns to the editor**. All three overlays (prompt, data-loss toast, drift chip) are mocked together
at [`key-safety-surfaces.html`](./mockups/key-safety-surfaces.html).

### Quick-fix (FR9 retarget-default rule)

Quick-fixes are one-click remediations attached to lint diagnostics (`{components.quick-fix-button}`),
surfaced in the diagnostics strip and the detail drawer; a fix-all is index-safe. For an
**encapsulation violation**, the quick-fix **defaults to retargeting** the connection to an **exposed
member**; **widening the interface** (exposing the targeted member) is an explicit **secondary** action,
never the default — *one click must not defeat encapsulation.*

### Export (resolves PRD FR16)

Export the current diagram view — **respecting collapsed modules and hidden layers** — as **PNG and SVG**,
saved into `<project>/exports/` (canonical); a completion **toast** offers open / download. **Simulation
reports and run-history exports (FR7)** — the non-image artifacts (JSON / CSV) — save into
`<project>/reports/`, keeping generated output out of the spec. `[DELEGATED]`

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| **Empty project** (new/empty folder) | Editor + canvas | Never a blank editor. Greet with a bundled **read-only sample offer** (the *"See a worked example"* register), a guided **"create your first component,"** and a prominent **library palette**. The template picker IS the palette. Mocked at [`key-empty-state.html`](./mockups/key-empty-state.html). (Resolves FR15.) `[DELEGATED]` |
| **Missing `main.spec.yaml`** | File rail | Show the file list + a prompt to create or pick a spec; `main.spec.yaml` is the default only when present. (Resolves FR2 non-happy path.) `[DELEGATED]` |
| **Migration** (first run from localStorage) | Modal prompt on first run | If a prior build's spec is found in **localStorage**, a one-time prompt offers to **migrate it into the project folder** (writing real `*.spec.yaml` files); once migrated, the folder is the source of truth. **Fallback:** when **no folder is configured** (e.g. a hosted preview), the app runs **localStorage-only** and says so — no silent data home. (Resolves FR5.) `[DELEGATED]` |
| **Read-only folder** | Whole app | A **read-only banner** mode; every write affordance disabled — no lying UI. `[DELEGATED]` |
| **Invalid mid-keystroke YAML** | Editor + canvas | The diagram **never clears** and no consumer crashes; the parse error surfaces as a single **error** entry in the diagnostics strip. The last valid diagram holds. (NFR1.) |
| **Conflict** (external edit) | Modal prompt | *"Changed on disk. Reload or keep your edits?"* — see Conflict prompt and [`key-safety-surfaces.html`](./mockups/key-safety-surfaces.html). (FR4.) |
| **Loading** (cold canvas) | Canvas | A shimmer skeleton on `{colors.surface-canvas}` until the scene compiles; no flash of empty. |
| **Simulation running** | Canvas + playback bar | Active-path nodes glow `{colors.accent}` (pulsing + "live" readout, not color alone); the **playback bar** shows transport (speed, pause/step) and a tracing readout; results roll up onto collapsed modules. A **simulator finding is not a spec error** — the **diagnostics strip stays green during a bottleneck**; the simulator surfaces pressure and the linter surfaces spec validity, and neither masquerades as the other (zero lying UI). The transport is **keyboard-operable and the simulation is pausable** (WCAG 2.2.2). **`prefers-reduced-motion` suppresses both the moving packet-dot animation and the node glow pulse** (leaving a static ring + "live" readout), not just the 120–180ms UI eases, and **packet animation never exceeds the flash threshold at any speed** (0.5×–5×; cap the effective flash rate, WCAG 2.3.1). An **external reload halts any running simulation** and requires a re-run — the sim never continues on a swapped-out buffer. Mocked at [`key-simulation-view.html`](./mockups/key-simulation-view.html). |
| **All checks passing** | Diagnostics strip | Dot in `{colors.success}`; copy *"All checks passing."* |
| **Command palette — no matches** | Command palette | When a query matches no command, show a quiet **"No matching commands"** row (never an empty void); the input stays focused to refine. |
| **Library palette — empty** | Edge flyout | When no templates are available, show a **"No templates yet"** message with a pointer to add one; never a blank flyout. |
| **Onboarding** (first run) | Overlay on demo | A dismissible first-run tour on a **read-only demo project outside the user's folder** (so it never pollutes user files); it teaches **the core loop and the gesture/summon vocabulary** — how to peek, descend, open the command palette, and summon surfaces — so a user who dismisses it is not stranded. Dismissed state saved in config; re-enable from **Help**; the first-run tip is shown in [`key-empty-state.html`](./mockups/key-empty-state.html). (Resolves G1×G3.) `[DELEGATED]` |

## Interaction Primitives

**Keyboard map** (VS Code / Visio kin; command palette is the spine):

| Key | Action |
|---|---|
| `⌘P` | Command palette |
| `⌘J` | Toggle detail drawer |
| `⇧1` | Fit diagram to screen |
| `⌘,` | Settings |
| `⌘S` | Flush save now |
| `⌘Z` / `⌘⇧Z` (or `Ctrl+Y`) | Undo / redo |
| `Tab` / arrow keys (canvas focused) | Move the focus ring between canvas nodes and pins, in reading order |
| `Enter` (module selected, canvas focused) | **Descend** into the module |
| `Space` (module selected, canvas focused) | Peek selected module (read-only) |
| expand key / context-menu / palette (module focused) | Expand-in-place / collapse |
| `Esc` | Close topmost overlay first (popover → palette → peek), then ascend one level |
| single-click | Select only (never navigate) |
| double-click (module) | Native edit/rename label; **descend only** as a progressive enhancement that cleanly intercepts the native gesture (see Component Patterns) |

**Canvas keyboard model (the canvas is fully keyboard-reachable).** The canvas is not mouse-only. `Tab` and
the arrow keys move a **focus ring** between nodes and boundary pins in reading order; a focused module
answers to **`Enter` = descend**, **`Space` = peek**, an **expand key / context-menu / palette command =
expand-in-place**, and **`Esc` = ascend/dismiss**. `Esc` dismisses an open **peek first**, then ascends one
level when no overlay is open. **"Go to node…"** in the command palette jumps the focus ring to any node by
name, so a keyboard user reaches any scope without spatial hunting. Every canvas operation also has a palette
command (see Command Inventory) — nothing on the canvas is reachable by mouse alone.

**Focus arbitration for bare/shift shortcuts (verbatim rule):** ***`Space` acts only when the canvas has
focus AND a module is selected — never inside text fields.*** The same holds for the other bare/shift canvas
shortcuts: **`Space` (peek) and `⇧1` (fit) are inert while focus is in the editor or any text input** — there
they are literal characters — and act only when the **canvas holds focus**. `selectedUnit` being shared
across panes never lets a keystroke in the editor peek or fit the diagram.

**After descend, focus** lands on the first boundary pin (or first node) of the entered module, so keyboard
navigation continues from inside the new scope.

**Undo/redo semantics** (from the current build): a 100-entry history; **typing bursts commit on an ~800ms
debounce** so one undo reverses a burst, not each character; canvas edits (delete/connect/rename) commit
immediately; a pending debounced edit is force-committed before an undo; the redo stack prunes on new
typing. Shortcuts are suppressed inside inputs **except** the spec editor. **Undo across a descend boundary
auto-navigates** to the scope of the reverted change and centers it before applying — undo never operates on
invisible context.

**Debounce disciplines** (from the current build): keystroke → canvas recompiles live; **canvas drag →
YAML coords write back ~450ms after drag stop**; **detail-drawer field edits ~200ms per field** with
instant local echo. Motion is 120–180ms eases, no decorative animation; **prefers-reduced-motion**
respected. **No sound.** `[DELEGATED]`

**Banned:** any dead/decorative control (FR12 — zero lying UI); a fix that silently widens an interface;
the term "scope-bound" in copy; clearing the diagram on invalid YAML.

## Accessibility Floor

- **Keyboard reachability for every surface — including the canvas.** Command palette, detail drawer
  (`⌘J`), file rail, view switcher, layers control (a focused row toggles with `Space`/`Enter`), library
  palette (its committed keyboard equivalent is the editor **"Insert template"** command), the
  **sync-health chip** (focus it, `Enter` opens the popover, arrow through per-drift actions, `Esc` closes),
  the **playback bar** (transport is keyboard-operable, simulation pausable), and diagnostics are all
  reachable and operable without a mouse. The **canvas itself** carries the keyboard model in Interaction
  Primitives (`Tab`/arrows/`Enter`/`Space`/`Esc` + "Go to node…"). Nothing is mouse-only (correcting the
  current build's mouse-only panel resize and click-only Tree rows).
- **The editor and detail drawer are the canonical accessible equivalents of the canvas.** The canvas is a
  supplementary visual view of the same spec; the **editor is the screen-reader-accessible equivalent and
  carries the full contract** (a complete, semantic textual representation), and the **detail drawer** is the
  accessible editing surface for any selected unit. **No operation is canvas-only** — guaranteed by the
  Command Inventory, where every canvas action has a palette command. The canvas region carries a
  **graphical-view `aria-label`** exposing the **system name, component and module counts, and the worst
  open diagnostic** (e.g. "Architecture diagram — 24 components, 3 modules, 1 error; see the editor for the
  full spec"); nodes expose accessible names/roles where Excalidraw permits.
- **Live-region announcements.** The **diagnostics count**, **sync-health state**, **save / dirty state**,
  and **simulation start / stop** are announced via an `aria-live` region so a screen-reader user perceives
  state changes on the visual canvas without polling.
- **Toasts** render in an **`aria-live` region** (`assertive` for the **data-loss warning**, `polite` for
  completions), **never steal focus**, and keep their **action and dismiss keyboard-reachable** while
  visible; the data-loss warning is **mirrored as a diagnostics/sync entry** so it survives the toast timeout.
- **The conflict prompt is a focus-trapped modal** with initial focus on the safe Cancel, `Esc` to the safe
  state, and **focus restored to the editor on close** (see Conflict prompt).
- **Focus moves predictably.** Selecting a unit moves focus to the **detail drawer's first field**; descend
  places focus on the **first boundary pin / node** of the entered module; dismissing a peek returns focus to
  the **peeked module**.
- **Focus-visible** on every interactive element — the `{colors.accent}` focus ring is never suppressed
  (correcting the current build's JS-hover-only header buttons).
- **Roving / arrow-key navigation with a single tab stop** on every vertical option list and control group:
  the **command-palette result list**, the **expanded diagnostics list**, tab bars, and the **view switcher**
  (which is a **combobox/dropdown**, not a tab bar — one ARIA pattern, resolved).
- **Color is never the sole carrier.** Component **type** and diagnostic **severity** always carry a text
  label alongside the hue (the `[Type]` label contract, and severity words error/warning/info); **node state**
  (selection / error / simulation) carries a non-color cue each (handles / dashed border + glyph / pulsing +
  "live" readout — see `DESIGN.md`); the **dirty dot** carries an "Unsaved" label.
- **Contrast floor** fixes the **9–11px problem**: interactive and content text is **≥ 13px** (the chunky
  density decision; `readout` metrics raised to 13px), and load-bearing text meets **WCAG AA** per `DESIGN.md`
  (`{colors.foreground-body}` on `{colors.background}`/`{colors.surface}`; `{colors.foreground-muted}` for
  labels; the newly-fenced `danger`/`accent`/`syntax-punctuation` pairs). `{colors.foreground-dim}` is
  supplementary only. `{typography.caption}`/`{typography.kbd}` (12px) are supplementary; nothing load-bearing
  sits below 12px.
- **Reflow.** UI text scales and reflows to **200%** without loss of content or function within the desktop
  frame (WCAG 1.4.4 / 1.4.10; degradation order in `DESIGN.md.Layout & Spacing`).
- **Tab order matches reading order** on every surface; `Esc` always closes the topmost overlay.

## Inspiration & Anti-patterns

**Four VHDL / Cadence Virtuoso pillars** — the admired model for hierarchical systems, decomposed and
confirmed as design anchors (memlog 2026-07-09):

1. **Descend / ascend hierarchy** with a breadcrumb — the diagram **reframes** to the module's internals:
   the same scene, filtered to the module's members and auto-fitted, with boundary pins at the edge. Descend
   and expand-in-place share **one layout** (same coordinates); they differ only in framing, not in a second
   drawing (see the descend coordinate model in Component Patterns).
2. **Symbol vs. schematic duality** — a module from outside is a compact **symbol** showing only interface
   pins; descended, the **same scene** is filtered to its members with boundary pins. Two honest
   representations of one honest layout, not a separate second drawing and not a collapsed one.
3. **Entity / architecture separation** — the same scope carries multiple representational views (maps to
   the view switcher's Static / Simulation / Aspects, and the grayed future renderers).
4. **Port discipline** — the **interface** is the only connection surface; **encapsulation violations** are
   surfaced as lint, and the retarget-default quick-fix keeps them from being one-clicked away.

Plus the **fifth, user-added: library authoring** — drag-and-drop, copy-paste, and quick-wiring of modules,
especially **library** modules ("the equivalent of boilerplate spec") — realized as the dual-entry library
palette.

- **Lifted from VS Code:** the command palette (`⌘P`), keyboard panel toggling, the restrained "active"
  blue, the dockable inspector.
- **Lifted from Notion:** the calm warm near-black clean slate — restraint, uncluttered surfaces.
- **Lifted from Discord:** warmer grays, friendly rounded grouping by shade-step, chunky density.
- **Lifted from Visio:** infinite canvas with a keyboard fit-to-screen.
- **Anti-pattern — overwhelming chrome:** the prototype "accreted many buttons with no orientation layer."
  The lean default is the direct answer; advanced surfaces are summoned, not stacked.
- **Anti-pattern — lying UI:** dead Save/Share/Settings/Terminal/Play controls, a fake "main.spec.yaml"
  label, "Postgres Integration Active" copy over local-only state. Zero lying UI: every control is wired or
  removed (FR12).

## Responsive & Platform

**Desktop-only** (mouse + keyboard). The two-pane frame, the ≥-minimum panes, the infinite canvas, and the
command-palette-first interaction model all assume a desktop browser. Narrow windows are **graceful
degradation only** — chrome may hide, but no stacked/mobile layout is designed. The **degradation order and
width thresholds** (file rail collapses first → docked drawer reverts under the editor → drawer overlays
below ~1024px; panes hold ≥ 280px) and the **200% text zoom / reflow** commitment are defined in
`DESIGN.md.Layout & Spacing`. No touch interaction model is promised. (memlog: form factor locked
desktop-only for MVP.)

## Key Flows

Three PRD journeys, restructured as named-protagonist journeys. Protagonist first names are `[ASSUMPTION]`;
the agent protagonist is *a Claude Code agent*. Step sequences and glossary terms mirror the PRD verbatim.

### Flow 1 — UJ1 Design a system (Priya `[ASSUMPTION]`, an architect, starting a new service)

1. Priya **launches Spec-Yard** and **opens a project folder** (`acme-checkout`) — the standalone tool,
   separate from any target repo. Empty folder → the empty-state greets her with a sample offer, a guided
   "create your first component," and a prominent **library palette**; never a blank editor.
2. She **authors the spec via editor and canvas interchangeably** — types a `Gateway` and a `Store` in
   YAML, drags a `Stage` in from the library palette onto the canvas, wires connections by drawing arrows;
   the two panes stay in one honest contract.
3. She groups the payment components into a **module** with a strict **interface**, exposing only the
   members other parts may target.
4. A **connection** from outside targets a non-exposed member — an **encapsulation violation** lints. She
   takes the **quick-fix**, which **retargets** to an exposed member (widening the interface is offered
   only as an explicit secondary). She **lint-cleans** the rest with quick-fixes.
5. She **simulates flows** to sanity-check capacity and bottlenecks — the playback bar runs traffic;
   active-path nodes glow, and a SPOF surfaces on the checkout `Store`.
6. **Climax:** she descends into the payments module and the Simulation view re-renders **only that
   module's internals**, traffic arriving through its boundary pins — the same drawing she designed, now
   showing where the pressure lands. She ascends, and **commits the spec files with normal git tooling**.

Failure: mid-edit the YAML is briefly invalid — the diagram does not clear; a single error sits in the
diagnostics strip until the keystroke completes.

### Flow 2 — UJ2 Hand off to an agent (Priya `[ASSUMPTION]` and a Claude Code agent)

1. Priya **points a Claude Code agent at the project's spec file(s)** — plain versioned `*.spec.yaml` the
   agent reads and writes directly, while her workspace may stay open (the common case).
2. The **agent builds or modifies** — editing the spec and the target code from the blueprint.
3. Because the agent edited the open file on disk, Priya's workspace surfaces the change: *"Changed on
   disk. Reload or keep your edits?"* She reloads to pick up the agent's spec edits.
4. The **agent (or CI) runs `spec-yard lint`** — the same rule engine headless, non-zero exit on errors,
   human-readable and machine-readable (`[ASSUMPTION]` JSON) output.
5. **Climax:** the lint gate passes green in CI, and Priya **reviews the spec diffs in the design project's
   own git history / PRs** — the architecture change is a readable diff, not a redrawn picture. The spec
   was the contract the whole way through.

Failure: `spec-yard lint` **fails red** — the gate's reason to exist. The headless run **exits non-zero** and
emits **human- and machine-readable** diagnostics (`[ASSUMPTION]` JSON); **CI blocks the PR**. The agent
**iterates** on the reported errors (or Priya opens the project and **reviews the same diagnostics in the
strip**, taking quick-fixes) until the gate passes. No red gate merges.

### Flow 3 — UJ3 Learn a system (Sam `[ASSUMPTION]`, a newcomer joining the system)

1. Sam **opens an existing project** read-mostly.
2. He **starts at the collapsed top level** — the whole system as a handful of **module symbols**, each
   showing its interface, member count, and worst diagnostic — simple enough to hold in his head.
3. He **dives into groups progressively** — peeks a module with `Space` to glance, then descends (`Enter` on
   the selected module, the enter-icon affordance on the symbol, or "Descend into…" in the palette) to work
   through its internals; the breadcrumb tracks where he stands; the editor leash-follows to the matching
   YAML so text and picture stay tied.
4. He **runs a simulation to watch flows** move through the system, building a mental model of what talks
   to what and where the traffic concentrates.
5. **Climax:** with the shape in his head, he **exports a diagram image** (PNG) of the top level — collapsed
   modules and hidden layers respected — for a doc, and drops it into the team channel to ask his first
   sharp question. He understood the system by navigating it, not by reading stale docs.

## Scope & Trajectory

Separating what this UX **designs for MVP** from **directional** items the design must anticipate but not
build (memlog SCOPE decisions). The tension the user surfaced — selecting every offered capability while
naming LEAN DESIGN as the top principle — is managed here: capabilities are staged, and the lean-by-default
disclosure keeps the visible surface small.

**MVP-designed:**
- Two-pane bidirectional core loop; lean default (editor + canvas + collapsed diagnostics strip).
- Module navigation, all three tiers (peek / descend / expand-in-place) with the gesture rule.
- Dockable adaptive detail drawer; editor leash-follow.
- **Line-jump**, both directions, spec-line ↔ diagram-element.
- **Sync-health**, three cheap detectors (unmapped canvas content, stale positions, partial-picture
  indicator) + data-loss toast.
- **View switcher** with two live alternates beyond Static: **Simulation-as-view** (promotion of the
  existing playback) and **Aspects** (free-text prose as a legitimate representation — echoing VHDL
  behavioral description).
- **Library palette**, dual-entry (canvas flyout + editor Insert template).
- Command palette, keybindings, save/conflict semantics, export, empty/read-only/onboarding states.

**DIRECTIONAL (anticipated, not built for MVP):**
- **Sequence / Pipeline / State views** — the view switcher UX is designed to hold them; they render as
  grayed future entries.
- **Menu-driven text wizard** — templates carry most of its safe-authoring value for MVP; the wizard is a
  directional note only.
- **Grouping-inference detector** — the "layout implies unstated grouping the spec doesn't state" sync
  situation is a directional note; the three MVP detectors ship first.

## Open Questions

Surfaced, not resolved here (mostly out of UX scope or carried as assumptions):
- **`[ASSUMPTION]` launch command** = `npx spec-yard <folder>` (PRD FR1, OQ2) — unconfirmed.
- **`[ASSUMPTION]` interface-bloat lint threshold** = a module of ≥ 4 members exposing more than half
  (PRD FR9) — unconfirmed.
- **`[ASSUMPTION]` `spec-yard lint` machine-readable format** = JSON (PRD FR17) — unconfirmed.
- **`[ASSUMPTION]` performance ceiling** = ~40 components / ~80 connections, keystroke→update ≤ 150ms p95
  (PRD NFR5) — a target, not measured (no telemetry).
- **`[ASSUMPTION]` protagonist names** Priya (architect) and Sam (newcomer) — invented for the flows.
- **Open (PRD GAP / OQ3):** no named internal dogfooders / adoption count — a product-measurement question,
  out of UX scope.
- **`[DELEGATED]` interaction-detail specifics** (right-click menus, exact drag/scroll behavior, animation
  curves) — decided by best practice above and marked; the user will tune from real usage post-build.
