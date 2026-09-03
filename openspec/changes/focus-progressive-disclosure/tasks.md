# Implementation Tasks: Focus progressive disclosure; quieter autocomplete

Each task is a vertical slice: behaviour + tests, independently
verifiable. Diff coverage must be 100% on lines each task adds or
modifies. The full `npm test` suite must be green before a task is
checked off.

- [x] **Task 1: Focus default view + Details disclosure**
  - Selected component: name + type always mounted; owner, status,
    color, version, description, latency, throughput, and ID rename
    unmounted until Details is expanded. Duplicate and Clear stay in
    the header. ID rename is not the first input (it lives in Details,
    after the metadata fields).
  - Nothing-selected: system name always mounted; version / status /
    owner / description unmounted until Details is expanded. After
    "Initialize System Metadata", Details opens so the new fields are
    reachable without a second hunt.
  - Disclosures are real buttons with accessible names and
    `aria-expanded`. Session-local `useState`; reset Details (closed)
    on selection change.
  - Unit tests (write first, red): default view hides the dense
    fields; name + type visible; keyboard activation of Details
    reveals them; ID input absent until Details; nothing-selected
    system name visible and extra metadata not forced open.
  - Adapt: `tests/focus-tab-diagnostics.test.tsx` (name input +
    diagnostics still work), `tests/focus-field-guard.test.tsx`,
    `tests/interactive-simulation-inputs.test.tsx`,
    `tests/component-id-renaming.test.tsx`,
    `tests/system-metadata-editor.test.tsx` (expand Details where
    they now need a field that moved).

- [x] **Task 2: Connections section, chips, compact rows, add control**
  - One Connections section, open by default, with outgoing and
    incoming sublists. Compact rows show target + label; Edit
    reveals label input + Disconnect. "Add connection" /
    "Add incoming" are compact controls that reveal the existing
    forms (testids preserved).
  - Header chips show outgoing/incoming counts; activating a chip
    opens Connections.
  - Connection diagnostic badges remain visible on the compact row
    so `tests/focus-connections-validation.test.tsx` still passes.
  - Unit tests (write first, red): chips show counts; default view
    does not mount add-form selects or label inputs; expanding
    Connections (already open) + Edit / Add reveals them.
  - Adapt: `tests/outgoing-connections-manager.test.tsx`,
    `tests/incoming-connections-manager.test.tsx`.

- [x] **Task 3: Compiled spec disclosure + diagnostics unchanged**
  - Live AST-Reconciled YAML dump is not in the document until
    "Show compiled spec" is opened. Button has an accessible name
    and `aria-expanded`.
  - Diagnostics block still renders when this component has issues;
    quick-fix still applies (`tests/focus-tab-diagnostics.test.tsx`
    stays green, adapted only for layout if needed).
  - Unit tests (write first, red): dump absent by default; present
    after the disclosure is activated.

- [x] **Task 4: Autocomplete stays quiet on free text and blank key lines**
  - `getAutocompleteSuggestions`: key completions (`field`,
    `metadata-key`, `connection-key`) require a non-empty query;
    free-text value contexts (same-line description/owner/name/
    version/label/id, comment lines, block-scalar content) return
    empty. Enum completions on `type:` / `status:` / `color:` /
    `target:` unchanged, including empty query.
  - Existing Tab-indent / Shift+Tab / Enter auto-indent /
    autocomplete-accept tests stay green unmodified.
  - Unit tests (write first, red): no suggestions on an indented
    blank line; no suggestions inside `description: |` content or
    after `description:` / `owner:`; still suggests for `type: S`,
    `status: d`, `color: i`, `target: d`, and `m` as a component
    field.
  - No CodeTab rewrite; no third-party editor.

- [ ] **Task 5: E2E scenario `focus-disclosure`**
  - Add `scripts/e2e-focus-disclosure.py` and wire it in
    `scripts/run-e2e.sh` (own port `BASE_PORT+4`, own throwaway
    project + `SPEC_YARD_CONFIG_DIR`; fail-closed via `e2e_guard`).
  - Real `next dev`, real Chromium: open a spec with a component,
    land on Focus, assert dense fields are not visible, expand
    Details, assert they appear, assert compiled spec is hidden
    until opened.
  - Autocomplete quieting is covered by unit tests, not this
    scenario (the Code-tab popup is flaky to assert in a real
    browser relative to its value). Record that choice in
    `verification.md`.

- [ ] **Task 6: Quality gate**
  - Full `npm test` green; `npm run test:coverage-gate` 100% on
    added/modified lines; `npm run build` clean; e2e
    `focus-disclosure` green (and the existing suite not regressed).
  - Confirm no new `yaml.parse(` write path; no new state library.
  - Merge delta specs into `openspec/specs/<capability>/spec.md`.
    Do not archive the change directory (left to the merge).
  - Record results in `verification.md`.
