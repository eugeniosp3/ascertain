# Frontend updates

**Current delivery instruction:** finish the app, then run lint, typecheck, format check, unit tests, the demo Playwright suite and the intercepted API Playwright suite on the working tree. The exact-pixel scroll matrix and additional frozen-candidate/evidence gates below are historical and superseded. Restoration must retain page/filter/sort and return near the originating row. No shared service restart, commit or push is part of this frontend handoff.


Updated 2026-11-20. This handoff records additions for the project manager's final implementation and testing punch list. The build details are in [frontend/docs/IMPLEMENTATION.md](../../frontend/docs/IMPLEMENTATION.md); [project.md](../project.md) remains the original assessment.

Project entry points: [root README](../../README.md), [master progress record](../PROGRESS.md), and its [interactive punch card](../holepunch.html). The coordinator owns those files.

## Current integration and review status

**New user scope:** default to User A without an initial selection step, preserving valid saved users and validating stale IDs. PM completed that narrow provider handoff (5 units and 11 intercepted-browser checks, `/tmp/ascertain-default-actor-20261120/handoff.json`). Overview now has an agreed stored-assignment contract: `assigned_user_id`, `assigned_to=me`, `scope=assigned`, migration `20261120_0002`, and idempotent `demo-assignments-v1` seeding. Implementation is in flight; the directory stays shared/all-patient. This selected addition reopens overview population/data acceptance; no earlier global-chart proof closes it.

**Completion ownership:** per the user's latest steering, all three active frontend continuations use Claude Opus 5.5, `effort=max`, `ultracode=true`: assignment data, restoration integration, and remaining visual presentation. Previous Sol assignment and previous visual writer were cancelled/confirmed interrupted with saved edits preserved; PatientResults was explicitly released to restoration. No two writers share those files. Focused implementation checks come first, followed by one coordinated final code-review/QA cycle and one stable handoff to infra. User preview `8081` remains available on the restored shared backend.

**2026-11-20, compiled API candidate 03: 16 passed, 0 failed, 0 skipped, 0 retries in 36.1 seconds. Visual acceptance and shared API-mode rollout remain open.** This is a dated functional result, not a claim that subsequent source changes or the entire UI passed review.

- Exact command from `frontend/`: `PLAYWRIGHT_LIVE_BASE_URL=http://127.0.0.1:4186 npm run e2e:live -- --workers=1`. Installed Chrome ran desktop 1440×960 and touch mobile 390×844 against a compiled API-mode frontend, same-origin `/api` → existing FastAPI `8000` → PostgreSQL `5432`. No HTTP interception or fixture fallback.
- Candidate: `/tmp/ascertain-live-sol-20261120T182341Z/candidate-03`. Inputs: `run-05-inputs.json` in that directory, recorded at `2026-11-20T18:34:05Z`, with 157 frontend file hashes and no source drift during build/run. Observed HEAD was `611bda5400332550708b3c39f049d3ee7690b01f` plus uncommitted integration changes. The SHA-256 of sorted `path + NUL + hash + newline` entries is `c43bde5d705308197482d731784003ef06a5c9efa89fe1dcb6e73414ee35cb30`.
- Raw results: `run-05.log`; traces, per-test cleanup receipts and geometry: `run-05-results.zip`; summary: `handoff.json`; cleanup audit: `final-audit.json`; hashes: `artifact-manifest.json`, all in that same directory. Parent independently verified all 75 manifest entries, with no mismatches. Archive SHA-256: `03ccb47d7c6fb09f2a9f0b8ca3fb1f5c9df86d56b29624de8153cb649c528d4f`.
- All 58 final-run disposable patient IDs independently returned 404 after cleanup. The original 100-patient ID set and both original unread summaries were unchanged. Traces contain 901 real API requests. Persistence was verified through reload and a fresh browser context; container-restart persistence remains infra's responsibility.
- **Backend identity limitation:** the manifest records the live API/database addresses and observed responses, but it did not capture an immutable backend source/image/OpenAPI hash at run start. This is not evidence for later backend edits. Infra's isolated post-fix compiled runner must establish that complete candidate identity.
- The compiled dialog translation defect is fixed and this run verifies its viewport bounds. It does not close clipped individual tab/pagination controls or the separate visual-density findings.
- Scroll evidence is deliberately separate: one live end-of-list return changed `scrollTop` by 60px while `scrollHeight` also shrank 60px and the visible card/link coordinates stayed identical. Earlier QA mid-list offset failures and its ≤8px criterion are preserved as v1 history. The `Opus pass-02 decision` (local QA evidence) authorizes a new v2 definition: same row/action focus, row/action viewport position within 2px, identical visible row order, preserved query/status, and end-pinning when applicable. Raw offsets remain diagnostics. Top/mid/end and filtered-page-2/unfiltered-page-1 coverage are required; the end-only live proof closes no v2 case. QA-LEAD-002 remains open pending those measurements.
- **Open fixes:** QA-LEAD-001/F1 touched-field validation and visible invalid-submit recovery; NAV-QA-002 repeated-history focus (implemented with scoped proof below); F2/F3/F4 mobile density/clipped controls; C1 partial-month chart treatment; A1–A3 copy/discussion/detail hierarchy. Sol owns functional/test work, Opus owns visual implementation, and the external Opus QA lead owns acceptance. `Pass-02 styling decisions` (local QA evidence) route accepted AST-001/002/003/006/007 and verification AST-008 to Opus; deferred/passing reference treatments remain separate.
- No shared `8080`/`8000`/`5432` restart or mode-transition clearance. The shared frontend still explicitly selects demo mode; source default API and a successful private API candidate do not change its running build.
- PM subsequently opened a user-facing current-source Vite API preview at `http://127.0.0.1:8081`, proxying shared `8000`. Keep it available; it is not a compiled acceptance candidate. User interaction may change shared synthetic patients/notes/comments/read state. The earlier candidate's preserved baseline remains historical, and final acceptance must use infra's isolated frozen stack.

