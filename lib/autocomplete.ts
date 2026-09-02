export function extractComponentIds(specText: string): string[] {
  const ids: string[] = []
  // Matches lines like "    - id: inbox" or "      id: digest_stage"
  const regex = /^\s*(?:-\s*)?id:\s*([a-zA-Z0-9_\-]+)/gm
  let match
  while ((match = regex.exec(specText)) !== null) {
    if (match[1]) {
      const trimmed = match[1].trim()
      if (ids.indexOf(trimmed) === -1) {
        ids.push(trimmed)
      }
    }
  }
  return ids
}

/**
 * Shared vocabularies, reused by both autocomplete suggestions and the
 * syntax-highlight overlay (lib/yaml-highlight.ts). Keep these as the one
 * source of truth — two copies would drift.
 */
export const VALID_TYPES = ["Store", "Stage", "Brick", "Gateway"]
export const VALID_STATUSES = ["draft", "active", "deprecated"]
export const VALID_COLORS = ["indigo", "purple", "emerald", "amber", "rose", "sky", "zinc"]
/**
 * Every metadata key a spec may use. THE registry: the linter validates
 * against it (lib/linter.ts) and the highlighter colours from it
 * (lib/yaml-highlight.ts). It previously lived only in the linter, so a valid
 * `latency: 50` linted clean and rendered plain — two lists, silently drifting.
 */
export const ALLOWED_METADATA_KEYS = [
  "owner", "description", "status", "version", "color",
  "rate_limit", "rate_limiting", "rateLimit", "rateLimiting", "rate-limit", "rate-limiting",
  "throttled", "throttling", "buffer",
  "latency", "throughput",
]

/**
 * What the suggestion popup offers: a deliberately curated SUBSET of
 * ALLOWED_METADATA_KEYS — six spellings of rate-limit in a popup is not a
 * feature. tests/yaml-highlight.test.ts enforces the subset relationship, so
 * this cannot quietly become a second registry again.
 */
export const METADATA_KEYS = ["owner:", "description:", "status:", "version:", "color:"]
export const CONNECTION_KEYS = ["- target:", "target:", "label:"]
export const COMPONENT_FIELDS = ["id:", "type:", "name:", "connections:", "metadata:"]

export interface AutocompleteResult {
  suggestions: string[]
  type: "id" | "type" | "field" | "metadata-key" | "metadata-status" | "metadata-color" | "connection-key" | null
  query: string
  replaceRange: [number, number]
}

export interface IndentContext {
  /** Leading whitespace count of the line at cursorPosition (0 for a blank line). */
  indentLevel: number
  /** Nearest enclosing block, found by scanning backward for a less-indented line. */
  parentBlock: "metadata" | "connections" | "component" | ""
  /** True when the current line's trimmed text ends with ":" — a block-opening key. */
  opensBlock: boolean
}

/**
 * Detects the indentation level and enclosing YAML block for the line at
 * cursorPosition. Shared by autocomplete (which block's keys to suggest)
 * and Enter auto-indent (how deep the next line should start) — see
 * design.md Decision 2. The backward-scan classification has non-obvious
 * cases (list items at indent >= 6 are connections); do not reimplement it.
 */
export interface DetectIndentOptions {
  /**
   * What a whitespace-only line reports as its indent.
   *
   * "literal" (default) — its own length. Right for Enter: the user is sitting
   * inside that indent and the next line should continue it, not drop to
   * column 0.
   *
   * "zero" — 0, which is what `origin/main`'s inline autocomplete detector
   * did. Autocomplete passes this: the extraction was meant to share one
   * implementation, not to change what the popup offers, and reporting the
   * literal indent made `system:\n    ` offer component-field completions
   * where `main` offered none.
   */
  blankLine?: "literal" | "zero"
  /**
   * Decide the indent and `opensBlock` from the text BEFORE the cursor only.
   *
   * Enter passes this: the text after the caret moves to the new line, so it
   * cannot be what decides whether the line being split opens a block. With
   * `  metadata:|owner: Tomer` the whole line does not end in a colon, but the
   * half the user is leaving behind does, and `owner:` should land nested.
   */
  upToCursor?: boolean
}

