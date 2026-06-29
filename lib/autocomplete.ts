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

export interface AutocompleteResult {
  suggestions: string[]
  type: "id" | "type" | "field" | "metadata-key" | "metadata-status" | "metadata-color" | "connection-key" | null
  query: string
  replaceRange: [number, number]
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
    const validTypes = ["Store", "Stage", "Brick", "Gateway"]
    
    // Filter suggestions: start with query, limit to 10 max, and filter out exact matches
    const suggestions = validTypes
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
    const validStatuses = ["draft", "active", "deprecated"]
    const suggestions = validStatuses
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
    const validColors = ["indigo", "purple", "emerald", "amber", "rose", "sky", "zinc"]
    const suggestions = validColors
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
  let indentLevel = currentLine.search(/\S/)
  if (indentLevel === -1) indentLevel = 0

  const linesBefore = specText.substring(0, lineStart).split("\n")
  let parentBlock = ""
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

  const currentWordMatch = textBeforeCursor.match(/^\s*([a-zA-Z0-9_\-]*)$/)
  if (currentWordMatch) {
    const query = currentWordMatch[1] || ""
    const queryStart = cursorPosition - query.length

    if (parentBlock === "metadata") {
      const keys = ["owner:", "description:", "status:", "version:", "color:"]
      const suggestions = keys
        .filter((k) => k.toLowerCase().startsWith(query.toLowerCase()) && k !== query)
      return {
        suggestions,
        type: "metadata-key",
        query,
        replaceRange: [queryStart, replaceEnd],
      }
    } else if (parentBlock === "connections") {
      const keys = ["- target:", "target:", "label:"]
      const suggestions = keys
        .filter((k) => k.toLowerCase().startsWith(query.toLowerCase()) && k !== query)
      return {
        suggestions,
        type: "connection-key",
        query,
        replaceRange: [queryStart, replaceEnd],
      }
    } else if (indentLevel >= 4) {
      // Default component property suggestions (requires at least component indentation level)
      const keys = ["id:", "type:", "name:", "connections:", "metadata:"]
      const suggestions = keys
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
