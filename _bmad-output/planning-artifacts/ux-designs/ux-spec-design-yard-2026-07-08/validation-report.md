# Validation Report — spec-design-yard

- **DESIGN.md:** `/Users/tomerhamam/personal/repos/spec-design-yard/_bmad-output/planning-artifacts/ux-designs/ux-spec-design-yard-2026-07-08/DESIGN.md`
- **EXPERIENCE.md:** `/Users/tomerhamam/personal/repos/spec-design-yard/_bmad-output/planning-artifacts/ux-designs/ux-spec-design-yard-2026-07-08/EXPERIENCE.md`
- **Run at:** 2026-07-09 (ISO)

## Overall verdict

A strong, source-extractable contract. Token discipline is near-flawless — all 39 color tokens carry 6-digit hex, every one of the 108 `{path.to.token}` references across both files resolves, all 21 components are both defined and referenced with zero orphans, and DESIGN.md holds canonical section order. A downstream consumer can extract cleanly. The gaps the rubric found are edge/requirement-level, not structural: FR5 (localStorage→file migration) has no home anywhere, two components (`button-primary`, `quick-fix-button`) carry frontmatter tokens but lack a DESIGN.md visual-anatomy row, and Flow 2's CI-lint-gate *failure* branch — the gate's whole reason to exist — is unspecified. None are blocking.

The two independent reviewers shift that picture materially, and they converge on the same surface. The adversarial reviewer found the behavior spine writing physics the Excalidraw 0.18 engine cannot honor: the headline "work" gesture (double-click to descend) collides head-on with Excalidraw's native double-click-to-edit, descend-as-scene-swap has no coordinate/data model, boundary pins fight the infinite canvas, and the entire line-jump/syntax-highlight editor story silently depends on ripping out and replacing a bare `<textarea>` — two implementability criticals plus seven highs the rubric's structural pass could not see. The accessibility auditor, from the opposite side, found that same canvas has no committed keyboard navigation and no screen-reader / accessible-equivalent position, so the core tiered-navigation loop (peek / descend / expand) is unreachable without a mouse. Both critical pairs land on one object: the canvas descend model is unbuildable as written — engine-infeasible by mouse *and* unreachable by keyboard at once. Contrast is clean on every declared-floor pair, but three unfenced load-bearing pairs (`danger`/`danger-dim` 4.23, `accent`/`accent-dim` 4.18, `syntax-punctuation`/`background` 3.01) miss WCAG AA by a hair.

## Category verdicts

- **Flow coverage** — adequate. All three PRD journeys have named Key Flows with Climax beats; gaps are requirement-level (FR5 migration, Flow 2 failure branch), not structural.
- **Token completeness** — strong. 39 colors all carry hex, all 108 references resolve, contrast floor stated for load-bearing combos; the `{spacing.1}`–`{spacing.8}` "misses" are YAML string-forced keys that flatten correctly.
- **Component coverage** — adequate. 19 of 21 components have a real visual-anatomy row + behavioral rule; two lack the prose row, and Metrics/Aspects/Layers get only an IA one-liner.
- **State coverage** — strong. Empty, cold-load, error, conflict, read-only, sim-running, onboarding all present; only the palette "no-match"/library-empty states are missing.
- **Visual reference coverage** — strong. All direction boards + wireframes linked with what each illustrates; reject and extracts correctly unlinked; no orphans.
- **Bloat & overspecification** — strong. Editorial voice is spec-appropriate; only the "four undefined tokens" motif over-repeats.
- **Inheritance discipline** — strong. `sources`/`design_ref` resolve, UJ names verbatim, glossary mirrors the PRD, component names identical — but see the adversarial dispute of "glossary mirrored verbatim."
- **Shape fit** — strong. Canonical section order exact; all required + required-when-applicable sections present; invented sections earn their place.
- **Adversarial review** — the prose promises canvas physics the Excalidraw engine can't deliver (double-click descend, edge-docked boundary pins, a code-editor that's actually a `<textarea>`) and violates its own "lean" charter with four look-alike status dots at rest: 2 critical / 7 high / 12 medium / 4 low.
- **Accessibility review** — strong where it legislates (color-never-sole-carrier, reduced-motion, declared floor all pass), but the canvas has no keyboard model and no screen-reader/editor-equivalent commitment, leaving the core navigation loop mouse-only: 2 critical / 6 high / 9 medium / 5 low.

## Findings by severity

Severity labels are preserved exactly as the reviewers assigned them. Deduped findings keep the higher severity and name both sources.

