# PRD Quality Review — Spec-Yard MVP — Internal Release PRD

Reviewed: `prd.md` + `addendum.md`, 2026-07-08. Stakes calibration: internal-tool MVP for an existing working prototype; implementation depth deliberately routed to `addendum.md` and a downstream design doc. Graded accordingly.

## Overall verdict

This is a decision-rich, thesis-coherent PRD that earns its scope: every feature group (G1–G5) traces to a named blocker in §2, success metrics measure outcomes rather than activity, and de-scoping is done in the open with upgrade paths. What's at risk is downstream extraction: a handful of FRs leave "done" genuinely ambiguous (FR15's unchosen alternatives, NFR5's "perceptible lag"), and the absence of a Glossary and Assumptions Index means the design doc inherits terminology drift ("flow" vs "connection", "workspace" vs "project folder") and a release criterion (§9.1) with no enumerated checklist behind it. Nothing here is broken; the fixes are localized.

## Decision-readiness — strong

The PRD states decisions as decisions and shows its work. OQ1 is resolved with a dated strikethrough ("~~Single-level grouping assumed.~~ **Resolved (2026-07-08): two module levels**"), OQ2 carries explicit decision criteria and a working recommendation ("cloned-repo script for the internal phase, graduating to `npx`"), and §8 defers named abstract ports with a stated upgrade path ("each exposed component becomes a default port, so nothing in MVP forecloses it") — that is a trade-off named with what was given up. G5 even records where a scope decision was made ("delegated to and made by the PRD process: lint first, everything else later"). The no-telemetry choice (NFR4) is honestly paid for in §3: "Measurement is manual/qualitative during the internal phase."

There are no `[NOTE FOR PM]` callouts, but their function is served by a consistent alternative convention: `[ASSUMPTION] … design-doc decision` tags plus OQ4's explicit "(Design-doc decision — needs no product input.)". Deferred decisions are routed, not smoothed over.

### Findings
- **low** FR4's conflict rule leans on FR3's undecided write semantics (§6 G1) — FR4 defines v1 conflict as "file changed on disk while local edits pending → prompt to reload or overwrite," but FR3 leaves auto-save vs explicit-save open (`[ASSUMPTION]` debounced auto-save). Under debounced auto-save, "local edits pending" is a race window measured in milliseconds, which changes how often the prompt can even occur and what "overwrite" destroys. *Fix:* add one sentence to FR4 noting the conflict rule must be re-validated against whichever write semantics the design doc picks.

## Substance over theater — strong

No furniture detected. The three personas (§4) each drive requirements: the AI agent motivates FR4 (external-edit handling), FR17 (CLI), and SM2; the newcomer motivates UJ3, FR13/FR14, and SM4. NFRs are product-specific to an unusual degree — NFR1 names the mechanism ("AST-based editing, never parse-and-dump") and the failure modes ("ghost components"), NFR2 names "deterministic seeds/ids," NFR7 targets a specific existing docs/code contradiction ("claimed DB auto-save"). The vision paragraph (§1 "The organizing principle is human capability… Encapsulation is the mechanism — and it is a design requirement, not a rendering trick") could not be swapped into another PRD; it directly generates G2's design stance (FR9's semantic, linted encapsulation). Competitive claims in §2 are backed by evidence in `addendum.md` §B (Structurizr cloud EOL, named neighbors Ilograph/Eraser/LikeC4) rather than asserted.

Brownfield references verified against the repo: `PreviewStorage` exists in `lib/db.ts`, the decorative "main.spec.yaml" label exists in `components/workspace/workspace-layout.tsx` and `editor-panel.tsx`, and the "~225 tests" claim is exactly accurate (225 test cases counted).

## Strategic coherence — strong

The thesis is explicit and load-bearing: "The current state of the product blocks real use… The mature core… is trapped behind prototype scaffolding" (§2), and the MVP succeeds "when internal architects design real systems in Spec-Yard by choice" (§3). Each of §2's four blockers (no files, flat schema, decorative UI, no orientation) maps 1:1 to a feature group (G1, G2, G3+G5, G3) — the scope is derived, not accumulated. SM1–SM4 validate the thesis (complexity ceiling, agent-build fidelity, design velocity, onboarding speed) rather than counting activity, and counter-metrics are present — the rubric's explicit ask — with the standout "Zero spec-corruption incidents… One corruption erases trust in the honest-contract premise," which ties a counter-metric back to the §1 thesis.

### Findings
- **low** Counter-metric "quick-fix adoption should stay high" (§3) has no observation mechanism — NFR4 forbids telemetry, and "adoption" is a rate. Manual dogfooding sessions can observe complaints, not adoption rates. *Fix:* restate as something observable in a session (e.g., "diagnostics users report ignoring or suppressing") or name the dogfooding protocol that captures it.

## Done-ness clarity — adequate

Most FRs carry testable consequences: FR4 quotes its conflict rule verbatim; FR8 fixes hierarchy at exactly two levels and names which boundaries seal; FR9 defines the encapsulation-violation lint precisely including the composition rule ("never a submodule's internals"); FR12 enumerates the decorative controls to remove; FR17 specifies exit codes, dual output formats, and a configurable severity threshold. FR13's dismissal behavior ("stays dismissed until explicitly re-enabled from Help") is directly traceable to the onboarding-friction counter-metric. Where FRs defer, they mostly say so with a tagged `[ASSUMPTION]` routed to the design doc, which is honest rather than vague.

But this dimension is graded unforgivingly, and a few spots leave an engineer without a "done" test:

