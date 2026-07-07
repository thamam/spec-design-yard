# Delta Specification for STRIDE Security Tab & Compliance Audit

## ADDED Requirements

### Requirement: stride-security/tab-integration
The system SHALL offer a dedicated "Security" tab alongside the raw code, component tree, property editor, and metric views, labeled with a standard shield or lock icon.

#### Scenario: Switching to Security Tab
- GIVEN the workspace layout is fully loaded
- WHEN the user clicks the "Security" tab button in the left panel's views bar
- THEN the system SHALL activate the Security tab panel and hide other tab panels.

---

### Requirement: stride-security/dashboard-ui
The system SHALL display an interactive dashboard with a color-matched Security Compliance Scorecard and six collapsible STRIDE threat sections (Spoofing, Tampering, Repudiation, Information Disclosure, Elevation of Privilege, Denial of Service) corresponding to the core threat categories.

#### Scenario: Visual Score Matching
- GIVEN the current system has multiple unresolved high-severity STRIDE threat warnings
- WHEN the linter completes static analysis checks
- THEN the system SHALL recalculate the overall score using weighted point deductions (Errors subtract 15%, Warnings subtract 5%) and render:
  - A green theme if the score is greater than or equal to 90%
  - An amber/yellow theme if the score is between 70% and 89%
  - A red theme if the score is less than 70%

---

### Requirement: stride-security/interactive-fixes
The system SHALL render clear, clickable interactive "Apply Security Guard" remediation triggers beside each listed active STRIDE threat vulnerability.

#### Scenario: Clicking Mitigation Quick-Fix
- GIVEN a gateway component is flagged with a Spoofing warning for lacking an outgoing authentication label
- WHEN the user clicks the "Apply Spoofing Guard (Auth Label)" button inside the Spoofing threat block
- THEN the system SHALL automatically reconcile the YAML specification by inserting a standard security/validation label (e.g., "secure token-auth flow") on the affected connection.

---

### Requirement: stride-security/report-exporter
The system SHALL allow users to generate and download a comprehensive architectural threat modeling review as a Markdown file.

#### Scenario: Downloading Security Audit
- GIVEN the active system contains multiple components and STRIDE diagnostics
- WHEN the user clicks the "Export Security Report" button
- THEN the system SHALL compile a cohesive Markdown document containing System Metadata, Executive summaries, current Compliance Score, and and itemized list of all active STRIDE vulnerabilities with their exact paths, message bodies, and recommended mitigations, and trigger a native browser file download named `security-audit-report.md`.