### Proposed scoped evidence mapping for PM and QA

These are candidate mappings for the lead's review, not checked-off master items. Exact assertions are in [the live suite](../../frontend/e2e-live/README.md).

| Cases | Candidate requirement coverage | Limits |
| --- | --- | --- |
| Directory, both projects | P2-09–12, P2-14, P2-17; `pl-cols/search/filter/sort/page`, `f-api` | Live source IDs/search/status/order/paging and virtual rows; no load/SLO claim. General scroll acceptance remains disputed. |
| Patient write, both projects | P4-01/02 and client-validation portion of P4-03; `pf-personal/medical/modes/submit` | All 17 writable fields, nullable clears, reload/fresh context, delete cancel/confirm. F1 and blur-error UX remain open. |
| Clinical, both projects | P3-05–08; `n-list/form/delete-ui`, `sm-ui` | Real timestamp/author/content, note URL, summary and tombstone refresh. |
| Deep routes, both projects | P2-15 and modal-geometry portion of P2-19; `pd-view`, `l-routes` | Direct/reloaded tabs and note, missing patient, bounds. Not blanket responsive or visual acceptance. |
| Discussion, cursor and row-action cases | FE-U02/07–10/12; bounded-read and whole-row additions | Two actors, unseen arrivals, exact server boundary/cursors, child actions. No forced equal DB timestamps or repeated-history focus proof. |
| Real failure case | Supporting API 422/403/404/410 behavior | Does not establish complete user-facing server-error or network-outage recovery (P4-04–06). |

### Subsequent review repairs (not part of candidate 03)

