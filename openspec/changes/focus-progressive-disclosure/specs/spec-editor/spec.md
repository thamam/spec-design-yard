# Delta for spec-editor

## ADDED Requirements

### Requirement: Suggestion popup stays off free-text and blank key lines

The Code-tab suggestion popup SHALL open only for a closed vocabulary
the user is completing: component type, status, color, metadata keys,
connection keys, or existing component ids as connection targets. It
SHALL NOT open while the user is typing a free-text value
(description, owner, name, version, label, arbitrary id) or a
comment, and SHALL NOT open for an empty key query (a blank indented
line). Esc SHALL still dismiss. Tab-indent, Shift+Tab outdent, and
Enter auto-indent SHALL remain when the popup is closed. Tab SHALL
still accept the highlighted suggestion when the popup is open.

#### Scenario: No popup on a blank indented line

- GIVEN the caret is on a whitespace-only line inside a component
  block
- WHEN autocomplete runs
- THEN it returns no suggestions

#### Scenario: No popup inside a description value

- GIVEN the caret is after `description: ` on the same line, or
  inside a `description: |` block-scalar body
- WHEN the user types a word that prefixes a metadata key (e.g.
  `owner`)
- THEN autocomplete returns no suggestions

#### Scenario: Popup still offers type and status

- GIVEN the caret is after `type: S` or `status: d` or `color: i`
- WHEN autocomplete runs
- THEN the matching closed-set values are suggested

#### Scenario: Popup still offers a typed metadata key

- GIVEN the caret is on `        o` inside a metadata block
- WHEN autocomplete runs
- THEN `owner:` is suggested