export function detectIndentContext(
  specText: string,
  cursorPosition: number,
  options: DetectIndentOptions = {}
): IndentContext {
  const lineStart = specText.lastIndexOf("\n", cursorPosition - 1) + 1
  const lineEndIdx = specText.indexOf("\n", cursorPosition)
  const lineEnd = lineEndIdx === -1 ? specText.length : lineEndIdx
  const fullLine = specText.substring(lineStart, lineEnd)
  const currentLine = options.upToCursor
    ? fullLine.slice(0, Math.max(0, cursorPosition - lineStart))
    : fullLine

  // A whitespace-only line (mid-edit blank inside a block) has no non-space
  // char for /\S/ to find. Fall back to the line's own length rather than 0
  // — the user is sitting inside that indent and Enter should continue it,
  // not drop them to column 0.
  let indentLevel = currentLine.search(/\S/)
  if (indentLevel === -1) {
    indentLevel = options.blankLine === "zero" ? 0 : currentLine.length
  }

  const linesBefore = specText.substring(0, lineStart).split("\n")
  let parentBlock: IndentContext["parentBlock"] = ""
  for (let i = linesBefore.length - 1; i >= 0; i--) {
    const line = linesBefore[i]
    const trimmed = line.trim()
    if (trimmed === "") continue
    const lineIndent = line.search(/\S/)
    if (lineIndent < indentLevel) {
      if (trimmed.startsWith("metadata:")) {
        parentBlock = "metadata"
        break
      }
      if (trimmed.startsWith("connections:")) {
        parentBlock = "connections"
        break
      }
      if (trimmed.startsWith("-") || trimmed.includes("id:")) {
        if (trimmed.startsWith("-") && !trimmed.includes("id:") && lineIndent >= 6) {
          parentBlock = "connections"
        } else {
          parentBlock = "component"
        }
        break
      }
    }
  }

  const trimmed = stripComment(currentLine).trim()
  // A list-item mapping entry ("- id: inbox") opens a mapping too: its
  // sibling keys (type:, name:, ...) align two spaces under the dash, i.e.
  // under "id", not under "-".
  // Three ways a line says "what follows belongs inside me":
  //   `metadata:`            a mapping key
  //   `description: |`       a block scalar (with optional chomping `-`/`+`
  //                          and an explicit indent digit: `|2-`)
  //   `- id: inbox`          a list item that is itself a mapping — but NOT
  //                          `- "key: value"`, which is one quoted string in
  //                          a sequence and opens nothing.
  const opensBlock =
    trimmed.endsWith(":") ||
    /:\s*[|>][0-9+-]*\s*$/.test(trimmed) ||
    (/^-\s+\S+:(\s|$)/.test(trimmed) && !/^-\s+["']/.test(trimmed))

  return { indentLevel, parentBlock, opensBlock }
}

/**
 * Strips a trailing "# ..." comment, ignoring a "#" inside a quoted scalar.
 *
 * YAML starts a comment at "#" only where it begins the line or follows
 * whitespace — `a#b` is an ordinary scalar. Cutting at any unquoted "#" left
 * `a#b:` as `a`, hiding the colon, so the key never opened its block.
 */
function stripComment(line: string): string {
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inSingle) {
      if (ch === "'") inSingle = false
      continue
    }
    if (inDouble) {
      if (ch === "\\") i++
      else if (ch === '"') inDouble = false
      continue
    }
    if (ch === "'") inSingle = true
    else if (ch === '"') inDouble = true
    else if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i)
  }
  return line
}

