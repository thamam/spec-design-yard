# Reconciliation — user discovery inputs vs prd.md / addendum.md

Verification pass for the finalize step: each user-supplied idea checked against
`prd.md` and `addendum.md` for faithful capture, with special attention to
qualitative ideas (tone, feel, intent) that FR-structuring tends to lose.

Verdict codes: **CAPTURED** (faithful), **CAPTURED-WITH-NOTE** (faithful but an
interpretation or scoping choice was made worth confirming), **GAP** (dropped),
**DISTORTION** (present but meaning shifted).

---

## Input 1 — Core principles (human capability, encapsulation, strict interfaces, isometry softening, two levels)

| Idea | Verdict | Where / notes |
|---|---|---|
| "Human capabilities… humans can easily track and navigate… always allowing the dive down to lower levels to expose more details and validate or tweak" | CAPTURED | prd.md §1 ¶2: "The organizing principle is human capability. Every view stays simple enough for a person to track and navigate, and detail is always one dive-down away for validation or tweaking." Near-verbatim; nothing lost. |
| "Encapsulation and modular structure that help shape the flow where every view in itself is simple. Abstraction and masking are critical" | CAPTURED | §1 ¶2 ("Encapsulation is the mechanism"), operationalized in G2 (FR8–FR11) and echoed in the UI itself (G3 intro: "applying the product's own abstraction principle to its UI"). |
| Sharpened: encapsulation/masking is "critical design requirement. Not just for visual sake but also for the actual design" | CAPTURED | §1 ¶2: "it is a design requirement, not a rendering trick… Visual masking… is the visible consequence of that discipline, not a substitute for it." The relative emphasis the user stated ("it's the encapsulation and strict interface that matters more to me") is preserved — design-level encapsulation is primary, masking derivative. |
| "Connect through modules simply through their interfaces… huge advantage over having to navigate each wire into the inside of the other box" | CAPTURED | §1 ¶2 ("connect *through the interface*, never by wiring into a module's internals") and FR9 (strict interfaces, encapsulation-violation lint, composing exposure rule). FR9 actually strengthens the idea (interface-bloat warning) without changing its intent. |
| Isometry softening: code sync post-MVP; "isomorphism to code is an overstatement" | CAPTURED | §1 ¶3 ("Deriving or verifying code against the spec is a post-MVP direction, not an MVP capability") and §8 bullet 1 ("'isomorphism with code' is explicitly not claimed"). The retained spec↔diagram half of the isometry survives as the "single honest contract" framing in §1 ¶2 — faithful to what the user kept vs. dropped. |
| Hierarchy = exactly two levels of encapsulation (module, submodule) | CAPTURED | FR8 (precise: two sealable boundaries; root and leaves explicitly not encapsulation boundaries), §8 (deeper nesting out of scope), OQ1 marked resolved to two levels. |

**Input 1 net: no gaps, no distortions.** This is the input most at risk of
qualitative loss and the PRD carries it intact, including the "requirement not
rendering trick" nuance.

---

## Input 2 — Implementation brief "specs as first-class, repo-resident artifacts"

**Verbatim preservation:** addendum.md §A carries the brief near-verbatim
(goal, context, process, 5 decision points, constraints, slices). Confirmed.

**Point-by-point coverage in prd.md G1 (FR1–FR7):**

