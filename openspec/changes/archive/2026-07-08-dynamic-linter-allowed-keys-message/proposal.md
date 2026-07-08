# Proposal: Dynamic Linter Messages to Prevent Key-List Drift

## Problem
In our YAML static analyzer (`lib/linter.ts`), several validation rules for unrecognized properties (such as unrecognized system keys, system metadata keys, system status values, component properties, component types, component status values, component metadata colors, and connection properties) use human-readable diagnostic messages with hardcoded lists of "valid options." 

If an engineer or subagent adds, modifies, or deprecates keys in these sets (as we frequently do during evolution loops), they must also remember to manually search and update the hardcoded message strings. Failure to do so leads to **message drift**, where the linter issues obsolete or misleading advice to users and other agents.

## Proposed Solution
We will refactor `lib/linter.ts` to dynamically construct all valid options lists inside diagnostic messages directly from their respective Set or Array definitions (e.g., using `Array.from(collection).sort().join(", ")`). 

This ensures that the message description and the actual validating collections are strictly synchronized by construction at runtime, fully satisfying the linter-defense guideline.

## Scope
- Refactor the diagnostic message generation for:
  1. Unrecognized system-level keys (`allowedSystemKeys`)
  2. Unrecognized system metadata keys (`allowedSysMetaKeys`)
  3. Unrecognized system metadata status values (`validStatuses` for system)
  4. Unrecognized component-level keys (`allowedComponentKeys`)
  5. Unrecognized component type values (`validTypes`)
  6. Unrecognized component metadata status values (`validStatuses` for metadata)
  7. Unrecognized component metadata color values (`validColors`)
  8. Unrecognized connection-level keys (`allowedConnectionKeys`)
- Write unit tests in `tests/linter.test.ts` to verify that dynamic messages are generated correctly and represent the actual validated set.

## Out of Scope
- Adding completely new architectural rules or modifying standard check triggers (only the message string formatting is changed).
- Modifying non-linter codebases or canvas reconciliation code.
