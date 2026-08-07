import yaml from "yaml"

/**
 * The shared shape of a parsed system spec, and the single place where the
 * YAML text is turned into it.
 *
 * The spec is authored by hand, so every field is optional and unknown keys are
 * allowed: `parseSpec` must survive whatever is in the editor mid-keystroke.
 */

export interface SpecConnection {
  target?: string
  label?: string
  [key: string]: any
}

export interface SpecComponent {
  id?: string
  name?: string
  type?: string
  x?: number
  y?: number
  connections?: (string | SpecConnection)[]
  metadata?: Record<string, any>
  [key: string]: any
}

export interface Spec {
  system?: {
    name?: string
    components?: SpecComponent[]
    [key: string]: any
  }
  [key: string]: any
}

export interface ParseSpecResult {
  /** The sanitized spec, or null when the text is not a YAML object. */
  spec: Spec | null
  /** The YAML syntax error message, or null when the text parsed. */
  error: string | null
}

// Mid-keystroke YAML like a bare "- " parses to null list entries; every
// consumer (FocusTab, linter, canvas compiler) assumes object entries, and a
// render throw unmounts the whole workspace. Strip them at the parse boundary.
// String-form connections ("- digest") are stripped here too: mid-keystroke
// text inside a connections list parses as a string on every keystroke, so the
// parse boundary keeps only { target } objects. normalizeConnections still
// accepts the string form for specs built in memory (tests, tooling).
function sanitizeParsedSpec(parsed: any): Spec {
  const components = parsed?.system?.components
  if (!Array.isArray(components)) return parsed
  return {
    ...parsed,
    system: {
      ...parsed.system,
      components: components
        .filter((c: any) => c && typeof c === "object" && !Array.isArray(c))
        .map((c: any) =>
          Array.isArray(c.connections)
            ? { ...c, connections: c.connections.filter((conn: any) => conn && typeof conn === "object" && !Array.isArray(conn)) }
            : c
        ),
    },
  }
}

/**
 * Parse and sanitize spec text. A non-object document (empty text, a bare
 * scalar) yields `spec: null` with no error — it is not a syntax problem, there
 * is just nothing usable yet.
 */
export function parseSpec(text: string): ParseSpecResult {
  try {
    const parsed = yaml.parse(text)
    if (parsed && typeof parsed === "object") {
      return { spec: sanitizeParsedSpec(parsed), error: null }
    }
    return { spec: null, error: null }
  } catch (e: any) {
    return { spec: null, error: e?.message || "Invalid YAML syntax" }
  }
}

export interface NormalizedConnection {
  target: string
  /** Empty string when the connection carries no label. */
  label: string
  /** Index in the component's raw `connections` array, for spec paths. */
  originalIdx: number
}

/**
 * A connection is either a bare target string or a `{ target, label }` object.
 * This is the single place that rule lives; entries without a usable string
 * target are dropped.
 */
export function normalizeConnections(component: SpecComponent | any): NormalizedConnection[] {
  const conns = Array.isArray(component?.connections) ? component.connections : []
  const normalized: NormalizedConnection[] = []
  conns.forEach((conn: any, originalIdx: number) => {
    if (typeof conn === "string") {
      normalized.push({ target: conn, label: "", originalIdx })
    } else if (conn && typeof conn === "object" && typeof conn.target === "string") {
      normalized.push({ target: conn.target, label: conn.label || "", originalIdx })
    }
  })
  return normalized
}