- **QA-LEAD-002 / NAV-QA-001, v2 baseline:** the new frozen compiled-DEMO matrix confirms a visible product defect: 82 scenarios passed and 58 failed across 160 measured returns, with zero setup/action errors. Mid-list anchor positions changed by up to −29px desktop, −95px mobile Overview and +89px mobile Notes; mobile top shifted −3px. I3 visible-row order also failed; I1 focus, I4 query state and applicable I5 end-pinning passed. Evidence: `/tmp/ascertain-scroll-v2-20261120T190334Z/handoff.json`; source frozen at `19:03:34Z`, aggregate `0cc3c60682c8f0c8da1619b8b5ba5b1f95e0a3c2f039fb68e0157322cb118a52`. This precedes Opus's compact-card changes. LIVE remains NOT_RUN. A dedicated Sol repair owns measured-position state/helpers; PatientResults integration follows explicit handoff from Opus to avoid concurrent writers. The new tests and all v1 evidence stay unchanged.
- **QA-LEAD-001 / F1:** form validation now reveals only blurred-field errors before submit, refreshes cross-field errors after edits, and validates the whole draft on submit. Failed attempts focus a visible summary with field links. Add/remove and Submit preserve pointer activation when blur changes layout. Frozen compiled-DEMO verification passed 24/24 browser checks (dark/light, desktop/mobile, including unchanged allergy touch/keyboard regressions); the identical recovery spec failed 12/12 on the baseline. Unit tests: 42/42. Scoped lint, typecheck and private build passed. Evidence/commands/screenshots/hash manifests: `/tmp/ascertain-form-recovery-20261120T185449Z/RESULT.json`. Parent verified all four identity manifests and all 17 owned-source hashes, plus unchanged QA control-test hash. Private port 4187 was stopped after handoff. This fixes the demonstrated behavior in its scoped candidate; final live/Opus acceptance remains open.
- **NAV-QA-002 / QA-LEAD-005:** committed workspace visits now rearm only the origin-matched return-focus flag. The saved scroll/filter/action snapshot and mounted workspace remain intact. No scroll restoration algorithm or threshold changed. New `e2e/history-focus.spec.ts` reproduces the old failure (0/4) and passes 6/6 frozen compiled-demo cases at 375/390/1440px, each with three Back returns and two Forward visits. Evidence, source/build hashes and preserved reports: `/var/folders/gh/2y0f0jnn71j9v5l95xbc495c0000gn/T/ascertain-history-focus-foezhrax/evidence-manifest.json`. Scoped worker unit checks: 18 passed. Private port 4188 stopped; QA originals unchanged. This awaits final integrated/lead acceptance.
- **QA-LEAD-003/007:** shared count formatting handles singular/plural announcements, including uncapped unread totals. The expanded theme trigger announces its saved choice; the collapsed trigger keeps its established `Theme` name. Thirteen focused component tests passed; patient-specific call sites are included in the ongoing Opus presentation lane. A parent combined focus/component rerun passed 23 tests across five files. Whole-tree TypeScript passed after the two transient parallel-edit errors captured in the focus worker's frozen snapshot were corrected.
- **Post-OPR validation mapping:** backend's stable handoff is `backend/tests/qa_faults/artifacts/20261120T190254373956Z-post-opr-final-checks-699f2c9a/handoff.json` (application hash `9627e57068effa5516a5c177fd52edd6f3a21be7c5b8c214bff0844d47a6a67f`). The parent added exact allergy-message cases to the form unit suite (23 form-page tests passed) and `e2e-api/validation-recovery.spec.ts` (4/4 browser cases at 390/1440px). They verify `body.allergies` mapping, preserved draft, visible focused summary and actionable field link. The browser cases deliberately inject the documented 422 response: these are HTTP-contract checks, not post-OPR live acceptance. Command: `npx playwright test --config playwright.api.config.ts e2e-api/validation-recovery.spec.ts --workers=1 --output=/tmp/ascertain-validation-recovery-http-20261120`. The shared backend was not rebuilt by frontend.
- **Next bound candidate:** new test-only lanes author the approved scroll-v2 matrix and the exact remaining core clauses (rendered API fields, home, 100-record paging/sort, ownership protection, profile-summary refresh, browser network failure and real 422/corrected resubmit). Execution waits for stable visual/frontend source and infra's post-OPR runtime. No response interception or shared outage may be represented as live proof.
- **Core proof authoring ready:** `core-acceptance-handoff.md` (later removed with the never-run spec it described) records six new journeys / 12 desktop-mobile cases, statically checked but LIVE NOT_RUN. They cover P2-09/13/17, P3-07/08 and P4-05/06. The permission case proves the other actor is not offered Delete plus actual API 403; it does not claim a rendered 403 alert. The network case explicitly declares page-local Chrome transport failure with no supplied response or shared outage. The validation case uses client-clock skew to get an actual server future-date 422, then corrects/resubmits. Original 16 cases plus these 12 plus two grouped v2 matrix cases make 30 collected live tests; the v2 groups contain 140 scenarios / 160 returns. Infra additionally receives `SCROLL_V2_IDENTITY_FILE` to bind that proof to its served candidate.

## Earlier integration run (preserved)

**2026-11-20 initial compiled live run: 3 passed, 13 failed. This gate is open.** The earlier demo and intercepted-contract passes below are historical evidence, not acceptance of this changing integration tree.

