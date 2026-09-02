const INDENT = "  "

export interface IndentResult {
  text: string
  selStart: number
  selEnd: number
}

export interface ApplyIndentOptions {
  outdent?: boolean
}

/**
 * Indents or outdents the current selection by one 2-space unit.
 *
 * Tab with a caret or an in-line selection inserts/replaces literally at
 * the caret (matches plain-textarea Tab behaviour). Shift+Tab, and Tab over
 * a selection spanning multiple lines, instead operate per line: every
 * touched line gains or loses up to 2 leading spaces, selection preserved.
 * No DOM — caller applies the result to a controlled textarea.
 */
export function applyIndent(
  text: string,
  selStart: number,
  selEnd: number,
  options: ApplyIndentOptions = {}
): IndentResult {
  const outdent = options.outdent ?? false
  const spansMultipleLines = text.slice(selStart, selEnd).includes("\n")

  if (!outdent && !spansMultipleLines) {
    const newText = text.slice(0, selStart) + INDENT + text.slice(selEnd)
    const pos = selStart + INDENT.length
    return { text: newText, selStart: pos, selEnd: pos }
  }

  const lineStart = text.lastIndexOf("\n", selStart - 1) + 1
  const lastLineEndsAtBoundary = selEnd > selStart && text[selEnd - 1] === "\n"
  const scanEnd = lastLineEndsAtBoundary ? selEnd - 1 : selEnd
  let lineEnd = text.indexOf("\n", scanEnd)
  if (lineEnd === -1) lineEnd = text.length

  const block = text.slice(lineStart, lineEnd)
  const lines = block.split("\n")

  const lineOffsets: number[] = []
  const lineDeltas: number[] = []
  const removeCounts: number[] = []
  let cursor = lineStart

  const newLines = lines.map((line) => {
    lineOffsets.push(cursor)
    cursor += line.length + 1
    if (outdent) {
      const removeCount = line.startsWith(INDENT) ? 2 : line.startsWith(" ") ? 1 : 0
      removeCounts.push(removeCount)
      lineDeltas.push(-removeCount)
      return line.slice(removeCount)
    }
    removeCounts.push(0)
    lineDeltas.push(INDENT.length)
    return INDENT + line
  })

  const newBlock = newLines.join("\n")
  const newText = text.slice(0, lineStart) + newBlock + text.slice(lineEnd)

  // Maps a caret position by the delta of every line strictly before its
  // own line, plus only the portion of its own line's delta that lands
  // before the position — not the total delta summed across every touched
  // line (which double-counts earlier lines' removals for a later line).
  const mapPosition = (pos: number): number => {
    let ownIdx = 0
    for (let i = 0; i < lineOffsets.length; i++) {
      if (lineOffsets[i] <= pos) ownIdx = i
      else break
    }
    const offsetWithinLine = pos - lineOffsets[ownIdx]
    let cumBefore = 0
    for (let i = 0; i < ownIdx; i++) cumBefore += lineDeltas[i]
    const ownContribution = outdent
      ? -Math.min(removeCounts[ownIdx], offsetWithinLine)
      : INDENT.length
    return Math.max(lineStart, pos + cumBefore + ownContribution)
  }

  return {
    text: newText,
    selStart: mapPosition(selStart),
    selEnd: mapPosition(selEnd),
  }
}
