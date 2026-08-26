---
title: Spec-Yard MVP — Internal Release PRD
status: draft
created: 2026-07-07
updated: 2026-07-07
---

# Spec-Yard MVP — Internal Release PRD

## 1. Product overview

**Spec-Yard** is a local-first visual IDE for system architecture. An architect describes a system in a human-readable YAML spec (components typed as Gateway / Stage / Store / Brick, connected by labeled directional flows) and works with it through a live, bidirectionally-synced Excalidraw diagram: typing YAML re-renders the diagram; dragging, connecting, renaming, or deleting on the canvas writes back into the YAML without destroying comments or formatting. Around this core loop sit a 40+ rule architectural linter (structural, connection-integrity, anti-pattern, graph-topology, and STRIDE security checks — most with one-click quick-fixes) and a packet-flow simulator (traffic playback, per-path latency/throughput analysis, bottleneck and single-point-of-failure detection, exportable run reports).

**The organizing principle is human capability.** Every view stays simple enough for a person to track and navigate; abstraction and encapsulation shape the flow; detail is always one dive-down away for validation or tweaking. The spec↔diagram pair is a single honest contract — neither side is ever allowed to drift from the other.

Specs written in Spec-Yard are deliberately agent-friendly: plain versioned YAML files that AI agents can read and write directly, and that can be handed to a coding agent (e.g., Claude Code) as the blueprint to build from. Deriving or verifying code against the spec is a post-MVP direction, not an MVP capability.

## 2. Problem & context

