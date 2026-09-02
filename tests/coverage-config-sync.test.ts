// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { COVERAGE_INCLUDE, TRACKED_ROOTS } from '../scripts/tracked-files.mjs'
import { isTrackedFile } from '../scripts/check-diff-coverage.mjs'
import vitestConfig from '../vitest.config'

// Literals, deliberately NOT derived from the module under test. The previous
// guard compared vitest.config.ts against the very constant that builds it, so
// both sides moved together: dropping `components/` and `pages/` from
// TRACKED_ROOTS silently stopped the gate checking them and the test stayed
// green. Anything the policy must cover is spelled out here by hand.
const REQUIRED_ROOTS = ['lib/', 'components/', 'pages/']
const REQUIRED_POLICY_FILES = ['scripts/check-diff-coverage.mjs', 'scripts/tracked-files.mjs']

describe('the coverage policy covers what it claims to', () => {
  it('the tracked roots still include every root the policy requires', () => {
    for (const root of REQUIRED_ROOTS) {
      expect(TRACKED_ROOTS).toContain(root)
    }
  })

  it('coverage.include still instruments every required root and policy file', () => {
    const include = vitestConfig.test?.coverage?.include
    for (const root of REQUIRED_ROOTS) {
      expect(include).toContain(`${root}**`)
    }
    for (const file of REQUIRED_POLICY_FILES) {
      expect(include).toContain(file)
    }
  })

  it('the gate enforces every root and policy file too', () => {
    // The policy file itself used to sit outside the gate's tracked set, so a
    // change to it escaped the coverage it defines for everything else.
    for (const root of REQUIRED_ROOTS) {
      expect(isTrackedFile(`${root}anything.ts`)).toBe(true)
    }
    for (const file of REQUIRED_POLICY_FILES) {
      expect(isTrackedFile(file)).toBe(true)
    }
  })
})

describe('coverage config stays in sync with the diff-coverage gate', () => {
  it('vitest.config.ts coverage.include matches the tracked-files source of truth', () => {
    expect(vitestConfig.test?.coverage?.include).toEqual(COVERAGE_INCLUDE)
  })
})
