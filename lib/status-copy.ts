export function formatIssueCount(n: number): string {
  if (n <= 0) return "No issues"
  if (n === 1) return "1 issue"
  return `${n} issues`
}