Architecture knowledge today lives in stale diagrams, whiteboard photos, and heads. Text-to-diagram tools (Mermaid, D2, Structurizr) render pictures but are one-way — edit the picture and the text is orphaned. Whiteboard tools (Miro, Excalidraw) are expressive but semantically empty — nothing validates, nothing simulates, nothing feeds automation. No mainstream tool combines a typed, lintable spec with an editable canvas and flow simulation, and the market is moving away from cloud-hosting architecture artifacts (Structurizr's cloud EOL is explicit evidence). Spec-Yard already occupies that empty intersection.

**The current state of the product blocks real use.** The mature core (editor, canvas sync, linter, simulator — ~225 tests) is trapped behind prototype scaffolding:

- Specs persist only to browser localStorage under a single hardcoded document id. There is no file on disk, nothing to version, diff, review, or hand to an agent.
- The header Save/Share/Settings buttons are decorative; the "main.spec.yaml" in the status bar is fiction; the Prisma/auth scaffolding is unwired.
- The schema is flat — no grouping or containment — so a system of real size becomes one undifferentiated sprawl, contradicting the abstraction-first principle.
- The UI has accreted many buttons and surfaces with no orientation layer; a new user cannot discover what the tool can do or how to use it.

This PRD defines the MVP that removes those blockers for a first internal release.

## 3. Goals & success metrics

The MVP succeeds when internal architects design real systems in Spec-Yard by choice. "How well it goes" is judged on four faces (thresholds are working targets, to be calibrated during the internal phase):

| #   | Metric                                                                                                                     | Working target                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| SM1 | **Complexity ceiling** — size of a system an architect can design and still navigate confidently                           | `[ASSUMPTION]` ≥ 40 components across ≥ 2 abstraction levels without the diagram becoming unnavigable  |
| SM2 | **Agent-build fidelity** — when the spec is handed to Claude Code to build, how close the result is to what was envisioned | `[ASSUMPTION]` ≥ 80% of components/connections realized as intended without needing spec clarification |
| SM3 | **Design velocity** — time for an architect to take a new system from blank project to lint-clean spec                     | `[ASSUMPTION]` ≤ 1 hour for a 10–15 component system                                                   |
| SM4 | **Onboarding speed** — time for someone new to a system to understand its architecture through Spec-Yard                   | `[ASSUMPTION]` ≤ 15 minutes to correctly answer flow/dependency questions about an unfamiliar spec     |

**Counter-metrics** (what must not degrade while chasing the above):

- **Zero spec-corruption incidents** — no lost comments, mangled formatting, or ghost components from canvas sync. One corruption erases trust in the honest-contract premise.
- **Linter signal quality** — quick-fix adoption should stay high; if users start ignoring diagnostics, rule precision is failing.
- **Onboarding friction** — first-use tips must be dismissible and stay dismissed; help that nags is worse than no help.

Measurement is manual/qualitative during the internal phase (dogfooding sessions, structured spec→build experiments). The tool ships no telemetry — see NFR4.

## 4. Users & primary workflows

**Primary: the architect** (internal software architects and engineering leads). Designs and evolves systems in the workspace; owns the spec files.

**Secondary: the AI agent** (Claude Code and similar). Reads and edits `*.spec.yaml` files directly in the project folder while the workspace may be open; consumes specs as build blueprints; runs the CLI linter as a gate.

**Tertiary: the newcomer** (engineer joining a system). Opens an existing project read-mostly, navigates hierarchy and simulation to build a mental model fast.

Primary workflows the MVP must serve end-to-end:

- **UJ1 — Design a system**: launch Spec-Yard → open/create a project folder → author spec via editor and canvas interchangeably → lint-clean it with quick-fixes → simulate flows to sanity-check capacity/bottlenecks → commit the spec files with normal git tooling.
- **UJ2 — Hand off to an agent**: point Claude Code at the project's spec file(s) → agent builds or modifies → agent (or CI) runs `spec-yard lint` → architect reviews spec diffs in the PR like any code change.
- **UJ3 — Learn a system**: open an existing project → start at the collapsed top level → dive into groups progressively → run a simulation to watch flows → export a diagram image for a doc or discussion.

## 5. MVP scope

The MVP = existing mature core (editor, bidirectional canvas, linter, simulator) **plus** five feature groups: project-folder persistence (G1), lightweight hierarchy (G2), UX overhaul (G3), diagram export (G4), and a lint CLI (G5). Everything else is out of scope (§8).

## 6. Functional requirements

### G1 — Project workspace & file persistence

Specs become first-class files on disk. Spec-Yard is a **standalone tool, separate from any target repo**: launching it opens a *project folder* — the single home for the specs and every artifact the tool generates (simulation reports, exports). The folder is plain files; users version it with git if and however they choose.

- **FR1 — Open/create project folder.** On launch, the user opens an existing project folder or creates a new one. The app operates on exactly one project at a time. `[ASSUMPTION]` Launch mechanism: a single local command (e.g., `npx spec-yard <folder>` or equivalent) that starts the local app pointed at the folder; exact packaging is a design-doc decision.
- **FR2 — Spec file discovery & switching.** All `*.spec.yaml` files in the project folder are discovered, listed in the left panel, and openable; `main.spec.yaml` is the default on first open. Creating a new spec file from the UI is supported.
- **FR3 — Real write semantics.** Edits persist to the actual file with atomic writes. The Save control is wired (no-op today), a dirty-state indicator shows unsaved changes, and the status bar shows the true file path instead of the current decorative label. `[ASSUMPTION]` Auto-save (debounced) with Save as an explicit flush — final semantics decided in the design doc.
- **FR4 — External-edit handling.** The app watches the open file; when it changes on disk (e.g., an agent edited it), the change is surfaced to the user. v1 conflict rule, explicitly: *file changed on disk while local edits pending → prompt to reload or overwrite*. No silent clobbering in either direction.
- **FR5 — Migration & fallback.** One-time export of the existing localStorage spec into a project file on first run. A localStorage-only mode remains when no project folder is configured (hosted-preview scenario).
- **FR6 — No half-wired code paths.** The unwired Prisma/Postgres and mock sign-in scaffolding is either parked behind an explicit flag or deleted (design-doc decision). Nothing in the shipped UI implies a capability that doesn't exist.
- **FR7 — Generated artifacts live in the project.** Simulation reports, history exports, and diagram exports save into the project folder (not browser downloads only). `[ASSUMPTION]` A conventional subfolder layout (e.g., `reports/`, `exports/`) — design-doc decision.

### G2 — Hierarchy & abstraction

The flat schema contradicts the product's core principle. The MVP adds *some* hierarchy — deliberately not full-blown recursive nesting.

- **FR8 — Grouping construct in the schema.** A component can belong to a named group (subsystem). `[ASSUMPTION]` Single level of grouping — groups contain components, not other groups. The schema change is additive and backward-compatible: every existing spec remains valid and renders as today.
- **FR9 — Collapse/expand on canvas.** A group renders as a single collapsed node showing aggregate signals (member count, worst diagnostic severity); expanding reveals members in place. Connections crossing a collapsed boundary render at the group edge. Collapsed/expanded state persists per spec.
- **FR10 — Hierarchy everywhere.** Tree, Grid, and Focus views reflect group membership (group nodes in the tree, group filter/sections in the grid, group assignment editable in Focus).
- **FR11 — Analysis respects hierarchy.** Linter and simulator operate on the full flat graph underneath (correctness is never computed on the collapsed abstraction); diagnostics and simulation activity roll up onto collapsed groups so problems inside a collapsed group stay visible.

### G3 — Orientation & UX overhaul

The tool's capabilities outgrew its discoverability. The MVP invests in orientation as a feature, applying the product's own abstraction principle to its UI.

- **FR12 — Remove decorative controls.** Every control that does nothing today (fake Save behavior, Share, Settings, Play, Terminal, branch pill, no-op Preview tool) is either wired to real behavior in this MVP or removed. Zero lying UI.
- **FR13 — First-use onboarding.** A guided first-run experience (tour or contextual tips) introduces the core loop — spec ↔ canvas ↔ lint ↔ simulate — on a bundled sample spec. Appears on first use, dismissible, stays dismissed until explicitly re-enabled from Help.
- **FR14 — Progressive disclosure.** The default view is the simple core (editor + canvas + diagnostics). Advanced surfaces (Metrics/simulator, path comparison, STRIDE detail, layers) are present but revealed opt-in rather than all competing at once. `[ASSUMPTION]` Exact grouping of "core" vs "advanced" surfaces to be validated with a UX pass during design.
- **FR15 — Purposeful empty state.** A brand-new project greets the user with a meaningful starting point (template picker / sample spec / guided "create your first component"), not a blank editor.

### G4 — Export

- **FR16 — Diagram image export.** Export the current diagram view (respecting collapsed groups and layer visibility) as PNG and SVG, saved into the project folder (FR7) and/or downloaded. `[ASSUMPTION]` Built on Excalidraw's native export utilities — low implementation cost.

### G5 — Agent & CI surface

Files-in-repo already make agents first-class spec editors; the CLI adds the headless gate. (Scope decision delegated to and made by the PRD process: lint first, everything else later.)

- **FR17 — `spec-yard lint` CLI.** Lints one or more spec files headlessly with the same rule engine as the app: non-zero exit on errors, human-readable output, plus a machine-readable format (`[ASSUMPTION]` JSON) for CI and agents. Severity threshold configurable (e.g., fail on error vs. warning).

## 7. Non-functional requirements

- **NFR1 — Spec integrity is sacred.** Every YAML write path preserves comments and formatting (AST-based editing, never parse-and-dump). Canvas sync must never fabricate ghost components or drop user content. Mid-keystroke invalid YAML never clears the diagram or crashes a consumer.
- **NFR2 — Determinism.** Identical specs render identical diagrams across sessions and machines (deterministic seeds/ids); recompiles don't churn the scene.
- **NFR3 — Backward compatibility.** All schema changes in this MVP are additive; every pre-MVP spec remains valid and renders unchanged.
- **NFR4 — Local-first, no exfiltration.** The tool operates entirely locally: no telemetry, no network calls with spec content, no accounts. File access is confined to the opened project folder (path-traversal guards, root allowlist).
- **NFR5 — Responsiveness at target scale.** Editing stays fluid (keystroke → updated diagram and diagnostics without perceptible lag) at the SM1 complexity ceiling (`[ASSUMPTION]` ~40 components / ~80 connections).
- **NFR6 — Quality discipline.** TDD; the existing 225+ test suite stays green; new subsystems (file API, watcher, hierarchy, CLI) ship with their own tests; clean `npm run build` before any release.
- **NFR7 — Docs tell the truth.** README and docs are updated to the file-based persistence model and hierarchy; the current docs/code contradiction (claimed DB auto-save) is eliminated.

## 8. Out of scope (MVP)

- **Code generation / code↔spec sync or drift detection** — post-MVP direction; "isomorphism with code" is explicitly not claimed. Agent-build fidelity is measured (SM2), not automated.
- **Cloud persistence, accounts, auth** — local-first is the identity; Prisma/auth scaffolding is parked or deleted (FR6).
- **Real-time multi-user collaboration / sharing** — collaboration happens through git.
- **Full recursive nesting** — one grouping level only (FR8); deeper hierarchy is a post-MVP candidate.
- **CLI beyond lint** — `render`, `simulate --report` etc. are post-MVP.
- **Import from other formats** (Mermaid, Structurizr, D2) and non-image export formats.
- **Monetization / packaging for external users** — internal phase decides what's next.

## 9. Release criteria

1. All FRs implemented; every `[ASSUMPTION]` in this document either confirmed or consciously revised.
2. Test suite green (existing + new); clean build; the app boots against a fresh project folder in one command.
3. UJ1–UJ3 each demoable end-to-end by someone other than the author.
4. Docs updated (NFR7); demo/sample project bundled.

## 10. Open questions

- **OQ1 — Hierarchy depth.** Single-level grouping is assumed (FR8). Confirm one level is enough for the internal phase, or whether groups-in-groups is needed sooner.
- **OQ2 — Launch packaging.** `npx`-style command, cloned-repo script, or packaged binary (FR1) — decide in the persistence design doc.
- **OQ3 — Metric thresholds.** SM1–SM4 working targets need calibration once the first internal users are named.
- **OQ4 — Project folder conventions.** Subfolder layout for generated artifacts (FR7) and whether the project folder carries any config file.

## 11. Further notes

- The persistence inversion (G1) has a user-authored implementation brief with design decision points and vertical slices — see `addendum.md` §A. It is the intended input to the design doc that precedes implementation.
- Competitive positioning evidence (why this intersection is empty and worth holding) — see `addendum.md` §B and `discovery-notes.md` §C.
- Development follows the project's existing conventions: conventional commits, adversarial review before merge, screenshot CI stays green.
