# PRD Addendum — spec-design-yard

Depth that belongs downstream (architecture / design doc / UX spec), preserved verbatim or near-verbatim from discovery.

## A. Repo-resident specs — implementation brief (user-authored, 2026-07-07)

Dox drafted this as a Claude Code prompt before routing through the PRD. It is the seed for the persistence-inversion design doc and its vertical slices.

> **Superseded in part (2026-07-08):** the PRD's G1 refines the model — Spec-Yard is a **standalone tool**, and specs live in a dedicated **project folder** opened at launch, not necessarily inside a target code repo. Read this brief's "repo-resident / inside the target project's repo" framing through that lens. Everything else (file access mechanism, write semantics, external-edit watching, migration/fallback, vertical slices) stands as written.

**Goal:** Make specs first-class, repo-resident artifacts (files over app-storage).

**Context:** spec-design-yard currently persists specs only to browser localStorage (`lib/db.ts` PreviewStorage, single hardcoded doc id "main"); the header Save button is a no-op, the "main.spec.yaml" in the status bar is decorative, there are no API routes, and the Prisma/Postgres + Sign-In scaffolding is unwired. Invert the model: specs are plain `*.spec.yaml` files living inside the target project's repo — versioned, diffable, reviewable in PRs, editable by humans and AI agents alike — and spec-yard becomes an editor/viewer pointed at those files.

**Process:** short design doc first (decision + rationale per point), approval gate, then vertical slices.

**Design must take a position on:**
1. **File access mechanism.** Default assumption: Next API routes (`/api/specs/...`) that list/read/write YAML under a configured workspace root, with path-traversal guards and a root allowlist. Argue for/against alternatives (browser File System Access API; standalone CLI/watcher that syncs) and pick one.
2. **Workspace concept.** How the app is pointed at a project folder (env var / config file / query param); how multiple `*.spec.yaml` files in one repo are discovered, listed, opened from the left panel; `main.spec.yaml` as default.
3. **Write semantics.** Debounced atomic writes vs explicit Save — either way, wire the currently-fake Save button; status-bar filename/breadcrumb shows the real path; dirty-state indicator.
4. **External-edit handling.** Agents will edit the spec file directly while the workspace is open. Watch the file, push changes to the client (SSE or polling); conflict rule for v1: "file changed on disk → prompt to reload or overwrite" is acceptable, but state it explicitly.
5. **Migration & fallback.** One-time export of existing localStorage spec to file; keep localStorage-only mode when no workspace root configured (hosted preview). Decide fate of unwired Prisma/auth scaffolding: park behind explicit flag or delete — no half-wired code paths.

**Constraints:**
- TDD; existing 225-test suite stays green; API routes and file-sync logic get their own tests.
- Vertical slices, each independently demoable: (a) load real file from disk into editor → (b) atomic write-back of edits → (c) multi-file list/picker → (d) external-change watch + live reload.
- Do not change the spec YAML format itself.
- Update README/docs to describe the new persistence model.

## B. Competitive landscape digest (2026-07)

See `discovery-notes.md` §C for the full scan. Key takeaways preserved for positioning sections downstream:
- Defensible wedge: typed, lintable YAML + true bidirectional canvas + flow simulation, local-first — no competitor ships all three.
- Structurizr cloud EOL (Sept 2026) validates local-first for architecture artifacts.
- Closest neighbors: Ilograph (YAML→interactive, one-way), Eraser.io (code+canvas sync, cloud SaaS, proprietary DSL), LikeC4 (rising, "AI-agent-friendly architecture-as-code").
- Simulation-on-a-spec is an empty intersection; existing simulators are interview-prep toys without a durable spec format.
