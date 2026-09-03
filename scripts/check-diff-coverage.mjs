#!/usr/bin/env node
// Diff-scoped coverage gate: fails the build if any line added or modified in
// this branch (relative to a base ref) is not exercised by the test suite.
// Global coverage is not enforced — this repo has 12k lines of pre-existing
// code a blanket threshold would block on.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { TRACKED_EXTENSIONS, TRACKED_ROOTS, TRACKED_SINGLE_FILES } from './tracked-files.mjs'

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/

/**
 * Decode git's C-style path quoting.
 *
 * Git wraps a path in double quotes and escapes it whenever the bytes are
 * non-ASCII or contain control characters: `+++ "b/lib/caf\303\251.ts"`.
 * Left encoded, the trailing `"` fails the extension test in isTrackedFile and
 * the file drops out of enforcement with no diagnostic at all — the gate goes
 * quiet on exactly the files it exists to check. `core.quotePath=false` (set on
 * the CLI's git invocation) stops the non-ASCII case at source, but git still
 * quotes control characters and `"` regardless, so the decoder stays.
 *
 * Octal escapes are UTF-8 *bytes*, not code points, so they are collected as
 * bytes and decoded together at the end.
 */
export function unquoteGitPath(raw) {
  if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) return raw
  const body = raw.slice(1, -1)
  const bytes = []
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '\\') {
      // A literal character inside the quotes: with core.quotePath=false git
      // emits non-ASCII raw, and a path with a `"` in it is quoted anyway. So
      // push its UTF-8 BYTES, not charCodeAt — that truncated é to 0xE9 and
      // halved every astral character, producing a key findCoverageEntry
      // could never match. Iterate by code point so surrogate pairs stay whole.
      const ch = String.fromCodePoint(body.codePointAt(i))
      i += ch.length - 1
      for (const byte of Buffer.from(ch, 'utf8')) bytes.push(byte)
      continue
    }
    const next = body[++i]
    // git's full C-escape set for a path, not just the common three: a BEL in
    // a filename comes through as `\a`, and decoding it to a literal "a"
    // silently renames the file into a DIFFERENT one's coverage entry.
    if (next === 'a') {
      bytes.push(0x07)
    } else if (next === 'b') {
      bytes.push(0x08)
    } else if (next === 'f') {
      bytes.push(0x0c)
    } else if (next === 'v') {
      bytes.push(0x0b)
    } else if (next === 't') {
      bytes.push(0x09)
    } else if (next === 'n') {
      bytes.push(0x0a)
    } else if (next === 'r') {
      bytes.push(0x0d)
    } else if (next >= '0' && next <= '7') {
      let octal = next
      while (octal.length < 3 && body[i + 1] >= '0' && body[i + 1] <= '7') {
        octal += body[++i]
      }
      bytes.push(parseInt(octal, 8))
    } else {
      // `\\` and `\"` both mean "the escaped character, literally", and so does
      // any escape git may add later. Same UTF-8 treatment as above.
      const ch = String.fromCodePoint(body.codePointAt(i))
      i += ch.length - 1
      for (const byte of Buffer.from(ch, 'utf8')) bytes.push(byte)
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

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
      // Decode before the `b/` strip: git quotes the whole `b/<path>`, so the
      // prefix is inside the quotes.
      const raw = unquoteGitPath(line.slice(4).trim())
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
  if (TRACKED_SINGLE_FILES.includes(filePath)) return true
  return TRACKED_ROOTS.some((root) => filePath.startsWith(root))
}

/**
 * Per-line hit counts for one file's istanbul-shaped coverage entry.
 *
 * EVERY line a statement spans is recorded, not just the line it starts on.
 * istanbul's own line summary counts only start lines, and this gate used to
 * follow it — which left a real hole: a diff touching the middle of an
 * uncovered multi-line statement hit no entry in the map, was treated as "not
 * a checkable point", and passed. A statement's continuation lines are as
 * uncovered as its first line.
 *
 * A line covered by several statements takes the max, so a covered statement
 * on the same line as an uncovered one still reads as covered — the same rule
 * as before, applied to a larger set of lines.
 */