- Command from `frontend/`: `PLAYWRIGHT_LIVE_BASE_URL=http://127.0.0.1:4176 npm run e2e:live -- --workers=1`.
- Environment: an owned, compiled API-mode preview at `4176`, forwarding same-origin `/api` to the running FastAPI service on `8000` and its real PostgreSQL database on `5432`. The shared frontend at `8080` was not switched or restarted.
- Source state: an uncommitted frontend integration candidate. The compiled artifact filenames/hashes and HEAD observed during triage are recorded in `/tmp/ascertain-live-initial-failures-20261120.manifest.json`; the run is not represented as a committed-source result.
- Confirmed product blocker at this run: compiled dialog centering left `translate: -50% -50%` active after CSS optimization, placing a 390px mobile dialog at `x=-195, y=-422`. Explicit shadcn translation overrides repaired it; candidate 03 above supplies the later compiled retest.
- Separate test issues: some directory assertions need reconciliation with live records, and a broad allergy label locator also matched a Remove button. This is distinct from QA's real mobile Add allergy defect, whose blur-validation layout shift has been fixed and verified in focused demo checks; compiled live verification remains pending.
- Preserve evidence: original artifacts were copied to `/tmp/ascertain-live-initial-failures-20261120.zip` before reruns. QA-owned artifacts and expectations were not overwritten. The shared patient total returned to 100 after cleanup of test-created records.
- No shared restart or API-default rollout clearance has been given. Subsequent results will identify their rebuilt candidate and remain distinct from this failed run.

New selected work in progress: compact overview charts (status, ages, latest-visit month distribution, note coverage), default Dark with Lightbulb/LightbulbOff and saved Light/Dark/System choices, and plain rounded text tooltips without a pointer. Charts share one complete cached projection, make no hover requests, and do not require a new endpoint. The monthly series counts patients by **latest recorded visit**, not total clinic visits; missing visits remain explicit.

## Delivery status

- The [patient workspace](../../frontend/docs/ui-mocks/index.html) and [component gallery](../../frontend/docs/ui-mocks/components.html) are standalone HTML design mocks. They open directly in a browser with local synthetic data.
- The workspace and conversation/unread-notification interactions have passed local Chrome checks, including phone touch emulation and 375–1440px widths.
- The React frontend is implemented with Vite, TypeScript, Tailwind/shadcn, TanStack Router/Query/Table/Virtual/Form and Zustand. It includes responsive navigation/list/detail, patient CRUD forms, notes, summaries, authored comments and unread notifications. [Frontend run commands](../../frontend/README.md) cover demo and API modes.
- The [frontend data and endpoint contract](frontend-data-contract.md) documents the adopted backend wire fields, cursor/read semantics and normalization. Candidate 03 provides scoped live integration evidence; later backend/source changes still need a frozen integrated run.
- Explicit demo mode holds patient/note/comment changes in browser memory and resets them on reload. API mode is the frontend source default and uses HTTP only, with no fixture fallback. The shared running setup still explicitly uses demo pending coordinated transition.

## Additions to include in the final punch list

