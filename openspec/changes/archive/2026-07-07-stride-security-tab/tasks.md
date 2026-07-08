# Implementation Tasks: STRIDE Security Threat Modeling Tab & Interactive Audit Exporter

- [x] **Task 1: Tab Integration**
  - Add `"security"` to `TabId` union type.
  - Register the Security tab in the `TABS` array with a custom Shield/Lock icon.
  - Render `<SecurityTab />` in `editor-panel.tsx` conditionally when `activeTab === "security"`.
  - Pass down central props (`parsedSpec`, `diagnostics`, `onQuickFix`).

- [x] **Task 2: Dashboard UI & STRIDE Categorization**
  - Develop the `SecurityTab` component interface.
  - Divide the panel layout into:
    - **Header Score Card**: Displays the overall score out of 100% with color-matched rings/borders (Green for >= 90%, Amber for 70-80%, Red for < 70%).
    - **STRIDE Accordions**: 6 cards representing each threat category with educational tooltips.
    - **Vulnerability Items**: Lists diagnostics falling under each threat category, or displays "0 threats detected" on secure categories.

- [x] **Task 3: Interactive Quick-Fix Action Dispatch**
  - Bind the `onQuickFix` callback prop to the mitigation buttons rendered under active threats.
  - Ensure clicking "Apply Security Guard" (e.g. rate-limiting, audit log, TLS flow) fires standard `reconcileSpec` updates.
  - Verify that applying a quick-fix updates the YAML text in real-time, which recalculates the linter, immediately resolving the threat card and boosting the compliance score.

- [x] **Task 4: Markdown Audit Exporter**
  - Implement a clean template compiler:
    - Document title: `# Spec-Yard - STRIDE Architectural Security & Compliance Audit Report`
    - Sections for: System Metadata Summary, Executive Summary, Scorecard, and Detailed Findings itemized per STRIDE category.
  - Use dynamic strings without nested syntax collisions.
  - Trigger client-side browser file download via Blob and hidden anchor tag.

- [x] **Task 5: Automated Testing and Quality Gate Verification**
  - Write dedicated unit and UI rendering test files:
    - `tests/stride-security-tab.test.tsx`: Validates rendering, score calculations, category splitting, and button clicks.
    - `tests/architecture-audit-report.test.tsx`: Validates markdown text compiler outputs and metadata formatting.
  - Run the complete Vitest suite to confirm all tests pass cleanly.
