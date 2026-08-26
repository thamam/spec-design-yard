---
name: spec-design-yard
description: Local-first visual IDE for system architecture — a warm near-black, dark-only instrument where a typed YAML spec and a live Excalidraw diagram stay in one honest contract.
status: final
updated: 2026-07-09
sources:
  - ../../prds/prd-spec-design-yard-2026-07-07/prd.md
colors:
  # ---- Surfaces (Notion-calm warm near-black; shade-step grouping) ----
  surface-canvas: '#1c1b1a'        # the diagram "paper at night"
  surface-canvas-dots: '#262624'   # dot-grid dots behind the canvas
  background: '#191919'            # app base / editor background
  surface: '#202020'              # panels, header, toolbars, drawer, cards
  surface-raised: '#232322'       # node fill (module/component boxes)
  surface-elevated: '#2a2a29'     # chips, hover tier, active tab, popover base
  surface-strong: '#2f2f2f'       # strongest shade step (raised chip, kbd)
  # ---- Borders / lines (nearly vanished; separation by shade) ----
  border: '#2e2d2b'               # quiet hairline
  border-node: '#6e6d68'          # node sketch border — raised to ≥3:1 vs surface-canvas so the untyped module-symbol boundary is perceivable
  border-pin: '#454440'           # interface-pin border, raised-surface hairline
  connection: '#6e6c67'           # connection stroke on canvas
  # ---- Text ----
  foreground: '#e6e4e0'           # primary — names, headings
  foreground-body: '#c8c6c1'      # body text, scalar values
  foreground-muted: '#9b9a97'     # captions, muted labels
  foreground-dim: '#737270'       # faint — line numbers, punctuation, disabled
  # ---- Accent (VS Code restrained blue; NEVER type or severity) ----
  accent: '#3794ff'               # selection ring, active marker, focus, primary btn, dirty dot, exposed pin
  accent-hover: '#4fb3ff'         # hover/brighten, palette match highlight
  accent-dim: '#122a40'           # active tool-button bg, palette selected-row fill, file-rail active row (darkened so accent text on it clears 4.5:1)
  accent-strong: '#007acc'        # status-bar accent, pressed
  # ---- Semantic (severities: red/amber reserved here) ----
  success: '#8fae8b'              # sync-ok, "Ready" dot (sage, distinct from Store green)
  success-dim: '#1f2d24'          # sync-health chip fill when honest
  warning: '#d0a04a'             # diagnostic amber — warning severity
  warning-dim: '#3a2f1b'          # warning badge fill
  danger: '#ef6d70'              # diagnostic red — error severity (brightened so error-badge text clears 4.5:1 on danger-dim)
  danger-dim: '#3a1f21'           # error badge fill
  info: '#7f9fbf'                # diagnostic info severity (dusty steel)
  info-dim: '#1e2b38'             # info badge fill
  # ---- Component type hues (fixed in memlog; four distinct on warm near-black) ----
  type-gateway: '#2dd4bf'         # Gateway — teal (external ingress)
  type-stage: '#a78bfa'           # Stage — violet (processing)
  type-store: '#4ade80'           # Store — green (persistence)
  type-brick: '#f472b6'           # Brick — rose (utility/sidecar)
  type-gateway-dim: '#16302c'     # Gateway chip fill
  type-stage-dim: '#241f38'       # Stage chip fill
  type-store-dim: '#16301f'       # Store chip fill
  type-brick-dim: '#35202c'       # Brick chip fill
  # ---- YAML syntax (editor) ----
  syntax-key: '#9db4cd'
  syntax-value: '#c8c6c1'
  syntax-number: '#c2a878'
  syntax-punctuation: '#83827b'   # raised to ≥4.5:1 on background — YAML `:`/`-` are structural content, not decorative
