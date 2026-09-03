# spec-editor Specification

## Purpose

The YAML authoring surface of the workspace: the keyboard behaviour of the
spec textarea (indentation, auto-indent, autocomplete acceptance), its syntax
colouring, and the line-ending and write discipline that keep caret offsets,
spec text, and the file on disk in one coordinate space.

## Requirements

### Requirement: Tab key behaviour

With the suggestion popup open, Tab SHALL apply the highlighted suggestion.
With the popup closed, Tab SHALL insert a 2-space indent at the caret and
Shift+Tab SHALL remove up to 2 leading spaces from the current line; when the
selection spans multiple lines, Tab and Shift+Tab SHALL indent/outdent every
selected line and preserve the selection. After the user presses Esc, the next
Tab SHALL move focus out of the textarea (keyboard escape hatch); any other
keystroke or edit SHALL disarm that escape, a bare modifier keydown (Shift,
Control, Alt, Meta) excepted, so that Esc then Shift+Tab escapes backwards.

#### Scenario: Tab indents at the caret

- GIVEN the spec textarea is focused and the suggestion popup is closed
- WHEN the user presses Tab
- THEN 2 spaces are inserted at the caret position
- AND focus remains in the textarea

#### Scenario: Shift+Tab outdents a multi-line selection

- GIVEN a selection spanning three lines, each indented at least 2 spaces
- WHEN the user presses Shift+Tab
- THEN each of the three lines loses 2 leading spaces
- AND the selection still covers the same lines

#### Scenario: Autocomplete accept on Tab is preserved

- GIVEN the suggestion popup is open with a highlighted suggestion
- WHEN the user presses Tab
- THEN the highlighted suggestion is applied at the replace range
- AND no indent is inserted

#### Scenario: Esc then Tab escapes the editor

- GIVEN the spec textarea is focused
- WHEN the user presses Esc and then Tab
- THEN focus moves out of the textarea per the browser default
- AND no indent is inserted

#### Scenario: Esc then Shift+Tab escapes backwards

- GIVEN the spec textarea is focused
- WHEN the user presses Esc and then Shift+Tab (Shift's own keydown arrives first)
- THEN focus moves out of the textarea per the browser default
- AND no outdent is applied

### Requirement: Enter key behaviour

With the suggestion popup open and arrow-navigated, Enter SHALL apply the
highlighted suggestion. In every other case Enter SHALL insert a newline whose
leading indent matches the correct YAML depth for the new line: one level
(2 spaces) deeper than the current line when it opens a block — including a
`- key: value` list-item line, whose new line aligns one level under the key
(not under the dash), so a sibling mapping key can follow — otherwise, for a
line with no trailing colon, the current line's own indent. The indent SHALL be
computed by the indent/parent-block detector shared with autocomplete — not by
a second implementation.

#### Scenario: Enter after a block-opening line indents one level deeper

- GIVEN the caret is at the end of a line reading `  metadata:` (2-space indent)
- WHEN the user presses Enter
- THEN the new line begins with 4 spaces and the caret sits after them

#### Scenario: Enter after a connections list-item line aligns under the key

- GIVEN the caret is at the end of a line reading `      - target: digest_stage`
  (6-space indent)
- WHEN the user presses Enter
- THEN the new line begins with 8 spaces, aligned under `target` so a
  sibling `label:` key can follow

#### Scenario: Enter after a component list-item line aligns under the key

- GIVEN the caret is at the end of a line reading `    - id: inbox` (4-space indent)
- WHEN the user presses Enter
- THEN the new line begins with 6 spaces, aligned under `id` so a sibling
  `type:` key can follow

#### Scenario: Navigated suggestion still applies on Enter

- GIVEN the suggestion popup is open and the user has pressed ArrowDown
- WHEN the user presses Enter
- THEN the highlighted suggestion is applied
- AND no bare newline is inserted

### Requirement: Syntax colouring

The editor SHALL render component ids, connection targets, and metadata
keys in visually distinct colours, implemented as a highlight overlay (a
styled backdrop behind a transparent-text textarea, kept in scroll sync) —
the `<textarea>` SHALL remain the input element, keeping its id
(`spec-textarea`), test ids, `data-focus-field` attribute, and disabled
hydration lockout unchanged. When the text is not parseable as the expected
YAML shape, the overlay SHALL degrade to uncoloured text and SHALL NOT
obstruct editing.

#### Scenario: Token classes are visually distinct

- GIVEN a spec containing a component id, a connection target, and a
  metadata key
- WHEN the editor renders
- THEN each of the three tokens has a distinct colour, different from the
  body text

#### Scenario: Overlay stays aligned while scrolling

- GIVEN a spec longer than the visible editor viewport
- WHEN the user scrolls the textarea
- THEN the overlay scroll position matches the textarea scroll position
- AND the coloured text stays exactly behind the (transparent) typed text

#### Scenario: Invalid YAML degrades gracefully

- GIVEN the user is mid-edit and the text is not valid YAML
- WHEN the editor renders
- THEN the text remains fully visible and editable, uncoloured where it
  cannot be classified

### Requirement: Line endings

Spec text SHALL be normalised to LF (`\n`) at the point where it enters
application state, so the editor's caret offsets and the spec text share one
coordinate space. Every line terminator — `\r\n` and a lone `\r` — becomes
`\n`. Keystroke handlers SHALL NOT translate between coordinate spaces, and
SHALL NOT synthesise any other line terminator.

#### Scenario: A CRLF project file loads as LF

- GIVEN a project whose `main.spec.yaml` uses CRLF line endings
- WHEN the workspace hydrates from it
- THEN the spec text held in application state contains no carriage return
- AND what is saved back to the project contains none either

#### Scenario: Indenting a spec that was authored with CRLF

- GIVEN a CRLF-authored spec that has been loaded
- WHEN the user puts the caret at the end of a line and presses Tab
- THEN the indent is inserted at the end of that line, not inside it
- AND the saved spec still contains no carriage return

### Requirement: YAML write discipline

Any code path that writes YAML SHALL use `yaml.parseDocument`, and SHALL NOT
use `yaml.parse`, so that user comments survive round-trips (product
invariant per `AGENTS.md`).

#### Scenario: Comments survive editor-driven writes

- GIVEN a spec containing a `# comment` line
- WHEN an editor behaviour causes the YAML to be rewritten
- THEN the comment is still present in the resulting text

### Requirement: Test coverage for editor behaviours

Every behaviour added to or modified in the spec editor SHALL be covered by
a unit test, and every user-visible behaviour SHALL additionally be covered
by a full-system e2e scenario (real `next dev`, real Chromium, real project
folder, per `scripts/run-e2e.sh`). Diff coverage SHALL be 100% on the lines
a change adds or modifies.

#### Scenario: Key behaviours verified end to end

- GIVEN the full-system e2e suite runs against a real project folder
- WHEN the Tab-indent, Enter-auto-indent, and syntax-colour scenarios execute
- THEN each passes in a real browser against the running app

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

