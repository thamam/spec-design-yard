import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  parseDiffLines,
  isTrackedFile,
  fileLineHits,
  uncoveredLines,
  unquoteGitPath,
  runGate,
  resolveBase,
  gitDiff,
  readCoverageFile,
  DEFAULT_BASE,
} from '../scripts/check-diff-coverage.mjs'

describe('parseDiffLines', () => {
  it('collects every line of a brand-new file as added', () => {
    const diff = `diff --git a/lib/new-file.ts b/lib/new-file.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/lib/new-file.ts
@@ -0,0 +1,3 @@
+export function add(a, b) {
+  return a + b;
+}
`
    const result = parseDiffLines(diff)
    expect([...result.get('lib/new-file.ts')].sort((a, b) => a - b)).toEqual([1, 2, 3])
  })

  it('records a single-line modification at its new-file line number', () => {
    const diff = `diff --git a/lib/foo.ts b/lib/foo.ts
index abc123..def456 100644
--- a/lib/foo.ts
+++ b/lib/foo.ts
@@ -5 +5 @@ export function foo() {
-  return 1
+  return 2
`
    const result = parseDiffLines(diff)
    expect([...result.get('lib/foo.ts')]).toEqual([5])
  })

  it('produces no added lines for a deletions-only hunk', () => {
    const diff = `diff --git a/lib/bar.ts b/lib/bar.ts
index abc123..def456 100644
--- a/lib/bar.ts
+++ b/lib/bar.ts
@@ -10,3 +9,0 @@ function bar() {
-  console.log('a')
-  console.log('b')
-  console.log('c')
`
    const result = parseDiffLines(diff)
    expect(result.get('lib/bar.ts').size).toBe(0)
  })

  it('accumulates added lines across multiple hunks in one file', () => {
    const diff = `diff --git a/lib/baz.ts b/lib/baz.ts
index abc123..def456 100644
--- a/lib/baz.ts
+++ b/lib/baz.ts
@@ -2,0 +3,2 @@ function baz() {
+  const x = 1
+  const y = 2
@@ -10 +12 @@ function qux() {
-  return x
+  return x + y
`
    const result = parseDiffLines(diff)
    expect([...result.get('lib/baz.ts')].sort((a, b) => a - b)).toEqual([3, 4, 12])
  })

  it('records no lines for a pure rename with unchanged content', () => {
    const diff = `diff --git a/lib/old-name.ts b/lib/new-name.ts
similarity index 100%
rename from lib/old-name.ts
rename to lib/new-name.ts
`
    const result = parseDiffLines(diff)
    expect(result.has('lib/new-name.ts')).toBe(false)
  })

  it('attributes lines to the new path when a rename also changes content', () => {
    const diff = `diff --git a/lib/old2.ts b/lib/new2.ts
similarity index 90%
rename from lib/old2.ts
rename to lib/new2.ts
index abc123..def456 100644
--- a/lib/old2.ts
+++ b/lib/new2.ts
@@ -20 +20 @@ function thing() {
-  return false
+  return true
`
    const result = parseDiffLines(diff)
    expect(result.has('lib/old2.ts')).toBe(false)
    expect([...result.get('lib/new2.ts')]).toEqual([20])
  })

  it('does not carry a deleted file into the result', () => {
    const diff = `diff --git a/lib/gone.ts b/lib/gone.ts
deleted file mode 100644
index abc123..0000000
--- a/lib/gone.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const gone = true
-export const alsoGone = false
`
    const result = parseDiffLines(diff)
    expect(result.has('lib/gone.ts')).toBe(false)
  })

  it('keeps an added line attributed to its real file when the line content starts with "++ "', () => {
    // An added line whose own content begins with "++ " is rendered by git as
    // "+++ <content>" — indistinguishable from a "+++ b/path" file header by
    // prefix alone. This must not be mistaken for a new file header mid-hunk.
    const diff = `diff --git a/lib/foo.ts b/lib/foo.ts
index abc123..def456 100644
--- a/lib/foo.ts
+++ b/lib/foo.ts
@@ -1,0 +2,3 @@
+first line
+++ line starting with plus plus
+third line
`
    const result = parseDiffLines(diff)
    expect(result.has('line starting with plus plus')).toBe(false)
    expect([...result.get('lib/foo.ts')].sort((a, b) => a - b)).toEqual([2, 3, 4])
  })

  it('advances the new-file line number across context lines instead of only additions', () => {
    const diff = `diff --git a/lib/qux.ts b/lib/qux.ts
index abc123..def456 100644
--- a/lib/qux.ts
+++ b/lib/qux.ts
@@ -1 +1,3 @@
 context line
+added at 2
+added at 3
`
    const result = parseDiffLines(diff)
    expect([...result.get('lib/qux.ts')].sort((a, b) => a - b)).toEqual([2, 3])
  })

  it('ignores a "no newline at end of file" marker without advancing the line counter', () => {
    const diff = `diff --git a/lib/nl.ts b/lib/nl.ts
index abc123..def456 100644
--- a/lib/nl.ts
+++ b/lib/nl.ts
@@ -1 +1 @@
-old line
\\ No newline at end of file
+new line
\\ No newline at end of file
`
    const result = parseDiffLines(diff)
    expect([...result.get('lib/nl.ts')]).toEqual([1])
  })
})

