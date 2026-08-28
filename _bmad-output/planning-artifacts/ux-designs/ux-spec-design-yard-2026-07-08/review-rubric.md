# Spine Pair Review — spec-design-yard

## Overall verdict

A strong, source-extractable contract. Token discipline is near-flawless — all 39 color tokens carry 6-digit hex, every one of the 108 `{path.to.token}` references across both files resolves, all 21 components are both defined and referenced with zero orphans, and DESIGN.md holds canonical section order. A downstream consumer can extract cleanly. The gaps are edge/requirement-level, not structural: FR5 (localStorage→file migration) has no home anywhere, two components (`button-primary`, `quick-fix-button`) carry frontmatter tokens but lack a DESIGN.md visual-anatomy row, and Flow 2's CI-lint-gate *failure* branch — the gate's whole reason to exist — is unspecified. None are blocking.

## 1. Flow coverage — adequate

Checked all three PRD user journeys (UJ1 Design a system, UJ2 Hand off to an agent, UJ3 Learn a system) — each has a named-protagonist Key Flow with numbered steps and a bold **Climax** beat (Priya / Priya+agent / Sam). Then walked FR1–FR17 for a home in a flow, Component Pattern, or State Pattern.

### Findings
- **medium** FR5 (one-time localStorage→project-file migration on first run; localStorage-only fallback when no folder is configured) appears nowhere — not in Foundation, State Patterns, or any flow (EXPERIENCE.md). The migration prompt is a UI surface a first-run consumer must build from nothing. *Fix:* add a "Migration (first run from localStorage)" row to State Patterns, or a Foundation sentence.
- **medium** Flow 2 (UJ2) climaxes on "the lint gate passes green in CI" but specifies no failure path for the gate failing red — the exact condition the CI surface exists to catch (EXPERIENCE.md line 353). The example spines carry a Failure line even on the async-handoff flow. *Fix:* add a `Failure:` line — non-zero exit, machine-readable errors surfaced, PR blocked; Priya sees the diagnostics.
- **low** FR11 names Tree, Grid, **Focus** views. The summoned-surface mapping folds Tree→breadcrumb, Grid→canvas view, Layers→control, Metrics→analysis view, but never names where **Focus** (membership/exposure editing) went — it is absorbed into the detail drawer's module editor but left implicit (EXPERIENCE.md lines 63-66). *Fix:* add "Focus = the detail drawer's module interface/members editor" to the mapping.
- **low** FR7 routes *simulation reports and history exports* into the project folder; only diagram export (`<project>/exports/`) is surfaced. Sim-run report file-save is not mentioned. *Fix:* one line in Export or Foundation.

## 2. Token completeness — strong

Extracted the full frontmatter (39 colors, 9 typography roles, 5 radii, 10 spacing steps, 21 components) and every `{...}` reference in both prose bodies. All 39 colors carry hex. All references resolve — the `{spacing.1}`…`{spacing.8}` refs map to YAML keys quoted as `'1'`…`'8'` (standard string-forcing) and flatten correctly. Contrast floor is stated for the load-bearing combinations (foreground-body on background/surface ≥4.5:1; foreground-muted on surface ≥4.5:1; foreground-dim declared decorative-only). No missing hex, no unresolved paths, no dangling components.

### Findings
- **low** `button-primary.foreground` is a raw hex `'#0b1a2e'` (dark-navy label on `{colors.accent}` `#3794ff`) — the only non-tokenized, non-neutral color value, and this accent/label pair is load-bearing yet absent from the stated contrast floor. *Fix:* add the primary-button label pair to the contrast-floor list, or promote the value to a named `on-accent` token.

## 3. Component coverage — adequate

Cross-checked all 21 frontmatter components against DESIGN.md.Components (visual anatomy) and EXPERIENCE.md Component Patterns (behavior). 19 have a real visual-anatomy row plus a behavioral rule; behavioral coverage is complete and specific (not one-word).

