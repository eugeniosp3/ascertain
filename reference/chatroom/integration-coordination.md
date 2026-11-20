# Application integration coordination

Updated 2026-11-20. The next milestone is the patient workspace running against the real FastAPI/PostgreSQL stack, with reproducible setup and evidence from complete user journeys.

## Current baseline

- The published repository is `eugeniosp3/ascertain`. Hosted CI passed on the published baseline; current backend integration edits are still local.
- Shared Docker services remain on 8080/8000/5432; 8080 uses the demo adapter. PM user preview http://127.0.0.1:8081 uses explicit API mode against 8000/PostgreSQL. It is current development source, not an acceptance snapshot. Users may change the shared synthetic records/read state there.
- Frontend and backend have agreed to use the backend's existing wire contract and chronological discussion cursor. Backend's viewer-specific `is_unread` addition is ready and tested; frontend integration is undergoing live validation.
- Demo browser tests and intercepted HTTP-contract tests are useful regressions, but do not establish live PostgreSQL-backed browser behavior.

## Ownership and handoffs

| Owner | Work | Handoff evidence | Current state |
| --- | --- | --- | --- |
| Backend | Preserve API/domain invariants and complete fault coverage; address actionable validation messages, OpenAPI error declarations and artifact collection. | Exact post-fix source identity, regression results and case-level fault evidence. | Post-OPR34e2150b repair evidence is accepted in stated pass 03 scopes and independently reproduced. NEW assignment model/API/seed work is now in flight; the old source freeze is historical. |
| Frontend | Complete real API integration and fix the Opus form/navigation/visual findings. | Exact compiled candidate/source identity, live results and fresh Opus decisions. | Earlier private live candidate16/16; form/history repairs accepted in DEMO. Visual and measured-scroll fixes continue; new default-user/assigned-overview behavior must be included in the next candidate. |
| Infra | Verify the final API-mode setup, privacy/cache headers, artifact exclusions and CI. | Isolated post-fix stack evidence and hosted run for the integrated revision. | Independent frozen-backend checks image passed236 backend / 160 data tests plus lint/format/mypy and artifact exclusion. Full runtime/live freeze awaits the NEW backend assignment and stable frontend handoffs. |
| Project manager | Maintain this handoff, resolve cross-owner conflicts, check acceptance evidence and keep requirement/study documentation aligned after integration settles. | Requirement-by-requirement readiness assessment with remaining gaps explicit. | Coordinating. |

Backend owns `backend/`. Frontend owns `frontend/` plus its two handoff documents in `reference/chatroom/`. Infra owns `infra/`, root setup/configuration and CI. The project manager owns the root README, this coordination record and the requirement/study annotations. QA owns its inventories, outcomes and review evidence, with the isolated worker scopes recorded in the parallel-work plan. Coordinate any cross-owner edit first. Preserve the explanatory code comments added for study.

## Opus review and visual direction

The user appointed the existing **Opus 5.5 UltraCode QA lead and code reviewer** as the single code/design acceptance authority. QA coordinates evidence imports; Codex workers continue implementation tests and evidence preparation. Their passing results alone do not grant final code or visual acceptance.

- The lead owns `qa/lead/opus-5-5/` and may use its private compiled demo preview on 4194.
- A separate Opus 5.5 UltraCode visual/UX review owns reports and screenshots under `qa/lead/opus-visual-review/`, with private compiled demo 4195 if needed. It compares the rendered application against the approved mockups/design system, including hierarchy, typography, chart density, dark/light styling, responsiveness, reachable controls and interaction quality.
- An Opus 5.5 UltraCode backend/data/delivery review owns reports under `qa/lead/opus-platform-review/`, with no runtime port or shared-state changes. It reviews implementation, contracts and the scope of verification claims.
- Both specialist reviews feed the existing Opus lead. They do not edit production code or compete with implementation owners.
- Frontend visual/chart implementation and design decisions are assigned to Opus 5.5 UltraCode under the frontend lead. Any displaced active visual writer must be stopped before another writer takes the same files. Distinct nonvisual/test workers may continue.
- New review passes after fixes are fresh Opus review tasks. Findings, unreviewed scope and the lead's written decision remain explicit; launching a reviewer does not close an acceptance item.

The visual review must preserve the user's compact responsive charts, rounded text-only tooltips, Dark default with saved Light/Dark/System choices, and Lightbulb/LightbulbOff controls. Automatic test success does not replace inspection of the actual rendered design.

## Styling accessibility documentation

