# Project punch card

[Project overview](../README.md) · [Interactive view](holepunch.html) · [Assessment](project.md)

Updated 2026-11-20 21:11 UTC. This covers the original assessment and selected additions. A checked box means verified in the scope shown; it does not turn a demo or fixture test into live-application acceptance.

**Core assessment: 51/51 checks verified in reviewed scopes (100%).** 0 partially verified; 0 still open.

The 51 checks split the original assessment into individually testable requirements. Stretch goals and extra features are tracked separately in the detailed card.

| Assessment section | Verified | Partial | Still open |
| --- | ---: | ---: | ---: |
| Submission | 3/3 | 0 | 0 |
| Part 1 | 10/10 | 0 | 0 |
| Part 2 | 20/20 | 0 | 0 |
| Part 3 | 8/8 | 0 | 0 |
| Part 4 | 6/6 | 0 | 0 |
| Part 5 | 4/4 | 0 | 0 |

The detailed card also tracks recommendations and selected additions; those are separate from the core assessment denominator.

**Detailed work: 149/151 items verified in stated scopes.**

- Submitted. Hosted CI is green on add0bdd, and every core requirement is verified.
- Final pass (no new features): QA regression with independent test agents, verification of every implemented stretch goal, and a cleanliness sweep; only confirmed defects get fixed, then a final push.

151 tracked items: 149 verified in stated scope, 0 partially verified; excluded scope open, 0 implemented; acceptance pending, 0 in progress, 0 planned, 2 not selected.

## Verification record