typography:
  # UI = system-ui at a chunky 13–14px floor; code/readouts = ui-monospace.
  display:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: '15px'
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: '0.01em'
  heading:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: '15px'
    fontWeight: '600'
    lineHeight: '1.4'
  body:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: '14px'
    fontWeight: '400'
    lineHeight: '1.5'
  label:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: '13px'
    fontWeight: '500'
    lineHeight: '1.4'
  caption:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: '12px'
    fontWeight: '400'
    lineHeight: '1.4'
  eyebrow:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: '11px'
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: '0.08em'
  code:
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
    fontSize: '13px'
    fontWeight: '400'
    lineHeight: '1.55'
  readout:
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
    fontSize: '13px'
    fontWeight: '400'
    lineHeight: '1.4'
  kbd:
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
    fontSize: '12px'
    fontWeight: '500'
    lineHeight: '1'
rounded:
  sm: '4px'      # inputs, small chips
  md: '6px'      # buttons, chips, cards
  lg: '8px'      # panels, drawer, module/component nodes
  xl: '12px'     # modals, command palette, peek card
  full: '9999px' # pills — type chips, playback controls, sync chip
spacing:
  '1': '4px'
  '2': '8px'
  '3': '12px'
  '4': '16px'
  '5': '20px'
  '6': '24px'
  '8': '32px'
  gutter: '16px'          # default inter-element gutter (chunky)
  control-height: '32px'  # chunky control/button min-height
  row-height: '36px'      # list-row / tab min-height
components:
  module-symbol:
    background: '{colors.surface-raised}'
    border: '{colors.border-node}'
    radius: '{rounded.lg}'
    name-color: '{colors.foreground}'
    pin-fill: '{colors.accent-dim}'
    pin-border: '{colors.border-pin}'
    member-chip-bg: '{colors.surface-elevated}'
    member-chip-text: '{colors.foreground-muted}'
  component-node:
    background: '{colors.surface-raised}'
    border: '{colors.border-node}'
    radius: '{rounded.lg}'
    name-color: '{colors.foreground}'
    type-gateway: '{colors.type-gateway}'
    type-stage: '{colors.type-stage}'
    type-store: '{colors.type-store}'
    type-brick: '{colors.type-brick}'
  boundary-pin:
    fill: '{colors.accent-dim}'
    border: '{colors.accent}'
    label: '{colors.foreground-muted}'
    radius: '{rounded.full}'
  type-chip:
    radius: '{rounded.full}'
    font: '{typography.readout.fontFamily}'
    gateway-bg: '{colors.type-gateway-dim}'
    stage-bg: '{colors.type-stage-dim}'
    store-bg: '{colors.type-store-dim}'
    brick-bg: '{colors.type-brick-dim}'
  member-count-chip:
    background: '{colors.surface-elevated}'
    foreground: '{colors.foreground-muted}'
    radius: '{rounded.full}'
    font: '{typography.readout.fontFamily}'
  diagnostic-badge:
    error-fill: '{colors.danger-dim}'
    error-text: '{colors.danger}'
    warning-fill: '{colors.warning-dim}'
    warning-text: '{colors.warning}'
    info-fill: '{colors.info-dim}'
    info-text: '{colors.info}'
    radius: '{rounded.sm}'
  detail-drawer:
    background: '{colors.surface}'
    border: '{colors.border}'
    radius: '{rounded.lg}'
    heading: '{colors.foreground}'
    field-bg: '{colors.background}'
    field-focus-ring: '{colors.accent}'
  diagnostics-strip:
    background: '{colors.surface}'
    ok-dot: '{colors.success}'
    error-dot: '{colors.danger}'
    warning-dot: '{colors.warning}'
    info-dot: '{colors.info}'
    count-text: '{colors.foreground-muted}'
  sync-health-chip:
    ok-fill: '{colors.success-dim}'
    ok-text: '{colors.success}'
    drift-fill: '{colors.warning-dim}'
    drift-text: '{colors.warning}'
    radius: '{rounded.full}'
  view-switcher:
    background: '{colors.surface-elevated}'
    active-marker: '{colors.accent}'
    text: '{colors.foreground-body}'
    disabled-text: '{colors.foreground-dim}'
    radius: '{rounded.md}'
  library-palette:
    background: '{colors.surface}'
    border: '{colors.border}'
    item-bg: '{colors.surface-raised}'
    item-hover: '{colors.surface-elevated}'
    radius: '{rounded.lg}'
  command-palette:
    background: '{colors.surface}'
    border: '{colors.border}'
    radius: '{rounded.xl}'
    input-text: '{colors.foreground}'
    selected-row: '{colors.accent-dim}'
    match-highlight: '{colors.accent-hover}'
    kbd-bg: '{colors.surface-strong}'
    kbd-text: '{colors.foreground-muted}'
  breadcrumb:
    text: '{colors.foreground-muted}'
    current: '{colors.foreground}'
    separator: '{colors.foreground-dim}'
  playback-bar:
    background: '{colors.surface}'
    control-bg: '{colors.surface-elevated}'
    active: '{colors.accent}'
    radius: '{rounded.full}'
  toast:
    background: '{colors.surface-elevated}'
    border: '{colors.border-pin}'
    text: '{colors.foreground-body}'
    action: '{colors.accent}'
    radius: '{rounded.lg}'
  button-primary:
    background: '{colors.accent}'
    foreground: '#0b1a2e'
    hover: '{colors.accent-hover}'
    radius: '{rounded.md}'
    height: '{spacing.control-height}'
  quick-fix-button:
    background: '{colors.surface-elevated}'
    foreground: '{colors.accent}'
    hover: '{colors.accent-dim}'
    radius: '{rounded.md}'
  status-bar:
    background: '{colors.surface}'
    path-text: '{colors.foreground-muted}'
    dirty-dot: '{colors.accent}'
    accent: '{colors.accent-strong}'
  file-rail:
    background: '{colors.surface}'
    item-text: '{colors.foreground-body}'
    active-item: '{colors.accent}'
    active-bg: '{colors.accent-dim}'
  peek-card:
    background: '{colors.surface}'
    border: '{colors.border-pin}'
    radius: '{rounded.xl}'
  editor:
    background: '{colors.background}'
    gutter-text: '{colors.foreground-dim}'
    current-line: '{colors.surface}'
    syntax-key: '{colors.syntax-key}'
    syntax-value: '{colors.syntax-value}'
    syntax-number: '{colors.syntax-number}'
    syntax-punctuation: '{colors.syntax-punctuation}'
    line-highlight: '{colors.accent-dim}'
