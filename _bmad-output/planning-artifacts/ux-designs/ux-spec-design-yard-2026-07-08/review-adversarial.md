---
title: Adversarial Review — DESIGN.md + EXPERIENCE.md spines
reviewer: cynical adversarial reviewer
date: 2026-07-09
targets:
  - ./DESIGN.md
  - ./EXPERIENCE.md
---

# Adversarial Review — Spec-Yard UX Spines

**Overall assessment.** These spines are well-written prose sitting on top of an engine that cannot do
several of the things they promise: the two headline gestures — **double-click to descend** and
**boundary pins at the canvas edge** — fight Excalidraw's own double-click-to-edit and its
infinite-canvas coordinate model, and the whole line-jump/syntax-highlight editor story assumes a code
editor the app does not have (it is a bare `<textarea>`). The "lean default = exactly three things"
banner is contradicted three lines later by the doc's own always-present furniture and by **four
differently-meaning dot/badge status indicators** shipping at rest — the exact chrome accretion this
product exists to kill. Most of the visual/token discipline is genuinely strong (the type-vs-severity
color fences are careful and correct); the danger is concentrated in the behavior spine writing physics
the canvas engine can't honor, which is itself a "lying UI" the PRD forbids.

Legend: **[critical]** ships broken or blocks a builder · **[high]** a builder will guess wrong or hit a
wall · **[medium]** real hole, fixable with a sentence or two · **[low]** tighten before contract.

---

## 1 — Feasibility against the actual Excalidraw 0.18 codebase

### [critical] Double-click descend collides head-on with Excalidraw's native double-click (EXPERIENCE §Component Patterns "Work = descend"; §Interaction Primitives keyboard map "double-click (module) → Descend")
In Excalidraw 0.18, double-clicking a shape enters **bound-text editing** (and double-clicking empty
canvas creates a text element). Verified in `excalidraw-canvas.tsx`: the canvas passes only `onChange`
(line 709) and `theme="dark"` (line 691) — there is **no double-click interception**, so Excalidraw's
default is fully in force, and the current build's "rename on canvas" is that same double-click-to-edit.
The spine binds double-click to descend, which means (a) descending a module also tries to edit its label
text, and (b) double-click now means "rename" on component nodes but "descend" on module nodes — two
conflicting meanings for one gesture, both fighting the engine. **Downstream:** the primary "work" gesture
is unimplementable without hacking Excalidraw's pointer pipeline, and rename-by-double-click silently
breaks on modules. **Fix:** pick a descend trigger the engine leaves alone (a corner "enter" control, or
`⌘·`/`Enter`-on-selected-module), and state explicitly that double-click text-edit is suppressed on module
symbols; define the module-rename gesture separately.

### [critical] Descend-as-scene-swap has no coordinate/data model (EXPERIENCE §Component Patterns "Work = descend"; §Inspiration pillar 1; DESIGN §Components "Boundary pin")
Descend is specified as a scene-swap — "the canvas **becomes** the module's internals" — distinct from
FR10 expand-in-place. But the current compiler does a **single flat compile** of the whole spec into one
scene (auto-layout layered BFS), and the spine also insists "structural data **and coordinates** live in
the spec" (EXPERIENCE §Foundation). A component has **one** coordinate in the spec, yet it must appear at
one position in the full-system view and a **different** position in the descended module-internal view
(boundary pins at the edges force a different layout). Nowhere is it said where the module-internal-view
positions live. **Downstream:** a builder cannot compile the subscene deterministically (NFR2) without
inventing a second coordinate space, and if they put it in the spec they reintroduce exactly the PR-diff
pollution OQ4 was resolved to avoid. **Fix:** state that descended-view layout is derived/auto-laid-out
(not stored) or that per-scope positions live in the project-folder config, and specify subscene
extraction + synthetic boundary-pin generation as an explicit build dependency.