describe('parseDiffLines — git C-quoted paths', () => {
  // Git quotes any path with non-ASCII bytes or control characters. Left
  // quoted, the trailing `"` defeats the `\.(ts|tsx|mjs)$` test in
  // isTrackedFile and the file drops out of enforcement with no diagnostic.
  it('decodes an octal-escaped UTF-8 path and still tracks it', () => {
    const diff = [
      'diff --git "a/lib/caf\\303\\251.ts" "b/lib/caf\\303\\251.ts"',
      'new file mode 100644',
      'index 0000000..1234567',
      '--- /dev/null',
      '+++ "b/lib/caf\\303\\251.ts"',
      '@@ -0,0 +1,2 @@',
      '+export const x = 1',
      '+export const y = 2',
      '',
    ].join('\n')

    const result = parseDiffLines(diff)
    expect([...result.keys()]).toEqual(['lib/café.ts'])
    expect([...result.get('lib/café.ts')].sort((a, b) => a - b)).toEqual([1, 2])
    expect(isTrackedFile('lib/café.ts')).toBe(true)
  })

  it('decodes an escaped double quote in a path', () => {
    const diff = [
      'diff --git "a/lib/sa\\"y.ts" "b/lib/sa\\"y.ts"',
      'index abc123..def456 100644',
      '--- "a/lib/sa\\"y.ts"',
      '+++ "b/lib/sa\\"y.ts"',
      '@@ -1 +1 @@',
      '+export const z = 3',
      '',
    ].join('\n')

    const result = parseDiffLines(diff)
    expect([...result.keys()]).toEqual(['lib/sa"y.ts'])
    expect(isTrackedFile('lib/sa"y.ts')).toBe(true)
  })

  it('decodes backslash, tab, newline and carriage-return escapes', () => {
    // All legal in a POSIX filename, and all quoted by git regardless of
    // core.quotePath, which is why the decoder cannot be dropped.
    expect(unquoteGitPath('"b/lib/a\\\\b.ts"')).toBe('b/lib/a\\b.ts')
    expect(unquoteGitPath('"b/lib/a\\tb.ts"')).toBe('b/lib/a\tb.ts')
    expect(unquoteGitPath('"b/lib/a\\nb.ts"')).toBe('b/lib/a\nb.ts')
    expect(unquoteGitPath('"b/lib/a\\rb.ts"')).toBe('b/lib/a\rb.ts')
  })

  it('keeps a literal non-ASCII character whole, bytes and all', () => {
    // Real git under core.quotePath=false quotes a path containing `"` and
    // emits its non-ASCII characters LITERALLY inside those quotes:
    //     +++ "b/lib/sa\"y-café.ts"
    //     +++ "b/lib/emoji🔥\"x.ts"
    // Pushing charCodeAt truncated é to one byte and halved the astral
    // character, so isTrackedFile still said true while findCoverageEntry
    // could never match the key — the gate then failed closed on a fully
    // covered file, naming a path nobody could find.
    expect(unquoteGitPath('"b/lib/sa\\"y-café.ts"')).toBe('b/lib/sa"y-café.ts')
    expect(unquoteGitPath('"b/lib/emoji🔥\\"x.ts"')).toBe('b/lib/emoji🔥"x.ts')
    expect(unquoteGitPath('"b/lib/日本語\\tx.ts"')).toBe('b/lib/日本語\tx.ts')
  })

  it('leaves an unquoted path exactly as it is', () => {
    expect(unquoteGitPath('b/lib/plain.ts')).toBe('b/lib/plain.ts')
    expect(unquoteGitPath('/dev/null')).toBe('/dev/null')
  })
})

