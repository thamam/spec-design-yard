# Delta for yaml-linter

## ADDED Requirements

### Requirement: dynamic-system-keys-messages
The system SHALL dynamically list allowed keys in the diagnostic warning message when an unrecognized system-level key or unrecognized system metadata key/status is detected.
- GIVEN a spec with an unrecognized key under `system` or `system.metadata`
- WHEN the linter evaluates the spec text
- THEN the returned warning message MUST dynamically match the sorted contents of the active allowed keys/statuses.

### Requirement: dynamic-component-keys-messages
The system SHALL dynamically list allowed keys/statuses/colors in the diagnostic warning/info message when an unrecognized component-level key, component metadata status, or component metadata color is detected.
- GIVEN a spec with an unrecognized key/status/color in a component or its metadata
- WHEN the linter evaluates the spec text
- THEN the returned warning/info message MUST dynamically match the sorted contents of the active allowed component keys/statuses/colors.

### Requirement: dynamic-connection-keys-messages
The system SHALL dynamically list allowed keys in the diagnostic warning message when an unrecognized connection key is detected.
- GIVEN a spec with an unrecognized key in a connection block
- WHEN the linter evaluates the spec text
- THEN the returned warning message MUST dynamically match the sorted contents of the active allowed connection keys.

### Requirement: dynamic-capitalized-types-messages
The system SHALL dynamically capitalize and list the validated component types in the diagnostic warning message when an unrecognized component type is detected.
- GIVEN a spec with an unrecognized component type
- WHEN the linter evaluates the spec text
- THEN the returned warning message MUST dynamically list the sorted PascalCase names of all allowed types (e.g. `Brick, Gateway, Stage, Store`).

### Requirement: dynamic-verification-tests
The system SHALL include unit tests that prove that diagnostic messages for unrecognized keys and values automatically update whenever the allowed sets are modified.
