#!/usr/bin/env node
// Diff-scoped coverage gate: fails the build if any line added or modified in
// this branch (relative to a base ref) is not exercised by the test suite.
// Global coverage is not enforced — this repo has 12k lines of pre-existing
// code a blanket threshold would block on.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { TRACKED_EXTENSIONS, TRACKED_ROOTS, TRACKED_SINGLE_FILE } from './tracked-files.mjs'

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/

/**
 * Parse `git diff` output (any context width, `--unified=0` or otherwise)
 * into a map of file path -> set of new-file line numbers that were added or
 * modified. Deleted files (new side is /dev/null) are omitted; pure deletion
 * hunks contribute no lines. Context lines advance the new-file line counter
 * without being reported.
 */
export function parseDiffLines(diffText) {
  const result = new Map()
  let currentFile = null
  let newLine = 0
  let inHunk = false

  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git ')) {
      currentFile = null
      inHunk = false
      continue
    }
    // "+++ " / "--- " are file headers only in a diff's header block, which
    // git emits right after "diff --git " and before the first "@@" hunk. An
    // added line whose own content starts with "++ " or "-- " renders as
    // "+++ <content>" / "--- <content>" inside a hunk body — indistinguishable
    // from a header by prefix alone, so gate recognition on hunk state, not
    // on the prefix.
    if (!inHunk && line.startsWith('+++ ')) {
      const raw = line.slice(4).trim()
      if (raw === '/dev/null') {
        currentFile = null
      } else {
        currentFile = raw.startsWith('b/') ? raw.slice(2) : raw
        if (!result.has(currentFile)) result.set(currentFile, new Set())
      }
      continue
    }
    if (!inHunk && line.startsWith('--- ')) {
      continue
    }
    if (line.startsWith('@@')) {
      inHunk = true
      const match = HUNK_HEADER.exec(line)
      if (match) newLine = parseInt(match[1], 10)
      continue
    }
    if (!currentFile) continue
    if (line.startsWith('+')) {
      result.get(currentFile).add(newLine)
      newLine++
    } else if (line.startsWith('-')) {
      // deleted line: does not exist in the new file, does not advance newLine
    } else if (line.startsWith('\\')) {
      // "\ No newline at end of file" — not a real line, does not advance newLine
    } else {
      // context line: unchanged, exists in the new file
      newLine++
    }
  }

  return result
}

/** True if a diff path is one the coverage config (and this gate) tracks. */
export function isTrackedFile(filePath) {
  if (!TRACKED_EXTENSIONS.test(filePath)) return false
  if (filePath === TRACKED_SINGLE_FILE) return true
  return TRACKED_ROOTS.some((root) => filePath.startsWith(root))
}

/**
 * Per-line hit counts for one file's istanbul-shaped coverage entry, using
 * the same rule istanbul-lib-coverage uses for its own line-coverage summary:
 * a line is "executable" if some statement starts there, and its hit count
 * is the max across any statements starting on that line.
 */
export function fileLineHits(fileCoverageEntry) {
  const lineMap = new Map()
  const statementMap = fileCoverageEntry.statementMap || {}
  const s = fileCoverageEntry.s || {}
  for (const [id, stmt] of Object.entries(statementMap)) {
    const line = stmt.start.line
    const count = s[id] ?? 0
    const prev = lineMap.get(line)
    if (prev === undefined || count > prev) lineMap.set(line, count)
  }
  return lineMap
}

function findCoverageEntry(coverageJson, relPath, repoRoot) {
  if (Object.prototype.hasOwnProperty.call(coverageJson, relPath)) {
    return coverageJson[relPath]
  }
  const target = path.resolve(repoRoot, relPath)
  for (const key of Object.keys(coverageJson)) {
    if (path.resolve(repoRoot, key) === target) return coverageJson[key]
  }
  return null
}

/**
 * Cross-reference diff lines against coverage data. A file entirely absent
 * from the coverage report (never loaded by any test) has every one of its
 * diff lines reported — that silence is exactly the case this gate exists to
 * catch, not a reason to skip the file.
 */
export function uncoveredLines(coverageJson, fileLinesMap, repoRoot = process.cwd()) {
  const report = []
  for (const [relPath, lineSet] of fileLinesMap) {
    const sortedLines = [...lineSet].sort((a, b) => a - b)
    const entry = findCoverageEntry(coverageJson, relPath, repoRoot)
    if (!entry) {
      for (const line of sortedLines) {
        report.push({ file: relPath, line, reason: 'no coverage data recorded for this file' })
      }
      continue
    }
    const lineHits = fileLineHits(entry)
    for (const line of sortedLines) {
      if (!lineHits.has(line)) continue
      if (lineHits.get(line) === 0) {
        report.push({ file: relPath, line, reason: 'not covered by any test' })
      }
    }
  }
  return report
}

/* v8 ignore start -- CLI wiring (argv handling, the git diff invocation, reading coverage/coverage-final.json, process exit codes); exercised by the CI job, not by unit tests */
function main() {
  const base = process.argv[2] || 'origin/main'
  const repoRoot = process.cwd()

  let diffText
  try {
    diffText = execFileSync('git', ['diff', '--unified=0', `${base}...HEAD`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (err) {
    console.error(`diff-coverage-gate: failed to diff against ${base}: ${err.message}`)
    process.exit(1)
  }

  const allFiles = parseDiffLines(diffText)
  const trackedFiles = new Map()
  for (const [file, lines] of allFiles) {
    if (isTrackedFile(file) && lines.size > 0) trackedFiles.set(file, lines)
  }

  if (trackedFiles.size === 0) {
    console.log('diff-coverage-gate: no tracked file changes in this diff — nothing to check.')
    process.exit(0)
  }

  const coveragePath = path.join(repoRoot, 'coverage', 'coverage-final.json')
  if (!existsSync(coveragePath)) {
    console.error(
      `diff-coverage-gate: ${coveragePath} not found — run "npx vitest run --coverage" first.`
    )
    process.exit(1)
  }
  const coverageJson = JSON.parse(readFileSync(coveragePath, 'utf8'))

  const uncovered = uncoveredLines(coverageJson, trackedFiles, repoRoot)
  if (uncovered.length === 0) {
    console.log('diff-coverage-gate: all added/modified lines are covered.')
    process.exit(0)
  }

  console.error(`diff-coverage-gate: ${uncovered.length} added/modified line(s) not covered by tests:`)
  for (const { file, line, reason } of uncovered) {
    console.error(`  ${file}:${line} — ${reason}`)
  }
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
/* v8 ignore stop */