describe('isTrackedFile', () => {
  it('accepts .ts/.tsx/.mjs files under the coverage-config roots', () => {
    expect(isTrackedFile('lib/foo.ts')).toBe(true)
    expect(isTrackedFile('components/workspace/Workspace.tsx')).toBe(true)
    expect(isTrackedFile('pages/index.tsx')).toBe(true)
    expect(isTrackedFile('scripts/check-diff-coverage.mjs')).toBe(true)
  })

  it('rejects files outside the tracked roots or with the wrong extension', () => {
    expect(isTrackedFile('scripts/run-e2e.sh')).toBe(false)
    expect(isTrackedFile('scripts/e2e-first-run.py')).toBe(false)
    expect(isTrackedFile('lib/foo.py')).toBe(false)
    expect(isTrackedFile('README.md')).toBe(false)
    expect(isTrackedFile('.github/workflows/tests.yml')).toBe(false)
    expect(isTrackedFile('package.json')).toBe(false)
  })
})

describe('fileLineHits', () => {
  it('maps each statement to its start line, taking the max hit count when lines collide', () => {
    const entry = {
      statementMap: {
        '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 20 } },
        '1': { start: { line: 5, column: 0 }, end: { line: 5, column: 20 } },
        '2': { start: { line: 5, column: 22 }, end: { line: 5, column: 40 } },
      },
      s: { '0': 5, '1': 0, '2': 3 },
    }
    const hits = fileLineHits(entry)
    expect(hits.get(1)).toBe(5)
    expect(hits.get(5)).toBe(3)
  })
})

describe('uncoveredLines', () => {
  const coverageJson = {
    'lib/foo.ts': {
      statementMap: {
        '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 20 } },
        '1': { start: { line: 5, column: 0 }, end: { line: 5, column: 20 } },
        '2': { start: { line: 8, column: 0 }, end: { line: 9, column: 1 } },
      },
      s: { '0': 5, '1': 0, '2': 3 },
    },
  }

  it('reports only executable lines that were never hit', () => {
    const diffFiles = new Map([['lib/foo.ts', new Set([1, 5, 6, 8])]])
    const report = uncoveredLines(coverageJson, diffFiles, '/repo')
    expect(report).toEqual([{ file: 'lib/foo.ts', line: 5, reason: 'not covered by any test' }])
  })

  it('does not flag a covered line', () => {
    const diffFiles = new Map([['lib/foo.ts', new Set([1])]])
    expect(uncoveredLines(coverageJson, diffFiles, '/repo')).toEqual([])
  })

  it('does not flag a non-executable diff line (e.g. a blank line or closing brace)', () => {
    const diffFiles = new Map([['lib/foo.ts', new Set([6])]])
    expect(uncoveredLines(coverageJson, diffFiles, '/repo')).toEqual([])
  })

  it('flags every diff line of a file with no coverage entry at all', () => {
    const diffFiles = new Map([['lib/untested.ts', new Set([2, 3])]])
    const report = uncoveredLines(coverageJson, diffFiles, '/repo')
    expect(report).toEqual([
      { file: 'lib/untested.ts', line: 2, reason: 'no coverage data recorded for this file' },
      { file: 'lib/untested.ts', line: 3, reason: 'no coverage data recorded for this file' },
    ])
  })
})

