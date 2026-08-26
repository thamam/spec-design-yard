# Accessibility Review — spec-design-yard UX spines

**Reviewer:** Accessibility auditor · **Date:** 2026-07-09
**Scope:** `DESIGN.md` (tokens + component specs) and `EXPERIENCE.md` (Accessibility Floor, Interaction
Primitives, IA, Component Patterns), audited against the current-build gaps in
`.working/extract-current-ui.md §7`. What the spines *commit to* is what will ship — silence is a gap.

## Overall assessment

The spines are genuinely strong where they legislate: the color-never-sole-carrier contract for type and
severity is explicit and holds, the 13px density correction is real, `prefers-reduced-motion` is named,
and the declared WCAG-AA floor combinations (`foreground-body`/`foreground-muted` on the body surfaces) all
compute clean. But the **canvas — the product's right half — has no stated keyboard navigation and no
stated screen-reader position**, so a keyboard-only or blind architect currently has no committed path to
select, peek, descend, or perceive a single node; the editor is a perfect accessible equivalent yet the
spine never says so. Secondary but real: the command palette is *claimed* as "keyboard entry to everything"
without a command inventory to back it, several interactive states (conflict modal, data-loss toast, node
selection/error/sim stacking) have no stated focus or non-color differentiation, and a handful of
load-bearing token pairs the floor never fenced (error-badge text, active-file text, YAML punctuation) miss
AA by a hair.

**Counts:** 2 critical · 6 high · 9 medium · 5 low.

---

## Critical

### [critical] Canvas has no committed keyboard navigation (EXPERIENCE.md § Component Patterns / Interaction Primitives)
Every canvas gesture is mouse-defined: `single-click` selects, `double-click` descends, hover/`Space` peeks.
The keyboard map binds `Esc` (ascend/dismiss) and `Space` (peek *a already-selected* module) — but **nothing
selects or moves between nodes from the keyboard, and nothing descends**. So the entire tiered-navigation
model (peek / descend / expand-in-place), the core of the product, is unreachable without a mouse. The
Accessibility Floor promises reachability for *summoned surfaces* (palette, drawer, rail, switcher, layers,
library, diagnostics) but conspicuously **omits the canvas itself**. Excalidraw's own keyboard support for
selecting/traversing scene objects is limited, so this cannot be assumed — it must be designed or honestly
punted.
**Fix:** Add to the Accessibility Floor + Interaction Primitives a canvas keyboard model, e.g.: `Tab`/arrow
keys move a focus ring between nodes and pins in reading order; `Enter` descends into a focused module,
`Space` peeks it, `Esc` ascends; a "Go to node…" command in the palette jumps focus to any node by name.
If a full spatial model is out of MVP scope, state that explicitly and route keyboard users to the
editor + "Go to node" palette command as the committed equivalent (see next finding).

### [critical] No screen-reader / accessible-equivalent position for the canvas (DESIGN.md § Components; EXPERIENCE.md § Foundation, Accessibility Floor)
The canvas is an inherently visual Excalidraw surface. The spines say nothing about how a screen-reader user
perceives it: no `aria-label` on the canvas region, no roles/labels for nodes, chips, badges, or pins, and
no stated position that **the YAML editor is the accessible textual equivalent** of the diagram. This is the
one place the product is unusually well-positioned — the editor *is* the honest contract, a fully
semantic textual representation of the exact same spec — yet the commitment is absent, so it will not be
built or QA'd. Silence here = a blind user gets an unlabeled canvas and nothing else.
**Fix:** State the honest position in the Accessibility Floor: "The canvas is a supplementary visual view
of the spec; the **editor is the screen-reader-accessible equivalent** and carries the full contract. The
canvas region is `aria-label`led (e.g. 'Architecture diagram — see the editor for the full spec'), and
canvas nodes expose accessible names/roles where Excalidraw permits." Add live-region announcements for
diagnostics count, sync-health state, save/dirty state, and simulation start/stop (none are currently
stated as announced).

---

## High