export function getAutocompleteSuggestions(specText: string, cursorPosition: number): AutocompleteResult {
  const defaultResult: AutocompleteResult = {
    suggestions: [],
    type: null,
    query: "",
    replaceRange: [cursorPosition, cursorPosition],
  }

  if (cursorPosition < 0 || cursorPosition > specText.length) {
    return defaultResult
  }

  // Find line start and end relative to cursor
  const lineStart = specText.lastIndexOf("\n", cursorPosition - 1) + 1
  const lineEnd = specText.indexOf("\n", cursorPosition) === -1 ? specText.length : specText.indexOf("\n", cursorPosition)
  const currentLine = specText.substring(lineStart, lineEnd)
  const cursorInLine = cursorPosition - lineStart
  const textBeforeCursor = currentLine.substring(0, cursorInLine)

  // Use word boundaries \b to avoid matching prototype: or on_target:
  const targetMatch = textBeforeCursor.match(/\btarget:\s*['"]?([a-zA-Z0-9_\-]*)$/)
  const typeMatch = textBeforeCursor.match(/\btype:\s*['"]?([a-zA-Z0-9_\-]*)$/)
  const statusMatch = textBeforeCursor.match(/\bstatus:\s*([a-zA-Z0-9_\-]*)$/)
  const colorMatch = textBeforeCursor.match(/\bcolor:\s*([a-zA-Z0-9_\-]*)$/)

  // Support cursor-inside-word by extending replaceRange to the end of the current word token
  const textAfterCursor = currentLine.substring(cursorInLine)
  const trailingWordMatch = textAfterCursor.match(/^([a-zA-Z0-9_\-]+)/)
  const trailingLength = trailingWordMatch ? trailingWordMatch[1].length : 0
  const replaceEnd = cursorPosition + trailingLength

  if (targetMatch) {
    const query = targetMatch[1] || ""
    const allIds = extractComponentIds(specText)
    
    // Filter suggestions: must start with query, limit to 10 max, and filter out exact matches to avoid redundant popup
    const suggestions = allIds
      .filter((id) => id.toLowerCase().startsWith(query.toLowerCase()) && id !== query)
      .slice(0, 10)

    const queryStart = cursorPosition - query.length
    return {
      suggestions,
      type: "id",
      query,
      replaceRange: [queryStart, replaceEnd],
    }
  }

  if (typeMatch) {
    const query = typeMatch[1] || ""

    // Filter suggestions: start with query, limit to 10 max, and filter out exact matches
    const suggestions = VALID_TYPES
      .filter((t) => t.toLowerCase().startsWith(query.toLowerCase()) && t !== query)
      .slice(0, 10)

    const queryStart = cursorPosition - query.length
    return {
      suggestions,
      type: "type",
      query,
      replaceRange: [queryStart, replaceEnd],
    }
  }

  if (statusMatch) {
    const query = statusMatch[1] || ""
    const suggestions = VALID_STATUSES
      .filter((s) => s.toLowerCase().startsWith(query.toLowerCase()) && s !== query)
      .slice(0, 10)

    const queryStart = cursorPosition - query.length
    return {
      suggestions,
      type: "metadata-status",
      query,
      replaceRange: [queryStart, replaceEnd],
    }
  }

  if (colorMatch) {
    const query = colorMatch[1] || ""
    const suggestions = VALID_COLORS
      .filter((c) => c.toLowerCase().startsWith(query.toLowerCase()) && c !== query)
      .slice(0, 10)

    const queryStart = cursorPosition - query.length
    return {
      suggestions,
      type: "metadata-color",
      query,
      replaceRange: [queryStart, replaceEnd],
    }
  }

  // Detect indentation and parent block context
  // "zero": preserve main's autocomplete behaviour on a whitespace-only line.
  const { indentLevel, parentBlock } = detectIndentContext(specText, cursorPosition, {
    blankLine: "zero",
  })

  const currentWordMatch = textBeforeCursor.match(/^\s*([a-zA-Z0-9_\-]*)$/)
  if (currentWordMatch) {
    const query = currentWordMatch[1] || ""
    const queryStart = cursorPosition - query.length

    if (parentBlock === "metadata") {
      const suggestions = METADATA_KEYS
        .filter((k) => k.toLowerCase().startsWith(query.toLowerCase()) && k !== query)
      return {
        suggestions,
        type: "metadata-key",
        query,
        replaceRange: [queryStart, replaceEnd],
      }
    } else if (parentBlock === "connections") {
      const suggestions = CONNECTION_KEYS
        .filter((k) => k.toLowerCase().startsWith(query.toLowerCase()) && k !== query)
      return {
        suggestions,
        type: "connection-key",
        query,
        replaceRange: [queryStart, replaceEnd],
      }
    } else if (indentLevel >= 4) {
      // Default component property suggestions (requires at least component indentation level)
      const suggestions = COMPONENT_FIELDS
        .filter((k) => k.toLowerCase().startsWith(query.toLowerCase()) && k !== query)
      return {
        suggestions,
        type: "field",
        query,
        replaceRange: [queryStart, replaceEnd],
      }
    }
  }

  return defaultResult
}