---

# spec-design-yard — Design Spine

> Dark-only, done well. Every token below is defined; the prototype's four undefined tokens
> (`--surface-elevated`, `--success`, `--warning`, `--accent-dim`) now exist and are load-bearing.
> This DESIGN.md is the visual identity; `EXPERIENCE.md` is the behavior. **Where any mock,
> wireframe, or direction board conflicts with these spines, the spines win.**
> 
> Identity composes four references (memlog 2026-07-09): **Notion-calm** warm near-black surfaces
> and soft borderless shapes · **VS Code** restrained blue accent · **Discord** chunky density with
> shade-step grouping · a **restrained-sketch** canvas. Direction boards that fix the exact hues:
> [`./.working/direction-notion-calm.html`](./.working/direction-notion-calm.html) (surfaces, shapes),
> [`./.working/direction-vscode-kin.html`](./.working/direction-vscode-kin.html) (accent),
> [`./.working/direction-discord-warm.html`](./.working/direction-discord-warm.html) (density, grouping).

## Brand & Style

Spec-Yard is a **quiet desk at night**, not an IDE cockpit. The organizing principle of the product —
*human capability: every view stays simple enough for a person to track, detail is one dive-down away* —
is also the visual thesis. The chrome recedes so the two things that matter can breathe: the **spec**
(a typed YAML file, the source of truth) and the **diagram** (a live Excalidraw rendering of it). The
spec↔diagram pair is a single honest contract; nothing in the visual language may imply a capability
that doesn't exist ("zero lying UI").

The register is **warm near-black** — Notion-calm, not IDE-charcoal, not blueprint-blue. On that calm
ground sits one **restrained blue accent** (the familiar IDE "active" blue, at disciplined volume) and
four **desaturated type hues** that let a reader tell Gateway from Store at a glance without shouting.
Density is **chunky** in the Discord sense: medium text, larger forgiving controls, pill chips, roomy
buttons — a deliberate correction of the prototype's 9–11px squint. Shapes are **soft and borderless**:
6–8px radii, separation carried by whitespace and shade-steps rather than hairlines. The canvas keeps a
**restrained sketch** feel — sub-degree tilts and gentle wobble, hand-felt but never marker-squeak —
so the inherited whiteboard identity survives inside the calm chrome.