### [high] Descend has no keyboard binding — hierarchy navigation is one-way (EXPERIENCE.md § Interaction Primitives)
`Esc` ascends one level (stated), but the only descend gesture is `double-click`. A keyboard user who
somehow reaches a module can climb *out* of the hierarchy but never *in* — the VHDL descend/ascend pillar,
the admired anchor, is half-reachable.
**Fix:** Bind descend to `Enter` (or double-`Enter`) on a focused/selected module, and add a palette command
"Descend into module." Mirror `Esc`↔descend in the keyboard map table so the pair is symmetric.

### [high] "Keyboard entry to everything" is claimed but not backed by a command inventory (EXPERIENCE.md § IA table, Command palette)
The IA table calls the command palette "Search-any-command; **keyboard entry to everything**," and
Inspiration reinforces it as "the spine." But no command inventory is committed, and the spatial/canvas
operations a mouse user performs — select node X, descend into module Y, expand-in-place, toggle a type's
visibility (Layers), switch view, resolve a specific sync drift, run a specific quick-fix, insert a specific
template, run/pause/step the simulation, set sim speed, dock the drawer, export — are nowhere enumerated as
palette commands. An "everything" claim with no backing list is a lying-UI risk against the spine's own
"zero lying UI" rule.
**Fix:** Add a Command Inventory subsection listing (or ruling in-scope) every mouse-reachable action as a
palette command, especially the canvas-spatial ones ("Go to node…", "Descend into…", "Peek…",
"Expand in place", "Toggle [type] visibility", "Resolve drift…", "Run quick-fix…", sim transport). Commit
that the palette is exhaustive, or narrow the claim.

### [high] Conflict prompt (data-loss modal) has no stated focus management (EXPERIENCE.md § Conflict prompt, State Patterns)
The conflict prompt — *"Changed on disk. Reload or keep your edits?"* — is called the **common case**
(agents editing the open file), and one choice **overwrites disk** and the other **discards the buffer**:
irreversible either way. Yet nothing is stated about focus trap, initial focus, default/destructive-button
distinction, or `Esc` behavior (and here `Esc` is dangerous — it must not silently pick a data-losing
default). A keyboard user could destroy work by hitting the wrong key.
**Fix:** Specify: modal traps focus, initial focus lands on the **non-destructive** choice, both buttons are
keyboard-operable and labeled distinctly (not color-only), `Esc` cancels to the *safe* state (keep-editing,
no write), and focus restores to the editor on close.

### [high] Toasts — including the data-loss warning — not committed to a live region or keyboard-reachable action (DESIGN.md § Toast; EXPERIENCE.md § Sync-health chip + data-loss toast)
The data-loss toast fires when canvas content would vanish on reload — a genuine loss warning — and export
completion toasts carry an open/download action. Nothing states the toast is announced via `aria-live`, that
it does or doesn't steal focus, or that its action link is keyboard-focusable and dismissible by `Esc`. A
screen-reader or keyboard user silently misses the loss warning and cannot reach "Undo/open."
**Fix:** State: toasts render in an `aria-live="assertive"` region for loss warnings (`polite` for
completions), do **not** steal focus, and their action + dismiss are keyboard-reachable while visible
(e.g. a shortcut or focus-on-`Tab`). Confirm the loss warning is also mirrored as a diagnostics/sync entry
so it survives toast timeout.

### [high] Selection ring, error border, and simulation glow stack on one node, distinguished by color/glow alone (DESIGN.md § Component node; EXPERIENCE.md § Canvas display elements)
A node can be simultaneously **selected** (`accent` ring), **erroring** (`danger` border), and **on an
active sim path** (`accent` glow). Selection ring and simulation glow are the *same hue* (`accent`), so a
selected node on a sim path is ambiguous; error vs the others is a pure color swap. No shape, icon, or
stroke-style differentiation is stated — this reintroduces color-as-sole-carrier for node *state* (the spine
solved it only for type and severity). Low-vision users can't tell these states apart, and the accent/accent
collision is ambiguous for everyone.
**Fix:** Differentiate by more than color: e.g. selection = solid ring + selection handles, error = dashed
`danger` border + an error glyph badge (already rolled up), simulation = animated/pulsing glow + a "live"
readout. Define the stacking order and visual language for co-occurrence in DESIGN.md § Component node.