export function fileLineHits(fileCoverageEntry) {
  const lineMap = new Map()
  const statementMap = fileCoverageEntry.statementMap || {}
  const s = fileCoverageEntry.s || {}
  for (const [id, stmt] of Object.entries(statementMap)) {
    const count = s[id] ?? 0
    const first = stmt.start.line
    const last = stmt.end?.line ?? first
    for (let line = first; line <= last; line++) {
      const prev = lineMap.get(line)
      if (prev === undefined || count > prev) lineMap.set(line, count)
    }
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

/** The default base the gate diffs against when argv names none. */
export const DEFAULT_BASE = 'origin/main'

/** Resolve the base ref from the gate's argv (everything after the script). */
export function resolveBase(argv) {
  return (argv && argv[0]) || DEFAULT_BASE
}

/**
 * The real `git diff` the gate runs. Exported and tested for real, because
 * the ignored CLI shim used to own it: a mutation here (a wrong range, a
 * dropped flag) was invisible to every test and to the gate itself.
 *
 * `core.quotePath=false` stops git octal-escaping non-ASCII paths at source;
 * unquoteGitPath still covers the control characters and quotes git escapes
 * regardless of this setting.
 */
export function gitDiff(range, cwd = process.cwd()) {
  return execFileSync('git', ['-c', 'core.quotePath=false', 'diff', '--unified=0', range], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
}

/** The real coverage-report read: the parsed object, or null when absent. */
export function readCoverageFile(repoRoot) {
  const coveragePath = path.join(repoRoot, 'coverage', 'coverage-final.json')
  if (!existsSync(coveragePath)) return null
  return JSON.parse(readFileSync(coveragePath, 'utf8'))
}

/**
 * The gate's whole decision, with every side effect injected so each exit path
 * is reachable from a test. Returns the exit code and never calls
 * process.exit: all of this used to sit inside a `v8 ignore` block, so
 * changing the diff range to `HEAD...HEAD` made the gate pass everything while
 * neither the gate nor its own tests could notice.
 *
 * `argv` is everything after the script name; the base ref is resolved here,
 * not by the caller, so the default is testable too. `diff(range)` returns the
 * diff text or throws; `readCoverage()` returns the parsed coverage JSON or
 * null when the report is missing.
 */
export function runGate({ argv = [], repoRoot, diff, readCoverage, log, error }) {
  const base = resolveBase(argv)
  let diffText
  try {
    diffText = diff(`${base}...HEAD`)
  } catch (err) {
    error(`diff-coverage-gate: failed to diff against ${base}: ${err.message}`)
    return 1
  }

  const trackedFiles = new Map()
  for (const [file, lines] of parseDiffLines(diffText)) {
    if (isTrackedFile(file) && lines.size > 0) trackedFiles.set(file, lines)
  }

  if (trackedFiles.size === 0) {
    log('diff-coverage-gate: no tracked file changes in this diff — nothing to check.')
    return 0
  }

  const coverageJson = readCoverage()
  if (!coverageJson) {
    const coveragePath = path.join(repoRoot, 'coverage', 'coverage-final.json')
    error(
      `diff-coverage-gate: ${coveragePath} not found — run "npx vitest run --coverage" first.`
    )
    return 1
  }

  const uncovered = uncoveredLines(coverageJson, trackedFiles, repoRoot)
  if (uncovered.length === 0) {
    log('diff-coverage-gate: all added/modified lines are covered.')
    return 0
  }

  error(`diff-coverage-gate: ${uncovered.length} added/modified line(s) not covered by tests:`)
  for (const { file, line, reason } of uncovered) {
    error(`  ${file}:${line} — ${reason}`)
  }
  return 1
}

/* v8 ignore start -- the entry-point guard and the process exit, and nothing
   else: argv parsing, the git invocation and the coverage read are all
   exported above and unit-tested against a real repo and a real file. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = process.cwd()
  process.exit(
    runGate({
      argv: process.argv.slice(2),
      repoRoot,
      diff: gitDiff,
      readCoverage: () => readCoverageFile(repoRoot),
      log: console.log,
      error: console.error,
    })
  )
}
/* v8 ignore stop */