Composition tension, resolved: chunky controls want room; borderless separation wants whitespace. Where
pure whitespace would cost more room than chunky controls allow, group with **background shade-steps**
(Discord's trick) — `{colors.surface}` → `{colors.surface-elevated}` → `{colors.surface-strong}`. This
identity at rest is mocked in the lean-default screen
[`key-lean-default.html`](./mockups/key-lean-default.html).

## Colors

Dark-only. The palette is one calm neutral ramp, one accent, four type hues, and the severity set — and
each is fenced to its job.

**Surfaces — the warm near-black ramp.** Six steps carry all hierarchy; there is no elevation-by-shadow
inside the app body (see Elevation & Depth).

- `{colors.background}` `#191919` — app base and editor field.
- `{colors.surface}` `#202020` — panels, header, toolbars, the detail drawer, cards.
- `{colors.surface-raised}` `#232322` — node fill for modules and components on the canvas.
- `{colors.surface-elevated}` `#2a2a29` — chips, hover tier, the active editor tab, popover base.
- `{colors.surface-strong}` `#2f2f2f` — the strongest step: raised chips, keyboard-key backgrounds.
- `{colors.surface-canvas}` `#1c1b1a` — the diagram "paper at night," a hair darker and warmer than the app so the drawing reads as a distinct plane; `{colors.surface-canvas-dots}` for its dot-grid.

**Accent — restrained blue `{colors.accent}` `#3794ff`.** Used *only* for: selection rings, the active
tab / active view marker, focused input borders, primary and quick-fix buttons, command-palette match
highlight, exposed interface pins, and the dirty-state dot. `{colors.accent-hover}` `#4fb3ff` brightens
on hover; `{colors.accent-dim}` `#122a40` is the dim accent wash behind active tool buttons, the
selected palette row, and the file-rail active row; `{colors.accent-strong}` `#007acc` is the
status-bar accent (graphical only — see the contrast floor). **Accent is never a type color and never a
severity color** — that fence is what keeps "active" legible.

**Type hues — four desaturated colors, one per component type** (fixed, memlog 2026-07-09). Legible on
warm near-black, mutually distinct, and clear of the accent and severity fences:

- `{colors.type-gateway}` `#2dd4bf` — **Gateway** (teal). Moved off amber so it never collides with warning.
- `{colors.type-stage}` `#a78bfa` — **Stage** (violet).
- `{colors.type-store}` `#4ade80` — **Store** (green). Moved off indigo so it never collides with the `#3794ff` selection blue.
- `{colors.type-brick}` `#f472b6` — **Brick** (rose). Distinct from the red error severity.

**Color is never the sole carrier.** Every typed node and chip also carries its `[Type]` text label; the
type hues only accelerate a distinction the text already makes.

**Severities — red/amber/info, reserved.** `{colors.danger}` `#ef6d70` (error), `{colors.warning}`
`#d0a04a` (warning), `{colors.info}` `#7f9fbf` (info). Each has a dim fill (`danger-dim`, `warning-dim`,
`info-dim`) for badges. **Sync-ok / "Ready"** is `{colors.success}` `#8fae8b` — a sage green held
deliberately off the brighter Store green so "healthy sync" never reads as a component.

**Canvas hues are authored, not double-inverted.** The canvas is pinned `theme="dark"`, but the type-hue
and severity hexes above are the **on-screen target values**: canvas node strokes and fills author these
hexes directly and are exempt from Excalidraw's dark-theme color inversion, so the fenced palette renders
as specified (no second inversion shifts Gateway teal toward Store green, etc.).

**Contrast floor (WCAG AA, load-bearing combinations).** Text pairs meet ≥ 4.5:1; purely graphical
marks (rings, borders, dots) meet ≥ 3:1.

- `{colors.foreground-body}` on `{colors.background}` and on `{colors.surface}` — ≥ 4.5:1 (primary reading target).
- `{colors.foreground-muted}` on `{colors.surface}` — ≥ 4.5:1 for captions and labels.
- `{colors.danger}` on `{colors.danger-dim}` — **5.07:1** (error-badge glyph + count). Brightened from the prior `#e5595c` (4.23, failing). `warning`/`info`/`success` on their dim fills already pass.
- `{colors.accent}` on `{colors.accent-dim}` — **4.78:1** (file-rail active filename, quick-fix-button hover label). `accent-dim` darkened from `#16344f` (4.18, failing).
- `{colors.syntax-punctuation}` on `{colors.background}` — **4.56:1** (YAML `:`/`-` structural punctuation, read to parse structure). Raised from `#66655f` (3.01, failing).
- `button-primary` foreground `#0b1a2e` on `{colors.accent}` — **5.70:1** (primary-button label).
- `border-node` on `{colors.surface-canvas}` — **3.32:1** graphical (the untyped module-symbol boundary; component nodes also carry their type-hue border). Raised from `#3a3936` (1.49, failing).
- `{colors.accent-strong}` on `{colors.surface}` — **3.61:1**, fenced to **graphical/non-text use only** (status-bar accent mark); never carries text.
- `{colors.foreground-dim}` is decorative/supplementary only (line numbers, disabled entries) — never sole carrier of essential meaning; line-jump highlights and centers the target and never requires reading a dim line number.
- Every type hue and every severity color pairs with a text label, so the color itself need not carry text contrast alone; the *label* does.

## Typography

Two families. **`system-ui`** for all chrome and prose; **`ui-monospace`** for anything the spec owns —
YAML in the editor, component ids, and numeric readouts (latency, throughput, packet counts).

The ramp is deliberately short and **starts at 13px** — the chunky-density correction of the prototype's
9–11px. Roles: `{typography.display}` / `{typography.heading}` (15px 600, wordmark and drawer/section
titles) · `{typography.body}` (14px 400, the default) · `{typography.label}` (13px 500, controls and
field labels) · `{typography.caption}` (12px 400 muted) · `{typography.eyebrow}` (11px 600 uppercase
tracked — chrome micro-labels only, never body). Monospace roles: `{typography.code}` (13px, the editor)
· `{typography.readout}` (13px, ids and metrics — **raised from 12px** so latency/throughput/packet-count
figures the architect reads daily meet the content floor) · `{typography.kbd}` (12px, keyboard hints in
the command palette and shortcuts).

**Rule:** 13px is the floor for interactive and content text (`readout` is now on the floor since its
metrics are content). Two supplementary roles may sit below it — `{typography.caption}` (12px, muted
non-essential labels only) and `{typography.kbd}` (12px, decorative shortcut hints that duplicate a named
command) — and the non-interactive `{typography.eyebrow}` micro-label may sit at 11px, uppercase-tracked,
where its job is orientation, not reading. Nothing load-bearing sits below 12px.

## Layout & Spacing

The scale is a 4-based chunky ramp — `{spacing.1}` 4 · `{spacing.2}` 8 · `{spacing.3}` 12 ·
`{spacing.4}` 16 · `{spacing.5}` 20 · `{spacing.6}` 24 · `{spacing.8}` 32 — with `{spacing.gutter}` (16px)
as the default inter-element gutter and `{spacing.control-height}` (32px) / `{spacing.row-height}` (36px)
as the chunky control and list-row minimums. Controls are roomy on purpose; fewer surfaces are visible at
once (the lean default), so each visible surface can afford the room.

**Frame.** Desktop two-pane: **editor left, canvas right**, a draggable split between them, neither pane
below a comfortable minimum. A thin **status bar** runs the bottom. A collapsible **file rail** lists the
project's spec files. This is the frame; `EXPERIENCE.md` owns what fills it and when surfaces are summoned.

Narrow windows are **graceful degradation only** — not a designed responsive experience (desktop-only MVP),
but the order is defined so a builder doesn't guess. Panes hold to **≥ 280px** each (editor, canvas). As the
window narrows, chrome sheds in this order: (1) the **file rail auto-collapses** first; (2) a **right-docked
detail drawer reverts** to the adaptive drawer under the editor; (3) below the point where both panes can
hold their minimums plus split handles (~**1024px** with the drawer docked), the drawer overlays rather than
splits. **Zoom / text-resize:** UI text scales and reflows to **200%** without loss of content or function
within the desktop frame — panes narrow to their minimums and chrome collapses per the order above (WCAG
1.4.4 / 1.4.10). Canvas `⇧1` fit-to-screen is diagram zoom, separate from UI text zoom.

## Elevation & Depth

Depth is **tonal, not cast**. Inside the app body, hierarchy comes entirely from the surface shade-steps
(`{colors.background}` → `{colors.surface}` → `{colors.surface-elevated}` → `{colors.surface-strong}`) —
borders nearly vanish (`{colors.border}` is a quiet hairline used sparingly). **Soft shadows appear only
on genuinely floating layers** that leave the plane: the command palette, the library palette flyout,
the peek card, popovers, and toasts. A floating shadow is diffuse and low-opacity — presence, not drama.
Everything docked (editor, canvas, drawer, strips, rail) sits flat and separates by shade alone.

## Shapes

Soft and borderless: `{rounded.sm}` 4px (inputs, small chips) · `{rounded.md}` 6px (buttons, chips,
cards) · `{rounded.lg}` 8px (panels, the detail drawer, canvas nodes) · `{rounded.xl}` 12px (the command
palette, the peek card, modals) · `{rounded.full}` (pills — type chips, the member-count chip, the
sync-health chip, playback controls). The larger radii on floating surfaces read calm; the pills keep the
chunky-density chips friendly rather than boxy.

**Canvas is the exception that proves the rule.** Nodes render in **restrained sketch**: Excalidraw
roughness dialed low, sub-degree tilt, a gentle hand-drawn wobble on borders — enough to feel drawn, not
enough to squeak. Node corners still follow `{rounded.lg}`; the sketch lives in the stroke, not the geometry.

## Components

Behavioral specs for each live in `EXPERIENCE.md.Component Patterns`; this is the visual anatomy. Hero-screen
reference: the three IA wireframes — [expand-in-place](./wireframes/flow-variant-a-expand-in-place-2026-07-08.excalidraw),
[descend](./wireframes/flow-variant-b-descend-2026-07-08.excalidraw),
[hybrid](./wireframes/flow-variant-c-hybrid-2026-07-08.excalidraw) — illustrate module navigation.

**Module symbol** (`{components.module-symbol}`) — a collapsed module rendered as a **single sealed box**
on `{colors.surface-raised}` with a low-roughness sketch border `{colors.border-node}`, `{rounded.lg}`.
Its *only* connection anchors are **interface pins** — small `{rounded.full}` nubs at the box edge, filled
`{colors.accent-dim}` with an `{colors.accent}` ring for **exposed members**, labeled in
`{colors.foreground-muted}`. It carries a **member-count chip** (below) and a **diagnostic badge** showing
the worst rolled-up severity. No internals are drawn — the symbol is the honest outside face.

**Component node** (`{components.component-node}`) — an atomic element on `{colors.surface-raised}`,
`{rounded.lg}`, name in `{colors.foreground}`. **Per-type color** is carried by the node's `[Type]` chip
and border tint: Gateway `{colors.type-gateway}`, Stage `{colors.type-stage}`, Store `{colors.type-store}`,
Brick `{colors.type-brick}`.

**Node state is differentiated by shape, not color alone** — the three states can co-occur on one node, so
each carries a non-color cue and they stack in a fixed order (outermost to innermost):

- **Selected** — a solid `{colors.accent}` ring **plus selection handles**. The handles, not the hue,
  signal selection (so a selected node on a sim path is unambiguous even though both use `{colors.accent}`).
- **Error** — a **dashed** `{colors.danger}` border **plus the rolled-up error diagnostic-badge glyph**.
  Dashed stroke + glyph distinguish error from selection and simulation without relying on the red.
- **On an active simulation path** — a **pulsing** `{colors.accent}` glow **plus a "live" readout** on the
  playback tracing line. Motion + label distinguish it from the static selection ring.

Stacking order when several apply at once: selection handles sit above the error border, which sits above
the simulation glow; all three remain individually legible.

**Boundary pin** (`{components.boundary-pin}`) — when descended into a module, connections and traffic
from outside enter at boundary pins: `{colors.accent-dim}` fill, `{colors.accent}` ring,
`{colors.foreground-muted}` label, `{rounded.full}`. A boundary pin is a **real scene-space element**
placed at the edge of the descended view's auto-fitted bounding box (the box enclosing the module's
members), on the side nearest its external counterpart — so it **pans and zooms with the content** rather
than clinging to a fixed screen edge, and native Excalidraw connectors can bind to it. (Coordinate model
in `EXPERIENCE.md.Component Patterns`.)

