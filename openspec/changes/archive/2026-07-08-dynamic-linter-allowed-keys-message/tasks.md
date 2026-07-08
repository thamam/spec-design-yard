# Tasks: Dynamic Linter Messages to Prevent Key-List Drift

We implement this in vertical slices to ensure that tests remain fully passing at each milestone.

- [ ] **Slice 1: Refactor System-Level Diagnostic Messages** <!-- id: slice-1 -->
  - [ ] Update unrecognized system keys message to dynamically output `allowedSystemKeys` sorted.
  - [ ] Update unrecognized system metadata keys message to dynamically output `allowedSysMetaKeys` sorted.
  - [ ] Update unrecognized system metadata status values message to dynamically output `validStatuses` sorted.
  - [ ] Verify local tests still pass.

- [ ] **Slice 2: Refactor Component-Level Diagnostic Messages** <!-- id: slice-2 -->
  - [ ] Update unrecognized component keys message to dynamically output `allowedComponentKeys` sorted.
  - [ ] Update unrecognized component types message to dynamically capitalize, sort, and output `validTypes`.
  - [ ] Update unrecognized component metadata status values message to dynamically output `validStatuses` sorted.
  - [ ] Update unrecognized component metadata color values message to dynamically output `validColors` sorted.
  - [ ] Verify local tests still pass.

- [ ] **Slice 3: Refactor Connection-Level Diagnostic Messages** <!-- id: slice-3 -->
  - [ ] Update unrecognized connection keys message to dynamically output `allowedConnectionKeys` sorted.
  - [ ] Verify local tests still pass.

- [ ] **Slice 4: Verification & Dynamic Set Validation Tests** <!-- id: slice-4 -->
  - [ ] Add explicit unit tests under `tests/linter.test.ts` to verify the actual output of these diagnostic message strings.
  - [ ] Assert that appending an unexpected key or value to any Set/Collection dynamically updates the returned message text in tests without manual code modifications.
  - [ ] Run the complete test suite.
