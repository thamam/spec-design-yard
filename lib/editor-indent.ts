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

  let startDelta = 0
  let runningDelta = 0

  const newLines = lines.map((line, idx) => {
    if (outdent) {
      const removeCount = line.startsWith(INDENT) ? 2 : line.startsWith(" ") ? 1 : 0
      if (idx === 0) startDelta = -removeCount
      runningDelta += -removeCount
      return line.slice(removeCount)
    }
    if (idx === 0) startDelta = INDENT.length
    runningDelta += INDENT.length
    return INDENT + line
  })

  const newBlock = newLines.join("\n")
  const newText = text.slice(0, lineStart) + newBlock + text.slice(lineEnd)

  return {
    text: newText,
    selStart: Math.max(lineStart, selStart + startDelta),
    selEnd: Math.max(lineStart, selEnd + runningDelta),
  }
}
