# Discovery Notes — spec-design-yard PRD (2026-07-07)

Source: three parallel discovery scans (docs, code, market). Condensed digests for resume/reference.

---

## A. Product identity & vision (from docs)

- **Identity** (README, docs/): "Spec-Yard" — an interactive visual workspace for defining, analyzing, and simulating system architectures. YAML spec → linted → rendered as interactive Excalidraw diagram → simulated (packet traffic).
- **Vision** (SENTINEL.md, "Project Manifesto"): the **Blueprint-First Thesis** — downstream AI systems (PRD gen, task breakdown, codegen, test gen) are bottlenecked by *blueprint drift*; if the blueprint (spec + diagram) stays tightly synchronized and honest, translation to code becomes trivial and AI-driven changes stay scoped. Top priority: "perfect bidirectional synchronization" and evolving both interfaces (spec editor + canvas) to "elite, world-class standard."
- **SENTINEL roadmap vectors**: (1) Elite Spec Editor (autocomplete, inline validation, smooth Raw↔Tree↔Focus transitions); (2) Elite Diagram Canvas (rigid auto-layout + organic sketch rendering, rich gestures); (3) Strict AST Reconciliation Layer ("Contract Mediator") — lossless canvas↔YAML translation, no comment loss.
- **Personas (impressionistic, per sketch READMEs)**: PMs/eng leads/architects (shareable docs); software architects/DevOps power users (visual IDE); microservice/K8s/DDD architects (nested complexity); designers+devs (whiteboard feel). Implicit primary consumer: **downstream AI agents**.
- **OpenSpec scaffolding initialized but empty** (no living specs/changes). design-artifacts/ dirs empty. Demo video exists (docs/demo/spec-yard-demo.mp4, no transcript).

## B. Implemented capability inventory (from code)

**Core loop**: split-pane; YAML editor left, live Excalidraw diagram right; keystroke-level parse+lint+recompile; bidirectional — canvas drag/connect/rename/delete/add writes back to YAML via AST-preserving reconciler (comments/formatting intact).

- **Editor tabs**: Code (line numbers, inline click-to-jump diagnostics, context-aware autocomplete), Tree (searchable hierarchy explorer), Focus (property/metadata editor, connections manager, duplication, quick-fixes, system metadata editor), Metrics (simulator).
- **Canvas**: type-styled nodes, orphan markers, ⚠️/❌ diagnostic badges, drag→x/y writeback, arrow-draw→connection, canvas rename/delete sync, auto-layout (layered BFS), fullscreen, Grid view (card directory: search/filter/sort/inline-rename/duplicate/delete/quick-fixes), Layers view (per-type visibility toggles).
- **Linter**: 40+ rules — structural, connection integrity, 5 architectural anti-patterns (gateway-to-store, store-to-store, brick-to-brick, gateway-to-gateway, stage/brick-to-gateway), graph topology (BFS islands, circular deps, SPOF/articulation points, overlaps), **full STRIDE security pass**. Quick-fixes for nearly every rule incl. fix-all (index-safe) and STRIDE remediations (insert auth verifier, audit ledger, rate_limit).
- **Simulator/Metrics**: packet streaming along traced paths; loss %/speed/playback controls; presets (built-in + custom, persisted); per-path latency/throughput/success; path-comparison tool with routing recommendations; system-health analytics (coupling rating, hotspots, SPOF); post-run report; persistent history with JSON/CSV export.
- **Domain model**: `system{name, metadata{owner,description,status,version}, components[]}`; component `{id, type: Gateway|Stage|Store|Brick, name, x, y, metadata{owner,desc,status,color,rate_limit,buffer,throttled,latency,throughput}, connections[{target,label}]}`. Unidirectional connections.
- **Persistence**: localStorage only, debounced auto-save, resilient hydration.
- **Undo/redo**: keystroke grouping (800ms debounce), immediate push for structural changes, 100-entry cap.

**Real vs decorative**:
- Heavily tested & polished: linter, reconciler, simulator (~35 test files, 225+ tests, defensive coding).
- Mock/unwired: auth (accepts any email, no backend), Prisma/Postgres schema (nothing imports it), header Save/Play/Share/Settings/Terminal buttons decorative, Preview tool no-op, editor-panel.tsx ~4,500 lines (accretion).
- **Docs contradiction**: features-and-workspace.md claims DB auto-save with login; reality is localStorage-only.

**Absences**: no real auth, multi-user, cloud persistence, sharing, spec versioning/snapshots, multiple files/projects, spec import/export, diagram image export, server/API, freehand annotation persistence.

**Trajectory (git)**: linter+reconciler foundation → STRIDE/SPOF analysis depth → big simulator/metrics push → grid/layers navigation → stability fixes → docs modularization + OpenSpec init. AI-agent-driven, adversarial-review-gated development style.

## C. Market landscape (2025–2026)

- **Diagrams-as-code (crowded, mostly free OSS)**: Mermaid (LLM-native default, no semantic model), PlantUML (legacy), D2 (best layout, no interactivity), Structurizr/C4 (**cloud EOL Sept 2026 — teams won't upload architecture to SaaS; validates local-first**), LikeC4 (rising, "AI-agent-friendly architecture-as-code" — watch), Ilograph (closest structural neighbor: YAML→interactive diagrams, one-way only, $18/mo Pro), Eraser.io (closest positioning competitor: AI + code+canvas sync, cloud SaaS, proprietary DSL, $10–25/user/mo), IcePanel (GUI-first C4 SaaS ~$15/user/mo), Multiplayer.app (architecture observability from OTel — future integration angle, not design-time competitor).
- **Canvas tools**: Excalidraw's own Mermaid conversion is one-way, link severed after convert; tldraw is an SDK a competitor could build on ($10M Series A); Miro/FigJam Mermaid embeds not editable (users filing feature requests for exactly this).
- **Simulation**: NO mainstream architecture-doc tool simulates flow/load/capacity. Existing simulators are indie interview-prep toys (SysSimulator, SyDe, Paperdraw) — drag-drop-first, no durable spec format.
- **Open intersections**: (1) true bidirectional text↔canvas round-trip; (2) local-first (air-gapped/regulated buyers underserved); (3) simulation on a lintable spec. **No tool ships all three; spec-design-yard already has all three.**
- **Trends**: diagrams-as-code mainstream (ThoughtWorks Trial ring); AI generation table stakes, buyers now demand *engineering accuracy* → lint layer is a credibility feature; LLM-friendliness of the spec format is a marketable feature; local-first resurgence.

## D. PRD gaps needing user input

1. Primary audience: human architects vs downstream AI agents — which leads?
2. Stakes: hobby / internal / launch.
3. Scope of this PRD: whole product vs next phase.
4. Success metrics / KPIs — none documented.
5. Persistence/auth/collab intent: is cloud aspiration real, or is local-first the identity? (Docs vs code contradiction must be resolved.)
6. The AI-consumer story: what export/API/integration surface (MCP? file convention? CLI?) feeds downstream AI.
7. Monetization / open-source strategy — silent everywhere.
8. NFRs: scale targets, performance, accessibility — silent.