### Findings
- **low** `button-primary` and `quick-fix-button` have frontmatter tokens and EXPERIENCE.md behavioral rules but **no DESIGN.md.Components visual-anatomy row** (the other 19 do). Impact is contained — the frontmatter tokens carry bg/fg/radius/height, so the visual spec is still source-extractable — but the prose spec is absent. *Fix:* add two short anatomy rows, or accept frontmatter-only and note it.
- **low** Metrics (analysis view: SPOFs, hotspots, path comparison, STRIDE), the Aspects prose view, and Layers (visibility control) are named in the IA table and flows (SPOF surfaces in Flow 1's climax) but have no visual or behavioral component spec beyond their IA one-liner. Lean-by-design is defensible, but a consumer building the Metrics view gets nothing. *Fix:* a minimal visual/behavioral note each, or an explicit "spec deferred" marker.

## 4. State coverage — strong

Walked each IA surface for the applicable states. State Patterns covers empty-project, missing `main.spec.yaml`, read-only folder, invalid mid-keystroke YAML (error), external-edit conflict, cold-load (Loading shimmer), simulation-running, all-checks-passing, and onboarding. Focus states are handled in the Accessibility Floor (focus-visible ring never suppressed). This is a comprehensive spread — empty, cold-load, error, conflict, and read-only are all explicitly present.

### Findings
- **low** No command-palette "no matches" state and no library-palette empty state (the paired example spine specs a command-palette no-match row). Cheap to add; a consumer will otherwise improvise the highest-traffic keyboard surface's empty view. *Fix:* add the two rows.

## 5. Visual reference coverage — strong

`.working/` holds three direction boards, three flow-variant wireframes, and two working extracts; `imports/` is empty. DESIGN.md links all three retained direction boards inline in its header (notion-calm→surfaces/shapes, vscode-kin→accent, discord-warm→density/grouping) and the three wireframes in Components; EXPERIENCE.md links the three wireframes in IA. Each link names what it illustrates. "Spines win on conflict" is stated (twice per file). `direction-drafting-instrument.html` is the documented intentional reject — correctly unlinked. `extract-prd.md` / `extract-current-ui.md` are working extracts, not visual artifacts — correctly unlinked. No orphans, no unspecific references.

### Findings
- None.

## 6. Bloat & overspecification — strong

DESIGN.md carries editorial voice ("a quiet desk at night, not an IDE cockpit") appropriately; EXPERIENCE.md prose stays plain and behavioral. Inline hex restatement in the Colors section is spec-appropriate (per-color story), matching the example convention.

### Findings
- **low** The "four undefined tokens now defined" motif repeats ~4× in DESIGN.md (opening blockquote, per-color parentheticals, and a Do/Don't row). It is load-bearing history but could compress to one or two mentions. Open Questions in EXPERIENCE.md largely restates PRD OQs/assumptions — justified as downstream flags, but skimmable rather than load-bearing.

## 7. Inheritance discipline — strong

`sources:` resolves (`../../prds/prd-spec-design-yard-2026-07-07/` exists on disk); `design_ref: ./DESIGN.md` resolves. UJ names are verbatim from the PRD extract. The EXPERIENCE.md glossary mirrors the canonical PRD glossary term-for-term (Spec · Component/4 types · Connection · Module/submodule · Interface/exposed member · Encapsulation violation · Quick-fix · Dirty state · Project folder · Collapse/expand). Component names are identical across frontmatter, DESIGN prose, and EXPERIENCE prose. All EXPERIENCE.md token references resolve to DESIGN.md tokens by name.

### Findings
- **low** `sources` points at the PRD *folder* rather than a specific `prd.md` (the example spines point at `.../prd.md`). Resolves fine and the folder is the correct home, but it is marginally less precise about which file wins.

## 8. Shape fit — strong

DESIGN.md sections run in exact canonical order: Brand & Style → Colors → Typography → Layout & Spacing → Elevation & Depth → Shapes → Components → Do's and Don'ts. EXPERIENCE.md carries all eight required defaults (Foundation, Information Architecture, Voice and Tone, Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor, Key Flows) plus both required-when-applicable sections: Inspiration & Anti-patterns (sources name VHDL/Virtuoso/VS Code/Notion/Discord) and Responsive & Platform (desktop-only note). Invented sections earn their place — Scope & Trajectory manages the user's select-everything-vs-LEAN-DESIGN tension (load-bearing); Open Questions is borderline but useful as an explicit unresolved-for-downstream ledger.

### Findings
- None.

## Mechanical notes

- **Names:** component names are consistent across all sections of both files (21/21 frontmatter ↔ prose ↔ references match; no drift). Glossary matches the source verbatim.
- **Cross-refs:** every inline `./` link target verified present on disk (3 direction boards, 3 wireframes, `./DESIGN.md`, the PRD source folder). No broken links.
- **Token resolution:** 108 total `{...}` references across both files; 0 unresolved. The only apparent misses (`{spacing.1}`–`{spacing.8}`) are a false positive — YAML string-forced keys (`'1'`) that flatten correctly at consumption.
- **Frontmatter completeness:** DESIGN.md — name, description, status, updated, sources, colors, typography, rounded, spacing, components all present. EXPERIENCE.md — name, status, updated, sources, design_ref present. `button-primary.foreground` is the sole raw-hex (non-referenced) color value.
- **Severity tally:** 0 critical · 0 high · 2 medium · 8 low.
