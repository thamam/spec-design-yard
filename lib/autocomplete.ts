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
  type: "id" | "type" | null
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

  const targetMatch = textBeforeCursor.match(/target:\s*['"]?([a-zA-Z0-9_\-]*)$/)
  const typeMatch = textBeforeCursor.match(/type:\s*['"]?([a-zA-Z0-9_\-]*)$/)

  if (targetMatch) {
    const query = targetMatch[1] || ""
    const allIds = extractComponentIds(specText)
    const suggestions = allIds.filter((id) => id.toLowerCase().startsWith(query.toLowerCase()))
    const queryStart = cursorPosition - query.length
    return {
      suggestions,
      type: "id",
      query,
      replaceRange: [queryStart, cursorPosition],
    }
  }

  if (typeMatch) {
    const query = typeMatch[1] || ""
    const validTypes = ["Store", "Stage", "Brick", "Gateway"]
    const suggestions = validTypes.filter((t) => t.toLowerCase().startsWith(query.toLowerCase()))
    const queryStart = cursorPosition - query.length
    return {
      suggestions,
      type: "type",
      query,
      replaceRange: [queryStart, cursorPosition],
    }
  }

  return defaultResult
}