The dedicated Accessibility agent is **documentation-only and styling-only**. It owns `qa/accessibility/` and will provide measured color/contrast, typography, spacing, responsive visual styling and state-appearance findings, including applicable primary-source guidance. It must not edit the application or expand into functional, ARIA, screen-reader or keyboard-flow implementation work. Optional rendered measurements use its own compiled demo on 4196; shared services and other previews remain untouched.

The project manager reviews the document and separates demonstrated problems from preferences. Accepted recommendations are consolidated with the Opus QA/design lead, assigned to the existing frontend/Opus implementation owner, and verified after implementation. Completing the document does not mark the recommended fixes or overall accessibility as complete.

## Agreed integration contract

The backend's current `API_CONTRACT.md`, generated OpenAPI and regression-tested behavior are the shared wire contract. UI-facing names may remain descriptive if the HTTP adapter maps them explicitly.

- Patient filtering sends `unread_only`; notification responses use `unread_comments` and `patients_with_unread`.
- Discussion follows `next_cursor` oldest-first within a bounded snapshot. Acknowledge the displayed prefix using `{through: read_through}`. Preserve equal-timestamp/deletion/concurrent-arrival protections.
- Backend supplies per-comment `is_unread` for the selected viewer; own comments and anonymous reads are not unread. The frontend must not infer per-comment state from a global total.
- Align nullable patient context, user fields, full PUT bodies and validation limits. No silent fallback from API failures to fixtures.
- `X-Demo-User-ID` remains a synthetic actor selector, not authentication. No new identity or infrastructure platform is required for this milestone.

## Sequence

1. Backend finishes the additive comment field and tells frontend exactly which tests/response shape are ready.
2. Frontend can adapt the established contract in parallel, then completes the real-stack browser journey after backend readiness. It supplies a repeatable live test command and required environment variables to infra.
3. Infra prepares live CI/configuration in parallel. Once frontend reports the live journey passing, make the normal interviewer setup use API mode; retain explicit demo mode as an option. Coordinate any shared container restart with frontend's active browser run.
4. Run combined regressions and a clean compiled stack. Capture the exact source revision/file state being verified. Integrate/publish through the existing repository workflow without including unrelated unfinished edits or personal study materials.

## Live browser handoff

Frontend and infra both accepted this interface:

- Command: `npm run e2e:live -- --workers=1`, using `playwright.live.config.ts` and `e2e-live/`.
- Required `PLAYWRIGHT_LIVE_BASE_URL` identifies an already-running compiled API-mode frontend; the suite does not start its own dev server or intercept HTTP requests.
- Real API calls use the stack's same-origin `/api`; discover current demo actors rather than hardcoding mock IDs.
- Failure artifacts go to ignored `frontend/e2e-live/results/`. Keep demo and intercepted-contract suites separately named.
- Frontend owns browser fixtures, disposable test records and complete UI journeys. Infra owns isolated stack initialization, teardown, restart and seed-preservation verification.
- Browser projects: `desktop-chrome` and `mobile-chrome` at 390px with touch emulation; installed Chrome is required. No additional credentials are needed. `SCROLL_V2_IDENTITY_FILE` is now required for bound v2 acceptance; it names the candidate manifest. JSON reports default to `e2e-live/results/report.json` and can be redirected with `PLAYWRIGHT_JSON_OUTPUT_FILE`.
- Tests create run-unique patients and clean up only their created IDs. They do not edit seed records or reset seed users' read state.
- Infra's `--live-browser` verifier builds a compiled API-mode stack, migrates/seeds, runs the live browser suite first, confirms cleanup/seed markers, then performs deliberate seed-edit/deletion restart checks. This ordering protects test expectations.
- Frontend may stage against its own API-mode frontend while the shared stack stays stable. Only infra controls the shared 8080/8000/5432 lifecycle; frontend has not yet cleared a mode change or restart.
- Frontend has also accepted a newly requested Light/Dark/System theme using semantic tokens, a theme provider and persisted UI preferences. It needs dedicated desktop/mobile, system-preference and persistence checks; it does not change the backend contract.
- Theme defaults to Dark only when no preference is saved; saved Light/Dark/System choices are respected. System follows the OS. Lightbulb/LightbulbOff controls require accessible labels.
- Four overview charts are selected: patient status, age bands, an interactive monthly latest-visit line with missing visits identified, and clinical-note coverage plus note totals. The monthly line counts patients by latest recorded visit month, not total historical clinic visits. Originally one cached paged global projection supplied the charts. The latest user request supersedes that scope: use a complete assigned cohort keyed by actor, with backend `assigned_to=me` and dashboard `scope=assigned`. No per-patient detail requests are needed. Empty/all-active data, date boundaries, error/loading states, accessible values and dark/light presentation need tests. These additions do not change the original assessment denominator.

