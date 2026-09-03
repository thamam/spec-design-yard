// Single source of truth for which files the diff-coverage gate enforces.
// vitest.config.ts's coverage.include is derived from the same constants so
// the two configs cannot drift out of sync silently (see FIX 4 in
// .orchestrator/foundation/FIXES.md).
export const TRACKED_EXTENSIONS = /\.(ts|tsx|mjs)$/
export const TRACKED_ROOTS = ['lib/', 'components/', 'pages/']
// The gate's own policy files. They live outside TRACKED_ROOTS, so without
// this list a change to either escaped the coverage it defines for everything
// else — including this file, which decides what the gate checks at all.
export const TRACKED_SINGLE_FILES = ['scripts/check-diff-coverage.mjs', 'scripts/tracked-files.mjs']

export const COVERAGE_INCLUDE = [...TRACKED_ROOTS.map((root) => `${root}**`), ...TRACKED_SINGLE_FILES]