### Critical (4)

**[Adversarial]** — Double-click descend collides head-on with Excalidraw's native double-click (EXPERIENCE §Component Patterns "Work = descend"; §Interaction Primitives)
Excalidraw 0.18 double-click enters bound-text editing; the canvas passes no double-click interception (`excalidraw-canvas.tsx:709/691`), so descend also edits the label and double-click means "rename" on components but "descend" on modules — two meanings for one gesture, both fighting the engine. The primary "work" gesture is unimplementable without hacking the pointer pipeline. *(Cross-link: converges with the accessibility criticals below — same descend model, engine-broken by mouse.)*
Fix: pick a descend trigger the engine leaves alone (corner "enter" control, or `⌘·`/`Enter`-on-selected-module), suppress double-click text-edit on module symbols, and define module-rename separately.

**[Adversarial]** — Descend-as-scene-swap has no coordinate/data model (EXPERIENCE §Component Patterns; §Foundation; DESIGN §Components "Boundary pin")
The compiler does one flat compile; a component has a single coordinate in the spec yet must sit at one position in the full-system view and a different one in the descended module-internal view, and nowhere is it said where the module-internal positions live. A builder can't compile the subscene deterministically (NFR2) without inventing a second coordinate space; storing it in the spec reintroduces the PR-diff pollution OQ4 resolved to avoid.
Fix: state that descended-view layout is derived/auto-laid-out (or per-scope positions live in project-folder config); specify subscene extraction + synthetic boundary-pin generation as an explicit build dependency.

**[Accessibility]** — Canvas has no committed keyboard navigation (EXPERIENCE §Component Patterns / Interaction Primitives)
Every canvas gesture is mouse-defined; the keyboard map binds only `Esc` and `Space` (peek an already-selected module) — nothing selects/moves between nodes, nothing descends. The entire tiered-navigation model (the core of the product) is unreachable without a mouse; Excalidraw's own object-traversal keyboard support is limited, so it can't be assumed. *(Cross-link: converges with the adversarial double-click critical — same object.)*
Fix: add a canvas keyboard model (`Tab`/arrows move a focus ring; `Enter` descends, `Space` peeks, `Esc` ascends; "Go to node…" palette command), or state the punt and route keyboard users to editor + "Go to node."

**[Accessibility]** — No screen-reader / accessible-equivalent position for the canvas (DESIGN §Components; EXPERIENCE §Foundation, Accessibility Floor)
No `aria-label` on the canvas, no roles/labels for nodes/chips/badges/pins, and no stated position that the YAML editor is the accessible textual equivalent — the one place the product is unusually well-positioned, yet absent, so it won't be built or QA'd.
Fix: state in the Accessibility Floor that the editor is the screen-reader-accessible equivalent carrying the full contract; `aria-label` the canvas; add live-region announcements for diagnostics count, sync-health, save/dirty, and simulation start/stop.

### High (13)

**[Adversarial]** — Boundary pins "docked to the canvas edge" fight the infinite canvas (DESIGN §Components "Boundary pin"; EXPERIENCE §Component Patterns / §View switcher)
No fixed "canvas edge" in scene space; a real element pinned at the edge scrolls away on pan, and a screen-fixed DOM overlay can't be the endpoint of a native Excalidraw arrow.
Fix: decide the pin model — scene-space pins at the subscene's bounding box vs. an overlay gutter with non-Excalidraw connectors — and write it in.

**[Adversarial]** — Line-jump, line-highlight, syntax coloring, and line numbers require replacing the textarea — an unflagged major dependency (DESIGN §Components "Editor"; EXPERIENCE §Editor / §Interaction Primitives)
The editor is a plain `<textarea id="spec-textarea">` (`editor-panel.tsx:136`); it cannot render line-highlight, syntax colors, or a gutter — every one needs CodeMirror/Monaco. The single most-promised interaction silently depends on swapping the editor, which no artifact flags as scope.
Fix: name the code-editor swap as an explicit MVP dependency, or descope syntax/line-highlight to what a textarea overlay can fake.

**[Adversarial]** — "Lean default = exactly three things" is false by the doc's own inventory, and four status indicators ship at rest (EXPERIENCE §IA line 45 + table; DESIGN §Components)
The banner says three things, but the IA marks Status bar Visible and Breadcrumb always-present, DESIGN adds a sync-health chip and canvas toolbar, and the rest state carries four differently-meaning dot/badge signifiers (dirty dot, sync-health chip, diagnostics-strip dot, per-module diagnostic badge) — the product reaccretes the chrome it was chartered to remove. *(Cross-link: same color-as-sole-carrier problem as the accessibility node-state stack.)*
Fix: replace "exactly three things" with an honest tally, and consolidate/differentiate the four look-alike dots.