| Brief point | Verdict | Where / notes |
|---|---|---|
| 1. File access mechanism (API routes vs FS Access API vs CLI watcher; path-traversal guards, root allowlist) | CAPTURED-WITH-NOTE | The *decision requirement* is deferred to the design doc via §11 ¶1 → addendum §A; the guards/allowlist land as product requirement in NFR4. FR1's launch-mechanism `[ASSUMPTION]` covers the adjacent packaging question (OQ2). Deferral is appropriate — this is a design decision, not a product requirement — but coverage is via pointer, not FR text. |
| 2. Workspace concept (pointing at a folder; multi-file discovery; left-panel list; `main.spec.yaml` default) | CAPTURED | FR1 (open/create project folder, one project at a time) + FR2 (discovery, left panel, default file, create-new). |
| 3. Write semantics (debounced-atomic vs explicit Save; wire the fake Save button; real status-bar path; dirty indicator) | CAPTURED | FR3 covers all four elements explicitly, with the debounce-vs-explicit choice preserved as `[ASSUMPTION]` for the design doc — exactly the brief's intent. |
| 4. External-edit watch + v1 conflict rule stated explicitly | CAPTURED | FR4 restates the reload-or-overwrite rule verbatim in spirit and adds "no silent clobbering in either direction." SSE-vs-polling transport detail correctly left in addendum. |
| 5. Migration + localStorage fallback + Prisma/auth fate (park or delete, no half-wired paths) | CAPTURED | FR5 (migration + fallback incl. hosted-preview scenario) + FR6 (park-or-delete, "Nothing in the shipped UI implies a capability that doesn't exist"). |
| Constraint: TDD; 225 tests green; new subsystems get tests | CAPTURED | NFR6, itemizing file API, watcher, hierarchy, CLI. |
| Constraint: vertical slices, each independently demoable | **GAP (minor)** | The slice plan (a–d) survives in addendum §A and §11 points at it as design-doc input, but prd.md itself never states slice-based delivery as a constraint — §9 release criteria and §11 conventions don't mention it. If the finalize step treats prd.md as the sole contract, the delivery-style constraint is droppable. Suggested fix: one clause in §11 or NFR6 ("delivered as independently demoable vertical slices per addendum §A"). |
| Constraint: do not change the spec YAML format | CAPTURED-WITH-NOTE | Re-scoped rather than copied: the brief forbade format changes (in persistence-work scope), while G2 necessarily adds schema constructs. NFR3 reconciles: all changes additive, every pre-MVP spec stays valid and renders unchanged. Faithful to intent (protect existing specs), and the re-scoping is the right call — but it *is* a deliberate reinterpretation, worth a conscious sign-off. |
| Constraint: update README/docs to new persistence model | CAPTURED | NFR7, which also adds elimination of the existing docs/code contradiction. |
| Later refinement: spec-yard is a STANDALONE tool, not part of the target repo; launch opens a project folder holding specs + all generated artifacts | CAPTURED in prd.md / **DISTORTION RISK in addendum** | prd.md G1 intro states it exactly ("standalone tool, separate from any target repo… single home for the specs and every artifact the tool generates") and FR7 places generated artifacts in the folder. **But addendum §A still says, verbatim from the original brief, that specs live "inside the target project's repo" and that spec-yard "becomes an editor/viewer pointed at those files" — with no supersession note.** Since §11 designates addendum §A as "the intended input to the design doc," a design-doc author reading §A in isolation could build the superseded model. Suggested fix: one-line editorial note at the top of §A: "Model refined post-drafting: standalone tool + project folder (see prd.md G1); read 'target project's repo' as 'project folder'." |

---

## Input 3 — MVP vision / UX weak spot

| Idea | Verdict | Where / notes |
|---|---|---|
| "UX… is a weak spot for this to be really successful… many buttons and options… hard for the user to navigate itself and orient itself" | CAPTURED | §2 blocker bullet 4 ("UI has accreted many buttons and surfaces with no orientation layer") and G3 intro ("capabilities outgrew its discoverability"). |
| "…they are good and important, but…" — the options themselves are valued, the problem is orientation | CAPTURED | The nuance survives: FR14 keeps advanced surfaces "present but revealed opt-in" rather than cutting them; only *decorative* (non-functional) controls are removed (FR12), which the user separately agreed to. No conflation of "confusing" with "unwanted." |
| "Significant part of our effort needs to be now also at UX and UI" | CAPTURED | UX overhaul is one of five MVP feature groups (§5, G3) — effort-weighting intent reflected structurally. |
| "tutorials, or tips that jump on first usage (or until turned off)" | CAPTURED | FR13 (first-run tour/tips, dismissable, stays dismissed, re-enable from Help) plus the §3 counter-metric ("help that nags is worse than no help") — the counter-metric arguably captures the *feel* of the user's parenthetical better than the FR alone. |
| Agreed: remove decorative controls | CAPTURED | FR12, with itemized list of today's fake controls; "Zero lying UI." |
| Liked: progressive disclosure | CAPTURED | FR14, with core-vs-advanced grouping flagged `[ASSUMPTION]` for UX validation. |

