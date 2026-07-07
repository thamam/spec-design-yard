# OpenSpec — Spec-Driven Development for spec-design-yard

This directory is the spec layer for all development on this project. Every
agent (Sentinel, Claude, or any other) and every human contributor follows the
procedure below for every change. It is tool-agnostic: no special CLI or slash
commands are required, only these file conventions.

## Directory Structure

```
openspec/
├── specs/                     # Living capability specs (current truth)
│   └── <capability>/
│       └── spec.md
└── changes/                   # Active changes
    ├── <change-id>/           # One directory per change (kebab-case)
    │   ├── proposal.md        # Problem, solution, scope, out-of-scope
    │   ├── design.md          # Decisions + rationale + rejected alternatives
    │   ├── tasks.md           # Implementation checklist (vertical slices)
    │   ├── linkages.json      # Requirement → design → task trace links
    │   └── specs/             # Delta specs for this change
    │       └── <capability>/
    │           └── spec.md
    └── archive/               # Completed changes
        └── <yyyy-mm-dd>-<change-id>/
```

## Per-Change Procedure

Applies to every feature, fix, or behavior change. Exempt: typo and
doc-only commits.

1. Create `openspec/changes/<change-id>/` (kebab-case, e.g.
   `file-backed-spec-persistence`).
2. Write `proposal.md` — the problem, the proposed solution, scope, and what
   is explicitly out of scope.
3. Write `design.md` — each key technical decision with its rationale and the
   alternative that was rejected.
4. Write `tasks.md` — a checklist in vertical slices, each independently
   demoable or verifiable.
5. Write delta specs (format below) for every capability the change touches.
6. Write `linkages.json` (schema below) tracing requirements to design
   decisions to tasks.
7. Implement per `tasks.md`, checking off tasks as they complete. The full
   test suite must be green before a task is marked done.
8. Verify the implementation against the delta specs; record the result in
   the change directory (e.g. `verification.md`).
9. On completion: merge the deltas into `openspec/specs/<capability>/spec.md`
   and move the change directory to `openspec/changes/archive/<yyyy-mm-dd>-<change-id>/`.

## Gates

- **Interactive sessions**: stop after `proposal.md` + `design.md` and wait
  for the maintainer's approval before implementing.
- **Autonomous/cron runs**: complete all artifacts and the implementation on
  a feature branch; put the proposal summary at the top of the PR
  description; never merge to main autonomously.
- Spec artifacts always travel in the same branch/PR as the code they
  describe.

## Spec Format

Living specs (`openspec/specs/<capability>/spec.md`):

```markdown
# <capability> Specification

## Purpose
One sentence: what this capability does and why it exists.

## Requirements

### Requirement: <requirement-name>

The system SHALL <behavior>.

#### Scenario: <scenario-name>

- GIVEN <precondition>
- WHEN <action or event>
- THEN <expected outcome>
```

Keywords: `SHALL` (mandatory), `SHOULD` (recommended), `MAY` (optional),
`SHALL NOT` (prohibited).

Delta specs (`openspec/changes/<id>/specs/<capability>/spec.md`) show only
what the change adds, modifies, or removes:

```markdown
# Delta for <capability>

## ADDED Requirements

### Requirement: <new-requirement>
The system SHALL <new behavior>.

## MODIFIED Requirements

### Requirement: <existing-requirement>
- OLD: The system SHALL <old behavior>.
+ NEW: The system SHALL <new behavior>.

## REMOVED Requirements

### Requirement: <removed-requirement>
~~The system SHALL <removed behavior>.~~
```

### Brownfield Rule

Much of this codebase pre-dates OpenSpec and has no living spec. When a
change touches such behavior, first capture the current behavior — as the
`OLD:` side of a MODIFIED requirement, or as explicit baseline requirements —
verified against the actual code, never from assumption. This is how the
legacy system gets specced over time: lazily, one change at a time. Untouched
areas remain unspecced by design; the spec tree maps what has been
deliberately worked on since adoption, not the whole system.

## linkages.json Schema

```json
{
  "change": "<change-id>",
  "links": [
    {
      "requirement": "<capability>/<requirement-name>",
      "design": "<design.md section heading>",
      "tasks": ["<task checklist item text or number>"]
    }
  ]
}
```

## Naming Conventions

Capability names are lowercase, hyphenated, matching the feature area, e.g.
`spec-persistence`, `canvas-sync`, `yaml-linter`, `metrics-simulation`.
One spec file per capability; split capabilities that grow beyond ~150 lines.
