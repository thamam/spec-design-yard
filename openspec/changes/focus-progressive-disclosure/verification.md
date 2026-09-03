# Verification — focus-progressive-disclosure

Verified on branch `cursor/focus-disclosure-autocomplete-9416` against
`origin/main` @ `ef5922f`. Quality-gate numbers are filled after the
gated run (Task 6).

## What was already true

- **Canvas / tree → Focus auto-switch.**
  `editor-panel.tsx` already calls `setActiveTab("focus")` whenever
  `selectedUnit` is set. Canvas selection and the metrics/tree directory
  set `selectedUnit`. Left alone, as required.
- **Same-line enum / key completions** were already scoped:
  `type:`, `status:`, `color:`, `target:`, metadata keys, connection
  keys, component fields. Same-line `description:` / `owner:` values
  already returned no suggestions. The real eager cases were an empty
  key query on a blank indented line (the popup after Enter, which
  stole Tab-indent) and prefix-matching a metadata key inside a
  `description: |` block scalar.

## What landed

- Focus progressive disclosure (Details, Connections, compiled spec,
  compact connection rows, chips, session-local `useState`).
- Autocomplete quieting: no popup on empty key queries or free-text
  value contexts. Enum completions unchanged.
- New unit tests in `tests/focus-disclosure.test.tsx` and
  `tests/autocomplete.test.ts`. Existing Focus tests adapted to expand
  Details / Edit / Add where a field moved behind a disclosure.
- E2E scenario `focus-disclosure` (`scripts/e2e-focus-disclosure.py`).
  Autocomplete quieting is unit-tested only — asserting the Code-tab
  popup in a real browser is flaky relative to its value (positioning
  depends on caret, overlay, and a race with `onSelect`).
- Living specs updated: `openspec/specs/focus-inspector/spec.md` (new)
  and the new requirement on `openspec/specs/spec-editor/spec.md`.
  Change directory is **not** archived (left to the merge).

## Evidence

| Check | Result |
|---|---|
| `npm test` | pending Task 6 |
| `npm run test:coverage-gate -- origin/main` | pending Task 6 |
| `npm run build` | pending Task 6 |
| `npm run test:e2e focus-disclosure` | pending Task 6 |

Canvas/tree → Focus was verified by reading
`editor-panel.tsx` (the `useEffect` on `selectedUnit`) and
`canvas-panel.tsx` (the two `setActiveTab("focus")` call sites). No
code change on that path.
