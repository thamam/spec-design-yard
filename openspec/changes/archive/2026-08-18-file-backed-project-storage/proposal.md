# Proposal: File-backed, project-scoped spec storage

## Problem

Spec-yard is a tool for designing a system spec for *some other* project, but
everything it produces is trapped in the tool's own browser localStorage:

- The spec — the valuable artifact — does not live with the project it
  describes. It is invisible to git, unshareable, and lost on cache clear.
- There is no project/workspace dimension: one origin (`localhost:3000`), one
  hardcoded key (`spec_main`). Switching target projects overwrites the
  previous project's spec.
- Launching carries no context: there is no way to say "open spec-yard against
  repo X", so the tool cannot save back to where the work belongs.

## Proposed solution

Introduce an optional, launch-time project binding:

```
SPEC_YARD_PROJECT_DIR=<path-to-client-repo> npm run dev
```

When set, a small Next.js API route (`pages/api/store/[...path].ts`) persists
the store's contents as files inside the client repo:

- `<projectDir>/main.spec.yaml` — the spec, raw YAML text (hand-editable
  outside the tool, committable, diffable)
- `<projectDir>/.specyard/spec-index.json` — title/updatedAt/rev metadata keyed by spec id
- `<projectDir>/.specyard/simulation_history.json` — metrics-tab run history
- `<projectDir>/.specyard/custom_presets.json` — custom simulator presets

Client-side, a `RemoteSyncSpecStore` wraps the existing
`LocalStorageSpecStore` (which becomes a synchronous write-through cache) and
mirrors every write to the server. On mount, one awaited `loadFromServer()`
makes the server file canonical, overriding stale local cache.

When `SPEC_YARD_PROJECT_DIR` is unset, the API route answers
`200 {enabled: false}` (quiet by design — an error status would log to the
browser console on every load) and the client behaves exactly as today
(localStorage-only). No behavior change for the existing standalone workflow.

## Scope

- API route with path-traversal guard and key whitelist
- `RemoteSyncSpecStore` + `loadFromServer` hydration in `workspace-layout.tsx`
- Tests for route, store, and hydration behavior
- Docs: `docs/getting-started.md`, `AGENTS.md` gotchas

## Out of scope

- Multi-spec or multi-project switcher UI (the single `"main"` spec id stays)
- Auth / non-localhost hardening (the route is for local dev use)
- Canvas-layout persistence beyond what already rides in the spec YAML
- Migrating existing localStorage specs into files (manual copy for now)