**Type chip** (`{components.type-chip}`) — a `{rounded.full}` pill in `{typography.readout}` with a dim
type-tinted fill (`type-gateway-dim` … `type-brick-dim`) and the type name as text. Text is mandatory;
the tint is an accelerator.

**Member-count chip** (`{components.member-count-chip}`) — a `{rounded.full}` pill,
`{colors.surface-elevated}` fill, `{colors.foreground-muted}` monospace readout ("6 members"). Sits on the
module symbol.

**Diagnostic badge** (`{components.diagnostic-badge}`) — a small `{rounded.sm}` badge, fill+text keyed to
severity (`danger-dim`/`danger`, `warning-dim`/`warning`, `info-dim`/`info`), carrying a glyph *and* count.
Rolls up onto collapsed modules as the worst contained severity.

**Detail drawer / inspector** (`{components.detail-drawer}`) — `{colors.surface}`, `{rounded.lg}`, heading
in `{colors.foreground}`. Fields sit on `{colors.background}` with a `{colors.accent}` focus ring.
**Dockable:** ships as an adaptive drawer under the editor; can dock right as a persistent inspector column.
Content adapts — component form vs. module interface/members — in either geometry. Shown in its descended,
dock-right form in the [`key-descended-module.html`](./mockups/key-descended-module.html) mock.

