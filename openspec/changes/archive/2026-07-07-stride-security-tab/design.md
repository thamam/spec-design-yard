# Design Document: STRIDE Security Threat Modeling Tab & Interactive Audit Exporter

## Technical Architecture Overview

To maintain the architectural goal of perfect bidirectional synchronization and real-time responsiveness, the Security Tab is designed as a zero-overhead view layer on top of our existing static analysis pipelines. 

```
+--------------------------------------------------------------+
|                    YAML Blueprint / Text                     |
+--------------------------------------------------------------+
                               |
                               | (central parser)
                               v
+--------------------------------------------------------------+
|                      Parsed Spec Object                      |
+--------------------------------------------------------------+
                               |
                               | (central static analyzer)
                               v
+--------------------------------------------------------------+
|               lintSpec(parsedSpec) -> Diagnostics            |
+--------------------------------------------------------------+
                               |
                               +-----------------------------+
                               | (general view filter)       | (STRIDE view filter)
                               v                             v
+-----------------------------------+         +----------------------------------+
|      Standard Editor Panels       |         |         New Security Tab         |
|  (Errors/Warnings General HUD)    |         |  (Interactive STRIDE Dashboard)  |
+-----------------------------------+         +----------------------------------+
                                                             |
                                                             | (MITIGATION ACTIONS)
                                                             +---> reconcileSpec()
                                                             |
                                                             | (REPORT EXPORT)
                                                             +---> Export File (.md)
```

---

## Key Technical Decisions

### Decision 1:Centralized Linter Execution with Decoupled STRIDE Categorization
We reject duplicate or isolated security parsers. Instead, `lib/linter.ts` acts as the single source of truth for all parsing and static rules. 
- **Rationale**: Re-executing separate parsers causes GC churn and CPU spikes on high-frequency keystrokes.centralizing the rules ensures changes to the specification schema instantly cascade to all tabs.
- **Implementation**: The Security tab consumes the centralized `diagnostics` array returned from `lintSpec(parsedSpec)`, filtering specifically for codes prefixed with `stride-` (e.g., `stride-spoofing`, `stride-tampering`, etc.).

### Decision 2: Quantitative Scoring Model (Security Compliance Score)
The Security Compliance Score uses a weighted deductive scale:
$$\text{Compliance Score} = \max(0, 100 - (\text{Critical Security Errors} \times 15) - (\text{Security Warnings} \times 5))$$
- **Rationale**: A simple count of bugs is hard for teams to track. A percentage-based score makes architectural trust easily trackable and matches industry standards.
- **Alternative Rejected**: Stating the raw count of threat items. This was rejected because a high-complexity system with 2 warnings can look less secure than a low-complexity system with 1 critical error.

### Decision 3: Client-Side Blob-Based Markdown Audit Exporter
The export feature is implemented entirely client-side using native HTML `a[download]` and a `Blob` containing plain text compiled dynamically in memory.
- **Rationale**: It operates entirely offline (requiring no server round-trips), protects sensitive proprietary blueprints from being sent to external reporting APIs, and ensures zero latency.
- **Alternative Rejected**: Running an API-driven PDF rendering service. This was rejected because it introduces security boundary leaks (transmitting system topology specifications across network channels) and incurs hosting/infrastructure costs.

### Decision 4: Interactive Mitigation Hookups to the AST Reconciler
All interactive quick-fix actions are linked directly to `reconcileSpec` in `lib/reconciler.ts` via standard action dispatch payloads.
- **Rationale**: This guarantees that applying a threat mitigation (e.g. rate-limiting, audit-logging) is saved instantly and synchronized back into the visual diagram canvas and the text editor.
- **Alternative Rejected**: Modifying the parsed JSON spec directly and serializing back. This was rejected because it causes the destruction of YAML formatting, deletion of comments, and coordinate synchronization failures.
