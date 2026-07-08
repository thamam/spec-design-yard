# Architectural Linter & Quality Rules

Spec-Yard contains a built-in static analyzer (**linter**) that scans your system blueprint YAML on every keystroke. It translates architectural standards into real-time diagnostics: **Errors**, **Warnings**, and **Info** alerts.

---

## 1. Diagnostic Severity Levels

The linter generates diagnostics in three levels, helping you prioritize improvements:

1. 🔴 **Error (`error`)**: Critical issues that prevent proper visualization, routing, database persistence, or simulation of your architecture. These must be resolved immediately.
2. 🟡 **Warning (`warning`)**: Violations of best practices, unrecognized configurations, metadata typos, or architectural anti-patterns that degrade the design quality.
3. 🔵 **Info (`info`)**: Helpful observations, recommendations, or missing descriptive metadata (like owners/descriptions) to enrich documentation.

---

## 2. Rule Index

Below is the complete catalog of rules checked by the Spec-Yard analyzer.

### System-Level Rules

| Code | Severity | Message / Condition | Why it matters |
| :--- | :--- | :--- | :--- |
| `missing-system` | 🔴 Error | Missing top-level `system` object. | The parser cannot find the specification root. |
| `missing-system-name` | 🟡 Warning | System name is missing or empty. | Every specification should have a clear descriptive name. |
| `unrecognized-system-key`| 🟡 Warning | Key not in `name`, `components`, `metadata`. | Prevents spelling errors in top-level system definition. |
| `invalid-system-metadata-object` | 🔴 Error | `system.metadata` must be a valid YAML object. | Metadata must follow object syntax to read nested values. |
| `unrecognized-system-metadata-key` | 🟡 Warning | Key not in `owner`, `description`, `status`, `version`. | Warns against typos in metadata properties. |
| `invalid-system-metadata-status` | 🟡 Warning | Status not in `draft`, `active`, `deprecated`. | Standardizes lifecycle tracking of systems. |
| `invalid-system-metadata-version` | 🟡 Warning | Version does not follow semantic version format. | Ensures version tracking aligns with standard SemVer specs. |
| `missing-system-metadata-description` | 🔵 Info | Lacks a `description` field. | High-quality blueprints must explain the system's purpose. |
| `placeholder-system-metadata-description` | 🟡 Warning | Uses placeholder values (e.g. `todo`, `tbd`). | Description field has not been completed. |
| `missing-system-metadata-owner` | 🔵 Info | Lacks an `owner` field. | Every system should have a responsible team assigned. |
| `placeholder-system-metadata-owner` | 🟡 Warning | Owner is a placeholder like `tbd` or `todo`. | Owner must be assigned to an active contact/team. |

---

### Component-Level Rules

| Code | Severity | Message / Condition | Why it matters |
| :--- | :--- | :--- | :--- |
| `components-not-array`| 🔴 Error | `components` is not a YAML array. | The parser cannot extract components unless they are listed. |
| `missing-component-id` | 🔴 Error | Required field `id` is missing or empty. | Components need unique identifiers to establish connections. |
| `duplicate-id` | 🔴 Error | Duplicate component ID detected. | Every ID must be strictly unique to draw links correctly. |
| `invalid-id-format` | 🟡 Warning | ID contains invalid characters. | IDs must only contain alphanumeric characters, `-`, or `_`. |
| `missing-component-type`| 🔴 Error | Required field `type` is missing or empty.| System needs component types to calculate layout and rules. |
| `unrecognized-type` | 🟡 Warning | Type is not `Store`, `Stage`, `Brick`, or `Gateway`. | Component rules depend on using one of the four types. |
| `invalid-metadata-object` | 🔴 Error | Component `metadata` must be an object. | Metadata fields must be readable as structured values. |
| `unrecognized-metadata-key` | 🔵 Info | Unrecognized component metadata key. | Highlights custom metadata keys or spelling errors. |
| `invalid-metadata-status` | 🟡 Warning | Status not in `draft`, `active`, `deprecated`. | Component status must align with standard states. |
| `invalid-metadata-color` | 🟡 Warning | Invalid color or non-standard hex code. | Standardizes canvas colors (`indigo`, `purple`, etc.) or valid CSS hexes. |

---

### Connection-Level Rules

