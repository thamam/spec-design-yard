// Pure report generation for the "System Architecture Audit & Blueprint Report"
// markdown export. Extracted from duplicated implementations in
// components/workspace/editor-panel.tsx and components/workspace/metrics-tab.tsx
// (the templates were byte-identical; only the download plumbing had drifted).
// DOM/clipboard/download concerns stay in the components.

import type { Diagnostic } from "./linter"

/**
 * Build the architecture-audit markdown for a parsed spec plus its diagnostics.
 * `dateStr` is injectable so tests can pin the output; callers omit it.
 */
export function generateArchitectureAuditReport(
  parsedSpec: any,
  diagnostics: Diagnostic[],
  dateStr: string = new Date().toLocaleString()
): string {
  const components = Array.isArray(parsedSpec?.system?.components) ? parsedSpec.system.components : []
  const systemName = parsedSpec?.system?.name || "Unnamed System"

  const totalComponents = components.length
  let gatewayCount = 0
  let stageCount = 0
  let brickCount = 0
  let storeCount = 0
  let totalConnections = 0

  components.forEach((c: any) => {
    if (!c) return
    const type = String(c.type || '').toLowerCase()
    if (type === 'gateway') gatewayCount++
    else if (type === 'stage') stageCount++
    else if (type === 'brick') brickCount++
    else if (type === 'store') storeCount++

    const conns = c.connections || []
    if (Array.isArray(conns)) {
      conns.forEach((conn: any) => {
        const target = typeof conn === 'string' ? conn : conn?.target
        if (target) {
          totalConnections++
        }
      })
    }
  })

  const errorsCount = diagnostics.filter(d => d.severity === "error").length
  const warningsCount = diagnostics.filter(d => d.severity === "warning").length
  const infoCount = diagnostics.filter(d => d.severity === "info").length

  // Health Score: starts at 100%, drops by 15% per error and 5% per warning.
  const healthPct = Math.max(0, 100 - (errorsCount * 15) - (warningsCount * 5))
  const connectionDensity = totalComponents > 0 ? parseFloat((totalConnections / totalComponents).toFixed(2)) : 0

  let couplingRating = "Empty"
  if (connectionDensity > 0) {
    if (connectionDensity < 1.0) couplingRating = "Loose"
    else if (connectionDensity < 1.8) couplingRating = "Balanced"
    else if (connectionDensity < 2.5) couplingRating = "Dense"
    else couplingRating = "Spaghettified"
  }

  // Connected components (undirected subgraphs count)
  const ids = new Set<string>()
  components.forEach((c: any) => {
    if (c && typeof c.id === 'string' && c.id.trim() !== "") {
      ids.add(c.id.trim())
    }
  })

  const adjUndirected: Record<string, string[]> = Object.create(null)
  ids.forEach(id => {
    adjUndirected[id] = []
  })

  components.forEach((c: any) => {
    if (!c || typeof c.id !== 'string') return
    const u = c.id.trim()
    if (!ids.has(u)) return

    const conns = c.connections || []
    if (Array.isArray(conns)) {
      conns.forEach((conn: any) => {
        const target = typeof conn === 'string' ? conn : conn?.target
        if (typeof target === 'string') {
          const v = target.trim()
          if (ids.has(v) && v !== u) {
            if (!adjUndirected[u].includes(v)) adjUndirected[u].push(v)
            if (!adjUndirected[v].includes(u)) adjUndirected[v].push(u)
          }
        }
      })
    }
  })

  const visitedNodes = new Set<string>()
  let subgraphsCount = 0

  ids.forEach(startNode => {
    if (!visitedNodes.has(startNode)) {
      subgraphsCount++
      const queue = [startNode]
      visitedNodes.add(startNode)
      let qIdx = 0
      while (qIdx < queue.length) {
        const node = queue[qIdx++]
        const neighbors = adjUndirected[node] || []
        for (const neighbor of neighbors) {
          if (!visitedNodes.has(neighbor)) {
            visitedNodes.add(neighbor)
            queue.push(neighbor)
          }
        }
      }
    }
  })

  const hasSpoofingThreat = diagnostics.some(d => d.code === 'stride-spoofing')
  const hasTamperingThreat = diagnostics.some(d => d.code === 'stride-tampering')
  const hasRepudiationThreat = diagnostics.some(d => d.code === 'stride-repudiation')
  const hasInfoDisclosureThreat = diagnostics.some(d => d.code === 'stride-information-disclosure')
  const hasElevationThreat = diagnostics.some(d => d.code === 'stride-elevation-of-privilege')
  const hasDoSThreat = diagnostics.some(d => d.code === 'stride-denial-of-service')

  return `# System Architecture Audit & Blueprint Report

Generated automatically by Sentinel (Hermes agent, Spec-Design Yard) on ${dateStr}.

## 1. System Overview
- **System Name:** ${systemName}
- **System Health:** ${healthPct}%
- **Coupling Rating:** ${couplingRating}
- **Connection Density:** ${connectionDensity}
- **Subgraphs Count:** ${subgraphsCount}

## 2. Component Inventory
- **Gateways (Ingestion points):** ${gatewayCount}
- **Stages (Processing units):** ${stageCount}
- **Bricks (Auxiliary sidecars):** ${brickCount}
- **Stores (Data persistence):** ${storeCount}
- **Total Components:** ${totalComponents}
- **Total Connections:** ${totalConnections}

## 3. Real-Time Linting Diagnostics
- **Errors Count:** ${errorsCount}
- **Warnings Count:** ${warningsCount}
- **Info Count:** ${infoCount}

### Detailed Active Diagnostics:
${diagnostics.length === 0
  ? "✅ No architectural violations or lint warnings detected! Perfect design standard."
  : diagnostics.map((d, i) => (i + 1) + ". [" + d.severity.toUpperCase() + "] (" + (d.code || "unknown") + "): " + d.message + " (Path: " + (d.path || "N/A") + ")").join("\n")}

## 4. STRIDE Threat Modeling & Recommendations
The system analysis evaluates six STRIDE threat boundaries across the design blueprint:

### Spoofing (S):
- Gateway elements must carry validation/auth labels.
- Status: ${hasSpoofingThreat ? "⚠️ VULNERABLE" : "✅ MITIGATED"}
- Recommendation: Ensure all outgoing connections from Gateways have security/auth labels to establish trusted identity.

### Tampering (T):
- Connection channels must specify secure communication.
- Status: ${hasTamperingThreat ? "⚠️ VULNERABLE" : "✅ MITIGATED"}
- Recommendation: Apply TLS, HTTPS, or gRPC communication labels explicitly.

### Repudiation (R):
- Key data Stores must attach to an audited event ledger or logging neighbor.
- Status: ${hasRepudiationThreat ? "⚠️ VULNERABLE" : "✅ MITIGATED"}
- Recommendation: Connect store nodes to auditing log / ledger bricks (e.g., audit_logger).

### Information Disclosure (I):
- Direct Gateway-to-Store flows bypassing stages.
- Status: ${hasInfoDisclosureThreat ? "⚠️ VULNERABLE" : "✅ MITIGATED"}
- Recommendation: Insert a validation or auth verifier Stage component to protect raw data stores.

### Elevation of Privilege (E):
- Administrative/privileged blocks must require verification.
- Status: ${hasElevationThreat ? "⚠️ VULNERABLE" : "✅ MITIGATED"}
- Recommendation: Connect administrative or privileged nodes to verification modules.

### Denial of Service (DoS):
- High-traffic bottleneck nodes (fan-in >= 3) must configure rate limits or throttling.
- Status: ${hasDoSThreat ? "⚠️ VULNERABLE" : "✅ MITIGATED"}
- Recommendation: Add "rate_limit: true" or "throttled: true" under metadata.`
}

/** Download filename for the report: pinned `architecture-audit-*.md` prefix. */
export function architectureAuditReportFilename(systemName: string): string {
  const sanitizedName = systemName.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  return `architecture-audit-${sanitizedName}-${Date.now()}.md`
}