**Diagnostics strip** (`{components.diagnostics-strip}`) — the collapsed **lean-default** surface: a thin
`{colors.surface}` strip carrying a status dot (`{colors.success}` when all checks pass, else
`{colors.danger}`/`{colors.warning}`/`{colors.info}` for the worst open severity) and a
`{colors.foreground-muted}` count. Expands to the full per-code diagnostic list with quick-fix buttons.

**Sync-health chip** (`{components.sync-health-chip}`) — a corner `{rounded.full}` chip. **Silent when
honest** (`success-dim` fill, `{colors.success}` check glyph); **stateful on drift** (`warning-dim` fill,
`{colors.warning}` text, count of drifts). Click expands a popover of per-drift resolve actions. The chip,
conflict prompt, and data-loss toast are mocked together in
[`key-safety-surfaces.html`](./mockups/key-safety-surfaces.html).

**View switcher** (`{components.view-switcher}`) — a single dropdown on `{colors.surface-elevated}`,
`{rounded.md}`, active entry marked by `{colors.accent}`. Future renderers (Sequence / Pipeline / State)
appear in `{colors.foreground-dim}` disabled text, present but grayed.

**Library palette** (`{components.library-palette}`) — an edge flyout, `{colors.surface}`, `{rounded.lg}`,
template items on `{colors.surface-raised}` (hover `{colors.surface-elevated}`). Floating, so it earns a
soft shadow. Each item is a card carrying the template's **name**, a **miniature of its type composition**,
and a **one-line description**. Mocked at
[`key-library-palette.html`](./mockups/key-library-palette.html), and in its auto-opened empty-project form
at [`key-empty-state.html`](./mockups/key-empty-state.html).