| Code | Severity | Message / Condition | Why it matters |
| :--- | :--- | :--- | :--- |
| `invalid-connections-array` | 🔴 Error | `connections` must be a YAML array. | Connections must be listed as multiple targets. |
| `empty-connection-target` | 🔴 Error | Connection has an empty target field. | Every connection must point somewhere. |
| `invalid-connection-label` | 🔴 Error | Connection label is not a string. | Labels must be alphanumeric strings describing data flows. |
| `missing-connection-label` | 🔵 Info | Connection from `Stage`/`Brick` lacks a label. | Core processing or utility outputs should describe what they send. |
| `duplicate-connection-label` | 🟡 Warning | Duplicate connection label on same component. | Warns against duplicate flow pathways on a single node. |
| `duplicate-connection` | 🟡 Warning | Duplicate connection targeting same component. | Redundant connections to the exact same target node. |
| `orphan-connection` | 🔴 Error | Connection target does not exist in the list. | Prevents dead links pointing to deleted/undefined components. |
| `connection-case-mismatch` | 🟡 Warning | Target exists but has different casing. | Warns that connection targets are strictly case-sensitive. |
| `self-connection` | 🔴 Error | Component has a connection targeting itself. | Node cannot route traffic directly back to its own input. |

---

### Architectural Flow Anti-Patterns

The linter enforces design discipline. The following rules generate quality warnings if components connect in ways that violate decoupled boundaries:

1. 🟡 **`gateway-to-store`**: A `Gateway` connects directly to a `Store` (e.g. database). *Why it matters:* Web ingestion points should write to active Stages or Bricks first for validation, parsing, and processing rather than raw-writing directly to databases.
2. 🟡 **`store-to-store`**: A `Store` connects directly to a `Store`. *Why it matters:* Databases or file systems should not transfer data directly to other stores without an intermediate processing active stage or queue.
3. 🟡 **`stage-brick-to-gateway`**: A core `Stage` or utility `Brick` connects downstream to a `Gateway`. *Why it matters:* Gateways are ingestion entry points; they do not consume processing outputs in a standard unidirectional pipeline.
4. 🟡 **`brick-to-brick`**: A utility `Brick` connects directly to another `Brick`. *Why it matters:* Bricks are decorators or sidecar plugins and should attach only to core architectural components (`Gateway`, `Stage`, or `Store`).
5. 🟡 **`gateway-to-gateway`**: A `Gateway` connects directly to another `Gateway`. *Why it matters:* Ingestion nodes must delegate to internal processing stages.

---

### STRIDE Threat Modeling Security Rules

Spec-Yard contains a built-in static architecture security analyzer that checks for the six core STRIDE threat vectors plus sensitive metadata credentials leaks:

1. 🟡 **`stride-spoofing`**: A `Gateway` component lacks an owner or is connected downstream without custom secure/auth connection labels (e.g., matching security keywords like `auth`, `secure`, `token`, `validate`). *Why it matters:* Gateways are external interfaces and must validate incoming identity.
2. 🟡 **`stride-tampering`**: A connection link is unlabeled or lacks custom encryption labels specifying secure channels (TLS/HTTPS/gRPC/SSH). *Why it matters:* Unlabeled data flows are susceptible to transit intercept, tampering, or eavesdropping.
3. 🔵 **`stride-repudiation`**: A database `Store` lacks outgoing or incoming audit log links to tracing/ledger Brick components. *Why it matters:* Transaction stores must maintain a traceable audit ledger to prove non-repudiation.
4. 🟡 **`stride-information-disclosure`**: A `Gateway` connects directly to a database `Store` bypassing verification/parsing stages. *Why it matters:* Direct data-store exposures without middle-tier sanitize/processing stages can result in mass credential theft or unauthorized data exposure.
5. 🟡 **`stride-elevation-of-privilege`**: A privileged node (marked `privileged: true` or containing `admin` or `root` in its name/ID) lacks connection to a verification node. *Why it matters:* High-privilege components must be gated by authentication/verification barriers.
6. 🟡 **`stride-denial-of-service`**: A bottleneck node with high traffic fan-in (>= 3 inbound connections) lacks rate limiting, throttling, or buffering metadata parameters (`rate_limit: true`, `throttled: true`). *Why it matters:* High fan-in components are susceptible to overload, memory leaks, and service degradation.
7. 🟡 **`stride-secret-leak`**: A metadata field containing sensitive keys (such as `api_key`, `password`, `token`, `session_secret`) holds raw, hardcoded credentials. *Why it matters:* Blueprints should never store raw credentials in plaintext. Use environment variable references (e.g. `${MY_API_KEY}`) or placeholders instead.

---

### Network Graph Topography Rules

During compilation, Spec-Yard runs a **Breadth-First Search (BFS)** across the component network to find dead ends or unreachable islands:

* **Entry Points Selection:**
  * If the system defines one or more `Gateway` components, those are considered the entry points.
  * If no `Gateway` exists, components with **no inbound connections** are treated as entry points.
* **Island Detection:**
  * If components exist that are unreachable from any designated entry point, the linter tags them with diagnostics showing they are **isolated** or **disconnected** from the system flow, helping you clean up dead or orphaned definitions.