### [high] Boundary pins "docked to the canvas edge" fight the infinite canvas (DESIGN §Components "Boundary pin"; EXPERIENCE §Component Patterns; §View switcher)
Excalidraw is an infinite pan/zoom surface — there is **no fixed "canvas edge" in scene space**; the
visible edge moves on every pan/zoom. An element pinned "at the edge" as a real Excalidraw element scrolls
away when you pan; as a screen-fixed DOM overlay it **cannot be the endpoint of a native Excalidraw
arrow** (arrows bind to scene-space elements). So "connections from outside enter via boundary pins at the
edge" is physics the engine does not offer. **Downstream:** either boundary pins jitter/scroll wrongly, or
the connections into them can't be drawn as real arrows — both read as broken. **Fix:** decide the pin
model explicitly — scene-space pins placed at the subscene's computed bounding box (they pan with content)
vs. an overlay "gutter" with non-Excalidraw connector rendering — and write it into the spine rather than
implying edge-docking the engine can't hold.

### [high] Line-jump, line-highlight, syntax coloring, and line numbers require replacing the textarea — an unflagged major dependency (DESIGN §Components "Editor"; EXPERIENCE §Editor leash-follow + line-jump; §Interaction Primitives)
The editor is a plain `<textarea id="spec-textarea">` (`editor-panel.tsx:136`) with **no line numbers**
(grep: none) and no per-line styling. The DESIGN editor token promises line numbers, `syntax-*` YAML
coloring, and an `accent-dim` **line-highlight** when the canvas jumps the cursor; EXPERIENCE makes
bidirectional line-jump an MVP, "named critical." A `<textarea>` **cannot** render line-highlight
backgrounds, syntax colors, or a gutter — every one of these needs CodeMirror/Monaco. **Downstream:** the
single most-promised interaction (spec-line ↔ diagram-element) and the entire editor visual spec silently
depend on ripping out and replacing the editor, which no artifact flags as scope. **Fix:** name the code-
editor swap as an explicit MVP dependency (or descope syntax/line-highlight to what a textarea overlay can
fake), so the estimate isn't a surprise.

### [medium] theme="dark" color-inversion shifts the literal type-hue hexes (DESIGN §Colors "Type hues"; memlog 2026-07-09 line 39; extract-current-ui §4)
The canvas is hard-pinned `theme="dark"` and the memlog decision says "keep the existing Excalidraw
dark-inversion approach." But DESIGN specifies **exact final hexes** for the type hues (Gateway
`#2dd4bf`, etc.). If Excalidraw's dark theme applies its inversion to node strokes, authoring those hexes
produces **different on-screen colors** than the DESIGN swatches. **Downstream:** the carefully-fenced
type palette renders wrong, or the fences (Store-off-selection-blue, Gateway-off-warning-amber) silently
break. **Fix:** state whether the DESIGN hues are pre- or post-inversion values, and if the inversion is
kept, provide the authored (pre-inversion) source hexes for canvas elements.

### [medium] Peek trigger needs manual hit-testing Excalidraw doesn't expose (EXPERIENCE §Component Patterns "Glance = peek")
"Hover-pause opens a peek card" and "Space (with a module selected)" both require knowing the pointer is
over a specific module element. Excalidraw exposes no per-element hover/`onElementHover` API; you must
hit-test the pointer against scene elements yourself on every mousemove and convert scene→screen coords
(via appState scroll/zoom) to place the card. Feasible but non-trivial, and the pause duration is
unspecified (see L2). **Fix:** note the manual hit-test + coord-conversion as a build task and give the
hover-pause a concrete threshold (e.g. 500 ms).

---

## 2 — Lean-principle violations ("see only what you need")