### [high] Load-bearing token pairs the contrast floor never fenced miss WCAG AA (DESIGN.md § Colors "Contrast floor", Components)
The declared floor combinations all pass, but three *undeclared* load-bearing pairs fail (full table below):
- **`danger` on `danger-dim` = 4.23:1** (error diagnostic-badge glyph+count) — below 4.5. The single most
  important severity has the only failing badge; `warning`/`info`/`success` all pass.
- **`accent` on `accent-dim` = 4.18:1** — the **open file's name** in the file rail (`{components.file-rail}`
  "open file in accent on an accent-dim row"). The indicator of *which file you are editing* fails AA.
- **`syntax-punctuation` on `background` = 3.01:1** — YAML structural punctuation (`:`, `-`) is content a
  low-vision author must read to parse structure; below 4.5.
**Fix:** Brighten `danger` toward ~`#ef6d70` or darken `danger-dim`, until ≥4.5 on the fill. For the file
rail, use `foreground` (not `accent`) for the active filename text and let the `accent-dim` row + an accent
marker carry "active." Raise `syntax-punctuation` (e.g. `#7a7972`+) to clear 4.5, or declare it decorative.
Add these three to the DESIGN.md contrast-floor list so they're fenced.

---

## Medium

### [medium] 13px floor contradicts the spine's own typography tokens (DESIGN.md § Typography; EXPERIENCE.md § Accessibility Floor)
The Accessibility Floor states "interactive and content text is **≥ 13px**… Only the non-interactive
`eyebrow` may sit at 11px." But `caption` (12px, "captions, muted labels"), `readout` (12px, "ids and
**metrics** — latency, throughput, packet counts"), and `kbd` (11px, shortcut hints) all sit below 13px and
all carry content. Metrics and ids are data the architect reads daily; this partially re-imports the exact
9–11px squint problem §7 called out.
**Fix:** Either raise `readout`/`caption` to 13px and `kbd` to ≥12px, or amend the floor rule to
explicitly carve out `caption`/`readout`/`kbd` and justify each as supplementary — but `readout` carrying
metrics is hard to justify as non-content. Recommend raising `readout` to 13px.

### [medium] `Space`-to-peek may collide with canvas pan and focused-button activation (EXPERIENCE.md § Interaction Primitives)
`Space` peeks a selected module, but `Space` is Excalidraw's pan modifier on canvas and the universal
"activate focused control" key. With no stated canvas focus model, it's unclear which wins when focus is on
the canvas vs a button vs a node.
**Fix:** State the precedence: `Space` peeks only when a module node holds canvas focus and no button is
focused; otherwise it pans/activates per platform convention. Resolve alongside the canvas keyboard model.

### [medium] Focus is not stated to move on selection (drawer) or after descend (EXPERIENCE.md § Detail drawer, Module symbol)
"Selecting any unit opens the detail drawer," but nothing says focus moves into the drawer's first field —
so a keyboard user opens a form they must then hunt for. Likewise, after `descend` the editor
leash-follows, but the canvas focus target inside the module is unstated.
**Fix:** State that selection moves focus to the drawer's first field (or exposes a documented `⌘J`/`Tab`
path into it), and that descend places focus on the first boundary pin or node of the entered module.

### [medium] Expand-in-place has no stated keyboard path (EXPERIENCE.md § Module symbol)
Expand-in-place is triggered by "an explicit **corner control or context-menu** action." Corner controls
need focus (unstated) and context menus need a keyboard opener (`Menu`/`Shift+F10`, unstated).
**Fix:** Bind expand-in-place to a key on a focused module and/or a palette command; ensure the context menu
opens from the keyboard.

### [medium] Sync-health chip resolution has no stated keyboard operation (EXPERIENCE.md § Sync-health chip)
The chip "click expands a popover of per-drift resolve actions," and drifts can risk data loss. The chip
isn't in the Accessibility Floor reachability list, and popover keyboard operation (focus, arrow, `Esc`) is
unstated.
**Fix:** Add the sync-health chip to the reachable set; specify focus into the popover, arrow-through
per-drift actions, and `Esc` to close.

