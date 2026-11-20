# Review findings and closure decisions

This record routes the completed Opus reviews and styling report to implementation owners. A proposed fix, a passing demo test and final acceptance are different states. The Opus QA lead's written decisions control case acceptance; later passes must retain the earlier decision/build history.

## Current connection and verification state

- The shared frontend on 8080 still embeds `VITE_DATA_MODE=demo`. PM has opened a separate user-facing API development preview at http://127.0.0.1:8081, proxied to real 8000/PostgreSQL. It uses changing source and is not a frozen acceptance build; user edits may change the shared synthetic dataset.
- The same-origin API proxy reaches FastAPI and PostgreSQL: read-only checks returned 100 patients and two users, matching direct database counts. This proves the API/database connection, not that the shared browser selected the HTTP adapter.
- A separate compiled API-mode candidate on 4186 reported 16/16 live journeys passing, with all 58 created patient IDs removed and baseline totals preserved. Its frontend/source hashes were reconciled; the backend identity was not captured at run start. It does not change the shared mode or grant visual acceptance.
- Opus accepted 41 complete compiled-demo case proofs, 28 supporting proofs, three failures, two rejected mappings, six definition revisions and five blocked cases in the prior reviewed build. QA imports those decisions in their recorded scope. No live acceptance follows from that demo decision.

## Functional and visual fixes

| IDs | Owner | Required action / closure evidence |
| --- | --- | --- |
| QA-LEAD-001; visual F1 | Frontend, with Opus review | Pass 03 accepts the compiled-DEMO repair (24 browser checks / 42 form units). Preserve its form-file identity; repeat on the integrated API candidate and include F1 in the final visual recheck. |
| QA-LEAD-002; NAV-QA-001 | Frontend test owner + Opus lead | Pass 02 authorized v2: same anchor/action, viewport offset within 2px, identical visible IDs, stable query/filter and end pinning. Raw offsets remain diagnostics. The frozen v2 run now measured82 pass / 58 fail across 140 scenarios/160returns: anchor-offset and visible-ID invariants fail. Retain v1/v2 evidence; one measured-restoration owner is repairing the behavior after the presentation-file handoff. |
| NAV-QA-002; QA-LEAD-005 | Frontend | Pass 03 accepts the repeated-history focus repair in compiled DEMO (6/6 at 375/390/1440). It does not close scroll restoration or prove the later integrated API candidate. |
| Visual F2 | Opus frontend design owner | Reduce excessive mobile chrome and fixed card space while preserving readable content and usable controls. |
| Visual F3/F4; QA-LEAD-004 | Opus frontend design owner | Fix clipped pagination value and Discussion tab at narrow widths. Prefer compact fitting controls; a deliberately scrollable strip needs a visible affordance and an explicitly revised acceptance definition. |
| Visual C1 | Opus overview owner | Make the partial current month explicit so the line does not imply a completed-period drop. Counts represent patients' latest visits, not total visit history. |
| Visual A1/A2/A3 | Opus frontend design owner | Simplify engineering copy, repeated patient facts and discussion action hierarchy; keep primary content distinct from maintenance/destructive controls. |
| QA-LEAD-003/007 | Frontend | Correct singular/plural accessible count text and the expanded theme trigger's current-choice label. These are outside the styling-only document author's scope. |
| QA-LEAD-006 | PM + frontend + next Opus lead pass | Keep the current UTC reference explicit and consistent with server date rules unless a different application timezone is intentionally selected; test month/today boundaries. |

## Platform fixes

| ID | Owner | Required action / closure evidence |
| --- | --- | --- |
| OPR-001 | Frontend then infra | Complete current compiled live and visual acceptance, then align default setup with API mode and verify the normal launch uses PostgreSQL data. No premature shared transition. |
| OPR-002 | Infra | Sanitize API access/error logging so search text, request identifiers and raw URLs do not leak through nginx. Verify using isolated synthetic probes. |
| OPR-003 | Backend + frontend | Backend message/path clauses accepted on 34e2150b. Integrated frontend field placement, corrected resubmit and email-rule alignment remain open. |
| OPR-004 | Backend | Fixed and accepted on 34e2150b:23-operation schema regressions and recorded TCP OpenAPI. The new assignment extension needs its own updated contract/tests. |
| OPR-008 | Backend + infra + QA | Preserve fault artifacts on disk, exclude them from Git/Docker/test/lint collection, and let QA import reviewed evidence into its owned delivery scope. Do not delete evidence or automatically publish runtime directories. |
| OPR-007 | Infra | Apply no-cache policy to entry HTML/SPA fallback and appropriate caching to hashed assets; verify actual headers. |
| OPR-005/006/009/010 | Relevant owners + Opus lead | Track contract-drift protection, read-lock tradeoffs, truthful all-active seed charts and complete acceptance manifests. Distinguish justified limitations/advisories from release blockers. Do not fabricate status diversity or load/SLO proof. |