### [high] "Lean default = exactly three things" is false by the doc's own inventory, and four status indicators ship at rest (EXPERIENCE §Information Architecture line 45 + IA table; DESIGN §Components)
The banner says the lean default is "**exactly three things**: editor, canvas, collapsed diagnostics
strip. Everything else is summoned." The same IA table then marks **Status bar** = Visible, **Breadcrumb**
= "Always present in canvas"; DESIGN adds an always-rendered **sync-health chip** ("silent when honest" but
still on screen) and a **canvas toolbar** hosting the view switcher. Worse for an anti-overwhelm product:
the rest state carries **four differently-meaning dot/badge signifiers** — (1) status-bar **dirty dot**
(buffer vs disk), (2) corner **sync-health chip** (diagram drift), (3) **diagnostics-strip dot** (lint
status), (4) per-module **diagnostic badge** (worst rolled-up severity). A first-timer sees four small
colored blobs meaning four unrelated things. **Downstream:** the "lean" contract is unbuildable as a
literal three-surface spec, and the product reaccretes the very orientation-less chrome it was chartered
to remove. **Fix:** replace "exactly three things" with an honest tally ("two primary panes + a diagnostics
strip + persistent status/nav furniture"), and consolidate/differentiate the four status signifiers so
they're not four look-alike dots.

### [medium] Four overlapping affordances to inspect one module symbol (EXPERIENCE §Component Patterns; §Detail drawer; keyboard map)
One module symbol answers to: single-click → select + **open detail drawer** (interface/members),
`Space` → **peek card** (internals, read-only), double-click → **descend**, and a corner control →
**expand-in-place**. Three of these reveal overlapping "module internals/interface" views. That is a lot of
doors on one box for a lean product, and it's undiscoverable (see M-discovery). **Fix:** justify or thin
the set — e.g. drawer = interface editing only, peek = internals glance, descend = work; make sure the
three don't read as redundant.

### [medium] First-timer discovery gap: every capability is summoned, nothing teaches the summons (EXPERIENCE §Information Architecture; §State Patterns "Onboarding"; §Command palette)
"Everything else is summoned" via `⌘P`, `Space`, double-click, an edge flyout, `⌘J`, a rail toggle — none
visible at rest. The described onboarding tour (State Patterns) teaches "the core loop — spec ↔ canvas ↔
lint ↔ simulate," **not** the gesture vocabulary or how to summon surfaces. A novice who dismisses the tour
is stranded with editor + canvas + dots and no path to peek/descend/command-palette. **Fix:** make the
onboarding explicitly teach the gesture/summon vocabulary, or add resting affordance hints; specify the
library-palette edge-flyout **open trigger** (the empty state calls it "prominent" while IA calls it
"closed edge flyout" — reconcile).

---

## 3 — PRD conflicts (silent deviations from FR1–FR17 / glossary)

### [high] Grid is simultaneously "a canvas view," a quick-fix host, and absent from the view-switcher enumeration (EXPERIENCE §IA table "Canvas" row; §Quick-fix; §View switcher; PRD FR9/FR11)
The IA says "the 'Grid' alt is a canvas **view** in the switcher," and §Quick-fix routes fixes to "the
diagnostics strip, the detail drawer, and **the Grid view**." But the view switcher is enumerated
everywhere as **Static / Simulation / Aspects** (+ grayed Sequence/Pipeline/State) — **Grid is not in the
list**. A builder cannot place the Grid, nor the FR9 quick-fix button that's supposed to live in it.
**Downstream:** FR9's quick-fix surface and FR11's "Grid reflects module membership" are unlocatable.
**Fix:** either add Grid to the enumerated switcher entries or delete the stale "Grid view" quick-fix
reference and re-home that quick-fix surface.

### [high] FR11 Tree view is folded into the breadcrumb, losing the whole-hierarchy view with no replacement (EXPERIENCE §IA "Summoned-surface mapping"; PRD FR11; UJ3)
FR11 requires Tree/Grid/Focus to "reflect module membership (module nodes in the tree...)." The spine maps
**Tree → breadcrumb**, but a breadcrumb shows only the **current path** (system → module → submodule), not
the full tree of modules and members. No surface in the IA lists the whole hierarchy (the file rail lists
*files*, not modules). **Downstream:** UJ3's newcomer, whose whole job is "start at the collapsed top level
and dive progressively," loses the at-a-glance structural map FR11 guaranteed. This deviation is presented
as a lossless "fold" but is a capability cut. **Fix:** acknowledge the regression and either restore a
hierarchy affordance (e.g. a tree in the file rail / command-palette navigator) or justify that canvas
navigation replaces it.

### [medium] Detail-drawer field list drops sim-critical component metadata (EXPERIENCE §Detail drawer; PRD §6 glossary / extract §3)
The drawer's component form is enumerated as "id, name, type, owner, status, description, latency,
throughput, connections." The PRD's canonical component metadata also includes `rate_limit`, `buffer`,
`throttled` (and `color`) — the fields the **simulator** consumes, editable today in the Focus tab. If the
drawer replaces Focus with only the listed fields, there is **no editor for simulation parameters**.
**Downstream:** the simulator (a headline MVP capability) loses its input surface. **Fix:** add the sim
params to the drawer's component form (or state explicitly where they're edited).

