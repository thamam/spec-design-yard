// Browser download plumbing shared by the workspace components (pure report
// content lives in lib/export-report.ts; this stays DOM-side).

/** The one place components hand a file to the browser. */
export function triggerDownload(href: string, filename: string) {
  const downloadAnchor = document.createElement('a')
  downloadAnchor.setAttribute("href", href)
  downloadAnchor.setAttribute("download", filename)
  document.body.appendChild(downloadAnchor)
  downloadAnchor.click()
  downloadAnchor.remove()
}