### [medium] Playback bar / simulation transport not committed to keyboard, and reduced-motion coupling is vague (EXPERIENCE.md § State Patterns "Simulation running", Interaction Primitives)
The playback bar (speed, pause, step) is absent from the reachability commitment, so a keyboard user may be
unable to pause or step a running simulation — which is also the app's largest continuous motion. `prefers-
reduced-motion` is named generally but not explicitly tied to the moving packet-dot animation.
**Fix:** Add playback controls to the reachable set with keys (e.g. `K` pause/play, `,`/`.` step). State
that `prefers-reduced-motion` suppresses or de-animates the simulation packet motion (not just the 120–180ms
UI eases), and that simulation is pausable — satisfying WCAG 2.2.2 for auto-moving content.

### [medium] Browser zoom / text-resize (WCAG 1.4.4 / 1.4.10 reflow) not addressed (DESIGN.md § Layout & Spacing; EXPERIENCE.md § Responsive & Platform)
"Desktop-only," fixed two-pane, "narrow windows degrade gracefully — not designed." Reflow at 200% zoom and
text resize to 200% are AA requirements even for desktop web; the spine's non-responsive stance may break
layout at zoom with no committed behavior. (Canvas `⇧1` fit-to-screen is diagram zoom, not UI text zoom.)
**Fix:** Commit a minimum: UI text scales/reflows to 200% without loss of content or function within the
desktop frame (panes may narrow to their minimums, chrome may collapse), even if a full responsive layout
isn't designed.

### [medium] Roving/arrow-key navigation committed only for tabs + view switcher, not the palette or diagnostics lists (EXPERIENCE.md § Accessibility Floor)
Roving tab focus is promised for "tab bars and the view switcher," but the command-palette result list and
the expanded diagnostics list are vertical option lists that equally need arrow-key navigation with a single
tab stop — unstated. Also: the view switcher is called a "**dropdown**" in DESIGN.md/Component Patterns but a
roving "tab bar" in the Accessibility Floor; these are different ARIA patterns (combobox/listbox vs tablist).
**Fix:** Extend the arrow-key/single-tab-stop commitment to the palette list and diagnostics list. Reconcile
the view-switcher description (pick dropdown *or* tablist) so the correct keyboard pattern is unambiguous.

### [medium] Dirty-dot and low-value contrast edges (DESIGN.md § Status bar, Colors)
The dirty state is an `accent` dot only, with no text affordance — small and color/presence-only; a low-
vision user may miss "unsaved." Separately, `accent-strong` on `surface` = **3.61:1** (status-bar accent):
fine as a graphical accent (≥3:1) but **fails 4.5:1 if it ever carries text**.
**Fix:** Pair the dirty dot with a text/tooltip affordance ("Unsaved") or a filename style change. Fence
`accent-strong` to non-text use in DESIGN.md, or don't use it for status-bar labels.

---

## Low

### [low] `foreground-dim` fails 4.5:1 on every surface — protected by declaration, but two edge cases lean load-bearing (DESIGN.md § Colors)
The spine explicitly scopes `foreground-dim` as "decorative/supplementary only… never sole carrier of
essential meaning," so its 2.99–3.66:1 ratios are compliant by contract. Two uses press that boundary:
editor **line numbers** (the line-jump feature navigates *by* line) and the **disabled future view-switcher
entries** (`Sequence/Pipeline/State` in `foreground-dim` = 2.99:1 on `surface-elevated`) which convey
"coming later." Keep them supplementary; ensure line-jump never *requires* reading a dim number.

### [low] Peek dismissal focus-return not stated (EXPERIENCE.md § Module symbol)
`Esc` dismisses the peek card, but where focus returns (should be the peeked module) is unstated.
**Fix:** State focus returns to the module that was peeked.

### [low] High-speed simulation (up to 5×) vs. flash thresholds not addressed (EXPERIENCE.md § State Patterns; extract §3)
The current build offers 0.5×–5× playback with moving packet dots; at high speed, rapidly appearing dots
could approach WCAG 2.3.1's three-flashes-per-second limit. The spines don't address it.
**Fix:** State that packet animation never exceeds the flash threshold at any speed (cap effective flash
rate or use motion, not blink).

### [low] Border hairlines sit far below 3:1 — by design, worth an explicit note (DESIGN.md § Elevation & Depth, Colors)
`border` on `surface`/`background` = 1.18–1.28:1 and `border-node`/`border-pin` = 1.36–1.61:1. The tonal-
depth model intends borders to "nearly vanish" and carry hierarchy by shade, so these are not text/essential
graphics. But **module symbols** (no type tint) rely on `border-node` = 1.49:1 against the canvas plus a
tiny fill delta (`surface-raised` #232322 vs `surface-canvas` #1c1b1a ≈1.1:1) — their boundary is nearly
imperceptible for low-vision users.
**Fix:** Ensure module symbols carry a perceivable boundary (raise `border-node` toward 3:1 against
`surface-canvas`, or add a shade/tint), since the object-boundary *is* essential for the untyped module box.

### [low] Layers visibility control and "operable" claims are asserted, not specified (EXPERIENCE.md § IA, Accessibility Floor)
"View switcher, layers control, library palette, and diagnostics are all reachable and operable without a
mouse" is a blanket assertion with no per-control keyboard spec (how a toggle flips, how a library item is
inserted by keyboard — the editor "Insert template" path covers library insertion honestly, which is good).
**Fix:** Note the concrete key/mechanism for each (at least: Layers toggle = `Space`/`Enter` on a focused
row; library = editor "Insert template" is the committed keyboard equivalent).

---

## Computed contrast table (WCAG 2.x, all load-bearing pairs)

Text target = 4.5:1 · UI/graphical target = 3.0:1. Computed from the exact DESIGN.md hex values.

| Foreground | Background | Ratio | Need | Kind | Result | Use |
|---|---|--:|--:|:--:|:--:|---|
| foreground | background | 13.85 | 4.5 | text | PASS | names/headings |
| foreground | surface | 12.83 | 4.5 | text | PASS | headings on panels |
| foreground | surface-raised | 12.39 | 4.5 | text | PASS | node name |
| foreground | surface-elevated | 11.31 | 4.5 | text | PASS | chip/tab text |
| foreground-body | background | 10.30 | 4.5 | text | PASS | primary reading (declared floor) |
| foreground-body | surface | 9.55 | 4.5 | text | PASS | body on panels (declared floor) |
| foreground-body | surface-raised | 9.22 | 4.5 | text | PASS | node body |
| foreground-body | surface-elevated | 8.42 | 4.5 | text | PASS | view-switcher / toast body |
| foreground-muted | background | 6.25 | 4.5 | text | PASS | captions |
| foreground-muted | surface | 5.79 | 4.5 | text | PASS | labels (declared floor) |
| foreground-muted | surface-raised | 5.59 | 4.5 | text | PASS | pin label / member readout |
| foreground-muted | surface-elevated | 5.11 | 4.5 | text | PASS | member-count chip |
| foreground-muted | surface-strong | 4.76 | 4.5 | text | PASS | kbd hint text |
| **foreground-dim** | **background** | **3.66** | 4.5 | text | **FAIL** | line numbers (declared decorative) |
| **foreground-dim** | **surface** | **3.39** | 4.5 | text | **FAIL** | breadcrumb sep / disabled (declared decorative) |
| **foreground-dim** | **surface-raised** | **3.27** | 4.5 | text | **FAIL** | punctuation (declared decorative) |
| **foreground-dim** | **surface-elevated** | **2.99** | 4.5 | text | **FAIL** | disabled future view entry (declared decorative) |
| accent | background | 5.73 | 4.5 | text | PASS | accent text/marker |
| accent | surface | 5.31 | 4.5 | text | PASS | accent on panels |
| accent | surface-elevated | 4.68 | 4.5 | text | PASS | quick-fix button label |
| accent-hover | surface | 7.16 | 4.5 | text | PASS | palette match highlight |
| **accent** | **accent-dim** | **4.18** | 4.5 | text | **FAIL** | **file-rail active filename** |
| **accent-strong** | **surface** | **3.61** | 4.5 | text | **FAIL** | status-bar accent (OK if graphical only) |
| btn-primary-fg `#0b1a2e` | accent | 5.70 | 4.5 | text | PASS | primary button label |
| type-gateway | surface-raised | 8.45 | 3.0 | ui | PASS | node border tint |
| type-gateway | surface-canvas | 9.24 | 3.0 | ui | PASS | marker on canvas |
| type-stage | surface-raised | 5.78 | 3.0 | ui | PASS | node border tint |
| type-stage | surface-canvas | 6.32 | 3.0 | ui | PASS | marker on canvas |
| type-store | surface-raised | 9.03 | 3.0 | ui | PASS | node border tint |
| type-store | surface-canvas | 9.87 | 3.0 | ui | PASS | marker on canvas |
| type-brick | surface-raised | 5.94 | 3.0 | ui | PASS | node border tint |
| type-brick | surface-canvas | 6.49 | 3.0 | ui | PASS | marker on canvas |
| type-gateway | type-gateway-dim | 7.55 | 4.5 | text | PASS | type chip text on dim fill |
| type-stage | type-stage-dim | 5.81 | 4.5 | text | PASS | type chip text on dim fill |
| type-store | type-store-dim | 8.16 | 4.5 | text | PASS | type chip text on dim fill |
| type-brick | type-brick-dim | 5.69 | 4.5 | text | PASS | type chip text on dim fill |
| **danger** | **danger-dim** | **4.23** | 4.5 | text | **FAIL** | **error badge glyph+count** |
| warning | warning-dim | 5.50 | 4.5 | text | PASS | warning badge text |
| info | info-dim | 5.22 | 4.5 | text | PASS | info badge text |
| success | success-dim | 5.89 | 4.5 | text | PASS | sync-ok chip text |
| danger | surface | 4.59 | 3.0 | ui | PASS | status dot |
| warning | surface | 6.83 | 3.0 | ui | PASS | status dot |
| info | surface | 5.91 | 3.0 | ui | PASS | status dot |
| success | surface | 6.67 | 3.0 | ui | PASS | status dot |
| syntax-key | background | 8.24 | 4.5 | text | PASS | YAML key |
| syntax-value | background | 10.30 | 4.5 | text | PASS | YAML value |
| syntax-number | background | 7.67 | 4.5 | text | PASS | YAML number |
| **syntax-punctuation** | **background** | **3.01** | 4.5 | text | **FAIL** | **YAML `:` `-` structural punctuation** |
| accent | surface-canvas | 5.60 | 3.0 | ui | PASS | selection ring on canvas |
| accent | surface-raised | 5.13 | 3.0 | ui | PASS | selection ring / glow on node |
| danger | surface-raised | 4.43 | 3.0 | ui | PASS | error border on node |
| connection | surface-canvas | 3.28 | 3.0 | ui | PASS | connection stroke |
| **border-node** | **surface-raised** | **1.36** | 3.0 | ui | **FAIL** | node sketch border (tonal by design) |
| **border-node** | **surface-canvas** | **1.49** | 3.0 | ui | **FAIL** | module-symbol boundary vs canvas |
| **border-pin** | **surface-raised** | **1.61** | 3.0 | ui | **FAIL** | interface-pin border (tonal by design) |
| **border** | **surface** | **1.18** | 3.0 | ui | **FAIL** | hairline (intentionally vanished) |
| **border** | **background** | **1.28** | 3.0 | ui | **FAIL** | hairline (intentionally vanished) |

**Reading the failures:** the `foreground-dim` and `border*` rows are *declared* decorative/tonal by the
spine and are compliant by that contract (flagged Low, with the module-symbol boundary caveat). The
**load-bearing AA misses the floor never fenced** are `danger`/`danger-dim` (4.23), `accent`/`accent-dim`
(4.18), and `syntax-punctuation`/`background` (3.01) — plus `accent-strong` (3.61) if used for text. Every
declared-floor combination passes.