**Input 3 net: no gaps, no distortions.**

---

## Input 4 — Success faces

| User face | Verdict | Where / notes |
|---|---|---|
| 1. "Complexity level of a system an architect is able to design" | CAPTURED | SM1, threshold `[ASSUMPTION]`, calibration deferred (OQ3). |
| 2. "When served to claude code to build from the specs… how close did what claude code build is to what was envisioned" | CAPTURED | SM2 near-verbatim; §8 correctly notes fidelity is *measured*, not automated. |
| 3. "Velocity in which an architect can design a system" | CAPTURED | SM3. |
| 4. "The speed at which someone new to a system design with spec-yard can do onboarding" | CAPTURED-WITH-NOTE | SM4 interprets the (grammatically ambiguous) phrase as *onboarding to a system designed with Spec-Yard* — consistent with the tertiary "newcomer" persona and UJ3. The alternative reading (*onboarding to the tool itself*) is not measured by any SM; tool learnability is handled qualitatively via G3/FR13 and the onboarding-friction counter-metric. The chosen reading is almost certainly right, but it was an interpretive choice — confirm with Dox at finalize. |

Framing bonus: §3 preamble ("judged on four faces") preserves the user's own
"faces" metaphor. All four thresholds honestly flagged `[ASSUMPTION]` rather
than invented as fact.

---

## Input 5 — Other decisions

| Decision | Verdict | Where / notes |
|---|---|---|
| Internal tool first; next phase decided by adoption | CAPTURED | Title ("Internal Release PRD"), §3 success framing ("internal architects design real systems… by choice"), §8 last bullet ("internal phase decides what's next"). |
| CLI first for agents; choice delegated → resolved to lint CLI | CAPTURED | G5 preamble records the delegation *and* the resolution ("Scope decision delegated to and made by the PRD process: lint first, everything else later"); FR17 specifies it; §8 fences off CLI-beyond-lint. Good provenance hygiene. |
| Export ability added ("useful", low cost) | CAPTURED | G4/FR16; the low-cost rationale survives as the Excalidraw-native-export `[ASSUMPTION]`. |
| Two encapsulation levels | CAPTURED | FR8 + OQ1 (resolved 2026-07-08). Duplicate of Input 1's last item; consistent in both places. |

---

## Summary of findings

1. **DISTORTION RISK — addendum §A stale model, no supersession note.** §A
   verbatim-preserves "specs living inside the target project's repo," which
   the user later superseded with the standalone-tool/project-folder model
   (correctly captured in prd.md G1). Because §11 names §A as the design-doc
   seed, add a one-line supersession note to §A.
2. **GAP (minor) — vertical-slices delivery constraint** exists only in
   addendum §A; prd.md never states it (not in NFR6, §9, or §11). Add a clause
   if prd.md is meant to be self-contained on constraints.
3. **NOTE — "do not change the YAML format" was consciously re-scoped** to
   "all schema changes additive / pre-MVP specs stay valid" (NFR3) to coexist
   with G2 modules. Faithful to intent; flag for explicit sign-off.
4. **NOTE — SM4 interpretation.** "Onboarding" read as system-onboarding, not
   tool-onboarding. Consistent with personas/UJ3 but interpretive; confirm.
5. **Housekeeping:** prd.md front-matter `updated: 2026-07-07` predates the
   OQ1 resolution stamped 2026-07-08 inside the document.

Everything else — including all qualitative/tonal content from Inputs 1 and 3
(human-capability principle, encapsulation-as-design-requirement, masking as
consequence, "good and important" buttons, tips-until-turned-off) — is
faithfully captured, several times with the nuance strengthened rather than
flattened.