describe('runGate — every exit path', () => {
  // The gate's verdict used to live entirely inside a `v8 ignore` block, so
  // changing the diff range to `HEAD...HEAD` made it pass everything with
  // nothing — not the gate, not its tests, not the coverage gate itself —
  // able to notice. These drive each exit path directly.
  const REPO = '/repo'
  const TRACKED_DIFF = `diff --git a/lib/foo.ts b/lib/foo.ts
index abc123..def456 100644
--- a/lib/foo.ts
+++ b/lib/foo.ts
@@ -5 +5 @@ export function foo() {
+  return 2
`
  const COVERED = {
    'lib/foo.ts': {
      statementMap: { '0': { start: { line: 5, column: 0 }, end: { line: 5, column: 9 } } },
      s: { '0': 1 },
    },
  }
  const UNCOVERED = {
    'lib/foo.ts': {
      statementMap: { '0': { start: { line: 5, column: 0 }, end: { line: 5, column: 9 } } },
      s: { '0': 0 },
    },
  }

  function harness({ diff, readCoverage = () => COVERED, argv = [] }: any) {
    const logs: string[] = []
    const errors: string[] = []
    const code = runGate({
      argv,
      repoRoot: REPO,
      diff,
      readCoverage,
      log: (m: string) => logs.push(m),
      error: (m: string) => errors.push(m),
    })
    return { code, logs, errors }
  }

  it('asks git for `${base}...HEAD`, so a mutated range cannot pass unnoticed', () => {
    const ranges: string[] = []
    harness({
      diff: (range: string) => {
        ranges.push(range)
        return TRACKED_DIFF
      },
      argv: [],
    })
    expect(ranges).toEqual(['origin/main...HEAD'])
  })

  it('honours a non-default base ref', () => {
    const ranges: string[] = []
    harness({
      diff: (range: string) => {
        ranges.push(range)
        return ''
      },
      argv: ['upstream/release'],
    })
    expect(ranges).toEqual(['upstream/release...HEAD'])
  })

  it('exits 1 with the reason when git fails', () => {
    const { code, errors } = harness({
      diff: () => {
        throw new Error('bad revision')
      },
    })
    expect(code).toBe(1)
    expect(errors).toEqual([
      'diff-coverage-gate: failed to diff against origin/main: bad revision',
    ])
  })

  it('exits 0 when the diff touches no tracked file', () => {
    const untracked = `diff --git a/README.md b/README.md
index abc123..def456 100644
--- a/README.md
+++ b/README.md
@@ -1 +1 @@
+# hello
`
    const { code, logs } = harness({ diff: () => untracked })
    expect(code).toBe(0)
    expect(logs).toEqual([
      'diff-coverage-gate: no tracked file changes in this diff — nothing to check.',
    ])
  })

  it('exits 1 when the coverage report is missing', () => {
    const { code, errors } = harness({ diff: () => TRACKED_DIFF, readCoverage: () => null })
    expect(code).toBe(1)
    expect(errors).toEqual([
      'diff-coverage-gate: /repo/coverage/coverage-final.json not found — run "npx vitest run --coverage" first.',
    ])
  })

  it('exits 1 listing every uncovered line', () => {
    const { code, errors } = harness({ diff: () => TRACKED_DIFF, readCoverage: () => UNCOVERED })
    expect(code).toBe(1)
    expect(errors).toEqual([
      'diff-coverage-gate: 1 added/modified line(s) not covered by tests:',
      '  lib/foo.ts:5 — not covered by any test',
    ])
  })

  it('exits 0 when every added line is covered', () => {
    const { code, logs } = harness({ diff: () => TRACKED_DIFF })
    expect(code).toBe(0)
    expect(logs).toEqual(['diff-coverage-gate: all added/modified lines are covered.'])
  })
})

describe('the gate resolves its own base ref', () => {
  // This used to live in the ignored CLI shim: changing the default to 'HEAD'
  // made the gate diff HEAD...HEAD, print "nothing to check", exit 0, and no
  // test or coverage line could see it.
  it('defaults to origin/main when argv names no base', () => {
    expect(resolveBase([])).toBe('origin/main')
    expect(resolveBase(undefined as any)).toBe('origin/main')
    expect(DEFAULT_BASE).toBe('origin/main')
  })

  it('uses the base argv names', () => {
    expect(resolveBase(['upstream/release'])).toBe('upstream/release')
  })
})

describe('gitDiff and readCoverageFile, against a real repo and a real file', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'diff-coverage-gate-'))
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: tmp, encoding: 'utf8' })
    git('init', '-q')
    git('config', 'user.email', 'gate@example.test')
    git('config', 'user.name', 'Gate Test')
    git('config', 'commit.gpgsign', 'false')
    writeFileSync(join(tmp, 'tracked.ts'), 'export const a = 1\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'base', '--no-verify')
    writeFileSync(join(tmp, 'tracked.ts'), 'export const a = 1\nexport const b = 2\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'change', '--no-verify')
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('returns a diff naming the changed file', () => {
    const out = gitDiff('HEAD~1...HEAD', tmp)
    expect(out).toContain('tracked.ts')
    expect(out).toContain('+export const b = 2')
  })

  it('returns nothing for a range with no changes', () => {
    expect(gitDiff('HEAD...HEAD', tmp)).toBe('')
  })

  it('throws on a bad revision, which runGate turns into exit 1', () => {
    expect(() => gitDiff('no-such-ref...HEAD', tmp)).toThrow()
  })

  it('reads the coverage report, and answers null when it is absent', () => {
    expect(readCoverageFile(tmp)).toBeNull()
    mkdirSync(join(tmp, 'coverage'), { recursive: true })
    writeFileSync(
      join(tmp, 'coverage', 'coverage-final.json'),
      JSON.stringify({ 'lib/foo.ts': { statementMap: {}, s: {} } })
    )
    expect(readCoverageFile(tmp)).toEqual({ 'lib/foo.ts': { statementMap: {}, s: {} } })
  })
})
