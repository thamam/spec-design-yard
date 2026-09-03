import { describe, test, expect } from 'vitest'
import { formatIssueCount } from '../lib/status-copy'

describe('formatIssueCount', () => {
  test('treats empty and negative counts as no issues', () => {
    expect(formatIssueCount(0)).toBe('No issues')
    expect(formatIssueCount(-1)).toBe('No issues')
  })

  test('singular and plural', () => {
    expect(formatIssueCount(1)).toBe('1 issue')
    expect(formatIssueCount(2)).toBe('2 issues')
    expect(formatIssueCount(12)).toBe('12 issues')
  })
})
