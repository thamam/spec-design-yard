import { describe, it, expect } from 'vitest'
import {
  parseDiffLines,
  isTrackedFile,
  fileLineHits,
  uncoveredLines,
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