### [medium] Glossary "mirrored verbatim" drops the load-bearing encapsulation clarifier; descend depth limit never stated (EXPERIENCE §header glossary line 16–18; PRD §6 / FR8; §Inspiration)
The spine lists "Module / submodule" as a bare term and claims the glossary is "mirrored verbatim," but
omits the PRD's pinned reading: "the two encapsulation boundaries... **the system root and leaf components
are not encapsulation boundaries**." The PRD explicitly flagged this counting scheme as a
terminology-drift risk. Relatedly, no behavioral rule states that **descend bottoms out at submodule** (two
levels) — a builder could allow arbitrary nesting. **Fix:** carry the clarifier verbatim and state the
descend/nesting depth cap (system → module → submodule; components are not descendable).

### [medium] `⌘,` "opens settings" but no settings surface exists in the IA (EXPERIENCE §Command palette; §Interaction Primitives; PRD FR12)
The keyboard map binds `⌘,` to "settings," yet the IA table has **no Settings surface**, and FR12 removed
the dead Settings button as lying UI. A shortcut that opens a panel that isn't designed is itself a lying
affordance. **Fix:** either define the settings surface (what it contains — view-state lives in config, so
what's left?) or drop the `⌘,` binding.

### [low] FR7 non-image artifact export not re-homed (EXPERIENCE §Export; PRD FR7)
The spine specifies `<project>/exports/` for PNG/SVG but never says where the current build's
**simulation reports / history JSON-CSV exports** (FR7) now save. **Fix:** one line homing sim reports
(e.g. `<project>/reports/`), or fold them into the export section.

*Preserved correctly (noted for the record):* FR9 retarget-default + index-safe fix-all is exact; the
four component types and their hue fences are clean; FR10-override → OQ4 config is properly disclosed;
FR3 save semantics, FR15 empty state, FR13 onboarding location, and FR16 and/or are all coherently
resolved.

---

## 4 — Gesture collisions & internal contradictions

### [high] `Space` (peek) and `⇧1` (fit) collide with text entry in the editor; no suppression rule (EXPERIENCE §Interaction Primitives keyboard map + "Undo/redo semantics")
`selectedUnit` is shared across both panes (extract §2), so a module can be "selected" while the user's
cursor is in the YAML `<textarea>`. `Space` = peek and `⇧1` = fit-to-screen are **bare/shift keys that are
literal characters in text**. The spine only says undo/redo shortcuts are "suppressed inside inputs except
the spec editor" — it never says what happens to `Space`/`⇧1` while typing. Taken literally, pressing space
in the editor peeks (or typing `!` fits the diagram). **Downstream:** either the editor eats these
shortcuts (peek/fit become unreachable while editing) or typing triggers them (broken text entry).
**Fix:** state the rule explicitly — global bare/shift shortcuts are inert while focus is in the editor;
`Space`-peek/`⇧1`-fit require canvas focus.

### [low] Esc precedence is an ambiguous list, not an order (EXPERIENCE §Interaction Primitives "Esc"; §Component Patterns)
`Esc` = "Dismiss peek · ascend one level · close palette/popover." With a popover open **and** a peek open
**and** descended, one `Esc` must do one thing; the list order (ascend in the middle) doesn't encode
topmost-first. **Fix:** state "Esc closes the topmost transient overlay first (popover → palette → peek),
and only ascends when no overlay is open."

---

## 5 — Unworkable interactions / missing precedence

### [medium] No precedence when conflict prompt + data-loss toast + drift chip fire together (EXPERIENCE §Sync-health chip; §Conflict prompt; §State Patterns) — and this is the *common* case
The spine itself says agent-edits-while-open is "the common case." That single event plausibly triggers,
at once: the modal **conflict prompt** (external edit), a **data-loss toast** (unmapped canvas content that
would vanish on reload), and a **stateful sync-health chip** (drift). Three attention-grabbers, no stacking
or precedence rule. **Downstream:** the interruptive layer stacks unpredictably on the product's most
frequent event. **Fix:** define precedence — the conflict prompt is modal and wins; drift/loss surfaces
suppress or queue behind it and re-evaluate after the user's reload/keep choice.

### [medium] Peek open (or descended) when the file changes on disk, or when a quick-fix deletes the scope you stand in (EXPERIENCE §Component Patterns; §Quick-fix; §State Patterns)
Undefined behaviors: (a) peek card open when a reload replaces the buffer and the peeked module no longer
exists; (b) you're **descended** into module A and a fix-all (or reload) **deletes/renames** A — the
canvas is now "standing in" a scope that doesn't exist. The reconciler already has `rename-id` as a change
type, so renames change ids, **orphaning the per-module view-state keys** stored in config. **Downstream:**
stale peek/descend context, orphaned collapsed/expanded state, no auto-ascend. **Fix:** specify "if the
current scope is deleted or its id changes, auto-ascend to the nearest surviving ancestor and re-key or
drop its view state"; dismiss/refresh the peek card on reload.

### [medium] Drawer docked-right at 1024px with the file rail open exceeds the minimums; "graceful degradation" names no hide-order (DESIGN §Layout; EXPERIENCE §Detail drawer; §Responsive)
Editor (≥280) + canvas (≥280) + docked-right inspector (~280) + file rail — plus split handles — cannot
coexist at 1024px. The spine's only answer is "narrow windows degrade gracefully; chrome may hide," with no
hide-order. **Downstream:** a builder guesses which of four regions collapses first. **Fix:** state the
degradation order (e.g. file rail auto-collapses first, then docked drawer reverts to under-editor) and the
width thresholds.

### [low] Simulation running + external reload leaves a stale sim graph mid-run (EXPERIENCE §State Patterns "Simulation running"; §Conflict prompt)
Sim runs on the buffer; a reload swaps the buffer under a live playback. No rule says whether the sim
stops, restarts, or continues on the old graph. **Fix:** one line — reload halts any running simulation and
requires re-run.

---

## 6 — State/edge holes on the Key Flows

### [high] Line-jump into a collapsed/undescended module has no defined behavior, yet "works across scopes" is promised (EXPERIENCE §Editor leash-follow + line-jump; §Key Flows)
"Place the cursor on a YAML line → the canvas highlights and centers the corresponding element... works
across scopes (descended or not)." But a component inside a **collapsed module symbol** (or inside a
*different* module than the one you're descended in) is **not rendered** — there is no element to center.
Does the canvas auto-expand/descend to reveal it, ascend, or highlight the sealed symbol as a proxy?
Undefined. **Downstream:** the "named critical," MVP line-jump breaks precisely where the hierarchy it's
supposed to traverse gets in the way. **Fix:** specify the cross-scope target rule (auto-navigate to the
scope containing the line and center there, or highlight the enclosing symbol when the target is sealed).

### [medium] Undo across a descend boundary operates on invisible context (EXPERIENCE §Interaction Primitives "Undo/redo"; §Component Patterns)
Descend/ascend is **view state** (config), so undo (which acts on the spec/buffer) won't restore scope.
Edit inside module A, ascend, then undo → you reverse an edit to an element you can no longer see, at the
top level, with no visual feedback. **Fix:** state that undo does not restore scope but auto-navigates to
the scope of the reverted change (or explicitly accept the blind-undo and say so).

---

## 7 — Ambiguity a builder can't implement from

### [medium] The "Aspects" view is MVP-designed but has no defined content or layout (EXPERIENCE §View switcher; §Scope & Trajectory "MVP-designed")
"Aspects (free-text prose as a legitimate representation)" is listed as a **live MVP** view alongside
Static/Simulation. But nothing says what it renders — prose from which field? The per-component
`description`? A system-level narrative? What's the layout when "the diagram" is text? A builder cannot
build a view from "prose as a legitimate representation." **Fix:** define the Aspects content source and
layout, or move it to DIRECTIONAL with the other future renderers.

### [low] Unquantified rules: hover-pause duration, sync-health cadence, edge-flyout trigger, `[DELEGATED]` on decided items
`Space`/hover-pause peek has no pause threshold; "silent check when honest" sync-health has no cadence
(on every write? debounced?); the library-palette edge flyout's open trigger is vague ("canvas edge");
and several load-bearing *resolved* decisions (save semantics, view-state location, empty state) are tagged
`[DELEGATED]`, which reads like "still open" on a contract doc. **Fix:** give numbers where behavior needs
them, and relabel resolved `[DELEGATED]` items as decided-by-facilitator so a builder treats them as
binding.
