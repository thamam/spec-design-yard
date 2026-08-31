// Single source of truth for which files the diff-coverage gate enforces.
// vitest.config.ts's coverage.include is derived from the same constants so
// the two configs cannot drift out of sync silently (see FIX 4 in
// .orchestrator/foundation/FIXES.md).
export const TRACKED_EXTENSIONS = /\.(ts|tsx|mjs)$/
export const TRACKED_ROOTS = ['lib/', 'components/', 'pages/']
export const TRACKED_SINGLE_FILE = 'scripts/check-diff-coverage.mjs'

export const COVERAGE_INCLUDE = [...TRACKED_ROOTS.map((root) => `${root}**`), TRACKED_SINGLE_FILE]
