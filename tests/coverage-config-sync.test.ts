// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { COVERAGE_INCLUDE } from '../scripts/tracked-files.mjs'
import vitestConfig from '../vitest.config'

describe('coverage config stays in sync with the diff-coverage gate', () => {
  it('vitest.config.ts coverage.include matches the tracked-files source of truth', () => {
    expect(vitestConfig.test?.coverage?.include).toEqual(COVERAGE_INCLUDE)
  })
})