**Command palette** (`{components.command-palette}`) — a centered floating panel, `{colors.surface}`,
`{rounded.xl}`, soft shadow. Input in `{colors.foreground}`; selected row `{colors.accent-dim}`; the
matched substring highlights `{colors.accent-hover}`; keybinding hints in `{typography.kbd}` on
`{colors.surface-strong}` chips.

**Breadcrumb** (`{components.breadcrumb}`) — the hierarchy trail (system → module → submodule). Ancestors
`{colors.foreground-muted}`, current scope `{colors.foreground}`, separators `{colors.foreground-dim}`.
Folds the Tree view into navigation.

**Playback bar** (`{components.playback-bar}`) — simulation transport on `{colors.surface}` with
`{rounded.full}` controls on `{colors.surface-elevated}`; the active speed / play state marked
`{colors.accent}`. Shown in context in the [`key-simulation-view.html`](./mockups/key-simulation-view.html) mock.

**Toast** (`{components.toast}`) — a floating `{rounded.lg}` card, `{colors.surface-elevated}`, hairline
`{colors.border-pin}`, body `{colors.foreground-body}`, action link in `{colors.accent}`. Used for
data-loss warnings and export completion — sparingly.

**Primary button** (`{components.button-primary}`) — the single emphasized action in a surface:
`{colors.accent}` fill, `#0b1a2e` label (dark navy, ≥ 4.5:1 on accent), `{rounded.md}`,
`{spacing.control-height}` tall, `{colors.accent-hover}` on hover. At most one per surface.