**[Adversarial]** — Grid is simultaneously "a canvas view," a quick-fix host, and absent from the view-switcher enumeration (EXPERIENCE §IA table; §Quick-fix; §View switcher; PRD FR9/FR11)
Grid is called a switcher view and a quick-fix host, but the switcher is enumerated Static/Simulation/Aspects (+ grayed Sequence/Pipeline/State) — Grid isn't listed. FR9's quick-fix surface and FR11's "Grid reflects membership" are unlocatable.
Fix: add Grid to the enumerated entries, or delete the stale "Grid view" quick-fix reference and re-home that surface.

**[Adversarial]** — FR11 Tree view is folded into the breadcrumb, losing the whole-hierarchy view with no replacement (EXPERIENCE §IA "Summoned-surface mapping"; PRD FR11; UJ3)
A breadcrumb shows only the current path, not the full tree; no surface lists the whole hierarchy. UJ3's newcomer loses the at-a-glance structural map FR11 guaranteed — presented as a lossless "fold" but a capability cut.
Fix: acknowledge the regression and restore a hierarchy affordance (tree in file rail / palette navigator), or justify canvas navigation as the replacement.

**[Adversarial]** — `Space` (peek) and `⇧1` (fit) collide with text entry in the editor; no suppression rule (EXPERIENCE §Interaction Primitives) — **deduped, keeps higher severity**
`selectedUnit` is shared across panes, so a module can be selected while the cursor is in the YAML `<textarea>`; `Space`/`⇧1` are literal characters in text, and the spine only suppresses undo/redo inside inputs. Taken literally, pressing space peeks or typing `!` fits. **Sources: Adversarial [high] + Accessibility [medium] ("`Space`-to-peek collides with canvas pan / focused-button activation") — same root cause, no focus-arbitration rule for `Space`; kept at high.**
Fix: global bare/shift shortcuts are inert while focus is in the editor; `Space`-peek/`⇧1`-fit require canvas focus.

