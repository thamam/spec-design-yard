# Spec-Yard PRD Content Extraction (for UX workflow → DESIGN.md + EXPERIENCE.md)

Source: `_bmad-output/planning-artifacts/prds/prd-spec-design-yard-2026-07-07/` (prd.md, addendum.md, discovery-notes.md, .memlog.md, plus review-adversarial.md / review-rubric.md / reconcile-user-inputs.md skimmed for UX-relevant open concerns).

## 1. Product vision & problem

**What it is.** "**Spec-Yard** is a local-first visual IDE for system architecture." An architect describes a system in a human-readable YAML spec (components typed as **Gateway / Stage / Store / Brick**, joined by labeled directional connections) and works through a "live, bidirectionally synced Excalidraw diagram": typing YAML re-renders the diagram; dragging, connecting, renaming, or deleting on the canvas writes back into the YAML "without destroying comments or formatting." Around this core loop sit a **40+ rule architectural linter** (structural, connection-integrity, anti-pattern, graph-topology, and STRIDE security checks — most with one-click quick-fixes) and a **packet-flow simulator** (traffic playback, per-path latency/throughput analysis, bottleneck and single-point-of-failure detection, exportable run reports).

**Organizing principle (load-bearing, mirror verbatim).** "**The organizing principle is human capability.** Every view stays simple enough for a person to track and navigate, and detail is always one dive-down away for validation or tweaking." Encapsulation is the mechanism "and it is a design requirement, not a rendering trick"; complex parts are modeled as "**modules with strict interfaces**," and other parts connect "*through the interface*, never by connecting into a module's internals." "Visual masking (collapsed views, hidden layers) is the visible consequence of that discipline, not a substitute for it." The spec↔diagram pair is "a single honest contract — neither side is ever allowed to drift from the other." Structure like module boundaries "must live in the spec itself, never only in the picture."

**Agent-friendly.** Specs are "plain versioned YAML files that AI agents can read and write directly," handable to a coding agent (e.g., Claude Code) as a build blueprint. Deriving/verifying code against the spec is "a post-MVP direction, not an MVP capability."

**The problem.** Architecture knowledge "lives in stale diagrams, whiteboard photos, and heads." Text-to-diagram tools (Mermaid, D2, Structurizr) are one-way; whiteboard tools (Miro, Excalidraw) are "semantically empty." "No mainstream tool combines a typed, lintable spec with an editable canvas and flow simulation." **The current product blocks real use:** the mature core (~225 tests) is "trapped behind prototype scaffolding" — specs persist only to browser localStorage under a single hardcoded doc id; header Save/Share/Settings buttons are decorative; the "main.spec.yaml" in the status bar is fiction; schema is flat (no grouping/containment); "the UI has accreted many buttons and surfaces with no orientation layer; a new user cannot discover what the tool can do or how to use it." This PRD "defines the MVP that removes those blockers for a first internal release."

## 2. Users & personas

Three role-protagonists (not named individuals):

- **Primary: the architect** — "internal software architects and engineering leads. Designs and evolves systems in the workspace; owns the spec files."
- **Secondary: the AI agent** — "Claude Code and similar. Reads and edits `*.spec.yaml` files directly in the project folder while the workspace may be open; consumes specs as build blueprints; runs the CLI linter as a gate."
- **Tertiary: the newcomer** — "engineer joining a system. Opens an existing project read-mostly, navigates hierarchy and simulation to build a mental model fast."

Discovery-notes §A adds impressionistic (non-canonical) persona sketches: "PMs/eng leads/architects (shareable docs); software architects/DevOps power users (visual IDE); microservice/K8s/DDD architects (nested complexity); designers+devs (whiteboard feel)." Skill levels: primary users assumed developer-grade (OQ2 rationale: "all have Node → npx/clone are zero-friction"). **GAP:** no named internal dogfooders / N / adoption count (flagged by adversarial review and OQ3).

## 3. In-scope features (MVP)