| ID | Requirement | Relationship to the assessment |
| --- | --- | --- |
| FE-U01 | Use a collapsible vertical sidebar; show labels as tooltips on hover and keyboard focus only when collapsed. Keep a small contextual header and mobile navigation. | Refines Part 2 layout/navigation |
| FE-U02 | Add a Notes column with the count of active clinical notes; open Notes directly from its number, including zero. | Extends Parts 2 and 3 |
| FE-U03 | Open patient detail in a two-panel workspace over a blurred decorative backdrop on wider screens; use full-screen detail with Back on phones. | Refines Part 2 patient view/responsiveness |
| FE-U04 | Compact the identity header while scrolling, retaining name, DOB, age and patient number; expand it again at the top. | Selected interaction addition |
| FE-U05 | Restore filters, sort, page, scroll and keyboard focus when closing detail; highlight the last patient in lilac. Remove background patient rows from the DOM while detail is open. | Selected interaction/accessibility addition |
| FE-U06 | Use TanStack Virtual for offscreen production rows where a page exceeds the viewport, while keeping server-side pagination and accessible navigation. | Selected performance addition; HTML mock remains paginated |
| FE-U07 | Add a Conversation column/card action showing total comments and a `New` badge for unread activity; open Discussion from that action. | Selected collaboration addition |
| FE-U08 | Show unread state inside the record and on new comment cards; reading Discussion marks only the displayed comments read for the current viewer. | Selected collaboration addition |
| FE-U09 | Add a desktop/mobile notification bell with the global unread-comment count; open a queue containing all patients with unread comments. | Selected collaboration addition |
| FE-U10 | Keep regular-list and notification-queue view state separate; return from detail to its source view, handle removal of a read patient and show an all-caught-up state at zero. | Selected interaction addition |
| FE-U11 | Use a small typed Zustand store for shared UI preferences, actor selection and return-to-list snapshots; keep server data in Query, live filters in Router and form values in Form. Compose small components and reuse named utility functions. | Selected architecture refinement |
| FE-U12 | Open patient Overview from any non-interactive row/card area, while preserving Notes/Conversation links, controls, text selection and keyboard access. | Selected interaction refinement |
| FE-U13 | Default to Dark only without a saved choice, support Light/Dark/System, reflect the resolved theme with lightbulb icons, and use rounded text-only tooltips. | Selected theme and component refinement |
| FE-U14 | Add four compact, responsive overview charts from one complete cached patient projection, including an interactive latest-visit monthly line with honest labels, totals and missing-value handling. | Status chart matches the original stretch; other charts are selected additions |
| FE-U15 | Default to the first actual `/users` result in both modes; preserve a valid saved choice and replace stale IDs after discovery. No initial selection gate. | Selected demo-identity refinement; PM owns narrow provider patch |
| FE-U16 | Show the selected user's stored assignment workload on Overview, with accurate user/cohort labels and charts/recent patients derived from the complete assigned population; preserve the shared 100+ patient directory. | New selected personalization; backend contract/migration/seed agreement and new live acceptance pending |

Unread activity is not a clinical status or urgency signal. The bell counts comments, while the notification queue counts affected patients; its subtitle should distinguish the two. Comments remain separate from clinical notes and never silently feed the patient summary.

## Backend and integration dependencies

- **List enrichment:** consume implemented `notes_count`, `comments_count` and per-viewer `unread_comments_count` without one child-resource request per row. Loading/unknown counts must not look like zero.
- **Complete-data notifications:** use wire `unread_only=true` before pagination and normalize `{unread_comments,patients_with_unread}` from the global summary. A filtered page is not the global badge total.
- **Read state:** backend owns durable per-user watermarks. Follow opaque chronological cursors and acknowledge the exact eligible `{through: read_through}`; preserve tied timestamp groups, unseen arrivals and actor/patient isolation. Do not use a single patient-wide flag or the superseded observed-ID proposal.
- **Read policy:** opening Overview/Notes/Summary or the queue does not mark discussion read. Own comments do not create self-unread; editing an existing comment only shows its edited timestamp in this scope. Failed acknowledgment retains unread state and offers retry.
- **Query invalidation:** comment changes and read acknowledgment refresh comments, list counts, unread queues and the global summary. Note changes refresh note counts. Partition viewer-specific query data by actor; preserve the clinical summary's separate inputs.
- **Ownership:** frontend builds UI/routing/query behavior; backend supplies implemented models, contracts and enforcement; data owns source preparation/exports; infra supplies proxy, container and CI wiring. Final acceptance is tied to the tested candidate, not merely endpoint registration.
- **Scope:** no push service or WebSocket requirement. Standard query revalidation can refresh notifications in the first implementation.

## Acceptance tests for the project manager

These boxes are intentionally unchecked for verification against the final integrated application.