**[Adversarial]** — Line-jump into a collapsed/undescended module has no defined behavior, yet "works across scopes" is promised (EXPERIENCE §Editor line-jump; §Key Flows)
A component inside a collapsed module symbol (or a different module than the one you're descended in) is not rendered — no element to center. Undefined whether the canvas auto-expands, ascends, or highlights the sealed symbol. The "named critical" MVP line-jump breaks where the hierarchy gets in the way.
Fix: specify the cross-scope target rule (auto-navigate to the scope containing the line, or highlight the enclosing symbol when the target is sealed).

**[Accessibility]** — Descend has no keyboard binding — hierarchy navigation is one-way (EXPERIENCE §Interaction Primitives)
`Esc` ascends but the only descend gesture is double-click; a keyboard user can climb out but never in — the VHDL descend/ascend pillar is half-reachable. *(Cross-link: subset of the canvas-keyboard critical; and adversarial shows double-click descend is engine-broken even for mouse.)*
Fix: bind descend to `Enter` on a focused/selected module + a "Descend into module" palette command; mirror `Esc`↔descend in the map.

**[Accessibility]** — "Keyboard entry to everything" is claimed but not backed by a command inventory (EXPERIENCE §IA table, Command palette)
No inventory is committed, and the spatial/canvas operations a mouse user performs are nowhere enumerated as commands — an "everything" claim with no backing list is a lying-UI risk against the spine's own "zero lying UI" rule. *(Cross-link: same summon vocabulary as the adversarial first-timer discovery gap.)*
Fix: add a Command Inventory listing every mouse-reachable action as a palette command (especially canvas-spatial ones), or narrow the claim.

**[Accessibility]** — Conflict prompt (data-loss modal) has no stated focus management (EXPERIENCE §Conflict prompt, State Patterns)
The common-case modal, where one choice overwrites disk and the other discards the buffer (irreversible either way), states nothing about focus trap, initial focus, destructive-button distinction, or `Esc` (here `Esc` is dangerous) — a keyboard user could destroy work with the wrong key. *(Cross-link: adversarial flags the same event has no precedence when modal + toast + drift chip fire together.)*
Fix: modal traps focus, initial focus on the non-destructive choice, buttons keyboard-operable and labeled distinctly (not color-only), `Esc` cancels to the safe state, focus restores to the editor.

**[Accessibility]** — Toasts — including the data-loss warning — not committed to a live region or keyboard-reachable action (DESIGN §Toast; EXPERIENCE §Sync-health chip)
The data-loss toast is a genuine loss warning and export toasts carry an action; nothing states `aria-live`, focus behavior, or that the action link is keyboard-focusable — a screen-reader/keyboard user silently misses the warning and can't reach "Undo/open."
Fix: render loss warnings in `aria-live="assertive"` (polite for completions), don't steal focus, keep action + dismiss keyboard-reachable, and mirror the warning as a diagnostics/sync entry so it survives timeout.

**[Accessibility]** — Selection ring, error border, and simulation glow stack on one node, distinguished by color/glow alone (DESIGN §Component node; EXPERIENCE §Canvas display elements)
A node can be selected (accent ring), erroring (danger border), and on a sim path (accent glow) at once; ring and glow are the same hue, and error vs the others is a pure color swap — reintroduces color-as-sole-carrier for node state. *(Cross-link: same problem as the adversarial "four look-alike dots.")*
Fix: differentiate by more than color (solid ring + handles, dashed danger border + error glyph, pulsing glow + "live" readout) and define the stacking order.

**[Accessibility]** — Load-bearing token pairs the contrast floor never fenced miss WCAG AA (DESIGN §Colors "Contrast floor")
Three undeclared load-bearing pairs fail: `danger`/`danger-dim` = 4.23 (error badge — the single most important severity has the only failing badge), `accent`/`accent-dim` = 4.18 (the open file's name in the file rail — which file you're editing), `syntax-punctuation`/`background` = 3.01 (YAML structural punctuation). *(Cross-link: rubric flagged `button-primary` as similarly unfenced, but the auditor computed `btn-primary-fg`/`accent` = 5.70 PASS — that one clears; these three don't.)*
Fix: brighten `danger` (~`#ef6d70`) or darken `danger-dim`; use `foreground` (not `accent`) for the active filename + an accent marker; raise `syntax-punctuation` (~`#7a7972`+) or declare it decorative; add all three to the floor list.

### Medium (22)

*Grouped by theme; each finding named on one line with its fix.*

**Canvas/engine feasibility (2)**
- **[Adversarial]** `theme="dark"` color-inversion shifts the literal type-hue hexes (DESIGN §Colors) — Fix: state whether hues are pre- or post-inversion; provide authored pre-inversion source hexes.
- **[Adversarial]** Peek trigger needs manual hit-testing Excalidraw doesn't expose (EXPERIENCE §Component Patterns "Glance = peek") — Fix: note the manual hit-test + scene→screen coord conversion as a build task; give hover-pause a concrete threshold (e.g. 500 ms).

**Lean-principle / discoverability (2)**
- **[Adversarial]** Four overlapping affordances to inspect one module symbol (single-click drawer, `Space` peek, double-click descend, corner expand) (EXPERIENCE §Component Patterns) — Fix: justify or thin the set so the three internals views don't read as redundant.
- **[Adversarial]** First-timer discovery gap: every capability is summoned, nothing teaches the summons (EXPERIENCE §IA; §State Patterns "Onboarding") — Fix: make onboarding teach the gesture/summon vocabulary or add resting hints; reconcile the library-flyout open trigger. *(Cross-link: accessibility AX "keyboard entry to everything" is the same vocabulary with no inventory.)*

**PRD conflicts (3)**
- **[Adversarial]** Detail-drawer field list drops sim-critical component metadata (`rate_limit`, `buffer`, `throttled`, `color`) (EXPERIENCE §Detail drawer; PRD §6) — Fix: add sim params to the drawer's component form, or state where they're edited.
- **[Adversarial]** Glossary "mirrored verbatim" drops the encapsulation clarifier ("root and leaf are not encapsulation boundaries"); descend depth limit never stated (EXPERIENCE §glossary; PRD §6/FR8) — Fix: carry the clarifier verbatim; state the depth cap (system → module → submodule; components not descendable). *(Cross-link: contests the rubric's Inheritance-discipline "strong.")*
- **[Adversarial]** `⌘,` "opens settings" but no settings surface exists in the IA (EXPERIENCE §Command palette; PRD FR12) — Fix: define the settings surface or drop the `⌘,` binding.

**Interaction precedence / edge holes (4)**
- **[Adversarial]** No precedence when conflict prompt + data-loss toast + drift chip fire together — the common case (EXPERIENCE §Sync-health chip; §Conflict prompt) — Fix: define precedence (conflict prompt modal wins; drift/loss surfaces queue behind it). *(Cross-link: accessibility AX-H3/AX-H4 hit the same event.)*
- **[Adversarial]** Peek open / descended when the file changes on disk, or a quick-fix deletes the scope you stand in (EXPERIENCE §Component Patterns; §Quick-fix) — Fix: auto-ascend to the nearest surviving ancestor and re-key or drop its view state; dismiss/refresh peek on reload.
- **[Adversarial]** Drawer docked-right at 1024px with the file rail open exceeds the minimums; "graceful degradation" names no hide-order (DESIGN §Layout; EXPERIENCE §Responsive) — Fix: state the degradation order and width thresholds. *(Cross-link: accessibility 200% reflow, same responsive stance.)*
- **[Adversarial]** Undo across a descend boundary operates on invisible context (EXPERIENCE §Interaction Primitives "Undo/redo") — Fix: undo auto-navigates to the scope of the reverted change, or explicitly accept blind-undo.

**Ambiguity a builder can't implement from (1)**
- **[Adversarial]** The "Aspects" view is MVP-designed but has no defined content or layout (EXPERIENCE §View switcher; §Scope & Trajectory) — Fix: define the content source and layout, or move it to DIRECTIONAL. *(Cross-link: escalates the rubric Component-coverage low for Metrics/Aspects/Layers.)*

**Accessibility — typography & focus (3)**
- **[Accessibility]** 13px floor contradicts the spine's own typography tokens (`caption` 12px, `readout` 12px carrying metrics, `kbd` 11px) (DESIGN §Typography) — Fix: raise `readout`/`caption` to 13px and `kbd` to ≥12px, or amend the floor and justify each.
- **[Accessibility]** Focus is not stated to move on selection (drawer) or after descend (EXPERIENCE §Detail drawer, Module symbol) — Fix: selection moves focus to the drawer's first field; descend places focus on the first pin/node.
- **[Accessibility]** Expand-in-place has no stated keyboard path (corner control / context-menu) (EXPERIENCE §Module symbol) — Fix: bind expand to a key on a focused module and/or a palette command; ensure the context menu opens from the keyboard.

**Accessibility — reachability & motion (2)**
- **[Accessibility]** Sync-health chip resolution has no stated keyboard operation (EXPERIENCE §Sync-health chip) — Fix: add the chip to the reachable set; specify focus into the popover, arrow-through actions, `Esc` to close.
- **[Accessibility]** Playback bar / simulation transport not committed to keyboard; reduced-motion coupling vague (EXPERIENCE §State Patterns "Simulation running") — Fix: add playback controls to the reachable set with keys; state `prefers-reduced-motion` suppresses packet motion and that sim is pausable (WCAG 2.2.2).

**Accessibility — reflow, roving nav, contrast edges (3)**
- **[Accessibility]** Browser zoom / text-resize (WCAG 1.4.4 / 1.4.10 reflow) not addressed (DESIGN §Layout; EXPERIENCE §Responsive) — Fix: commit UI text scales/reflows to 200% without loss within the desktop frame. *(Cross-link: adversarial 1024px hide-order, same stance.)*
- **[Accessibility]** Roving/arrow-key nav committed only for tabs + view switcher, not the palette or diagnostics lists; view switcher called both "dropdown" and "tab bar" (EXPERIENCE §Accessibility Floor) — Fix: extend arrow-key/single-tab-stop to palette + diagnostics lists; reconcile the view-switcher ARIA pattern.
- **[Accessibility]** Dirty-dot is `accent`-only (no text affordance); `accent-strong` on `surface` = 3.61 fails 4.5 if it ever carries text (DESIGN §Status bar, Colors) — Fix: pair the dirty dot with a text/tooltip affordance; fence `accent-strong` to non-text use.

### Low (16)

*Grouped by theme; each finding named on one line.*

**Rubric — spec completeness (6)**
- **[Rubric/Flow]** FR11 Focus view never named in the summoned-surface mapping (EXPERIENCE §IA) — Fix: add "Focus = the detail drawer's module interface/members editor."
- **[Rubric/Flow]** FR7 simulation-report/history export has no stated save home (EXPERIENCE §Export; PRD FR7) — **deduped: Rubric [low] + Adversarial [low] ("FR7 non-image artifact export not re-homed"), both sources, kept at low** — Fix: one line homing sim reports (e.g. `<project>/reports/`).
- **[Rubric/Token]** `button-primary.foreground` is a raw hex outside the fenced contrast floor (DESIGN §Colors) — Fix: add the pair to the floor or promote to a named `on-accent` token. *(Cross-link: accessibility computed it 5.70 PASS — AA worry resolved, fencing gap stands.)*
- **[Rubric/Component]** `button-primary` and `quick-fix-button` lack a DESIGN.md visual-anatomy row (DESIGN §Components) — Fix: add two short anatomy rows or note frontmatter-only.
- **[Rubric/Component]** Metrics, Aspects, and Layers have no spec beyond their IA one-liner (IA table) — Fix: a minimal visual/behavioral note each or an explicit "spec deferred." *(Cross-link: Aspects escalated to adversarial medium.)*
- **[Rubric/State]** No command-palette "no matches" state and no library-palette empty state (EXPERIENCE §State Patterns) — Fix: add the two rows.

**Rubric — bloat & inheritance (2)**
- **[Rubric/Bloat]** "Four undefined tokens now defined" motif repeats ~4× in DESIGN.md; Open Questions largely restates PRD OQs (DESIGN; EXPERIENCE) — Fix: compress to one or two mentions.
- **[Rubric/Inheritance]** `sources` points at the PRD folder rather than a specific `prd.md` (frontmatter) — Fix: point at the file.

**Adversarial — precedence & unquantified rules (3)**
- **[Adversarial]** `Esc` precedence is an ambiguous list, not an order (EXPERIENCE §Interaction Primitives "Esc") — Fix: "Esc closes the topmost transient overlay first (popover → palette → peek), ascending only when none is open."
- **[Adversarial]** Simulation running + external reload leaves a stale sim graph mid-run (EXPERIENCE §State Patterns) — Fix: reload halts any running simulation and requires re-run.
- **[Adversarial]** Unquantified rules: hover-pause duration, sync-health cadence, edge-flyout trigger, `[DELEGATED]` on decided items (EXPERIENCE, multiple) — Fix: give numbers where behavior needs them; relabel resolved `[DELEGATED]` items as decided-by-facilitator.

**Accessibility — contrast, focus, motion, boundaries (5)**
- **[Accessibility]** `foreground-dim` fails 4.5:1 on every surface — compliant by declaration, but line numbers and disabled view entries lean load-bearing (DESIGN §Colors) — Fix: keep supplementary; ensure line-jump never requires reading a dim number.
- **[Accessibility]** Peek dismissal focus-return not stated (EXPERIENCE §Module symbol) — Fix: state focus returns to the peeked module.
- **[Accessibility]** High-speed simulation (up to 5×) vs. flash thresholds (WCAG 2.3.1) not addressed (EXPERIENCE §State Patterns) — Fix: state packet animation never exceeds the flash threshold at any speed.
- **[Accessibility]** Border hairlines sit far below 3:1 — by design, but module symbols (`border-node` = 1.49 vs canvas + ~1.1:1 fill delta) have a near-imperceptible essential boundary (DESIGN §Elevation, Colors) — Fix: give module symbols a perceivable boundary (raise `border-node` toward 3:1 or add a shade/tint).
- **[Accessibility]** Layers visibility control and "operable" claims are asserted, not specified (EXPERIENCE §IA, Accessibility Floor) — Fix: note the concrete key/mechanism for each (Layers toggle = `Space`/`Enter` on a focused row; library = editor "Insert template").

## Dedup summary

- **Deduped panel tally:** 4 critical · 13 high · 22 medium · 16 low (raw 4/13/23/17 across the three reviewers; two findings collapsed).
- **Dedup 1 (kept high):** `Space` overload — Adversarial `Space`+`⇧1` vs editor text entry **+** Accessibility `Space`-to-peek vs canvas-pan/focused-button. Same root cause (no focus-arbitration rule for `Space`). Removed 1 medium.
- **Dedup 2 (kept low):** FR7 export home — Rubric Flow-coverage **+** Adversarial "FR7 non-image artifact export not re-homed." Removed 1 low.
- **Cross-linked, not merged:** the two converging critical pairs (double-click-descend engine collision ↔ no canvas keyboard/SR path); contrast-floor fencing; Aspects view; conflict/data-loss common case; responsive degradation; node/status color signifiers; the "glossary mirrored verbatim" claim.
- **Count note:** the adversarial file has 2C/7H/12M/4L at the heading level; the pipeline's "8 high" summary counted the legend line.

## Reviewer files

- review-rubric.md
- review-adversarial.md
- review-accessibility.md