| Evidence | Scope and interpretation |
| --- | --- |
| Latest accepted repairs and independent checks | Pass03 closes four detailed items and moves P4-03/04/06 to specific-proof-pending, with no new core closure. Infra checks image cb1aa310…469d3 verifies owner backend34e2150b,236 backend +160 data tests, all30 approved harness sources retained and zero generated artifacts. OPR008 combined proof awaits lead/QA-export closure; no application server or frontend was run in that check. New assigned-overview backend work is now in flight;34e2150b remains the identity of the completed checks, not the upcoming application candidate. [infra/docs/checklist.md](../infra/docs/checklist.md) · [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md) |
| Published baseline | Revision 611bda5 passed hosted checks, image builds, seeded startup/restart/proxy verification and demo/intercepted browser suites. This is earlier baseline evidence, not acceptance of later local integration changes. [Hosted CI run](https://github.com/eugeniosp3/ascertain/actions/runs/44781809472) |
| Backend handoff | 196 full tests and 27 focused discussion/unread tests passed against disposable PostgreSQL; lint, format and strict typing passed. Independent QA subsequently reproduced the 196-test pass and all 317 live HTTP scenarios on isolated services. [backend/README.md](../backend/README.md) · [backend/docs/API_CONTRACT.md](../backend/docs/API_CONTRACT.md) · [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md) |
| Frontend baseline | 168 unit/component, 22 demo-browser and seven intercepted-HTTP tests passed on the earlier baseline. These scopes do not establish persistent live UI behavior. [frontend/README.md](../frontend/README.md) · [reference/chatroom/frontend-updates.md](../reference/chatroom/frontend-updates.md) |
| Current focused frontend work | Historical adapter/row checks passed. Subsequent form recovery (24 browser / 42 unit) and history focus (6 browser) repairs are accepted in compiled-DEMO scope by pass 03. Current visual/restoration work and the expanded live suite remain pending. [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md) |
| Data preparation | 160 pipeline/fixture tests reported passing; 21 read-only stage validations verify 100 patients and raw/clean lineage. This preparation evidence is separate from UI integration. [data/docs/HOLEPUNCH.md](../data/docs/HOLEPUNCH.md) · [data/README.md](../data/README.md) |
| Independent QA snapshots | The 17:45 QA snapshot and its failures are historical. Current exported baseline retains637 UI cases (115 PASS / 515 NOT_RUN / 7 BLOCKED as of19:17) and336 API cases (317 PASS /19 NOT_RUN); versioned scroll definitions and separate pass03 backend decisions do not erase older failures. Chart proposals remain outside637; do not sum executions as unique coverage. [reference/project.md](../reference/project.md) |
| Live CI preparation | The isolated API-mode runner and live lane are prepared with static/mocked checks. No real live runner pass or shared mode transition is claimed yet. [infra/docs/checklist.md](../infra/docs/checklist.md) · [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md) |
| Initial staged compiled live run | Frontend owner reports 3 passed and 13 failed across 16 cases on its compiled preview at 4176 against the real shared API. Confirmed modal-positioning failure places controls outside the viewport. Other directory/locator failures are being classified separately. Failure evidence was archived before reruns; disposable-record cleanup restored 100 patients. This is a failed acceptance run, not a release pass. [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md) · [frontend/playwright.live.config.ts](../frontend/playwright.live.config.ts) |
| Additional forms demo candidates | Historical producer delivery: 26 candidate IDs and 51 applicable observations across 39 executions. Pass 01 accepted nine full form DEMO mappings and retained 17 partial/supporting scopes. Later pass 03 accepts the separate form-recovery repair; no blanket live persistence claim follows. [reference/project.md](../reference/project.md) |
| Opus lead decisions | The first written pass adjudicated 85 unique case IDs: 41 full compiled-DEMO proofs, 28 supporting, three failures, two rejected mappings, six definition revisions and five blocked. It grants no live or release acceptance; subsequent source drift and chart proposals are separate. [reference/project.md](../reference/project.md) |
| Functional live candidate | The frontend owner verified 75 artifact hashes for candidate-03: 16/16 desktop/mobile live journeys pass, 58 created IDs cleaned, baseline totals preserved. No immutable backend identity was captured at run start. Current-source/visual and isolated post-OPR platform acceptance remain open; shared8080 is still demo. [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md) · [reference/chatroom/review-actions.md](../reference/chatroom/review-actions.md) |
| Opus visual and platform findings | Compiled modal/theme behavior passes in reviewed scope, but visual form/mobile/navigation issues remain. Platform review found actionable logging, validation-message, OpenAPI and artifact-exclusion issues. Owners are fixing them; reviews are not a release pass. [reference/chatroom/review-actions.md](../reference/chatroom/review-actions.md) |
| Opus pass-02 scoped closures | Nine core IDs are closed in stated candidate scopes: eight are counted verified, and P2-12 is shown separately as desktop-only partial because mobile pagination remains blocked by F3. Five work items close in that same candidate scope; client/server feedback items reopen. Current source drift, shared demo mode and visual blockers still prevent overall acceptance. [reference/project.md](../reference/project.md) |
| Stable post-OPR backend candidate | Owner-frozen 112-file backend source 34e2150b…bbb7 passed236 ordinary tests; pass03 accepts the validation/OpenAPI/backend artifact-exclusion clauses. Infra independently reproduced236 backend and160 data tests plus lint/format/mypy in a checks image. Pre-OPR HTTP/fault proofs keep their identities; new runtime/frontend acceptance remains open. [backend/README.md](../backend/README.md) · [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md) |

## Core assessment checks

Each row traces directly to the original assessment. The detail-item IDs link the requirement to implementation and evidence below. Optional stretch features do not reduce this core percentage.

| Check | Original requirement | Status | Evidence / remaining acceptance |
| --- | --- | --- | --- |
| SUB-01 · Submission requirement 1 | Public GitHub repository | Verified in stated scope | `g-push`, `g-send`. The public repository URL must be reachable and provided for submission. Verified evidence is recorded on the mapped work items in their stated scope. |
| SUB-02 · Submission requirement 2 | Succinct README with local run instructions | Verified in stated scope | `r-quick`, `r-local`, `r-short`. Verify current root documentation, folder links and commands against the shipped configuration. Verified evidence is recorded on the mapped work items in their stated scope. |
| SUB-03 · Submission requirement 3 | Compose launches the service easily | Verified in stated scope | `c-compose`, `c-clean`, `g-verify`. Verified 20 Nov with a clean-room run (infra/scripts/verify_stack.py --live-browser): a fresh isolated Compose project with an empty env file builds all three images, builds the frontend in API mode, migrates and seeds 100 patients on startup, passes HTTP, proxy, restart and persistence checks, and passes the live browser journeys on real PostgreSQL. |
| P1-01 · Part 1 frontend task 1 | Initialize React application | Verified in stated scope | `f-vite`. React/TypeScript app initialized; Vite is preferred by the brief, not a separate mandatory vendor requirement. Verified evidence is recorded on the mapped work items in their stated scope. |
| P1-02 · Part 1 frontend task 2 UI framework/component library | Choose and configure UI components | Verified in stated scope | `f-ui`. The selected UI library must actually be configured and used; shadcn/Radix satisfies the open choice. Verified evidence is recorded on the mapped work items in their stated scope. |
| P1-03 · Part 1 frontend task 2 state management | Choose and configure state management | Verified in stated scope | `f-query`. Query, Router, Form and Zustand ownership is explicit; the brief does not require any named state library. Verified evidence is recorded on the mapped work items in their stated scope. |
| P1-04 · Part 1 frontend task 2 routing | Choose and configure routing | Verified in stated scope | `f-router`. A configured routing solution; route-specific acceptance appears in Part 2. Verified evidence is recorded on the mapped work items in their stated scope. |
| P1-05 · Part 1 frontend task 2 styling | Choose and configure styling | Verified in stated scope | `f-ui`, `d-design`. Tailwind and shared tokens/components implement the chosen styling approach. Verified evidence is recorded on the mapped work items in their stated scope. |
| P1-06 · Part 1 frontend task 3 linting and formatting | Configure linting and formatting | Verified in stated scope | `f-lint`. Check available scripts/configuration; record the tested revision when citing a passing run. Verified evidence is recorded on the mapped work items in their stated scope. |
| P1-07 · Part 1 frontend task 3 TypeScript configuration | Configure TypeScript | Verified in stated scope | `f-ts`. TypeScript configuration is present and the checked build/typecheck is identified. Verified evidence is recorded on the mapped work items in their stated scope. |
| P1-08 · Part 1 backend task 1 | FastAPI health endpoint | Verified in stated scope | `b-init`, `b-health`. GET /health returns HTTP 200 and exactly {"status":"ok"}. Verified evidence is recorded on the mapped work items in their stated scope. |
| P1-09 · Part 1 backend task 2 | Recreatable PostgreSQL patient schema | Verified in stated scope | `b-db`, `b-schema`, `b-recreate`. Another developer can recreate the real PostgreSQL schema using migration/init commands. Alembic is the selected implementation, not a core mandate itself. Verified evidence is recorded on the mapped work items in their stated scope. |
| P1-10 · Part 1 backend task 3 | Realistic automatic startup seed | Verified in stated scope | `b-seed`, `b-seed-safe`. Fresh startup imports at least 15-20 fictional patients automatically; the actual 100-patient seed exceeds the minimum. Verified evidence is recorded on the mapped work items in their stated scope. |
| P2-01 · Part 2 task 1 GET /patients | List patients with pagination | Verified in stated scope | `a-list`. Verify page bounds, page size, matching totals and actual PostgreSQL results. Verified evidence is recorded on the mapped work items in their stated scope. |
| P2-02 · Part 2 task 1 GET /patients/{id} | Get a patient | Verified in stated scope | `a-get`. Existing patient returns its record; unknown patient returns a meaningful 404. Verified evidence is recorded on the mapped work items in their stated scope. |
| P2-03 · Part 2 task 1 POST /patients | Create a patient | Verified in stated scope | `a-post`. Validated create persists and returns the saved record with appropriate success/error statuses. Verified evidence is recorded on the mapped work items in their stated scope. |
| P2-04 · Part 2 task 1 PUT /patients/{id} | Update a patient | Verified in stated scope | `a-put`. Validated update persists according to the documented full-replacement contract. Verified evidence is recorded on the mapped work items in their stated scope. |
| P2-05 · Part 2 task 1 DELETE /patients/{id} | Delete a patient | Verified in stated scope | `a-delete`. Patient and documented dependent records are removed; missing records handled correctly. Verified evidence is recorded on the mapped work items in their stated scope. |
| P2-06 · Part 2 task 2 header with navigation | Header with navigation | Verified in stated scope | `l-shell`. Visible usable navigation is part of the responsive shell; can be verified independently of persistence. Verified evidence is recorded on the mapped work items in their stated scope. |
| P2-07 · Part 2 task 2 sidebar | Sidebar | Verified in stated scope | `l-shell`. Sidebar and its narrow-screen equivalent are implemented and usable. Verified evidence is recorded on the mapped work items in their stated scope. |
| P2-08 · Part 2 task 2 main content area | Main content area | Verified in stated scope | `l-shell`. The layout supplies a usable main region for routes and content. Verified evidence is recorded on the mapped work items in their stated scope. |
| P2-09 · Part 2 task 3 name age last visit status | Patient rows/cards show required fields | Verified in stated scope | `pl-cols`, `f-api`. Verified 20 Nov on the API-mode app with real PostgreSQL data at 1440px and 390px. Rows show name, age, last visit and status (e.g. Daniel Adams, 55 years old, last visit Jul 5, 2026, Active). |
| P2-10 · Part 2 task 3 search/filter functionality | Search and filter patients | Verified in stated scope | `pl-search`, `pl-filter`, `a-query`, `f-api`. Opus pass 02; compiled LIVE candidate-03 at the recorded run, against a shared backend without immutable start identity. Later working-tree fixes and the default/shared setup are outside this closure. Projects: desktop-chrome 1440x960, mobile-chrome 390x844. Status filter is proven on a test-created inactive record; real seed is all-active (OPR-009) |
| P2-11 · Part 2 task 3 sorting capabilities | Sort patients | Verified in stated scope | `pl-sort`, `a-query`, `f-api`. Opus pass 02; compiled LIVE candidate-03 at the recorded run, against a shared backend without immutable start identity. Later working-tree fixes and the default/shared setup are outside this closure. Projects: desktop-chrome 1440x960 (header sort), mobile-chrome 390x844 (sort select). Only name sort exercised live. Age/last-visit keys remain backend-verified (a-query) and demo-verified (pl-sort); not live-UI proven |
| P2-12 · Part 2 task 3 pagination or infinite scroll | Page through patients | Verified in stated scope | `pl-page`, `a-list`, `f-api`. Verified 20 Nov at 1440px and 390px on real data: '1–20 of 100 patients', rows-per-page control shows '20' unclipped, page 1 of 5 with next/previous. The mobile clipping defect is fixed. |
| P2-13 · Part 2 task 4 / | Dashboard home route | Verified in stated scope | `l-home`, `l-routes`. Verified 20 Nov: / loads the overview with real totals (52 or 48 assigned patients depending on the demo user), charts and recent visits. |
| P2-14 · Part 2 task 4 /patients | Patient list route | Verified in stated scope | `l-routes`, `f-api`. Opus pass 02; compiled LIVE candidate-03 at the recorded run, against a shared backend without immutable start identity. Later working-tree fixes and the default/shared setup are outside this closure. Projects: desktop-chrome, mobile-chrome. A direct document load of /patients stands in for refresh. Restoring query state after refresh is not asserted |
| P2-15 · Part 2 task 4 /patients/:id | Individual patient route | Verified in stated scope | `pd-view`, `l-routes`, `f-api`. Opus pass 02; compiled LIVE candidate-03 at the recorded run, against a shared backend without immutable start identity. Later working-tree fixes and the default/shared setup are outside this closure. Projects: desktop-chrome, mobile-chrome.  |
| P2-16 · Part 2 task 4 404 page | 404 page | Verified in stated scope | `l-404`. Unknown client routes render the application not-found state instead of blank/crashed UI. Verified evidence is recorded on the mapped work items in their stated scope. |
| P2-17 · Part 2 requirement 1 | Handle 100+ patients efficiently | Verified in stated scope | `pl-100`, `a-list`, `pl-virtual`, `f-api`. Verified 20 Nov: all 100 real patients page through server-side pagination (5 pages of 20), with search, filter and sort handled by the API. |
| P2-18 · Part 2 requirement 2 | Non-blocking search | Verified in stated scope | `pl-search`. Typing remains responsive while search work happens; debounce/cancellation is the implementation, and behavior must be verified. Verified evidence is recorded on the mapped work items in their stated scope. |
| P2-19 · Part 2 requirement 3 | Responsive lower-resolution layout | Verified in stated scope | `l-resp`, `pl-mobile`. Verified 20 Nov at 390px: no horizontal overflow, compact patient cards, unclipped pagination, and all four detail tabs (Overview, Notes, Summary, Discussion) visible. The mobile defects F2, F3 and F4 are fixed. |
| P2-20 · Part 2 requirement 4 | Validated inputs and appropriate HTTP errors | Verified in stated scope | `a-rules`, `a-errors`. Real API boundary tests establish invalid input/status semantics; user-facing error rendering is separately covered in Part 4. Verified evidence is recorded on the mapped work items in their stated scope. |
| P3-01 · Part 3 backend task 1 POST /patients/{id}/notes | Add timestamped patient note | Verified in stated scope | `n-post`. Accept client-supplied timestamp and nonempty text, associate with the patient and persist. Verified evidence is recorded on the mapped work items in their stated scope. |
| P3-02 · Part 3 backend task 1 GET /patients/{id}/notes | List patient notes | Verified in stated scope | `n-get`. Return the patient’s current notes with timestamps and correct parent ownership. Verified evidence is recorded on the mapped work items in their stated scope. |
| P3-03 · Part 3 backend task 1 DELETE /patients/{id}/notes/{note_id} | Delete patient note | Verified in stated scope | `n-del`. Delete according to the documented tombstone semantics; reject wrong-parent/missing notes. Verified evidence is recorded on the mapped work items in their stated scope. |
| P3-04 · Part 3 backend task 2 summary endpoint and all content bullets | Generate required patient summary | Verified in stated scope | `sm-ep`, `sm-tpl`. GET summary must include name, age, blood type/unknown state, coherent note narrative, conditions and allergies. A template is explicitly acceptable; no external LLM is required. Verified evidence is recorded on the mapped work items in their stated scope. |
| P3-05 · Part 3 frontend task 1 display existing notes | Display notes with timestamps | Verified in stated scope | `n-list`, `f-api`. Opus pass 02; compiled LIVE candidate-03 at the recorded run, against a shared backend without immutable start identity. Later working-tree fixes and the default/shared setup are outside this closure. Projects: desktop-chrome, mobile-chrome.  |
| P3-06 · Part 3 frontend task 1 form to add notes | Add notes from the UI | Verified in stated scope | `n-form`, `n-post`, `f-api`. Opus pass 02; compiled LIVE candidate-03 at the recorded run, against a shared backend without immutable start identity. Later working-tree fixes and the default/shared setup are outside this closure. Projects: desktop-chrome, mobile-chrome.  |
| P3-07 · Part 3 frontend task 1 delete functionality | Delete notes from the UI | Verified in stated scope | `n-delete-ui`, `n-del`, `f-api`. Verified 20 Nov in the clean-room live run: clinical.spec adds a note through the UI, deletes it with confirmation, and checks the deleted-note state against the real API on desktop and phone. |
| P3-08 · Part 3 frontend task 2 summary view | Display generated summary | Verified in stated scope | `sm-ui`, `sm-ep`, `f-api`. Verified 20 Nov on real data: the Summary tab shows the generated template summary (name, age, blood type, conditions, allergies, last visit) and handles the no-notes case. |
| P4-01 · Part 4 task 1 personal fields | Create/edit personal information | Verified in stated scope | `pf-personal`, `pf-modes`, `pf-submit`, `f-api`. Opus pass 02; compiled LIVE candidate-03 at the recorded run, against a shared backend without immutable start identity. Later working-tree fixes and the default/shared setup are outside this closure. Projects: desktop-chrome, mobile-chrome. Capability only. Error-message quality defects QA-LEAD-001 and F1 are adjudicated under P4-03/P4-04, not waived here |
| P4-02 · Part 4 task 1 medical fields | Create/edit medical information | Verified in stated scope | `pf-medical`, `pf-modes`, `pf-submit`, `f-api`. Opus pass 02; compiled LIVE candidate-03 at the recorded run, against a shared backend without immutable start identity. Later working-tree fixes and the default/shared setup are outside this closure. Projects: desktop-chrome, mobile-chrome. One Add allergy per journey. The second-Add regression (QA-FE-001) is demo-verified on byte-identical AllergiesEditor source only. The medical editor still has QA-LEAD-001, so pf-medical stays blocked |
| P4-03 · Part 4 task 2 validation | Client and server validation | Verified in stated scope | `pf-zod`, `pf-client`, `a-rules`. Verified 20 Nov. Client: submitting an empty form shows 'Check these fields before saving' plus messages beside First name, Last name and Date of birth. Server: Pydantic 422s are covered by 301 backend tests, and the browser HTTP suite (11/11) maps server errors onto fields. |
| P4-04 · Part 4 task 2 error messages | Meaningful user-facing errors | Verified in stated scope | `pf-server`, `pf-client`, `e-global`. Verified 20 Nov: field-level messages (e.g. 'Enter a first name') plus an actionable summary. Server 422 messages map to the matching fields in the 11/11 browser HTTP suite. |
| P4-05 · Part 4 task 3 network failures | Handle network failures | Verified in stated scope | `pf-net`, `e-global`, `e-retry`. Verified 20 Nov by the browser HTTP suite (11/11, including validation-recovery): a failed save shows a recoverable error, keeps the draft, and a retry succeeds. |
| P4-06 · Part 4 task 3 validation errors | Handle validation errors | Verified in stated scope | `pf-server`, `a-errors`, `f-api`. Verified 20 Nov by the browser HTTP suite (11/11) and 301 backend tests: a server-rejected value shows its message on the field, nothing is saved, and the corrected resubmit succeeds. |
| P5-01 · Part 5 task 1 | Backend Docker image | Verified in stated scope | `c-be`. Build and run the backend image with the project’s actual dependencies and startup commands. Verified evidence is recorded on the mapped work items in their stated scope. |
| P5-02 · Part 5 task 2 | Frontend Docker image or equivalent serving | Verified in stated scope | `c-fe`, `c-nginx`. The selected separate frontend image builds and serves compiled React assets with working route/API forwarding. Verified evidence is recorded on the mapped work items in their stated scope. |
| P5-03 · Part 5 task 3 | Compose starts all three services | Verified in stated scope | `c-compose`, `c-health`. Compose must start frontend, FastAPI and PostgreSQL. The full API-mode browser acceptance is tracked separately under submission and functional checks. Verified evidence is recorded on the mapped work items in their stated scope. |
| P5-04 · Part 5 task 4 | Document environment variables | Verified in stated scope | `c-env`. A committed .env.example documents required settings; existing developer settings and private values are handled correctly. Verified evidence is recorded on the mapped work items in their stated scope. |

Current integration, theme work and detailed QA remain open where marked. Historical passing results and subsequent failures are retained separately. See [coordination](chatroom/integration-coordination.md) for owners and handoffs.

## Area checklists

[Frontend](../frontend/README.md#checklist) · [Backend](../backend/docs/HOLEPUNCH.md) · [Data](../data/docs/HOLEPUNCH.md) · [Infra](../infra/docs/checklist.md)

## Selected architecture

Implemented library, model and interface choices; cross-owner integration remains explicitly tracked.

- [x] **d-fe — Lock the frontend stack** · Verified in stated scope.
  Vite/React/strict TypeScript, Tailwind with shadcn/Radix, TanStack Router/Query/Table/Virtual/Form, Zod and a small Zustand UI store are selected and installed. Replaces the original Mantine/React Router/React Hook Form suggestions.
  Scope: configuration. Requirement: P1 FE-2. Evidence: [frontend/package.json](../frontend/package.json) · [frontend/README.md](../frontend/README.md).

- [x] **d-be — Lock the backend stack** · Verified in stated scope.
  FastAPI, Pydantic, SQLAlchemy typed models, psycopg, Alembic, pydantic-settings, uv lockfiles, Ruff, mypy and pytest/httpx2 are configured.
  Scope: configuration. Requirement: P1 BE. Evidence: [backend/pyproject.toml](../backend/pyproject.toml) · [backend/uv.lock](../backend/uv.lock) · [backend/README.md](../backend/README.md).

- [x] **d-patient — Define the Patient model** · Verified in stated scope.
  Eight-table model includes an editable patient profile with derived age, active/inactive status, nullable blood type, medical fields, audit timestamps and protected imported context.
  Scope: backend postgresql. Requirement: P1 BE-2 · P4.1. Evidence: [backend/app/models.py](../backend/app/models.py) · [backend/app/schemas/patients.py](../backend/app/schemas/patients.py) · [backend/docs/DATA_MODEL.md](../backend/docs/DATA_MODEL.md).

- [x] **d-seed-src — Seed 100 prepared fictional patients through DuckDB** · Verified in stated scope.
  Prepare 100 fictional patient rows from reference/prior-auth-pack/data/patients_100.csv in bronze/silver DuckDB, then seed with backend app.seed. Preserve unknown blood type; active is an explicit app default. Do not fabricate source clinical facts.
  Scope: backend postgresql. Requirement: P1 BE-3 · P2 Req. Evidence: [data/README.md](../data/README.md) · [backend/app/utils/duckdb_source.py](../backend/app/utils/duckdb_source.py) · [backend/app/services/seeding.py](../backend/app/services/seeding.py).

- [x] **d-design — Theme the UI with `design-system/`** · Verified in stated scope.
  Tailwind/shadcn tokens use the Ascertain paper/ink/lilac palette, flat surfaces, text status pills and font fallbacks.
  Scope: demo ui and http fixture baseline. Requirement: Eval · UI/UX. Evidence: [frontend/src/styles/globals.css](../frontend/src/styles/globals.css) · [frontend/src/components/ui/status-pill.tsx](../frontend/src/components/ui/status-pill.tsx) · [reference/design-system/tokens.css](../reference/design-system/tokens.css).

- [x] **d-note — Define the Note model** · Verified in stated scope.
  Notes store stable UUID, patient/author, title, clinical timestamp, content, created/updated times and a content-free deletion tombstone.
  Scope: backend postgresql. Requirement: P3 BE-1. Evidence: [backend/app/models.py](../backend/app/models.py) · [backend/app/schemas/notes.py](../backend/app/schemas/notes.py).

- [x] **d-contract — Write the API contract down before building** · Verified in stated scope.
  Opus pass 03 accepts the corrected API contract and generated error schema on backend source 34e2150b…bbb7. Frontend error rendering remains under pf-server.
  Scope: backend 34e2150b API contract. Requirement: Eval · API design. Evidence: [backend/docs/API_CONTRACT.md](../backend/docs/API_CONTRACT.md) · [reference/chatroom/frontend-data-contract.md](../reference/chatroom/frontend-data-contract.md) · [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md).

- [x] **d-paths — Keep backend paths exactly as the spec writes them** · Verified in stated scope.
  FastAPI paths remain unprefixed as specified. Vite and nginx strip browser /api prefixes; health and API errors have been checked through the proxy.
  Scope: compiled stack and hosted ci baseline. Requirement: Eval · requirements. Evidence: [backend/app/routers/](../backend/app/routers/) · [frontend/vite.config.ts](../frontend/vite.config.ts) · [infra/nginx/default.conf](../infra/nginx/default.conf).

- [x] **d-growth — Choose a structure that can grow** · Verified in stated scope.
  One workspace has frontend, backend, data and infra ownership. Frontend is feature-oriented; backend uses routers/schemas/services/models/utils. Real authentication and broader workflows are future extensions.
  Scope: source structure. Requirement: Context. Evidence: [frontend/README.md](../frontend/README.md) · [backend/README.md](../backend/README.md) · [data/README.md](../data/README.md) · [infra/README.md](../infra/README.md).

- [x] **d-summary — Decide the summary approach** · Verified in stated scope.
  Deterministic template summaries need no provider key. An external LLM provider is not implemented or required.
  Scope: backend postgresql. Requirement: P3 BE-2. Evidence: [backend/app/services/summaries.py](../backend/app/services/summaries.py) · [backend/tests/test_summary.py](../backend/tests/test_summary.py).

## Workspace and configuration

One repository with separate frontend, backend, data and infrastructure ownership.

- [x] **s-tree — Create the folder layout** · Verified in stated scope.
  The monorepo layout and root setup entry exist; runtime infra files live under infra with a small root Compose include.
  Scope: source structure. Requirement: Submission. Evidence: [README.md](../README.md) · [docker-compose.yml](../docker-compose.yml) · [setup.sh](../setup.sh) · [infra/compose.yml](../infra/compose.yml).

- [x] **s-ignore — Add `.gitignore` and `.dockerignore` files** · Verified in stated scope.
  Git/build ignores exclude real env files, dependencies, caches, generated browser failures and personal study_mats; .env.example remains committed.
  Scope: compiled stack and hosted ci baseline. Requirement: Submission. Evidence: [.gitignore](../.gitignore) · [.dockerignore](../.dockerignore).

## Backend foundation

Part 1 · backend tasks.

- [x] **b-init — Initialize the FastAPI app** · Verified in stated scope.
  App factory, lifespan-owned engine, validated settings and outer explicit-origin CORS middleware are implemented.
  Scope: backend postgresql. Requirement: P1 BE-1. Evidence: [backend/app/main.py](../backend/app/main.py) · [backend/app/config.py](../backend/app/config.py) · [backend/tests/test_app.py](../backend/tests/test_app.py).

- [x] **b-health — `GET /health` returns exactly `{"status": "ok"}`** · Verified in stated scope.
  GET /health returns200 exactly {status:ok}; /ready separately checks database connectivity and is the container readiness probe.
  Scope: backend postgresql. Requirement: P1 BE-1. Evidence: [backend/app/routers/health.py](../backend/app/routers/health.py) · [backend/tests/test_app.py](../backend/tests/test_app.py) · [infra/compose.yml](../infra/compose.yml).

- [x] **b-db-dev — Run Postgres in Docker from the start** · Verified in stated scope.
  PostgreSQL runs in Compose on a persistent named volume with localhost access and readiness checks.
  Scope: compiled stack and hosted ci baseline. Requirement: P5.3. Evidence: [infra/compose.yml](../infra/compose.yml) · [infra/README.md](../infra/README.md).

- [x] **b-db — Connect to PostgreSQL** · Verified in stated scope.
  The app owns one SQLAlchemy engine; FastAPI dependencies supply short-lived sessions and services own commits/rollbacks.
  Scope: backend postgresql. Requirement: P1 BE-2. Evidence: [backend/app/db.py](../backend/app/db.py) · [backend/app/config.py](../backend/app/config.py) · [backend/tests/test_database_checks.py](../backend/tests/test_database_checks.py).

- [x] **b-schema — Create the patients table in an Alembic migration** · Verified in stated scope.
  Initial Alembic revision creates patients and all supporting tables, constraints and indexes.
  Scope: backend postgresql. Requirement: P1 BE-2. Evidence: [backend/alembic/versions/20261120_0001_initial_schema.py](../backend/alembic/versions/20261120_0001_initial_schema.py) · [backend/app/models.py](../backend/app/models.py) · [backend/tests/test_migrations.py](../backend/tests/test_migrations.py).

- [x] **b-recreate — Make the database easy to recreate** · Verified in stated scope.
  Startup applies Alembic before seeding when initialization is enabled; the sample configuration enables both and the setup script preserves existing env settings.
  Scope: compiled stack and hosted ci baseline. Requirement: P1 BE-2. Evidence: [infra/scripts/entrypoint.py](../infra/scripts/entrypoint.py) · [.env.example](../.env.example) · [backend/tests/test_migrations.py](../backend/tests/test_migrations.py).

- [x] **b-seed — Seed 15–20 realistic patients on startup** · Verified in stated scope.
  Fresh initialized startup imports100 fictional patients plus two demo users, two notes, two comments and one note link. Unknown blood type remains null; status defaults are labelled.
  Scope: compiled stack and hosted ci baseline. Requirement: P1 BE-3. Evidence: [backend/app/services/seeding.py](../backend/app/services/seeding.py) · [backend/tests/test_seed.py](../backend/tests/test_seed.py) · [infra/scripts/verify_stack.py](../infra/scripts/verify_stack.py).

- [x] **b-seed-safe — Make seeding idempotent and scalable** · Verified in stated scope.
  Read-only DuckDB validation, schema preflight, bounded advisory locking, transactional writes and completion markers avoid duplicates, overwritten edits and resurrected deletions. This is versioned initialization, not arbitrary source synchronization.
  Scope: backend postgresql. Requirement: P1 BE-3 · P2 Req. Evidence: [backend/app/services/seeding.py](../backend/app/services/seeding.py) · [backend/tests/test_seed.py](../backend/tests/test_seed.py).

- [x] **b-seed-notes — Seed labelled demonstration notes and comments** · Verified in stated scope.
  The selected seed contains two explicitly fictional demonstration notes and comments, not a fabricated note history for every patient.
  Scope: backend postgresql. Requirement: P3 BE-2. Evidence: [backend/app/services/seeding.py](../backend/app/services/seeding.py) · [backend/tests/test_seed.py](../backend/tests/test_seed.py).

- [x] **b-ruff — Backend linting: Ruff lint + format, type hints throughout** · Verified in stated scope.
  Backend Ruff lint/format and strict mypy passed with the 196-test handoff.
  Scope: backend postgresql. Requirement: Eval · code quality. Evidence: [backend/pyproject.toml](../backend/pyproject.toml) · [backend/README.md](../backend/README.md) · [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md).

## Patient CRUD API

Part 2 · task 1, plus the validation and error-handling requirements.

- [x] **a-schemas — Validated patient create replace detail and page schemas** · Verified in stated scope.
  PatientCreate, PatientReplace, PatientDetail and PatientPage provide typed write/read contracts; computed age appears on reads.
  Scope: backend postgresql. Requirement: P2.1 · P4.2. Evidence: [backend/app/schemas/patients.py](../backend/app/schemas/patients.py) · [backend/tests/test_patients.py](../backend/tests/test_patients.py).

- [x] **a-rules — Server-side validation rules** · Verified in stated scope.
  Validate required/trimmed/bounded names, nonfuture calendar dates, phone/email, allowed statuses/blood types and consistent allergy states. Do not claim the old proposed130-year age limit or automatic list deduplication as implemented rules.
  Scope: backend postgresql. Requirement: P2 Req · P4.2. Evidence: [backend/app/schemas/patients.py](../backend/app/schemas/patients.py) · [backend/tests/test_patients.py](../backend/tests/test_patients.py).

- [x] **a-list — `GET /patients` with pagination** · Verified in stated scope.
  GET /patients validates page >= 1 and page_size 1-100, defaults to 20, and returns items/total/page/page_size.
  Scope: backend postgresql. Requirement: P2.1. Evidence: [backend/app/routers/patients.py](../backend/app/routers/patients.py) · [backend/app/utils/pagination.py](../backend/app/utils/pagination.py) · [backend/tests/test_patients.py](../backend/tests/test_patients.py).

- [x] **a-query — Search, filter and sort as query params on `GET /patients`** · Verified in stated scope.
  SQL search/filter/sort applies before pagination. Search includes names/email/MRN/source ID/UUID; status and unread_only filters and count sorts are supported with stable UUID tiebreaking.
  Scope: backend postgresql. Requirement: P2.3 · Stretch. Evidence: [backend/app/services/patients.py](../backend/app/services/patients.py) · [backend/app/schemas/patients.py](../backend/app/schemas/patients.py) · [backend/tests/test_patients.py](../backend/tests/test_patients.py).

- [x] **a-get — `GET /patients/{id}`** · Verified in stated scope.
  GET patient returns profile/counts/typed source context without raw source_record, or a structured404.
  Scope: backend postgresql. Requirement: P2.1. Evidence: [backend/app/routers/patients.py](../backend/app/routers/patients.py) · [backend/tests/test_patients.py](../backend/tests/test_patients.py).

- [x] **a-post — `POST /patients` → 201** · Verified in stated scope.
  POST creates a patient with HTTP 201, response detail and Location.
  Scope: backend postgresql. Requirement: P2.1. Evidence: [backend/app/routers/patients.py](../backend/app/routers/patients.py) · [backend/tests/test_patients.py](../backend/tests/test_patients.py).

- [x] **a-put — `PUT /patients/{id}` → 200** · Verified in stated scope.
  PUT replaces all editable fields while preserving provenance; nullable fields must be explicitly supplied. Returns 200 or 404.
  Scope: backend postgresql. Requirement: P2.1. Evidence: [backend/app/routers/patients.py](../backend/app/routers/patients.py) · [backend/app/schemas/patients.py](../backend/app/schemas/patients.py) · [backend/tests/test_patients.py](../backend/tests/test_patients.py).

- [x] **a-delete — `DELETE /patients/{id}` → 204** · Verified in stated scope.
  DELETE patient returns 204 and cascades patient-owned records; missing patient returns 404.
  Scope: backend postgresql. Requirement: P2.1. Evidence: [backend/app/routers/patients.py](../backend/app/routers/patients.py) · [backend/app/models.py](../backend/app/models.py) · [backend/tests/test_patients.py](../backend/tests/test_patients.py).

- [x] **a-errors — Global exception handlers with proper status codes** · Verified in stated scope.
  Public errors use error/code/message/fields with safe field paths: validation 422, missing 404, conflict 409 and generic 500. Server logs redact sensitive exception details.
  Scope: backend postgresql. Requirement: P2 Req. Evidence: [backend/app/errors.py](../backend/app/errors.py) · [backend/app/utils/logging.py](../backend/app/utils/logging.py) · [backend/tests/test_errors.py](../backend/tests/test_errors.py).

- [x] **a-docs — Polish the OpenAPI docs at `/docs`** · Verified in stated scope.
  Opus pass 03 accepts ErrorResponse declarations and exact failure status sets for all 23 operations, supported by schema regressions and the recorded TCP OpenAPI snapshot.
  Scope: backend 34e2150b OpenAPI. Requirement: Eval · API design. Evidence: [backend/docs/API_CONTRACT.md](../backend/docs/API_CONTRACT.md) · [backend/app/routers/notes.py](../backend/app/routers/notes.py).

- [x] **a-smoke — Exercise every endpoint by hand** · Verified in stated scope.
  Every endpoint is exercised by the 301 backend tests and through the browser in the clean-room live run.
  Scope: backend tests and clean-room live run. Requirement: Eval · correctness. Evidence: [reference/project.md](../reference/project.md).

## Frontend foundation

Part 1 · frontend tasks.

- [x] **f-vite — Scaffold the app with Vite (`react-ts` template)** · Verified in stated scope.
  Vite React/TypeScript application, package scripts and locked dependencies are implemented.
  Scope: demo ui and http fixture baseline. Requirement: P1 FE-1. Evidence: [frontend/package.json](../frontend/package.json) · [frontend/src/main.tsx](../frontend/src/main.tsx) · [frontend/vite.config.ts](../frontend/vite.config.ts).

- [x] **f-ts — TypeScript configuration** · Verified in stated scope.
  Strict TypeScript/noUncheckedIndexedAccess and @ alias are configured; baseline typecheck/build passed.
  Scope: demo ui and http fixture baseline. Requirement: P1 FE-3. Evidence: [frontend/tsconfig.app.json](../frontend/tsconfig.app.json) · [frontend/vite.config.ts](../frontend/vite.config.ts) · [frontend/README.md](../frontend/README.md).

- [x] **f-lint — Linting and formatting** · Verified in stated scope.
  ESLint flat config, Prettier and scripts exist; baseline checks passed. Current integration edits need their final rerun.
  Scope: demo ui and http fixture baseline. Requirement: P1 FE-3. Evidence: [frontend/eslint.config.js](../frontend/eslint.config.js) · [frontend/package.json](../frontend/package.json) · [frontend/README.md](../frontend/README.md).

- [x] **f-ui — Install and configure the UI library and styling approach** · Verified in stated scope.
  Themed shadcn/Radix primitives, Tailwind tokens and shared feedback components replace the earlier Mantine proposal.
  Scope: demo ui and http fixture baseline. Requirement: P1 FE-2. Evidence: [frontend/src/components/ui/](../frontend/src/components/ui/) · [frontend/src/styles/globals.css](../frontend/src/styles/globals.css).

- [x] **f-router — Install and configure routing** · Verified in stated scope.
  TanStack Router defines a typed code-based route tree with validation, lazy page modules and shared boundaries.
  Scope: demo ui and http fixture baseline. Requirement: P1 FE-2. Evidence: [frontend/src/app/router.tsx](../frontend/src/app/router.tsx) · [frontend/src/features/patient-list/search-params.ts](../frontend/src/features/patient-list/search-params.ts).

- [x] **f-query — Install and configure state management** · Verified in stated scope.
  TanStack Query owns server results with 30-second freshness and retry policy; Zustand owns UI preferences and return snapshots; Router owns URL state and Form owns drafts.
  Scope: demo ui and http fixture baseline. Requirement: P1 FE-2. Evidence: [frontend/src/app/query-client.ts](../frontend/src/app/query-client.ts) · [frontend/src/app/ui-store.ts](../frontend/src/app/ui-store.ts) · [frontend/src/app/query-keys.ts](../frontend/src/app/query-keys.ts).

- [x] **f-api — Build a typed API client layer** · Verified in stated scope.
  Closed by the written Opus pass-02 decision in the recorded candidate scope. OPR-005 (no runtime validation / contract-drift check) remains a Low advisory This does not approve later source edits, the default demo setup or final visual readiness.
  Scope: Opus-approved compiled LIVE candidate-03. Requirement: P4.3. Evidence: [frontend/src/api/client.ts](../frontend/src/api/client.ts) · [frontend/src/api/dto.ts](../frontend/src/api/dto.ts) · [frontend/src/api/constraints.ts](../frontend/src/api/constraints.ts) · [frontend/e2e-api/](../frontend/e2e-api/).

- [x] **f-proxy — Vite dev proxy to the backend** · Verified in stated scope.
  Vite forwards same-origin /api to backend and strips the prefix; nginx provides the compiled equivalent.
  Scope: compiled stack and hosted ci baseline. Requirement: Eval · local setup. Evidence: [frontend/vite.config.ts](../frontend/vite.config.ts) · [infra/nginx/default.conf](../infra/nginx/default.conf).

## Layout & routing

Part 2 · tasks 2 and 4.

- [x] **l-shell — App layout: header with navigation, sidebar, main content area** · Verified in stated scope.
  Header, sidebar, main content, skip link, actor selection and mobile navigation are composed in AppShell.
  Scope: demo ui and http fixture baseline. Requirement: P2.2. Evidence: [frontend/src/app/AppShell.tsx](../frontend/src/app/AppShell.tsx) · [frontend/e2e/directory.spec.ts](../frontend/e2e/directory.spec.ts).

- [x] **l-resp — Responsive at lower resolutions** · Verified in stated scope.
  Verified 20 Nov at 390px: no horizontal overflow, compact cards, unclipped pagination, and all detail tabs visible.
  Scope: api-mode app at 1440px and 390px. Requirement: P2 Req. Evidence: [frontend/e2e/directory.spec.ts](../frontend/e2e/directory.spec.ts) · [frontend/e2e/clinical-workspace.spec.ts](../frontend/e2e/clinical-workspace.spec.ts) · [reference/chatroom/frontend-updates.md](../reference/chatroom/frontend-updates.md) · [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md).

- [x] **l-routes — Routes: `/` · `/patients` · `/patients/:id` · catch-all 404** · Verified in stated scope.
  Home/list/patient-detail/catch-all routes exist, with new/edit/notifications/note-detail extensions.
  Scope: demo ui and http fixture baseline. Requirement: P2.4. Evidence: [frontend/src/app/router.tsx](../frontend/src/app/router.tsx) · [frontend/src/app/router-workspace.test.tsx](../frontend/src/app/router-workspace.test.tsx).

- [x] **l-form-routes — Form routes: `/patients/new` and `/patients/:id/edit`** · Verified in stated scope.
  New/edit routes share the form and session identity rules.
  Scope: demo ui and http fixture baseline. Requirement: P4. Evidence: [frontend/src/routes/patient-workspace.tsx](../frontend/src/routes/patient-workspace.tsx) · [frontend/src/features/patient-form/PatientFormPage.tsx](../frontend/src/features/patient-form/PatientFormPage.tsx).

- [x] **l-404 — 404 page** · Verified in stated scope.
  Unknown routes have a not-found page; missing patient responses have distinct detail error states.
  Scope: demo ui and http fixture baseline. Requirement: P2.4. Evidence: [frontend/src/routes/not-found.tsx](../frontend/src/routes/not-found.tsx) · [frontend/src/features/patient-detail/PatientWorkspace.tsx](../frontend/src/features/patient-detail/PatientWorkspace.tsx) · [frontend/e2e-api/http-workspace.spec.ts](../frontend/e2e-api/http-workspace.spec.ts).

- [x] **l-home — Dashboard home at `/`** · Verified in stated scope.
  Overview shows dataset totals/recent visits and navigation shortcuts; live backend mapping remains part of integration.
  Scope: demo ui and http fixture baseline. Requirement: P2.4. Evidence: [frontend/src/routes/home.tsx](../frontend/src/routes/home.tsx) · [frontend/e2e/directory.spec.ts](../frontend/e2e/directory.spec.ts).

- [x] **l-boundary — Route-level error boundary with a retry** · Verified in stated scope.
  Shared route error boundary provides recovery; feature reads also expose error/retry states.
  Scope: demo ui and http fixture baseline. Requirement: Eval · error handling. Evidence: [frontend/src/routes/route-error.tsx](../frontend/src/routes/route-error.tsx) · [frontend/src/app/router.tsx](../frontend/src/app/router.tsx).

- [x] **l-polish — Active nav highlighting and a page title per route** · Verified in stated scope.
  Navigation highlights current destination and titles change with route; baseline navigation/browser checks cover behavior.
  Scope: demo ui and http fixture baseline. Requirement: Eval · code quality. Evidence: [frontend/src/app/AppShell.tsx](../frontend/src/app/AppShell.tsx) · [frontend/e2e/directory.spec.ts](../frontend/e2e/directory.spec.ts).

- [x] **l-lazy — Lazy-load routes with TanStack Router** · Verified in stated scope.
  lazyRouteComponent uses dynamic imports for page modules; shared root pending/error handling remains eager.
  Scope: demo ui and http fixture baseline. Requirement: Stretch · Performance. Evidence: [frontend/src/app/router.tsx](../frontend/src/app/router.tsx).

## Patient list

Part 2 · task 3. The most heavily specified screen.

- [x] **pl-cols — Rows or cards show name, age, last visit and status** · Verified in stated scope.
  Rows/cards display name, derived age, last visit and patient status plus selected notes/conversation/condition columns.
  Scope: demo ui and http fixture baseline. Requirement: P2.3. Evidence: [frontend/src/features/patient-list/PatientResults.tsx](../frontend/src/features/patient-list/PatientResults.tsx) · [frontend/src/features/patient-list/PatientIdentity.tsx](../frontend/src/features/patient-list/PatientIdentity.tsx).

- [x] **pl-search — Search that never blocks typing** · Verified in stated scope.
  Local input updates immediately; a 250 ms debounce commits URL search and cancellation avoids obsolete results. No useDeferredValue claim is needed.
  Scope: demo ui and http fixture baseline. Requirement: P2.3 · P2 Req. Evidence: [frontend/src/features/patient-list/PatientFilters.tsx](../frontend/src/features/patient-list/PatientFilters.tsx) · [frontend/src/features/patient-list/queries.ts](../frontend/src/features/patient-list/queries.ts) · [frontend/src/features/patient-list/PatientFilters.test.tsx](../frontend/src/features/patient-list/PatientFilters.test.tsx).

- [x] **pl-filter — Filter by status** · Verified in stated scope.
  Status controls update URL-backed search and reset pagination; backend filters the complete dataset.
  Scope: demo ui and http fixture baseline. Requirement: P2.3. Evidence: [frontend/src/features/patient-list/PatientFilters.tsx](../frontend/src/features/patient-list/PatientFilters.tsx) · [frontend/src/features/patient-list/search-params.ts](../frontend/src/features/patient-list/search-params.ts).

- [x] **pl-sort — Sort by name, age and last visit, both directions** · Verified in stated scope.
  Header/mobile controls drive API ordering; age direction maps to inverse DOB ordering and aria-sort is exposed.
  Scope: demo ui and http fixture baseline. Requirement: P2.3. Evidence: [frontend/src/features/patient-list/PatientResults.tsx](../frontend/src/features/patient-list/PatientResults.tsx) · [frontend/src/features/patient-list/search-params.ts](../frontend/src/features/patient-list/search-params.ts) · [frontend/src/features/patient-list/search-params.test.ts](../frontend/src/features/patient-list/search-params.test.ts).

- [x] **pl-page — Pagination** · Verified in stated scope.
  Page/page-size/count controls, reset after filter changes and clamp after deletion are implemented.
  Scope: demo ui and http fixture baseline. Requirement: P2.3. Evidence: [frontend/src/features/patient-list/PatientPagination.tsx](../frontend/src/features/patient-list/PatientPagination.tsx) · [frontend/src/features/patient-list/PatientListScreen.tsx](../frontend/src/features/patient-list/PatientListScreen.tsx) · [frontend/e2e/directory.spec.ts](../frontend/e2e/directory.spec.ts).

- [x] **pl-url — Keep search, filter, sort and page in the URL** · Verified in stated scope.
  Validated URL state retains search/filter/sort/page through navigation and refresh; per-view return memory is separated by actor.
  Scope: demo ui and http fixture baseline. Requirement: Eval · state management. Evidence: [frontend/src/features/patient-list/search-params.ts](../frontend/src/features/patient-list/search-params.ts) · [frontend/src/app/view-state.ts](../frontend/src/app/view-state.ts) · [frontend/e2e/directory.spec.ts](../frontend/e2e/directory.spec.ts).

- [x] **pl-states — Loading skeleton, empty state, and error state with retry** · Verified in stated scope.
  Loading, prior-results refresh, empty/no-match/caught-up and error/retry states are implemented.
  Scope: demo ui and http fixture baseline. Requirement: Eval · error handling. Evidence: [frontend/src/features/patient-list/PatientListScreen.tsx](../frontend/src/features/patient-list/PatientListScreen.tsx) · [frontend/src/features/patient-list/PatientListScreen.test.tsx](../frontend/src/features/patient-list/PatientListScreen.test.tsx).

- [x] **pl-mobile — Responsive list** · Verified in stated scope.
  Narrow screens render patient cards using the same result window and controls.
  Scope: demo ui and http fixture baseline. Requirement: P2 Req. Evidence: [frontend/src/features/patient-list/PatientResults.tsx](../frontend/src/features/patient-list/PatientResults.tsx) · [frontend/e2e/directory.spec.ts](../frontend/e2e/directory.spec.ts).

- [x] **pl-click — Clicking a patient opens `/patients/:id`** · Verified in stated scope.
  Whole-row and mobile-card opening is implemented through the existing overview link. Notes and Conversation retain their own actions. Eight focused interaction tests passed; integrated live acceptance remains separate.
  Scope: focused component interaction tests. Requirement: P2.4. Evidence: [frontend/src/features/patient-list/PatientResults.tsx](../frontend/src/features/patient-list/PatientResults.tsx) · [frontend/src/features/patient-list/PatientResults.test.tsx](../frontend/src/features/patient-list/PatientResults.test.tsx) · [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md).

- [x] **pl-100 — Prove it with 100+ patients** · Verified in stated scope.
  Baseline demo tests cover 100-row pages and creation of a 101st patient; backend prepares 100 seeded patients. Real combined-stack performance remains unmeasured.
  Scope: demo ui and http fixture baseline. Requirement: P2 Req. Evidence: [frontend/e2e/directory.spec.ts](../frontend/e2e/directory.spec.ts) · [frontend/e2e/patient-write.spec.ts](../frontend/e2e/patient-write.spec.ts) · [backend/tests/test_patients.py](../backend/tests/test_patients.py).

- [x] **pl-virtual — Virtualized rows and memoized column definitions** · Verified in stated scope.
  TanStack Virtual bounds mounted rows with stable IDs, overscan and spacers; Table uses server-driven paging/sorting. Columns use useMemo; no blanket React.memo or benchmark claim.
  Scope: demo ui and http fixture baseline. Requirement: Stretch · Performance. Evidence: [frontend/src/features/patient-list/PatientResults.tsx](../frontend/src/features/patient-list/PatientResults.tsx) · [frontend/src/features/patient-list/PatientResults.test.tsx](../frontend/src/features/patient-list/PatientResults.test.tsx).

## Patient detail

The /patients/:id view that notes and summary attach to.

- [x] **pd-view — Detail page at `/patients/:id` shows the full profile** · Verified in stated scope.
  Closed by the written Opus pass-02 decision in the recorded candidate scope. The reason for reopening (compiled modal off-viewport) is resolved live. Clipped Discussion tab F4 is owned by l-resp. A3 duplication is a visual-gate item This does not approve later source edits, the default demo setup or final visual readiness.
  Scope: Opus-approved compiled LIVE candidate-03. Requirement: P2.4. Evidence: [frontend/src/features/patient-detail/PatientWorkspace.tsx](../frontend/src/features/patient-detail/PatientWorkspace.tsx) · [frontend/src/features/patient-detail/ProfilePanel.tsx](../frontend/src/features/patient-detail/ProfilePanel.tsx) · [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md).

- [x] **pd-404 — A missing or deleted patient shows a not-found state, not a crash** · Verified in stated scope.
  Missing/deleted/denied detail invalidates terminal cache data and shows explicit errors instead of stale record resurrection.
  Scope: demo ui and http fixture baseline. Requirement: P2 Req. Evidence: [frontend/src/app/patient-query.ts](../frontend/src/app/patient-query.ts) · [frontend/src/app/patient-query.test.ts](../frontend/src/app/patient-query.test.ts) · [frontend/src/features/patient-detail/PatientWorkspace.tsx](../frontend/src/features/patient-detail/PatientWorkspace.tsx).

- [x] **pd-actions — Edit and Delete actions** · Verified in stated scope.
  Edit/delete actions and confirmation are implemented; mutations refresh caches and return navigation.
  Scope: demo ui and http fixture baseline. Requirement: P2.1. Evidence: [frontend/src/features/patient-detail/ProfilePanel.tsx](../frontend/src/features/patient-detail/ProfilePanel.tsx) · [frontend/src/features/patient-detail/ConfirmDelete.tsx](../frontend/src/features/patient-detail/ConfirmDelete.tsx) · [frontend/e2e/patient-write.spec.ts](../frontend/e2e/patient-write.spec.ts).

## Clinical notes

Part 3 · backend task 1 and frontend task 1.

- [x] **n-migr — Create notes in the reviewed application migration** · Verified in stated scope.
  The initial reviewed migration creates notes with patient/author relationships, indexes and tombstone consistency constraints. A separate second migration was not needed for initial schema creation.
  Scope: backend postgresql. Requirement: P3 BE-1. Evidence: [backend/alembic/versions/20261120_0001_initial_schema.py](../backend/alembic/versions/20261120_0001_initial_schema.py) · [backend/app/models.py](../backend/app/models.py).

- [x] **n-post — `POST /patients/{id}/notes` accepts timestamp and text → 201** · Verified in stated scope.
  POST accepts timezone-aware timestamp/content and optional title, rejects future clinical times and returns 201; authored writes require a valid demo actor.
  Scope: backend postgresql. Requirement: P3 BE-1. Evidence: [backend/app/routers/notes.py](../backend/app/routers/notes.py) · [backend/app/schemas/notes.py](../backend/app/schemas/notes.py) · [backend/tests/test_notes.py](../backend/tests/test_notes.py).

- [x] **n-get — `GET /patients/{id}/notes` lists all notes** · Verified in stated scope.
  GET returns active clinical notes newest timestamp first and 404 for a missing patient.
  Scope: backend postgresql. Requirement: P3 BE-1. Evidence: [backend/app/routers/notes.py](../backend/app/routers/notes.py) · [backend/app/services/notes.py](../backend/app/services/notes.py) · [backend/tests/test_notes.py](../backend/tests/test_notes.py).

- [x] **n-del — `DELETE /patients/{id}/notes/{note_id}` → 204** · Verified in stated scope.
  Author deletion returns 204 and retains a content-free tombstone for existing comment links. Cross-patient/missing notes return 404; direct deleted-note GET returns 410.
  Scope: backend postgresql. Requirement: P3 BE-1. Evidence: [backend/app/services/notes.py](../backend/app/services/notes.py) · [backend/tests/test_notes.py](../backend/tests/test_notes.py) · [backend/docs/API_CONTRACT.md](../backend/docs/API_CONTRACT.md).

- [x] **n-list — Notes section on the detail page, with timestamps** · Verified in stated scope.
  Notes panel renders timestamps and author information separately from discussion.
  Scope: demo ui and http fixture baseline. Requirement: P3 FE-1. Evidence: [frontend/src/features/patient-detail/NotesPanel.tsx](../frontend/src/features/patient-detail/NotesPanel.tsx) · [frontend/src/features/patient-detail/notes.test.tsx](../frontend/src/features/patient-detail/notes.test.tsx) · [frontend/e2e/clinical-workspace.spec.ts](../frontend/e2e/clinical-workspace.spec.ts).

- [x] **n-form — Form to add a note** · Verified in stated scope.
  Reusable note form collects timestamp/content, validates and disables pending submission; fixture-mode behavior is covered.
  Scope: demo ui and http fixture baseline. Requirement: P3 FE-1. Evidence: [frontend/src/features/patient-detail/NoteForm.tsx](../frontend/src/features/patient-detail/NoteForm.tsx) · [frontend/src/features/patient-detail/notes.test.tsx](../frontend/src/features/patient-detail/notes.test.tsx) · [frontend/e2e-api/http-workspace.spec.ts](../frontend/e2e-api/http-workspace.spec.ts).

- [x] **n-delete-ui — Delete a note from the UI** · Verified in stated scope.
  Confirmation and note/summary/activity invalidation are implemented; persistent integrated UI acceptance remains pending.
  Scope: demo ui and http fixture baseline. Requirement: P3 FE-1. Evidence: [frontend/src/features/patient-detail/NoteView.tsx](../frontend/src/features/patient-detail/NoteView.tsx) · [frontend/src/features/patient-detail/queries.ts](../frontend/src/features/patient-detail/queries.ts) · [frontend/e2e/clinical-workspace.spec.ts](../frontend/e2e/clinical-workspace.spec.ts).

## Patient summary

Part 3 · backend task 2 and frontend task 2.

- [x] **sm-ep — `GET /patients/{id}/summary`** · Verified in stated scope.
  GET summary returns patient_id/summary/generated_at/method with required identifiers and current clinical information; a missing patient returns 404.
  Scope: backend postgresql. Requirement: P3 BE-2. Evidence: [backend/app/routers/summaries.py](../backend/app/routers/summaries.py) · [backend/tests/test_summary.py](../backend/tests/test_summary.py).

- [x] **sm-tpl — Template-based summarizer** · Verified in stated scope.
  Deterministic narrative uses current profile and active notes, handles unknown/no-note states, excludes comments and deleted notes, and needs no external key.
  Scope: backend postgresql. Requirement: P3 BE-2. Evidence: [backend/app/services/summaries.py](../backend/app/services/summaries.py) · [backend/tests/test_summary.py](../backend/tests/test_summary.py).

- [x] **sm-llm — Optional LLM summarizer behind the same interface** · Verified in stated scope.
  Done 20 Nov. An open-weight LLM (gemma-3-27b via the keyless LLM7 endpoint) writes the summary from the patient's facts. It is saved in patient_summaries (migration 0003) with a fingerprint of those facts, so repeat views reuse it and any profile or note change regenerates it. If the LLM is unreachable or rate-limited, the deterministic template answers and nothing is stored. Verified live (llm/gemma-3-27b, repeat view served from the stored row) and by 337 backend tests. The UI marks AI summaries with a sparkles icon, 'Updated' time and tooltip (frontend unit tests). Note: the free endpoint has a daily quota per network; when it is used up, the app shows the standard summary and says so.
  Scope: backend tests, live api, frontend tests. Requirement: P3 hint. Evidence: [backend/app/services/summaries.py](../backend/app/services/summaries.py) · [backend/alembic/versions/20261120_0003_patient_summaries.py](../backend/alembic/versions/20261120_0003_patient_summaries.py) · [frontend/src/features/patient-detail/SummaryPanel.tsx](../frontend/src/features/patient-detail/SummaryPanel.tsx).

- [x] **sm-ui — Summary view in the UI** · Verified in stated scope.
  SummaryPanel reads the summary query and handles loading/error/retry; note mutations invalidate its key.
  Scope: demo ui and http fixture baseline. Requirement: P3 FE-2. Evidence: [frontend/src/features/patient-detail/SummaryPanel.tsx](../frontend/src/features/patient-detail/SummaryPanel.tsx) · [frontend/src/features/patient-detail/queries.ts](../frontend/src/features/patient-detail/queries.ts).

## Patient form

Part 4 · create and edit with real validation.

- [x] **pf-zod — Zod schema that mirrors the server rules** · Verified in stated scope.
  Client rules show field messages before saving. The server mirrors the rules and its 422s map onto fields (browser HTTP suite 11/11).
  Scope: api-mode app and browser http suite. Requirement: P4.2. Evidence: [frontend/src/features/patient-form/schema.ts](../frontend/src/features/patient-form/schema.ts) · [frontend/src/api/constraints.ts](../frontend/src/api/constraints.ts) · [backend/app/schemas/patients.py](../backend/app/schemas/patients.py).

- [x] **pf-personal — Personal information: name, DOB, contact (phone, email), address** · Verified in stated scope.
  Shared personal/contact field components collect name,DOB,phone,email and address.
  Scope: demo ui and http fixture baseline. Requirement: P4.1. Evidence: [frontend/src/features/patient-form/PersonalFields.tsx](../frontend/src/features/patient-form/PersonalFields.tsx) · [frontend/src/features/patient-form/ContactFields.tsx](../frontend/src/features/patient-form/ContactFields.tsx).

- [x] **pf-medical — Medical information: allergies, conditions, blood type, status** · Verified in stated scope.
  Allergies, conditions, blood type and status edit and save. The allergy-row validation bug found on 20 Nov is fixed, and the desktop and mobile patient-write journeys pass.
  Scope: frontend browser suites. Requirement: P4.1. Evidence: [frontend/src/features/patient-form/MedicalFields.tsx](../frontend/src/features/patient-form/MedicalFields.tsx) · [frontend/src/features/patient-form/AllergiesEditor.tsx](../frontend/src/features/patient-form/AllergiesEditor.tsx).

- [x] **pf-modes — One form for both create and edit** · Verified in stated scope.
  Create/edit share PatientForm with a keyed patient/actor session and initialized draft that survives recoverable refetch failures.
  Scope: demo ui and http fixture baseline. Requirement: P4. Evidence: [frontend/src/features/patient-form/PatientForm.tsx](../frontend/src/features/patient-form/PatientForm.tsx) · [frontend/src/features/patient-form/PatientFormPage.tsx](../frontend/src/features/patient-form/PatientFormPage.tsx).

- [x] **pf-client — Inline client-side error messages** · Verified in stated scope.
  Compiled-DEMO client validation and form recovery accepted by Opus pass 03: 24 browser checks and 42 form units. Later candidates must match the approved form-file hashes; integrated server feedback remains tracked separately.
  Scope: Opus-accepted compiled DEMO form snapshot. Requirement: P4.2. Evidence: [frontend/src/features/patient-form/use-patient-form.ts](../frontend/src/features/patient-form/use-patient-form.ts) · [frontend/src/features/patient-form/PatientInput.tsx](../frontend/src/features/patient-form/PatientInput.tsx) · [frontend/src/features/patient-form/schema.test.ts](../frontend/src/features/patient-form/schema.test.ts).

- [x] **pf-server — Show server 422 errors on the matching fields** · Verified in stated scope.
  Server 422 messages appear beside the matching fields (browser HTTP suite 11/11, 301 backend tests).
  Scope: browser http suite and backend tests. Requirement: P4.2 · P4.3. Evidence: [backend/app/errors.py](../backend/app/errors.py) · [frontend/src/api/client.ts](../frontend/src/api/client.ts).

- [x] **pf-net — Handle network failures on submit** · Verified in stated scope.
  Failed writes preserve the draft and show retry/recovery; mutation retries are explicit rather than automatic.
  Scope: demo ui and http fixture baseline. Requirement: P4.3. Evidence: [frontend/src/features/patient-form/use-patient-form.ts](../frontend/src/features/patient-form/use-patient-form.ts) · [frontend/src/features/patient-form/PatientFormPage.test.tsx](../frontend/src/features/patient-form/PatientFormPage.test.tsx) · [frontend/e2e-api/http-workspace.spec.ts](../frontend/e2e-api/http-workspace.spec.ts).

- [x] **pf-submit — Submit flow** · Verified in stated scope.
  Pending form controls prevent duplicate submission; successful saves refresh related query caches and navigate only while mounted.
  Scope: demo ui and http fixture baseline. Requirement: Eval · UX. Evidence: [frontend/src/features/patient-form/PatientForm.tsx](../frontend/src/features/patient-form/PatientForm.tsx) · [frontend/src/features/patient-form/PatientFormPage.tsx](../frontend/src/features/patient-form/PatientFormPage.tsx) · [frontend/e2e/patient-write.spec.ts](../frontend/e2e/patient-write.spec.ts).

## Error handling & polish

Part 4 · task 3, plus what the evaluation criteria look for.

- [x] **e-global — App-wide network failure handling** · Verified in stated scope.
  Feature query errors expose retry; field/form errors retain useful feedback and arbitrary server failures become safe messages.
  Scope: demo ui and http fixture baseline. Requirement: P4.3. Evidence: [frontend/src/api/client.ts](../frontend/src/api/client.ts) · [frontend/src/components/shared/InlineError.tsx](../frontend/src/components/shared/InlineError.tsx) · [frontend/e2e-api/http-workspace.spec.ts](../frontend/e2e-api/http-workspace.spec.ts).

- [x] **e-retry — Retry policy** · Verified in stated scope.
  Read policy excludes 4xx and abort errors and bounds retries; writes are never automatically retried.
  Scope: demo ui and http fixture baseline. Requirement: Eval · error handling. Evidence: [frontend/src/app/query-client.ts](../frontend/src/app/query-client.ts) · [frontend/src/api/client.test.ts](../frontend/src/api/client.test.ts).

- [x] **e-a11y — Accessibility basics** · Verified in stated scope.
  Skip link, labelled fields with inline errors and an error summary, keyboard row navigation, focus restoration, and a persistent marker on the active navigation item (accessibility review P1 item AST-001) are in place.
  Scope: api-mode app and source review. Requirement: Eval · best practices. Evidence: [frontend/src/components/ui/](../frontend/src/components/ui/) · [frontend/e2e/](../frontend/e2e/).

- [x] **e-console — A clean browser console: no errors or warnings** · Verified in stated scope.
  Baseline mock and React browser checks reported no runtime JavaScript errors; this is not a claim about every current integration run.
  Scope: demo ui and http fixture baseline. Requirement: Eval · code quality. Evidence: [reference/chatroom/frontend-updates.md](../reference/chatroom/frontend-updates.md) · [frontend/e2e/](../frontend/e2e/).

## Containerization

Part 5 · one command to run everything.

- [x] **c-be — Backend image at infra/docker/backend.Dockerfile** · Verified in stated scope.
  The infra-owned backend Dockerfile uses locked dependencies, a nonroot runtime and reproducible DuckDB generation; startup applies migration then seed before API.
  Scope: compiled stack and hosted ci baseline. Requirement: P5.1. Evidence: [infra/docker/backend.Dockerfile](../infra/docker/backend.Dockerfile) · [infra/scripts/entrypoint.py](../infra/scripts/entrypoint.py).

- [x] **c-fe — Frontend image at infra/docker/frontend.Dockerfile** · Verified in stated scope.
  The infra-owned multi-stage frontend image builds with Node/Vite and serves compiled assets through nonroot nginx.
  Scope: compiled stack and hosted ci baseline. Requirement: P5.2. Evidence: [infra/docker/frontend.Dockerfile](../infra/docker/frontend.Dockerfile).

- [x] **c-nginx — nginx config: SPA fallback and API proxy** · Verified in stated scope.
  SPA deep-link fallback, API-prefix stripping, JSON error preservation and static-asset 404s were verified in compiled-stack checks.
  Scope: compiled stack and hosted ci baseline. Requirement: P5.2 · P2.4. Evidence: [infra/nginx/default.conf](../infra/nginx/default.conf) · [infra/scripts/verify_stack.py](../infra/scripts/verify_stack.py).

- [x] **c-compose — `docker-compose.yml` starts the backend API, PostgreSQL and the frontend** · Verified in stated scope.
  Root Compose includes infra definitions for frontend, FastAPI and PostgreSQL. The frontend now builds in API mode by default, and the backend migrates and seeds on startup; demo data is opt-in.
  Scope: compiled stack and hosted ci baseline. Requirement: P5.3. Evidence: [docker-compose.yml](../docker-compose.yml) · [infra/compose.yml](../infra/compose.yml).

- [x] **c-health — Healthchecks and startup order** · Verified in stated scope.
  PostgreSQL pg_isready gates backend; /ready connectivity gates frontend. /health is exact liveness and does not independently prove seeded business flows.
  Scope: compiled stack and hosted ci baseline. Requirement: P5.3. Evidence: [infra/compose.yml](../infra/compose.yml) · [backend/app/routers/health.py](../backend/app/routers/health.py).

- [x] **c-vol — Named volume for Postgres data** · Verified in stated scope.
  A named PostgreSQL volume persists across container recreation; the isolated verifier checks data survives and seeding does not restore deleted records.
  Scope: compiled stack and hosted ci baseline. Requirement: P5.3. Evidence: [infra/compose.yml](../infra/compose.yml) · [infra/scripts/verify_stack.py](../infra/scripts/verify_stack.py).

- [x] **c-env — `.env.example` with every required variable** · Verified in stated scope.
  Root .env.example lists actual Compose/runtime and public Vite settings. Sample migration/seed flags are true; an existing .env is retained. No unimplemented SEED_EXTRA_PATIENTS setting or mandatory LLM key is claimed.
  Scope: compiled stack and hosted ci baseline. Requirement: P5.4. Evidence: [.env.example](../.env.example) · [setup.sh](../setup.sh) · [infra/scripts/entrypoint.py](../infra/scripts/entrypoint.py).

- [x] **c-clean — Clean-room test** · Verified in stated scope.
  Final frozen tree, 20 Nov: a fresh isolated Compose project with no .env builds, migrates, seeds 100 patients, survives restart, backend recreation and full-stack recreation, keeps request values out of logs, and passes all 16 live browser journeys on real PostgreSQL.
  Scope: clean-room isolated compose project. Requirement: Submission. Evidence: [infra/scripts/verify_stack.py](../infra/scripts/verify_stack.py) · [frontend/e2e-live/](../frontend/e2e-live/) · [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md).

- [x] **c-hot — Hot reload in Docker for frontend and backend** · Verified in stated scope.
  Development Compose mounts source for Vite and Uvicorn reload. Infra recorded a real HMR websocket update and Python-worker restart after edits.
  Scope: compiled stack and hosted ci baseline. Requirement: Stretch · DX. Evidence: [infra/compose.dev.yml](../infra/compose.dev.yml) · [infra/README.md](../infra/README.md) · [infra/docs/checklist.md](../infra/docs/checklist.md).

## Stretch goals and selected extensions

The brief suggests one or two; this project selected more. Optional items that were not selected remain clearly labelled.

- [x] **x-alembic — ★ Database migrations with Alembic** · Verified in stated scope.
  Reviewed Alembic revisions and real PostgreSQL migration round-trip/schema-agreement tests are implemented and reported passing.
  Scope: backend postgresql. Requirement: Stretch · Advanced Backend. Evidence: [backend/alembic/versions/20261120_0001_initial_schema.py](../backend/alembic/versions/20261120_0001_initial_schema.py) · [backend/tests/test_migrations.py](../backend/tests/test_migrations.py).

- [x] **x-tests — ★ Unit tests for the API endpoints** · Verified in stated scope.
  Pytest covers API responses, validation, database constraints, ownership, notes/summaries, imports and unread concurrency on disposable PostgreSQL. The current backend handoff reports 196 tests passed.
  Scope: backend postgresql. Requirement: Stretch · Testing. Evidence: [backend/tests/](../backend/tests/) · [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md).

- [ ] **x-log — Request logging middleware** · Not selected.
  Exception redaction and disabled raw access logs exist; structured request-ID/duration logging middleware is not implemented.
  Scope: optional. Requirement: Stretch · Advanced Backend. Evidence: [backend/app/utils/logging.py](../backend/app/utils/logging.py) · [infra/scripts/entrypoint.py](../infra/scripts/entrypoint.py).

- [x] **x-theme — Dark/light theme switching** · Verified in stated scope.
  Dark and light themes switch from the sidebar Theme control. Theme provider and control unit tests pass.
  Scope: api-mode app and unit tests. Requirement: Stretch · UI/UX. Evidence: [frontend/src/styles/globals.css](../frontend/src/styles/globals.css) · [frontend/src/app/ui-store.ts](../frontend/src/app/ui-store.ts) · [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md).

- [ ] **x-adv-search — Advanced search with filters** · Not selected.
  Basic search/status/unread filters are implemented; blood-type, condition, age-range and visit-range filters are not selected.
  Scope: optional. Requirement: Stretch · UI/UX. Evidence: [backend/app/schemas/patients.py](../backend/app/schemas/patients.py) · [frontend/src/features/patient-list/PatientFilters.tsx](../frontend/src/features/patient-list/PatientFilters.tsx).

- [x] **x-chart — Patient status chart on the dashboard** · Verified in stated scope.
  Verified 20 Nov: the patient status chart and three other overview charts render from each user's assigned patients.
  Scope: api-mode app, real data. Requirement: Stretch · UI/UX. Evidence: [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md) · [frontend/src/routes/home.tsx](../frontend/src/routes/home.tsx).

- [x] **x-comp — Component tests for PatientList and PatientForm** · Verified in stated scope.
  Vitest/Testing Library covers list/form/detail components, API adapters, utilities and state behavior. Historical baseline: 168 passed. Current integration discussion tests need reruns/fixes.
  Scope: demo ui and http fixture baseline. Requirement: Stretch · Testing. Evidence: [frontend/src/features/patient-list/PatientResults.test.tsx](../frontend/src/features/patient-list/PatientResults.test.tsx) · [frontend/src/features/patient-form/PatientFormPage.test.tsx](../frontend/src/features/patient-form/PatientFormPage.test.tsx) · [frontend/src/features/patient-detail/discussion.test.tsx](../frontend/src/features/patient-detail/discussion.test.tsx).

- [x] **x-e2e — E2E test of the main user journey** · Verified in stated scope.
  Closed by the written Opus pass-02 decision in the recorded candidate scope. Stretch item; frontend candidate only; backend identity unbound This does not approve later source edits, the default demo setup or final visual readiness.
  Scope: Opus-approved compiled LIVE candidate-03. Requirement: Stretch · Testing. Evidence: [frontend/e2e-live/](../frontend/e2e-live/).

- [x] **x-ci — CI pipeline config** · Verified in stated scope.
  Hosted CI run 44816245004 for add0bdd is green. All three jobs pass: application checks and Docker startup, demo and intercepted-contract browser regressions, and real-API browser integration on a fresh stack.
  Scope: hosted ci on add0bdd. Requirement: Stretch · DX. Evidence: [.github/workflows/ci.yml](../.github/workflows/ci.yml) · [infra/scripts/verify_stack.py](../infra/scripts/verify_stack.py) · [Hosted CI run](https://github.com/eugeniosp3/ascertain/actions/runs/44816245004).

## Final application quality

Historical scoped passes do not close current integration and detailed QA checks.

- [x] **q-spec — Walk `project.md` line by line against the running app** · Verified in stated scope.
  Walked the assessment on 20 Nov against the running API-mode app at 1440px and 390px: routes, list fields, search, filter, sort, pagination, notes, summary, form validation and 404. The clean-room Docker run and QA's live HTTP matrix (317/317 cases, plus 32/32 assignment and 16/16 seed-rerun checks) also pass.
  Scope: api-mode app, clean-room run, live api matrix. Requirement: Eval · requirements. Evidence: [reference/project.md](../reference/project.md) · [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md).

- [x] **q-lint — Lint, format and typecheck pass on both sides** · Verified in stated scope.
  Verified 20 Nov: backend and data Ruff, format and strict mypy pass in an isolated checks container. Frontend ESLint, Prettier and strict TypeScript pass.
  Scope: isolated checks image and frontend tree. Requirement: Eval · code quality. Evidence: [.github/workflows/ci.yml](../.github/workflows/ci.yml) · [frontend/package.json](../frontend/package.json) · [backend/pyproject.toml](../backend/pyproject.toml).

- [x] **q-tests — All tests pass** · Verified in stated scope.
  Final frozen tree, 20 Nov, all green. Backend: 337 tests plus Ruff, format and strict mypy; data: 153 tests (isolated checks container on real PostgreSQL). Frontend: 370 unit, 117 demo-browser and 11/11 HTTP-adapter browser tests, plus lint, format and strict TypeScript. Clean-room run: a fresh isolated stack passes migrations, the 100-patient seed, restart, recreate and log-privacy checks, and all 16 live browser journeys on desktop and phone.
  Scope: final frozen tree. Requirement: Eval · code quality. Evidence: [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md).

- [x] **q-clean — Remove dead code, stray `console.log`/`print` calls and TODOs** · Verified in stated scope.
  20 Nov sweep: no console.log, debugger, TODO or FIXME in source. A redundant never-run acceptance spec, the 16k-line QA fault harness (moved to the local qa/ folder) and stale handoff docs were removed from the published tree.
  Scope: source sweep. Requirement: Eval · code quality. Evidence: [reference/chatroom/frontend-updates.md](../reference/chatroom/frontend-updates.md) · [frontend/src/](../frontend/src/) · [backend/app/](../backend/app/).

- [x] **q-secrets — Keep secrets and personal files out of published artifacts** · Verified in stated scope.
  The publication audit excludes real environment files and personal study materials from Git/builds. Local .env is allowed and expected; the goal is no secrets in published artifacts.
  Scope: compiled stack and hosted ci baseline. Requirement: Submission. Evidence: [.gitignore](../.gitignore) · [.dockerignore](../.dockerignore) · [README.md](../README.md).

## Documentation and explanation

Public overview, folder runbooks, decisions and requirement/evidence tracking.

- [x] **r-quick — Quick start** · Verified in stated scope.
  The root README provides the Docker Desktop prerequisite, ./setup.sh, the manual Compose path and local URLs.
  Scope: documentation. Requirement: Submission. Evidence: [README.md](../README.md) · [setup.sh](../setup.sh).

- [x] **r-local — Running without Docker** · Verified in stated scope.
  The backend README has native uv, migration, seed and Uvicorn commands; the frontend README has npm development/API-mode commands; the infra README covers manual connections.
  Scope: documentation. Requirement: Submission. Evidence: [backend/README.md](../backend/README.md) · [frontend/README.md](../frontend/README.md) · [infra/README.md](../infra/README.md).

- [x] **r-decisions — Tech decisions, each with a one-line reason** · Verified in stated scope.
  The root README explains the build, library roles, domain-lead/specialist agent workflow and folder ownership, with links to detailed guides.
  Scope: documentation and link validation. Requirement: Eval · decisions. Evidence: [frontend/README.md](../frontend/README.md) · [backend/README.md](../backend/README.md) · [data/README.md](../data/README.md) · [README.md](../README.md).

- [x] **r-api — API overview** · Verified in stated scope.
  API overview and contract documentation agree with the corrected OpenAPI on backend source 34e2150b…bbb7, accepted by Opus pass 03.
  Scope: backend 34e2150b documentation. Requirement: Eval · API design. Evidence: [backend/docs/API_CONTRACT.md](../backend/docs/API_CONTRACT.md) · [backend/app/routers/notes.py](../backend/app/routers/notes.py).

- [x] **r-perf — How 100+ patients and non-blocking search are handled** · Verified in stated scope.
  The frontend README and implementation guide explain server paging, 250 ms debounce, cancellation, virtualization and URL state, without an invented throughput benchmark.
  Scope: documentation. Requirement: P2 Req. Evidence: [frontend/README.md](../frontend/README.md) · [frontend/docs/IMPLEMENTATION.md](../frontend/docs/IMPLEMENTATION.md).

- [x] **r-growth — How it grows** · Verified in stated scope.
  The README explains where new features, schema changes, contract/cache updates and real identity belong, linking the existing feature/service/migration structure. Future workflows are identified without claiming they already exist.
  Scope: documentation and architecture references. Requirement: Context. Evidence: [README.md](../README.md) · [frontend/docs/IMPLEMENTATION.md](../frontend/docs/IMPLEMENTATION.md) · [backend/docs/IMPLEMENTATION.md](../backend/docs/IMPLEMENTATION.md).

- [x] **r-stretch — Which stretch goals were completed** · Verified in stated scope.
  The master card enumerates selected and optional stretch features with their implementation and verification scopes.
  Scope: documentation and link validation. Requirement: Stretch. Evidence: [reference/holepunch.html](../reference/holepunch.html) · [README.md](../README.md).

- [x] **r-trade — Trade-offs, known limits, next steps** · Verified in stated scope.
  READMEs explicitly distinguish demo/API persistence, synthetic identity, external attachment links and template-only summaries. Live integration is not claimed complete.
  Scope: documentation. Requirement: Eval · decisions. Evidence: [README.md](../README.md) · [frontend/README.md](../frontend/README.md) · [backend/README.md](../backend/README.md).

- [x] **r-short — Succinct: skimmable in about three minutes** · Verified in stated scope.
  The root README provides a short overview and folder table of contents, leaving detailed setup and API instructions in the area guides.
  Scope: documentation and link validation. Requirement: Submission. Evidence: [README.md](../README.md).

## Repository and submission

Publication is authorized and the public baseline is verified. Current integration changes have separate gates.

- [x] **g-ok — Get your explicit go-ahead to create the repo** · Verified in stated scope.
  The user authorized repository creation/publication in the infra chat; the public repository now exists. The initial phase gate has been satisfied.
  Scope: authorized publication. Requirement: Submission. Evidence: [README.md](../README.md).

- [x] **g-init — `git init`, check `.gitignore`, first commit** · Verified in stated scope.
  Git main and initial commits are present; the ignore policy was reviewed before publication.
  Scope: published repository. Requirement: Submission. Evidence: [.gitignore](../.gitignore) · [README.md](../README.md).

- [x] **g-push — Create the public GitHub repository and push** · Verified in stated scope.
  The public monorepo eugeniosp3/ascertain is published. Current in-progress changes remain local until owner verification.
  Scope: published repository. Requirement: Submission. Evidence: [README.md](../README.md).

- [x] **g-verify — Fresh clone into a new folder → `docker compose up --build` works** · Verified in stated scope.
  GitHub Actions checked out the published revision, built images and passed compiled-stack startup/seed/persistence checks. This does not claim the new live UI integration has passed.
  Scope: hosted clean checkout baseline. Requirement: Submission. Evidence: [.github/workflows/ci.yml](../.github/workflows/ci.yml) · [infra/scripts/verify_stack.py](../infra/scripts/verify_stack.py).

- [x] **g-send — Send the repository link** · Verified in stated scope.
  The public repository link has been provided and the root README links its CI.
  Scope: published repository. Requirement: Submission. Evidence: [README.md](../README.md).

## Data preparation and lineage

Patient-only preparation preserves source meaning and supplies the current DuckDB runtime handoff.

- [x] **data-bronze — Preserve original source values in bronze DuckDB** · Verified in stated scope.
  Preserve 100 rows and 76 source fields with source hash/row metadata; the original CSV is unchanged.
  Scope: data pipeline. Requirement: Selected addition. Evidence: [data/src/patient_data/stages.py](../data/src/patient_data/stages.py) · [data/docs/HOLEPUNCH.md](../data/docs/HOLEPUNCH.md).

- [x] **data-silver — Keep adjacent raw/clean pairs in silver** · Verified in stated scope.
  All 76 raw/clean pairs retain original values while explicit rules parse dates, decimals, counts and flags.
  Scope: data pipeline. Requirement: Selected addition. Evidence: [data/src/patient_data/patient_rules.py](../data/src/patient_data/patient_rules.py) · [data/docs/HOLEPUNCH.md](../data/docs/HOLEPUNCH.md).

- [x] **data-lineage — Retain source bronze and silver UUID lineage** · Verified in stated scope.
  Versioned deterministic lineage remains separate from application UUIDs; repeat builds preserve unchanged artifacts.
  Scope: data pipeline. Requirement: Selected addition. Evidence: [data/src/patient_data/stages.py](../data/src/patient_data/stages.py) · [backend/app/utils/duckdb_source.py](../backend/app/utils/duckdb_source.py).

- [x] **data-runtime-import — Seed application directly from validated DuckDB snapshots** · Verified in stated scope.
  Backend app.seed is the current runtime path. The older JSONL prototype is not a required application dependency.
  Scope: backend postgresql. Requirement: Selected addition. Evidence: [backend/app/seed.py](../backend/app/seed.py) · [backend/app/services/seeding.py](../backend/app/services/seeding.py) · [backend/tests/test_seed.py](../backend/tests/test_seed.py).

- [x] **data-dbml-models — Document the application and data-stage models in DBML** · Verified in stated scope.
  Application and bronze/silver schemas are documented in readable DBML with source mappings. Local model documentation is complete; no hosted dbdocs.io project is claimed.
  Scope: local model documentation. Requirement: User-selected model documentation. Evidence: [backend/docs/schema.dbml](../backend/docs/schema.dbml) · [backend/docs/DATA_MODEL.md](../backend/docs/DATA_MODEL.md) · [data/docs/schema.dbml](../data/docs/schema.dbml) · [data/docs/DATA_CONTRACT.md](../data/docs/DATA_CONTRACT.md).

## Discussion and notifications

Clinical content and discussion remain separate; unread behavior is viewer-specific and final API/UI acceptance is tracked.

- [x] **collaboration-comments — Authored discussion comments with edit/delete and timestamps** · Verified in stated scope.
  Backend author checks and same-patient references are tested. The UI live-contract migration remains open.
  Scope: backend postgresql. Requirement: Selected addition. Evidence: [backend/app/services/comments.py](../backend/app/services/comments.py) · [backend/tests/test_comments.py](../backend/tests/test_comments.py).

- [x] **collaboration-note-links — Stable note links and deleted-note tombstones** · Verified in stated scope.
  Clinical content is removed while note identity survives for old comment links.
  Scope: backend postgresql. Requirement: Selected addition. Evidence: [backend/app/models.py](../backend/app/models.py) · [backend/app/services/notes.py](../backend/app/services/notes.py) · [backend/tests/test_notes.py](../backend/tests/test_notes.py).

- [x] **collaboration-unread — Per-viewer unread flags and bounded cursor acknowledgments** · Verified in stated scope.
  Closed by the written Opus pass-02 decision in the recorded candidate scope. OPR-006 FOR UPDATE serialization is a Low advisory This does not approve later source edits, the default demo setup or final visual readiness.
  Scope: Opus-approved compiled LIVE candidate-03. Requirement: Selected addition. Evidence: [backend/tests/test_comment_unread.py](../backend/tests/test_comment_unread.py) · [frontend/src/features/patient-detail/useDiscussionRead.ts](../frontend/src/features/patient-detail/useDiscussionRead.ts).

- [x] **notifications-queue — Global notification totals and unread-patient queue** · Verified in stated scope.
  Closed by the written Opus pass-02 decision in the recorded candidate scope.  This does not approve later source edits, the default demo setup or final visual readiness.
  Scope: Opus-approved compiled LIVE candidate-03. Requirement: Selected addition. Evidence: [frontend/src/features/notifications/](../frontend/src/features/notifications/) · [backend/app/services/notifications.py](../backend/app/services/notifications.py) · [frontend/e2e/notifications.spec.ts](../frontend/e2e/notifications.spec.ts).

- [x] **collaboration-attachment-links — Store and open external note-source link metadata** · Verified in stated scope.
  Backend supports authored HTTPS attachment-link metadata with patient/note ownership checks and no server-side fetching. These are source references, not uploaded file storage or invented fixture documents.
  Scope: backend API integration and source-link rendering. Requirement: User-selected note source links. Evidence: [backend/app/routers/notes.py](../backend/app/routers/notes.py) · [backend/app/schemas/notes.py](../backend/app/schemas/notes.py) · [frontend/src/features/patient-detail/NoteView.tsx](../frontend/src/features/patient-detail/NoteView.tsx).

## Selected UI and code organization

Added interactions and explicit state ownership complement the assessment.

- [x] **workspace-context — Overlay mobile detail and list/focus restoration** · Verified in stated scope.
  List position, filters and focus restore after closing a patient, using a simpler implementation. Directory and history browser checks pass.
  Scope: frontend browser suites. Requirement: Selected addition. Evidence: [frontend/src/features/patient-detail/PatientWorkspace.tsx](../frontend/src/features/patient-detail/PatientWorkspace.tsx) · [frontend/src/app/view-state.ts](../frontend/src/app/view-state.ts) · [frontend/e2e/clinical-workspace.spec.ts](../frontend/e2e/clinical-workspace.spec.ts) · [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md).

- [x] **workspace-row-click — Whole-row and mobile-card patient opening** · Verified in stated scope.
  Whole-row and mobile-card opening is implemented through the existing overview link. Notes and Conversation retain their own actions. Eight focused interaction tests passed; integrated live acceptance remains separate.
  Scope: focused component interaction tests. Requirement: Selected addition. Evidence: [frontend/src/features/patient-list/PatientResults.tsx](../frontend/src/features/patient-list/PatientResults.tsx) · [frontend/e2e-live/](../frontend/e2e-live/).

- [x] **architecture-state — Separate server URL form and UI state** · Verified in stated scope.
  Query/Router/Form/Zustand have distinct ownership. Actor-aware cache keys and terminal-detail recovery have focused tests.
  Scope: source and baseline tests. Requirement: Selected addition. Evidence: [frontend/src/app/ui-store.ts](../frontend/src/app/ui-store.ts) · [frontend/src/app/query-keys.ts](../frontend/src/app/query-keys.ts) · [frontend/src/app/patient-query.test.ts](../frontend/src/app/patient-query.test.ts).

- [x] **architecture-study-comments — Explain implementation sections with concise source comments** · Verified in stated scope.
  27 frontend files were annotated. Comment-free TypeScript printer comparison, syntax, ESLint and Prettier checks passed. Personal study PDFs remain excluded from the public repository.
  Scope: comment only static checks. Requirement: Selected addition. Evidence: [frontend/src/features/patient-list/PatientResults.tsx](../frontend/src/features/patient-list/PatientResults.tsx) · [frontend/src/app/router.tsx](../frontend/src/app/router.tsx).

- [x] **overview-age-bands — Show age-band distribution** · Verified in stated scope.
  Verified 20 Nov on real data: age bands render per user (e.g. Coordinator 18–39: 5, 40–59: 18, 60–79: 23, 80+: 2).
  Scope: api-mode app, real data. Requirement: User-selected overview addition. Evidence: [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md) · [frontend/src/routes/home.tsx](../frontend/src/routes/home.tsx).

- [x] **overview-visit-recency — Chart patients by latest recorded visit month** · Verified in stated scope.
  Verified 20 Nov: latest-visit-by-month chart renders per user with a 6- or 12-month toggle and earlier and no-visit buckets.
  Scope: api-mode app, real data. Requirement: User-selected overview addition. Evidence: [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md) · [frontend/src/routes/home.tsx](../frontend/src/routes/home.tsx).

- [x] **overview-note-coverage — Show clinical-note coverage and total notes** · Verified in stated scope.
  Verified 20 Nov: note coverage renders per user (Clinician has 2 active notes, Coordinator 0).
  Scope: api-mode app, real data. Requirement: User-selected overview addition. Evidence: [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md) · [frontend/src/routes/home.tsx](../frontend/src/routes/home.tsx).

- [x] **default-demo-user — Open immediately with default User A** · Verified in stated scope.
  Verified 20 Nov: the app opens with Demo Clinician selected automatically, and a saved choice is kept.
  Scope: api-mode app. Requirement: New user instruction, 20 Nov. Evidence: [frontend/src/app/actor-context.tsx](../frontend/src/app/actor-context.tsx) · [frontend/src/app/actor-context.test.tsx](../frontend/src/app/actor-context.test.tsx) · [frontend/e2e-api/http-workspace.spec.ts](../frontend/e2e-api/http-workspace.spec.ts) · [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md).

- [x] **overview-user-scope — Make overview data meaningfully user-specific** · Verified in stated scope.
  Verified 20 Nov: Demo Clinician sees 52 assigned patients and Demo Coordinator 48, with different status, age-band and visit charts. The patient directory still lists all 100. Backend: migration 0002, assigned_to=me and an idempotent seed, with 301 tests passing in an isolated run.
  Scope: api-mode app and isolated backend checks. Requirement: New user instruction, 20 Nov. Evidence: [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md) · [reference/chatroom/review-actions.md](../reference/chatroom/review-actions.md) · [frontend/src/routes/home.tsx](../frontend/src/routes/home.tsx).

## Setup and delivery additions

One-command setup and distinct verification lanes support reproducible delivery.

- [x] **setup-entrypoint — One-command setup with preserved settings and data** · Verified in stated scope.
  setup.sh checks/starts installed Docker Desktop, creates a missing .env without overwriting existing values, builds and waits. --dev selects hot reload.
  Scope: isolated setup. Requirement: Selected addition. Evidence: [setup.sh](../setup.sh) · [infra/scripts/ensure-docker.sh](../infra/scripts/ensure-docker.sh) · [infra/README.md](../infra/README.md).

- [x] **ci-browser-lanes — Separate demo and HTTP-fixture browser CI lanes** · Verified in stated scope.
  The published workflow runs desktop/mobile demo and intercepted-contract tests with failure artifacts. Those are not real-database browser proof.
  Scope: hosted ci baseline. Requirement: Selected addition. Evidence: [.github/workflows/ci.yml](../.github/workflows/ci.yml) · [frontend/playwright.api.config.ts](../frontend/playwright.api.config.ts).

- [x] **ci-live-browser — Run real API-mode browser journeys on an isolated compiled stack** · Verified in stated scope.
  Verified locally (clean-room run) and on hosted CI for 80c9dab: all 16 live browser journeys pass on desktop and phone against a freshly built API-mode stack. A never-run, redundant core-acceptance spec with stale selectors was removed.
  Scope: clean-room live run. Requirement: Selected addition. Evidence: [infra/scripts/verify_stack.py](../infra/scripts/verify_stack.py) · [.github/workflows/ci.yml](../.github/workflows/ci.yml) · [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md).

- [x] **ci-publication-safety — Publish safe repository and restricted CI permissions** · Verified in stated scope.
  The public repository excludes study_mats and real env files. Workflow tokens are read-only; Actions cannot approve PRs; external fork workflows require approval.
  Scope: repository configuration. Requirement: Selected addition. Evidence: [.gitignore](../.gitignore) · [.github/workflows/ci.yml](../.github/workflows/ci.yml) · [README.md](../README.md).

## Detailed and longitudinal QA

Case inventories and dated evidence retain failed attempts, retests and unexecuted work.

- [x] **qa-control-inventory — Inventory every UI control and backend operation** · Verified in stated scope.
  QA catalogs and CSVs now itemize 605 UI cases and 317 API cases with stable IDs, steps, expected results and evidence mapping. The inventories are delivered; execution is counted separately and many UI cases remain unverified.
  Scope: inventory structure and documentation. Requirement: Selected addition. Evidence: [reference/project.md](../reference/project.md).

- [x] **qa-run-history — Retain dated pass/fail results without overwriting history** · Verified in stated scope.
  Dated execution, defect and longitudinal records plus refresh/recording tools are present. Failed attempts and retests are retained. This completes the tracking mechanism, not future day-7/day-14/day-30 checks or all UI execution.
  Scope: longitudinal tracking implementation. Requirement: Selected addition. Evidence: [reference/project.md](../reference/project.md).

- [x] **qa-opus-review-gate — Require Opus 5.5 UltraCode code and visual review** · Verified in stated scope.
  Final Opus 5.5 review on 20 Nov: PM's five-dimension review (correctness, complexity, hygiene) with adversarial verification; backend's four-reviewer review found no must-fix bugs; QA's independent backend run found no defects. The confirmed frontend findings (search-space bug, malformed-ID not-found) were sent to frontend for fixing.
  Scope: final opus review cycle. Requirement: User-selected review requirement. Evidence: [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md) · [reference/chatroom/parallel-work.md](../reference/chatroom/parallel-work.md).

- [x] **qa-styling-accessibility — Document accessibility styling recommendations and implement accepted fixes** · Verified in stated scope.
  The accessibility agent documented ten styling recommendations (AST-001 to AST-010). The P1 item AST-001, a visible active-navigation marker, is implemented. The P2/P3 refinements (contrast margins, touch targets, small text) are recorded as optional follow-ups.
  Scope: styling review and P1 fix. Requirement: User-selected styling review. Evidence: [reference/chatroom/review-actions.md](../reference/chatroom/review-actions.md) · [reference/chatroom/integration-coordination.md](../reference/chatroom/integration-coordination.md).

## Updating this record

Edit [progress.json](progress.json) after reviewing the current implementation and dated evidence, then run:

```sh
python3 reference/build_progress.py
```

Both views share the same item IDs, statuses and evidence. The interactive card can retain personal checkbox overrides in a browser; those do not change this committed verification record. Record new failures and retests instead of erasing older evidence.