### Findings
- **medium** FR15 lists three alternatives without choosing (§6 G3) — "template picker / sample spec / guided 'create your first component'" is a menu, not a requirement, and unlike FR1/FR3/FR14 it carries no `[ASSUMPTION]` tag or design-doc routing. An engineer cannot know which of the three satisfies the release criterion. *Fix:* pick one, or tag the choice as a design-doc decision like the others.
- **medium** NFR5 "without perceptible lag" is the exact adjective-instead-of-bound the rubric flags (§7) — the scale side is quantified (~40 components / ~80 connections) but the latency side is not; no perf test can be written against "perceptible." *Fix:* state a bound (e.g., keystroke→diagram+diagnostics under N ms at SM1 scale), even as an `[ASSUMPTION]`.
- **low** FR9's interface-bloat warning has no threshold (§6 G2) — "a module exposing most of its members" leaves "most" undefined; two implementers will pick two numbers. *Fix:* tag a working threshold (e.g., `[ASSUMPTION]` >70% exposed) for the design doc to confirm.
- **low** FR16 "saved into the project folder (FR7) and/or downloaded" (§6 G4) — "and/or" makes it unclear whether download alone passes acceptance, which would contradict FR7's "not browser downloads only." *Fix:* make project-folder save the requirement and download the optional extra.

## Scope honesty — strong

§8 is a real Non-Goals section doing real work: every exclusion carries a rationale ("collaboration happens through git"), and the most tempting scope creep — code generation — is explicitly disclaimed with a measurement substitute ("'isomorphism with code' is explicitly not claimed. Agent-build fidelity is measured (SM2), not automated"). Eleven inline `[ASSUMPTION]` tags sit exactly where the user's confirmation is missing (all four SM thresholds, launch packaging, write semantics, folder layout, UX grouping, export mechanism, CLI output format, perf scale). De-scoping inside FRs is flagged in place (G2: "Deliberately not full-blown: two module levels… see the post-MVP headroom in §8"). Open-items density (3 open OQs + 11 assumptions) is right for internal-MVP stakes, and OQ3 honestly says the metric targets await real users.

### Findings
- **low** No Assumptions Index, but §9.1 depends on one — release criterion 1 requires "every `[ASSUMPTION]` in this document either confirmed or consciously revised," yet nothing enumerates them; the criterion is checkable only by re-grepping the document. *Fix:* add a short indexed list (A1–A11) at the end and have §9.1 reference it.

## Downstream usability — adequate

This is a chain-top PRD (it explicitly feeds the persistence design doc, §11), so extraction quality matters. IDs are clean: FR1–FR17, SM1–SM4, UJ1–UJ3, NFR1–NFR7, OQ1–OQ4, G1–G5 — contiguous, unique, and every cross-reference resolves (FR16→FR7, §5→§8, OQ1→FR8, NFR5→SM1, §11→`addendum.md` §A/§B and `discovery-notes.md` §C — both files exist). The addendum split works: §A is genuinely implementation depth (API-route positions, vertical slices) that would have bloated the PRD.

The gap is terminology infrastructure:

### Findings
- **medium** No Glossary — domain nouns the design doc must consume are defined only in passing or not at all: "Gateway / Stage / Store / Brick" appear once in §1 prose and never again; "exposed member," "interface," "layer," "Focus view" carry load in FR9–FR11 and FR14 with no canonical definitions. Downstream source-extraction will reconstruct meanings from context. *Fix:* add a Glossary section defining component types, module, submodule, interface/exposed member, flow, project folder, and the three views.
- **low** Term drift: "flow" vs "connection" — §1 says components are "connected by labeled directional flows," but FR9/FR10 and SM2 say "connection(s)"; whether these are the same noun is inferable but never stated. Likewise "project folder" (G1, FR1) vs "workspace" (§4 "while the workspace may be open"; G1's heading "Project workspace"; addendum's "workspace root"). *Fix:* pick one term per concept; a Glossary entry resolves both.

## Shape fit — strong

The shape matches the product. This is an internal tool with three distinct roles, and the PRD correctly uses a capability-spec spine (feature groups with FRs) plus exactly three one-line UJs — enough to anchor end-to-end release criteria (§9.3 "UJ1–UJ3 each demoable end-to-end") without UJ theater. SMs are appropriately operational/outcome-shaped rather than consumer-growth-shaped. As a brownfield PRD, its existing-code references were spot-checked and are accurate (see Substance); new capability (modules, files) vs existing capability (editor, linter, simulator) is cleanly distinguished in §5's framing ("existing mature core plus five feature groups"). No over-formalization detected — personas are three paragraphs total, and there is no invented market section beyond the evidence-backed §2 positioning.

## Mechanical notes

- **Stale frontmatter:** `updated: 2026-07-07` but OQ1 records "Resolved (2026-07-08)" — the resolution postdates the recorded update stamp.
- **Assumptions Index roundtrip:** fails trivially — 11 inline `[ASSUMPTION]` tags, no index (see Scope honesty finding).
- **Glossary drift:** "flow"/"connection", "workspace"/"project folder" (see Downstream usability); also "diagnostics" (FR11, FR14) vs "lint error/warning" (FR9) — same system, two registers, low impact.
- **ID continuity:** clean; no gaps, duplicates, or dangling references. `addendum.md` §A/§B and `discovery-notes.md` all present in the folder.
- **UJ protagonists:** UJs use role protagonists (architect, agent, newcomer) rather than named individuals; acceptable for the internal-tool shape, and each UJ's actor is unambiguous from §4.
- **Required sections:** all present for internal-MVP stakes (overview, problem, goals/SMs with counter-metrics, users/workflows, scope, FRs, NFRs, out-of-scope, release criteria, open questions). No monetization/market section — correct for these stakes; positioning evidence lives in the addendum where it belongs.