**Quick-fix button** (`{components.quick-fix-button}`) — a compact remediation control on lint
diagnostics: `{colors.surface-elevated}` fill, `{colors.accent}` label, `{rounded.md}`,
`{colors.accent-dim}` hover fill (accent label on `accent-dim` clears 4.5:1). Secondary weight, never the
lone primary in a surface.

**Status bar** (`{components.status-bar}`) — `{colors.surface}`, shows the **true file path** in
`{colors.foreground-muted}` and a **dirty dot** in `{colors.accent}` when the buffer is ahead of disk. The
dot is never color-only: it is paired with an **"Unsaved" text label** (or tooltip) so the dirty state does
not depend on perceiving a small colored dot. The status bar's accent mark (`{colors.accent-strong}`)
is graphical only — it never carries text (it fails the 4.5:1 text floor; it clears the 3:1 graphical bar).

**File rail** (`{components.file-rail}`) — lists discovered `*.spec.yaml` files; items in
`{colors.foreground-body}`, the open file in `{colors.accent}` on an `{colors.accent-dim}` row.

**Peek card** (`{components.peek-card}`) — the read-only hover/Space overlay of a module's internals:
floating `{colors.surface}`, `{rounded.xl}`, hairline `{colors.border-pin}`, soft shadow, zero layout shift.

**Editor** (`{components.editor}`) — `{colors.background}` field, `{typography.code}`, line numbers in
`{colors.foreground-dim}`, YAML syntax keyed to the `syntax-*` tokens, and a `{colors.accent-dim}`
line-highlight when the canvas jumps the cursor to a mapped element. **Implementation prerequisite:** line
numbers, per-line syntax coloring, and the line-highlight require a **line-addressable editor component**
(gutter + per-line decoration + programmatic scroll-to-line). A plain `<textarea>` — the current build's
editor — cannot render any of them; swapping in a line-addressable editor is a prerequisite for this
anatomy and for bidirectional line-jump. The specific component is architecture's call; this spine only
fixes that the capability is required, not faked.

## Do's and Don'ts

| Do                                                                                                    | Don't                                                                                                               |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Carry hierarchy with the surface shade-steps                                                          | Add drop-shadows to docked surfaces (shadow = floating only)                                                        |
| Reserve `{colors.accent}` for active / selected / focused / primary                                   | Use accent as a type color or a severity color                                                                      |
| Keep every type and severity color paired with a text label                                           | Let color be the sole carrier of type or severity                                                                   |
| Keep interactive and content text ≥ 13px                                                              | Reintroduce the prototype's 9–11px squint density                                                                   |
| Hold `{colors.success}` sage apart from Store green; `{colors.warning}` amber apart from Gateway teal | Reuse a type hue for a status, or a status hue for a type                                                           |
| Draw canvas nodes in restrained sketch (low roughness, sub-degree tilt)                               | Let the sketch "squeak" — heavy roughness, wobbling geometry                                                        |
| Define every token here before a component references it                                              | Reference `--surface-elevated` / `--success` / `--warning` / `--accent-dim` without a definition (the original bug) |
| Let chrome recede so spec and diagram breathe                                                         | Imply any capability the product doesn't have ("zero lying UI")                                                     |