- [ ] FE-U01: Sidebar collapses/expands; tooltips appear on hover and keyboard focus only when collapsed; mobile navigation exposes the same destinations.
- [ ] FE-U02: Notes counts match nondeleted notes across the full collection, update after mutations and open the correct patient's Notes view, including zero.
- [ ] FE-U03: Desktop/tablet detail uses the two-panel overlay; phone detail fills the viewport; background navigation is inert and no patient rows remain rendered behind the open record.
- [ ] FE-U04: Identity compacts and expands without scroll oscillation; required identifiers remain legible with long names and narrow widths.
- [ ] FE-U05: Close, Escape and browser Back restore list filters/sort/page/scroll/focus and highlight the correct patient; Forward and copied direct links also work.
- [ ] FE-U06: Offscreen rows are virtualized in the React implementation; rendering/focus works with 100+ patients, resized windows and a returned row outside the initial viewport.
- [ ] FE-U07: Total comments and unread counts are distinct; the `New` pill is absent at zero and does not replace Active/Inactive status; a zero-count action can start a discussion.
- [ ] FE-U08: Opening Overview or Notes preserves unread state; opening loaded Discussion acknowledges only displayed comments and initially identifies those newly read comments.
- [ ] FE-U08: One user's read acknowledgment leaves another user's unread count intact; posting one's own comment does not increase self-unread.
- [ ] FE-U08: Paged comments remain unread until loaded/displayed; an incoming comment after the acknowledged snapshot stays unread; failures preserve state and allow retry.
- [ ] FE-U08: Edits, comment deletion, patient deletion and repeated acknowledgments keep counts consistent and nonnegative.
- [ ] FE-U09: Bell total is global across accessible patients and independent of list filters/page; desktop and mobile badges agree and have useful accessible names.
- [ ] FE-U09: Notifications includes unread patients from later pages; entering it is not constrained by the regular list's stale search or status filters.
- [ ] FE-U10: Closing a record from Notifications returns to that queue; a newly read patient leaves it, pagination clamps and focus moves to a visible target.
- [ ] FE-U10: Zero unread activity hides the number bubble and shows all-caught-up; a filtered no-match state remains distinct; All patients restores its earlier view.
- [ ] FE-U11: Sidebar/actor/view state works through the shared Zustand store; changing actor cannot expose stale unread state; fetched entities and clinical drafts are not duplicated or persisted there. Shared helpers and component compositions cover their real consumers.
- [ ] Verify the workspace at 1440, 1024, 768, 390 and 375px, keyboard-only and reduced-motion settings, with no horizontal page overflow or runtime errors.
- [ ] Regression: patient list/search/filter/sort, CRUD and validation, timestamped notes, summaries, author attribution, note links, 404s, Docker deep-link refresh and CI still satisfy the original brief.

## Mock verification evidence

The initial HTML workspace/gallery passed Chrome checks for responsive layout, sidebar tooltips, forms, table paging/search, Notes entry, background-row removal, header compaction, Escape/focus restoration, browser Back/Forward, local note/comment creation and return-to-list highlighting. The mock made no remote resource requests.

The conversation extension starts with 18 unread comments across 12 synthetic patients. Chrome checks verified total/unread count separation, unchanged unread state after Overview/Notes visits, Discussion acknowledgment and visit-only New markers, own-reply exclusion, regular-list/notification-queue restoration, read-state persistence for the tab session, row removal/focus fallback, all-caught-up at zero, and mobile navigation. No horizontal page/table overflow was observed at 1440, 1280, 1024, 900, 834, 768, 390 or 375px. The prior workspace browser regression journey also passed with no JavaScript errors or remote requests.

These are HTML mock results. Per-user server isolation, read races, authorization, durable persistence and real API failures still need the integrated tests above.

## Historical React checks and integration handoff

- An earlier frontend snapshot passed lint, formatting, strict TypeScript, production build and 168 unit/component tests. Later scoped results and candidate identity appear above; this number is not a current full-suite claim.
- That earlier snapshot passed 22 demo browser cases on desktop/mobile, including virtualization, a 101st patient, notes, ownership controls, paged unread queues and linked-note drafts. Later QA found separate focus/scroll/form issues; the earlier pass does not close them.
- Seven earlier API-mode browser tests passed with intercepted HTTP contract responses, covering headers, serialization, errors, writes, tombstones, cache ordering, draft preservation and a mobile path. Those are transport/UI tests, not database evidence, and protocol changes require their own rerun.
- Independent reviews led to fixes for draft loss on cached refresh failure and note-route remounting, stale PUT/read-receipt counts, and terminal-access cache resurrection. Terminal errors now discard exact patient/actor cached detail; success is required to restore it, while recoverable outages preserve drafts.
- The adapter now maps `unread_only` and notification wire names, consumes chronological comment cursors/`is_unread`, sends exact `{through}`, and normalizes nullable context/current field limits. Candidate 03 exercises these live. Remaining gates are post-fix candidate identity, review findings, backend error-envelope updates and infra's default/restart proof.
- Infra owns serving `dist/`, setting `VITE_DATA_MODE=api` for a live-integration build, SPA fallback, API proxying, database startup/seed invocation and CI. Run the final project-manager acceptance list against that assembled stack; the unchecked boxes above intentionally remain for that stage.