MVP = "the existing mature core (editor, bidirectional canvas, linter, simulator) **plus** five feature groups." Priority-ordered as staged drops (see §8 Constraints/Release).

**Key concept definitions (mirror verbatim):**

- **Project-folder model (G1):** "Spec-Yard is a **standalone tool, separate from any target repo**: launching it opens a *project folder* — the single home for the specs and every artifact the tool generates (simulation reports, exports). The folder is plain files; users version it with git if and however they choose." "The app operates on exactly one project at a time." Distinct from any target code repo. (Note: addendum §A still contains the *superseded* "specs living inside the target project's repo" framing — a documented DISTORTION RISK; the standalone/project-folder model in prd.md G1 is authoritative.)

- **Two encapsulation levels (G2 / FR8):** "Modules nest **two levels deep** — top-level modules may contain submodules; submodules contain only components — giving the design exactly **two levels of encapsulation** (module and submodule are the sealable boundaries; the system root and leaf components are not encapsulation boundaries)." Schema change is "additive and backward-compatible." (Terminology-consistency caution: adversarial review flags that "two encapsulation levels" / "nest two levels deep" / "≥ 2 abstraction levels" / "nesting beyond two module levels" appear across the doc — UX should use one counting scheme; FR8's parenthetical is the pinned reading.)

- **Staged drops (§9):** "Internal releases ship **per feature group as it lands** (staged drops)," in priority order G1 → FR12 → G2 → G3 remainder → G4+G5. "Each drop is built in vertical, independently demoable slices... and ships only with tests green... a clean build, and docs updated." "If schedule pressure forces a cut, groups slip from the bottom of this order — G2 is the thesis and is not sacrificed to hold a date."

**Feature groups & FRs (UI-facing flagged):**

**G1 — Project folder & file persistence**
- FR1 — Open/create project folder on launch; one project at a time. [ASSUMPTION] launch = single local command (e.g., `npx spec-yard <folder>`).
- FR2 — Spec file discovery & switching: all `*.spec.yaml` discovered, "listed in the left panel, and openable"; `main.spec.yaml` is the default on first open; creating a new spec file from the UI is supported. **[UI]**
- FR3 — Real write semantics: atomic writes; "the Save control is wired (no-op today), a dirty-state indicator shows unsaved changes, and the status bar shows the true file path instead of the current decorative label." [ASSUMPTION] debounced auto-save + Save as explicit flush. **[UI]**
- FR4 — External-edit handling: app watches the open file; on-disk change is "surfaced to the user." v1 conflict rule: "*file changed on disk while local edits pending → prompt to reload or overwrite*." No silent clobbering; every write preceded by mtime/content-hash check; mismatch "triggers the conflict prompt instead of the write." Agents editing while workspace open is "the *common* case." **[UI — conflict prompt]**
- FR5 — Migration & fallback: one-time export of localStorage spec to a project file on first run; localStorage-only mode remains when no project folder configured (hosted-preview).
- FR6 — No half-wired code paths: unwired Prisma/Postgres + mock sign-in "parked behind an explicit flag or deleted." "Nothing in the shipped UI implies a capability that doesn't exist."
- FR7 — Generated artifacts (simulation reports, history exports, diagram exports) save into the project folder. [ASSUMPTION] subfolders e.g. `reports/`, `exports/`.

**G2 — Modules & strict interfaces**
- FR8 — Module construct in the schema (two levels deep; see definition above).
- FR9 — Strict interfaces: "A module's interface is the subset of member components it explicitly exposes." A connection from outside "may target only exposed members — anything else is a lint error ('encapsulation violation')" with a quick-fix that "**defaults to retargeting the connection to an exposed member**; widening the interface (exposing the targeted member) is offered as an explicit secondary action, never the default — one click must not defeat encapsulation." A parent module "may expose its direct members and the *exposed* members of its submodules — never a submodule's internals." Interface-bloat lint warning: [ASSUMPTION] "a module of ≥4 members exposing more than half of them." **[UI — lint diagnostic + quick-fix affordance]**
- FR10 — Collapse/expand on canvas: "A collapsed module renders as a single node whose only connection anchor points are its interface, showing aggregate signals (member count, worst diagnostic severity); expanding reveals members in place. Connections crossing a collapsed boundary render at the interface. Collapsed/expanded state persists per spec." **[UI]**
- FR11 — Hierarchy across views and analysis: "Tree, Grid, and Focus views reflect module membership (module nodes in the tree, module sections/filters in the grid, membership and exposure editable in Focus)." "Linter and simulator always compute on the full flat graph underneath... with diagnostics and simulation activity rolling up onto collapsed modules." **[UI — three named views]**

**G3 — Orientation & UX overhaul** (all UI-facing)
- FR12 — Remove decorative controls: "Every control that does nothing today (fake Save behavior, Share, Settings, Play, Terminal, branch pill, no-op Preview tool) is either wired to real behavior... or removed. Zero lying UI."
- FR13 — First-use onboarding: "A guided first-run experience (tour or contextual tips) introduces the core loop — spec ↔ canvas ↔ lint ↔ simulate — on a bundled sample spec. Appears on first use, dismissible, stays dismissed until explicitly re-enabled from Help."
- FR14 — Progressive disclosure: "The default view is the simple core (editor + canvas + diagnostics). Advanced surfaces (Metrics/simulator, path comparison, STRIDE detail, layers) are present but revealed opt-in rather than all competing at once." [ASSUMPTION] exact core-vs-advanced grouping to be validated in a UX pass.
- FR15 — Purposeful empty state: "A brand-new project greets the user with a meaningful starting point — at minimum a bundled sample spec and a guided 'create your first component' flow; never a blank editor." [ASSUMPTION] exact form (template picker vs. single sample).

**G4 — Export**
- FR16 — Diagram image export: "Export the current diagram view (respecting collapsed modules and layer visibility) as PNG and SVG," saved into the project folder and offered as browser download. [ASSUMPTION] built on Excalidraw native export. **[UI]**

**G5 — Agent & CI surface**
- FR17 — `spec-yard lint` CLI: headless lint with the same rule engine, non-zero exit on errors, human-readable + machine-readable ([ASSUMPTION] JSON) output, configurable severity threshold. (Not GUI, but defines agent/CI terminology.)

## 4. User stories / journeys (verbatim names + step sequences)

- **UJ1 — Design a system:** "launch Spec-Yard → open/create a project folder → author spec via editor and canvas interchangeably → lint-clean it with quick-fixes → simulate flows to sanity-check capacity/bottlenecks → commit the spec files with normal git tooling."
- **UJ2 — Hand off to an agent:** "point Claude Code at the project's spec file(s) → agent builds or modifies → agent (or CI) runs `spec-yard lint` → architect reviews spec diffs in the design project's own git history/PRs."
- **UJ3 — Learn a system:** "open an existing project → start at the collapsed top level → dive into groups progressively → run a simulation to watch flows → export a diagram image for a doc or discussion."

## 5. Explicit UX/UI decisions already made

Layout / screens:
- **Split-pane core loop:** YAML editor (left) + live Excalidraw diagram (right); "The default view is the simple core (editor + canvas + diagnostics)" (FR14).
- **Left panel** lists discovered `*.spec.yaml` files, openable, with create-new (FR2).
- **Status bar** shows the true file path (replacing the decorative "main.spec.yaml" label) + **dirty-state indicator** (FR3).
- **Save control** wired (FR3); **conflict prompt** ("reload or overwrite") on external edit (FR4).
- **Named views** the UX must mirror: **Code / Tree / Focus / Metrics** editor tabs and **Grid** view and **Layers** view (discovery §B); FR11 explicitly names **Tree, Grid, Focus** views reflecting module membership ("module nodes in the tree, module sections/filters in the grid, membership and exposure editable in Focus").
- **Canvas module rendering:** collapsed module = "single node whose only connection anchor points are its interface, showing aggregate signals (member count, worst diagnostic severity)"; expand reveals members in place (FR10).

Interactions:
- Bidirectional sync: "typing YAML re-renders the diagram; dragging, connecting, renaming, or deleting on the canvas writes back into the YAML."
- Canvas gestures already implemented (discovery §B): drag→x/y writeback, arrow-draw→connection, canvas rename/delete sync, auto-layout (layered BFS), fullscreen, per-type visibility toggles (Layers), orphan markers, ⚠️/❌ diagnostic badges.
- **Quick-fixes:** one-click remediations attached to lint diagnostics; fix-all (index-safe); FR9 mandates the encapsulation-violation quick-fix default = retarget (not expose).
- **Onboarding:** first-run tour/tips on a bundled sample spec, dismissible, "stays dismissed until explicitly re-enabled from Help" (FR13).
- **Progressive disclosure** of advanced surfaces: Metrics/simulator, path comparison, STRIDE detail, layers revealed opt-in (FR14).
- **Empty state:** never a blank editor; bundled sample + guided "create your first component" (FR15).

Terminology decisions (already fixed): "Zero lying UI"; the four component types; module/submodule; interface/exposed member; collapse/expand; dirty state; quick-fix; project folder.

Counter-metrics constraining UX: "first-use tips must be dismissible and stay dismissed; help that nags is worse than no help"; linter signal quality — users must act on diagnostics, not ignore them.

Visual style: **GAP** — no color/typography/visual-identity direction stated beyond "organic sketch rendering" / Excalidraw hand-drawn aesthetic implied by the canvas engine (discovery §A SENTINEL roadmap: "rigid auto-layout + organic sketch rendering"). DESIGN.md visual identity is largely greenfield.

## 6. Domain glossary (canonical — mirror verbatim)

From prd.md §12 Glossary:
- **Spec** — "a `*.spec.yaml` file describing one system; the source of truth."
- **Component** — "the atomic design element; one of four types: **Gateway** (external ingress), **Stage** (processing), **Store** (persistence), **Brick** (utility/sidecar)."
- **Connection** — "a unidirectional, labeled edge from one component to another (`target` + `label`)."
- **Module / submodule** — "named containers of components; the two encapsulation boundaries (FR8). The system root and leaf components are not encapsulation boundaries."
- **Interface (of a module)** — "the subset of member components the module explicitly exposes; the only legal targets for connections from outside (FR9)."
- **Encapsulation violation** — "a connection from outside a module targeting a non-exposed member; a lint error."
- **Project folder** — "the directory opened at launch; home of all specs and generated artifacts (G1). Distinct from any target code repo."
- **Collapse / expand** — "canvas rendering of a module as a single interface-only node vs. its members in place (FR10)."
- **Quick-fix** — "a one-click automated remediation attached to a lint diagnostic."
- **Dirty state** — "unsaved editor changes not yet flushed to the spec file (FR3)."

Additional canonical terms from body/discovery (UX must mirror): **exposed member**; **STRIDE** security pass; the five architectural anti-patterns ("gateway-to-store, store-to-store, brick-to-brick, gateway-to-gateway, stage/brick-to-gateway"); graph-topology checks (BFS islands, circular deps, SPOF/articulation points, overlaps); **packet-flow simulator / Metrics**; **path-comparison**; **Layers**; component metadata fields `{owner, desc, status, color, rate_limit, buffer, throttled, latency, throughput}`; system metadata `{name, owner, description, status, version}`. Terminology drift flagged by rubric review (UX should pick one per concept): "flow" vs "connection" (use **connection**); "workspace" vs "project folder" (use **project folder**); "diagnostics" vs "lint error/warning."

## 7. Out of scope (MVP)

Verbatim from §8:
- "Code generation / code↔spec sync or drift detection" — post-MVP; "'isomorphism with code' is explicitly not claimed."
- "Cloud persistence, accounts, auth" — local-first is the identity.
- "Real-time multi-user collaboration / sharing" — "collaboration happens through git."
- "Nesting beyond two module levels."
- "Named abstract ports (connect to `billing.api` rather than to an exposed component)" — post-MVP; exposed-members model upgrades mechanically.
- "CLI beyond lint" (`render`, `simulate --report`).
- "Import from other formats (Mermaid, Structurizr, D2) and non-image export formats."
- "Monetization / packaging for external users."

## 8. Constraints

- **Stakes: internal tool first.** "internal-tool MVP for an existing working prototype"; next phase decided by adoption. (Not consumer, not regulated — though local-first targets "air-gapped/regulated buyers underserved" per discovery §C.)
- **Platform / form-factor:** local-first desktop-class web app; "operates entirely locally: no telemetry, no network calls with spec content, no accounts" (NFR4). Launch via a single local command; [ASSUMPTION] `npx spec-yard <folder>` or cloned-repo script (OQ2). Built on Next.js + Excalidraw (discovery/addendum). File access confined to the opened project folder (path-traversal guards, root allowlist); local file API rejects cross-origin requests (origin checks / per-session token) — NFR4.
- **Spec integrity is sacred (NFR1):** every YAML write path preserves comments/formatting (AST-based editing, never parse-and-dump); canvas sync must never fabricate ghost components or drop content; "Mid-keystroke invalid YAML never clears the diagram or crashes a consumer."
- **Determinism (NFR2):** identical specs render identical diagrams (deterministic seeds/ids).
- **Backward compatibility (NFR3):** all schema changes additive; every pre-MVP spec stays valid and renders unchanged.
- **Responsiveness (NFR5):** editing fluid at SM1 ceiling ([ASSUMPTION] ~40 components / ~80 connections); "keystroke → updated diagram and diagnostics in [ASSUMPTION] ≤ 150 ms (p95)."
- **Quality (NFR6):** TDD; existing 225+ test suite stays green; new subsystems get their own tests; clean `npm run build` before release. Vertical, independently demoable slices.
- **Docs (NFR7):** README/docs updated to file-based persistence; eliminate the claimed-DB-auto-save contradiction.
- **No telemetry** → measurement is manual/qualitative (dogfooding, structured spec→build experiments).

## 9. Open questions / unresolved concerns (UX will need to resolve)

From prd.md §10 / assumptions relevant to UX:
- **FR14 [ASSUMPTION]** — exact "core" vs "advanced" surface grouping "to be validated with a UX pass during design." **(Owner: UX pass.)**
- **FR15 [ASSUMPTION]** — empty-state form: "template picker vs. single sample" undecided. Rubric flags FR15 as "a menu, not a requirement" (medium). **(Owner: UX pass.)**
- **FR3** — auto-save vs explicit-Save semantics undecided; rubric + adversarial: mandating auto-save + dirty indicator + Save-as-flush together "has no coherent semantics" — decide what the dirty indicator and Save actually mean before locking affordances.
- **OQ4 — Project folder conventions:** subfolder names, and whether a config file (`spec-yard.config.yaml`) holds "UI state such as collapsed modules and dismissed tips, lint severity." Adversarial review argues **FR10 collapsed/expanded state persistence is a product/UX decision misfiled as design detail** — if it lives in the spec it "pollutes the single honest contract" and creates PR diff noise; UX must draw "an explicit line between structural state and view state" (also affects where dismissed-tips / UI state live).
- **G1 × G3 interaction (adversarial):** FR13's onboarding tour "runs on a bundled sample spec" — inside the user's project folder (polluting it) or outside any project (contradicting FR1's one-project model)? Unexamined.
- **FR2 non-happy cases (adversarial):** default-open behavior when `main.spec.yaml` is absent, empty new folder, or read-only folder — unspecified. FR15 "covers greeting, not file creation semantics."
- **FR16 "and/or"** (project-folder save and/or download) — rubric/adversarial: "a requirement with 'and/or' is two requirements or none." UX should specify save vs. download vs. a toggle.
- **FR9 quick-fix design (adversarial):** whether the one-click fix defeats strict interfaces. PRD already fixed the default (retarget, not expose) — UX must present this so "one click must not defeat encapsulation" (retarget primary, expose as explicit secondary).
- **SM4 interpretation (reconcile NOTE):** "onboarding" read as onboarding *to a system designed with Spec-Yard* (UJ3/newcomer), not tool-onboarding; confirm.
- **Terminology to standardize** (rubric): flow/connection, workspace/project folder, diagnostics/lint-error — UX spines must pick one each.
- **GAP:** no visual identity / brand direction stated anywhere (color, type, tone) — DESIGN.md is greenfield.

## 10. Decision trail highlights (.memlog.md, with rationale)

- **Product is human-first:** "views stay simple/trackable via abstraction+encapsulation, with drill-down to detail." (Rationale: humans must track/navigate; drill down to validate/tweak.)
- **Stakes = internal tool first;** next phase decided by adoption. PRD scope = MVP for first internal release.
- **Persistence inverted:** specs become "repo-resident `*.spec.yaml` files (versioned/diffable/PR-reviewable, human+agent editable); app becomes editor/viewer over files; localStorage demoted to fallback; prisma/auth parked-or-deleted." (User brief in addendum §A.)
- **Later refined — Run story:** "spec-yard is a standalone tool, NOT part of the target repo; on launch user opens a project folder where specs + all generated artifacts are saved." (This supersedes addendum §A's repo-resident framing.)
- **AI-agent surface = CLI first;** delegated then resolved to **lint CLI** (CI gate, exit codes); render/simulate CLI post-MVP.
- **UX/onboarding named the MVP weak spot:** "too many buttons, hard to orient; significant effort on UX/UI incl. first-use tutorials/tips (dismissable)." UX scope resolved = **remove decorative controls + progressive disclosure + first-use onboarding/tips.** (Rationale: the options "are good and important" but orientation is the problem — don't cut valued surfaces, only decorative ones.)
- **Isometry softened:** "code edge... post-MVP, and 'isomorphism to code' is an overstatement — vision language should be softer (spec↔diagram sync is the real contract; code is adjacency, not isometry)."
- **Encapsulation sharpened:** "encapsulation = modules with STRICT INTERFACES is the primary design requirement (connect through interfaces, not into internals); visual masking is secondary and may coexist; flat schema confirmed as artifact of current implementation, never a stated requirement."
- **Interface model:** "exposed-member interfaces for MVP; named ports post-MVP with mechanical upgrade path (exposed component → default port); interface-bloat lint warning included."
- **OQ1 resolved — hierarchy depth = TWO module levels** (modules may contain submodules; submodules contain only components). Terminology settled: "'two levels' = two encapsulation boundaries (module, submodule); system root and leaf components are NOT encapsulation boundaries."
- **Success = 4 faces (SM1–SM4):** complexity ceiling; agent-build fidelity (Claude-Code-built vs envisioned); design velocity; onboarding speed for someone new to a system. SM4 confirmed as system-onboarding.
- **Export in MVP:** PNG/SVG, cheap via Excalidraw native export utilities.
- **NFR3 reinterpretation signed off:** "'do not change YAML format' scoped to persistence work; G2 module schema change is additive-only, old specs stay valid."
- **Reviewer gate outcome:** rubric strong (0 crit/high); adversarial 5 top findings; reconciliation 4 nits — all resolved (addendum supersession note, FR4 no-write-over-unread-state rule, SM2 experiment protocol, NFR4 cross-origin guard, FR9 non-weakening quick-fix default, glossary + assumptions index added).
- **Staged internal drops** confirmed: G1 → FR12 decorative-removal → G2 → G3 rest → G4+G5; "cuts slip from bottom; G2 never sacrificed; MVP-complete gate kept for the eval."