## Handoff evidence

- Published baseline: `611bda5400332550708b3c39f049d3ee7690b01f`; [hosted CI pass](https://github.com/eugeniosp3/ascertain/actions/runs/44781809472). This precedes the current integration changes.
- Backend reports six changed files for the additive unread field: comment schema/router/service, `test_comment_unread.py`, notification regressions and `API_CONTRACT.md`. Focused discussion/unread tests: 27 passed; full backend suite: 196 passed; Ruff lint/format, strict mypy and diff whitespace checks passed. Tests used a disposable migrated PostgreSQL database; no live-data writes or container lifecycle changes were made for this handoff.
- Coordinator independently read the running API: health/readiness 200, patient total 100, two users, and `CommentResponse.is_unread` present in OpenAPI. These read-only checks confirm availability; they are not final browser acceptance.
- A narrow independent source review found the backend handoff coherent: viewer forwarding, batched watermark lookup, strict cutoff comparison, own/anonymous handling and mutation-author serialization align. Cursor/acknowledgment behavior is unchanged; targeted regressions cover the relevant boundaries. This review did not rerun the backend tests.
- Frontend subsequently reported 130 focused adapter/validation tests and eight focused whole-row/mobile-card interaction tests passing. Cursor discussion, theme work and the complete live browser run remain pending; these scoped results do not replace full current-tree QA.
- Initial staged compiled live run: 3 passed / 13 failed out of 16 cases, using the frontend-owned compiled preview on 4176 and real shared API on 8000. The confirmed primary product blocker is modal positioning that places controls outside the viewport. Directory assertions and an ambiguous live-test allergy locator are being triaged separately from QA's reproducible mobile Add allergy defect. API negative cases and desktop whole-row opening passed. The owner preserved failed artifacts in `frontend/e2e-live/results/` and archived them before reruns; disposable-record cleanup restored the shared patient total to 100. No shared restart, mode switch, publication clearance or live acceptance is granted by this run.
- The additional forms lane delivered 26 candidate case IDs: 13 direct demo UI cases and 13 supporting-only save/reopen cases. Its 51 applicable observations passed across 39 test/project executions on one frozen compiled demo artifact, including the mobile allergy regression. Failed harness attempts, hashes, mappings and cleanup proof are retained under `qa/frontend/parallel/forms/`; port 4191 is clear. The lead subsequently accepted nine full form mappings and retained supporting/partial clauses. No live acceptance follows; pending-save and network/server-error scenarios remain blocked in that unmodified demo adapter.
- The first Opus lead decision now accepts 41 full compiled-demo case proofs, 28 supporting proofs, three failures, two rejected mappings, six definition revisions and five blocked cases. QA imported the scoped decisions while retaining the 637-case baseline and separate chart proposals. These do not grant live or release acceptance. The second and third serial passes are now complete; their later decisions are recorded below without rewriting this historical first-pass scope.
- New functional live candidate: `candidate-03` in `/tmp/ascertain-live-sol-20261120T182341Z/`, with 157 frontend source hashes captured at 18:34:05 UTC and aggregate `c43bde5d705308197482d731784003ef06a5c9efa89fe1dcb6e73414ee35cb30`. The owner verified 75 artifact hashes. Run 05 passed 16/16 desktop/mobile cases in 36.1 seconds without retries/skips; all 58 created IDs were absent afterward and the original 100-patient set/unread totals were preserved. No immutable backend source/image/OpenAPI identity was captured at run start, so this is not an exact post-OPR backend candidate claim. Infra's isolated post-fix run must close that provenance and restart gap.
- Current shared-stack read-only check: frontend 8080 still embeds `VITE_DATA_MODE=demo`; `/api/health`, `/api/ready`, `/api/users` and `/api/patients` reach the real backend. Direct PostgreSQL counts match the API's 100 patients and two users. The frontend selector simulates authorship and personal unread state; it does not partition patient access.
- Opus pass 02 accepted nine core IDs in candidate-03 scopes. The metric counts eight as verified and P2-12 as desktop-only partial, preserving the excluded mobile clause: 39 verified / one partial / 11 open. Five work items close in that scope; later source drift remains unverified. Original v1 scroll failures are retained and a new test-only v2 lane is measuring the approved user-facing invariants before any restoration change.
- Backend post-OPR handoff is stable and independently hash-checked by infra: 112-file digest `34e2150b2653ce418ef2aa73d0e01bd0466cc87237af34ec249fd9a71972bbb7`, application digest `9627e57068effa5516a5c177fd52edd6f3a21be7c5b8c214bff0844d47a6a67f`; 236 ordinary tests pass with no fault-module imports, plus lint/format/mypy. Validation/error-schema regressions and actual 422 proof are recorded under the backend-owned post-OPR artifacts. This does not claim a fresh 317-case rerun or hosted/live release acceptance.
- Frontend supplied separate repaired candidates: repeated-history focus 6/6 compiled-demo checks at 375/390/1440, and form recovery 24/24 browser checks after a 12-failure baseline, plus 42 form units. Their source/build hashes are distinct from candidate-03. Serial Opus pass 03 accepted those scoped repairs and corrected backend contract/docs. It closed no additional core check. The later v2 run measured82 passed / 58 failed across 140 scenarios; core-gap live tests remain unrun.

Current findings, owner actions and PM styling proposals are consolidated in [review-actions.md](review-actions.md). Historical failures remain available after a newer scoped pass.

## Final integration acceptance

- [ ] A fresh normal setup runs migrations and seeds at least 100 patients, then presents actual API-backed records in the browser.
- [ ] List, search, filter, sort, pagination and direct patient/404 routes work against the real service.
- [ ] Whole-row and mobile-card opening work without swallowing Notes/Conversation links, controls or keyboard navigation.
- [ ] Create/edit/delete validates correctly, handles network/server failures and refreshes affected views.
- [ ] Notes and template summaries persist and update correctly; clinical notes remain separate from discussion.
- [ ] Two demo viewers have independent unread state; own comments, edits, paged reads, equal timestamps, deleted comments and newer arrivals retain the documented semantics.
- [ ] Note links, deleted-note indicators, notification totals and queue state remain consistent after mutations.
- [ ] Browser reload and container restart preserve application edits/deletions and do not duplicate or resurrect seed data.
- [ ] Desktop/mobile/focus/return-to-list regressions pass in the integrated application.
- [ ] CI distinguishes demo, intercepted-contract and real-stack browser tests; all required checks pass for the integrated revision.
- [ ] README, frontend/backend contract docs and requirement coverage match the verified default behavior.

Use isolated Compose projects/disposable records for destructive checks. Do not reset the user's development volume. Each owner should report files changed, checks and exact commands, verification environment, unresolved items and the next handoff.

## Current wrap-up handoff — 20 Nov, 19:33 UTC

- Pass 03 closes `pf-client` (compiled DEMO) and `d-contract`/`a-docs`/`r-api` (backend 34e2150b). Core remains39 verified / 1 partial / 11 open; P4-03/04/06 need integrated proof. See `pass03` (local QA evidence).
- Infra independent evidence is under `infra/artifacts/backend-post-opr-20261120T191801Z-2e9937db/`:236 backend + 160 data tests, lint/format/mypy, all 30 approved harness sources retained and zero generated artifacts. Image `sha256:cb1aa3109179ebe119f1cc1bc058ba2891f598c79b633a2699f627bc365469d3`; no standalone API/frontend ran. First input-omission failure is retained. OPR008 lead/QA-export closure is still pending.
- Scroll v2 initial frozen DEMO evidence: `/tmp/ascertain-scroll-v2-20261120T190334Z/handoff.json`,82 pass / 58 fail,140 scenarios / 160 returns, zero setup/action errors. I2 anchor and I3 visible-ID invariants fail; I1/I4/I5 pass. Preserve original v1 failures. The dedicated repair owner needs the visual owner's `PatientResults` handoff before integration.
- The expanded live suite collects 30 tests in 7 files: original 16 + 12 core clauses + 2 grouped scroll matrices. Static authoring is not live acceptance.
- New User A behavior: first actual `/users` result is selected automatically in API/demo mode; a valid saved selection is preserved. PM owns only actor-context, its tests and the affected intercepted-contract fixture/spec expectations; no selector styling, store or scroll code changed.
- NEW workload model: backend owns nullable indexed `assigned_user_id` FK, migration `20261120_0002`, deterministic repeat-safe `demo-assignments-v1` seed, creator assignment, read-only membership, `assigned_to=me` filtering and `scope=assigned` dashboard metadata. Frontend owns the complete assigned projection, actor+scope cache keys, charts/recent patients and clear assigned-cohort labels. Global directory remains100+;  clinical/status/visit facts stay unchanged; notifications remain global per viewer. This is not RBAC. Exact contract is recorded in [review actions](review-actions.md).
- Backend34e2150b is now historical; no integrated freeze or shared migration/restart until the new assignment handoff is stable and coordinated. The user-facing 8081 preview must remain available; don't treat its mutable DB state as a frozen acceptance fixture.