Backend's 17 fault cases plus immediate restart execution have now been reported passing on an archived pre-OPR snapshot. The sustained-load case remains NOT_RUN without a declared protocol. Those results must not silently become evidence for subsequent OPR-003/004 edits. Infra must wait for the stable post-fix source before freezing a new integrated candidate.

## PM styling recommendation triage

Source: `styling-only review` (local QA evidence). Opus pass 02 adopted the triage below; `its exact decisions and criteria` (local QA evidence) are authoritative. These are accepted/deferred scopes, not completed fixes or blanket WCAG claims. The documentation author does not edit the app.

| ID | PM recommendation | Reason and boundary |
| --- | --- | --- |
| AST-001 | Accept for implementation | Add a compact persistent selected-navigation marker with measured contrast. Preserve the rail width and distinguish selection from focus. |
| AST-002 | Accept targeted strengthening | Make the light chart guide legible over both card and tinted area. Preserve redundant point/value cues; do not label the whole chart a proven failure solely from this subpart. |
| AST-003 | Accept component maintenance, below active-screen blockers | Use semantic foreground/background pairs for the two unused generic Badge variants. Preserve the passing CountPill; this is not a claim that current unread badges fail. |
| AST-004 | Documentation follow-up; preserve original reference | Record safe implementation pairs separately from sampled reference colors. Do not rewrite historical observations or add unused product statuses. Current Active/Inactive colors already pass. |
| AST-005 | Defer pending design judgment | Selected weight already supplies another cue. An underline/edge may help, but no demonstrated color-only failure requires a global restyle. |
| AST-006 | Accept selective readability improvements | Remove tiny essential metadata and clipped labels where observed, while preserving compact density. Do not blindly enlarge every label or flatten hierarchy. |
| AST-007 | Accept coarse-pointer fixes | Apply the local touch-target intent to specific missed controls without enlarging all fine-pointer desktop controls. Keep the report's AA-versus-local-target distinction. |
| AST-008 | Accept verification first; fix demonstrated constraints | Check current candidate reflow, zoom/text spacing, long labels and short screens. Do not hide overflow or shrink text to conceal clipping. |
| AST-009 | Defer optional edge polish | Text/icon already identify note links; stronger edges are a design refinement unless current rendered evidence proves ambiguity. |
| AST-010 | Preserve passing treatment; defer optional margin changes | Keep gaps, labels and geometry. Alter thin-mark contrast only if the current rendered review needs it; do not invent a stricter conformance threshold. |

Accepted styling changes go to the existing Opus/frontend implementation owner with disjoint file ownership. Recalculate affected pairs and verify the current compiled candidate afterward. A fresh Opus recheck is required for new acceptance claims.

## Pass-02 closures and current-source limits

`Closure decisions` (local QA evidence) accept nine core checks in stated scopes. Eight count as verified in the top-level metric; P2-12 is desktop-only partial while its mobile clause remains open. Five work items close: `f-api`, `pd-view`, `collaboration-unread`, `notifications-queue` and `x-e2e`. All retain candidate-03 identity and unbound-backend limitations.

The metric is 39 verified, one partial and 11 open out of 51 assessment checks. It is not a release sign-off. Later form/focus/theme edits do not inherit old candidate acceptance. Pass 03 is complete: pf-client, d-contract, a-docs and r-api close in stated scopes; P4-03/04/06 are pending integrated proof. Later v2 failures remain open. Independent checks-image evidence now reproduces236 backend / 160 data passes and artifact exclusion, but OPR008 awaits combined lead/QA-export adjudication. Current assignment work supersedes the backend source freeze for future runs.

## Demo identity clarification

The selector simulates staff identity for note/comment authorship, author-only operations and personal discussion read state. Both identities share the patient population and clinical content; display roles are not RBAC. The user subsequently requested automatic User A selection; PM implemented it for API/demo while preserving a valid saved choice. The user also explicitly requested a user-specific overview. That is new workload behavior, not login or patient-level access control.

## New selected workload scope — implementation in progress

Frontend contacted backend and agreed a persisted `Patient.assigned_user_id` relationship with additive migration `20261120_0002`. `GET /patients?assigned_to=me` filters before totals/paging and requires the active actor; the unfiltered directory remains shared. The existing dashboard endpoint gains `scope=assigned` plus explicit scope/user metadata. Charts and recent patients share one complete assigned projection keyed by actor and scope; personal notification counts keep their separate global-per-viewer meaning.

Selected-actor creates receive server-side assignment; PUT preserves it and callers cannot write assignment fields. A durable `demo-assignments-v1` seed marker gives the two existing users deterministic cohorts without changing clinical facts. Repeated seeding must preserve later reassignment/unassignment/deletion. All-active cohorts can truthfully retain an all-active chart; no fabricated status diversity is required.

Acceptance: switch A→B→A and reload, verify each cohort/count/chart against real API data, preserve the shared 100+ directory, validate missing/invalid actors and filters, prove repeat-safe assignment seeding and creator assignment. Backend/frontend will supply a new stable source handoff before the isolated integrated run. Historical global-overview evidence does not accept this new behavior. Shared migration/restart/publication remains infra-coordinated.
