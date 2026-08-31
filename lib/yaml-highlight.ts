import {
  METADATA_KEYS,
  CONNECTION_KEYS,
  COMPONENT_FIELDS,
  VALID_TYPES,
  VALID_STATUSES,
  VALID_COLORS,
} from "./autocomplete"

export type TokenClass =
  | "component-id"
  | "connection-target"
  | "metadata-key"
  | "field-key"
  | "value"
  | "plain"

export interface HighlightToken {
  text: string
  className: TokenClass
}

interface Span {
  start: number
  end: number
  className: TokenClass
}

const stripKey = (k: string) => k.replace(/^-\s*/, "").replace(/:$/, "")

const escapeAlt = (words: string[]) =>
  words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")

const METADATA_KEY_NAMES = METADATA_KEYS.map(stripKey)
const FIELD_KEY_NAMES = Array.from(new Set([...COMPONENT_FIELDS, ...CONNECTION_KEYS].map(stripKey)))
const VALUE_WORDS = new Set<string>([...VALID_TYPES, ...VALID_STATUSES, ...VALID_COLORS])

// Same shape as extractComponentIds' pattern (lib/autocomplete.ts) — an
// "id:" or "target:" line, list-item dash optional, capturing the value.
const ID_LINE_RE = /^\s*(?:-\s*)?id:\s*([a-zA-Z0-9_\-]+)/
const TARGET_LINE_RE = /^\s*(?:-\s*)?target:\s*([a-zA-Z0-9_\-]+)/
const METADATA_KEY_RE = new RegExp(`^\\s*(${escapeAlt(METADATA_KEY_NAMES)})(?=:)`)
const FIELD_KEY_RE = new RegExp(`^\\s*(?:-\\s*)?(${escapeAlt(FIELD_KEY_NAMES)})(?=:)`)
const TRAILING_VALUE_RE = /:\s*([a-zA-Z0-9_\-]+)\s*$/

function captureSpan(line: string, match: RegExpMatchArray, className: TokenClass): Span | null {
  const group = match[1]
  if (group === undefined || match.index === undefined) return null
  const start = match.index + match[0].lastIndexOf(group)
  return { start, end: start + group.length, className }
}

/**
 * Classifies one line of YAML into component id / connection target /
 * metadata key / field key / recognized value spans, degrading to plain
 * text wherever nothing matches. Line-based regex, not a parse — invalid
 * or mid-edit YAML never throws, it just renders uncoloured.
 */
function spansForLine(line: string): Span[] {
  const spans: Span[] = []

  const idMatch = line.match(ID_LINE_RE)
  if (idMatch) {
    const span = captureSpan(line, idMatch, "component-id")
    if (span) spans.push(span)
  }

  const targetMatch = line.match(TARGET_LINE_RE)
  if (targetMatch) {
    const span = captureSpan(line, targetMatch, "connection-target")
    if (span) spans.push(span)
  }

  const metaMatch = line.match(METADATA_KEY_RE)
  if (metaMatch) {
    const span = captureSpan(line, metaMatch, "metadata-key")
    if (span) spans.push(span)
  }

  const fieldMatch = line.match(FIELD_KEY_RE)
  if (fieldMatch) {
    const span = captureSpan(line, fieldMatch, "field-key")
    if (span) spans.push(span)
  }

  const valueMatch = line.match(TRAILING_VALUE_RE)
  if (valueMatch && VALUE_WORDS.has(valueMatch[1])) {
    const span = captureSpan(line, valueMatch, "value")
    if (span && !spans.some((s) => span.start >= s.start && span.start < s.end)) {
      spans.push(span)
    }
  }

  return spans.sort((a, b) => a.start - b.start)
}

export function tokenizeLine(line: string): HighlightToken[] {
  const spans = spansForLine(line)
  if (spans.length === 0) return [{ text: line, className: "plain" }]

  const tokens: HighlightToken[] = []
  let cursor = 0
  for (const span of spans) {
    if (span.start < cursor) continue
    if (span.start > cursor) {
      tokens.push({ text: line.slice(cursor, span.start), className: "plain" })
    }
    tokens.push({ text: line.slice(span.start, span.end), className: span.className })
    cursor = span.end
  }
  if (cursor < line.length) {
    tokens.push({ text: line.slice(cursor), className: "plain" })
  }
  return tokens
}

export function tokenizeSpec(specText: string): HighlightToken[][] {
  return specText.split("\n").map(tokenizeLine)
}
