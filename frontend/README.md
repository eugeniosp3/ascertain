# Frontend

The Vite/React patient workspace implements the reviewed design with themed shadcn components, TanStack Router/Query/Table/Virtual/Form, and a small Zustand UI store. It includes patient creation/editing/deletion, clinical notes, summaries, authored discussion, unread notifications and responsive patient overlays.

**Integration:** API mode is the default. The app automatically uses the first active demo user returned by `/users`, preserving a valid saved choice. Overview shows that user's assigned workload; the patient directory stays shared. See the [data contract](../reference/chatroom/frontend-data-contract.md), [frontend updates](../reference/chatroom/frontend-updates.md), and [root setup guide](../README.md).

## Run locally

Use Node 24.21 or later in the Node 24 line and npm 11.19 or later in the npm 11 line, matching [package.json](package.json) and [.nvmrc](.nvmrc).

```sh
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite. The app defaults to User A (the first actual `/users` result), preserving a valid saved choice. Use the demo-user picker to switch identities. API mode uses FastAPI/PostgreSQL; `VITE_DATA_MODE=demo` is the explicit temporary-memory option whose edits reset on reload. Zustand persists sidebar, actor and theme preferences, not clinical records or drafts.

Identity discovery validates the saved user against `/users`; absent or stale choices fall back to its first actual result. Failed discovery does not fabricate an identity or fall back to fixture data. Browser calls use `/api`; the dev proxy forwards them to `API_PROXY_TARGET` (default `http://127.0.0.1:8000`) with the prefix removed. `VITE_DATA_MODE` and `VITE_API_BASE` are build-time public settings. The adapter maps backend notification/list fields, follows chronological comment cursors, and acknowledges exact displayed-prefix boundaries.

## Verify and build

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run e2e -- --workers=2
npm run e2e:api -- --workers=2
# Live journeys against an already-running compiled API-mode stack (no servers are started):
PLAYWRIGHT_LIVE_BASE_URL=http://localhost:10050 npm run e2e:live
# Or, from the repository root, build an isolated stack and run them: python3 infra/scripts/verify_stack.py --live-browser
# Build for deployment when needed:
npm run build
```

The production build is in `dist/`. Playwright uses installed Chrome and isolated browser contexts. The demo suite starts Vite on port 4174; the API suite starts API mode on 4175 and intercepts HTTP responses. `PLAYWRIGHT_BASE_URL` and `PLAYWRIGHT_API_BASE_URL` can instead point at existing frontend servers. These HTTP fixtures do not prove database persistence. Test results and review fixes are recorded in the project-manager update.

Infra can use `npm ci` and `npm run build`, serve `dist/` with SPA fallback, and forward `/api/` to FastAPI. Builds use API mode by default; provide Chrome for the browser checks in CI. Docker, Compose, database seeding and workflow wiring are owned by infra/backend/data.

## Organization and state

- `src/components/ui/` contains the adapted shadcn primitives; `components/shared/` contains reusable fields, errors and empty states.
- `src/app/` composes the router, Query client, actor selection and Zustand store. Router owns URL filters; Query owns API entities; Form owns drafts; Zustand owns small shared UI preferences and return snapshots.
- `src/features/` separates patient lists, patient forms, patient detail/discussion and notifications. Shared date, patient-label and form-error helpers live in `src/utils/`.
- `src/api/` contains the typed interface, HTTP client and explicit memory adapter. `src/fixtures/` supplies synthetic demo data; it does not import the source CSV or replace the real seed pipeline.
- The patient parent route stays mounted across linked-note navigation so drafts and visit-only New markers survive. Recoverable refresh failures keep drafts; denied/deleted patient fetches discard cached detail until a successful read restores access.

## Open the mockups

- [Patient workspace](docs/ui-mocks/index.html): collapsible vertical navigation, a searchable and paginated patient table, clickable clinical-note counts, and the two-panel patient overlay. On phones, the overlay becomes full-screen detail with Back.
- [Component gallery](docs/ui-mocks/components.html): theme colors, buttons, fields, navigation, tables, identity headers, feedback and dialog specimens.

Double-click either HTML file to open it in a browser. Both files contain their own styles, scripts and synthetic data; no install, server or database is required. Patient/note/comment changes stay in memory and reset on reload; view preferences may persist in the browser.

Open a patient, scroll to compact the identity header, and close to restore the list position with the last patient highlighted in lilac. The mock removes the background patient-row DOM while the record is open. Its table uses pagination; the React application additionally uses TanStack Virtual for visible-row rendering.

The mockups were checked in desktop Chrome with 375–1440px viewport sizes, including phone touch emulation. Checks covered layout overflow, collapsed-only tooltips, search/paging, note counts, note/comment creation, dialogs, keyboard focus, browser Back/Forward, compact headers and return-to-list state. No runtime JavaScript errors or remote resource requests were observed. This is UI verification, not backend or production-library verification.

## Overview

The frontend is a React + TypeScript single-page app for a medical practice's patient management dashboard. Staff can browse, search, create, edit and delete patients, record clinical notes, read a generated summary, and discuss a patient in comments that can link to specific notes. The browser calls the FastAPI backend through relative `/api` URLs. TanStack Query holds API data; Zustand holds small shared UI preferences and return-to-list state.

## Selected stack

| Concern | Choice |
| --- | --- |
| Build and language | Vite, React, TypeScript in strict mode |
| UI and styling | Tailwind CSS with shadcn/ui components, themed from the Ascertain design reference first |
| Routing | TanStack Router with one code-based route tree and typed search params |
| Server state | TanStack Query |
| Shared UI state | Zustand for sidebar preferences, demo actor selection and return-to-list snapshots |
| Tables | TanStack Table for server-driven sorting/paging, with TanStack Virtual for visible-row rendering |
| Forms and validation | TanStack Form with Zod schemas |
| Quality | ESLint, Prettier, Vitest with Testing Library, and Playwright for the browser journey |

This stack replaces the Mantine, React Router and React Hook Form suggestions in the older Holepunch checklist.

## References

- Brief: [project.md](../reference/project.md). Master checklist: [holepunch.html](../reference/holepunch.html).
- Design reference: [design-system/README.md](../reference/design-system/README.md), [tokens.css](../reference/design-system/tokens.css), [components](../reference/design-system/02_components.md) and [accessibility](../reference/design-system/05_accessibility_and_responsive.md).
- Companion plans: [backend checklist](../backend/docs/HOLEPUNCH.md), [API implementation plan](../backend/docs/IMPLEMENTATION.md), [data-model proposal](../backend/docs/DATA_MODEL.md), [schema](../backend/docs/schema.dbml), [infra plan](../infra/README.md) and [infra checklist](../infra/docs/checklist.md).
- Fixture context: [prior-auth-pack/README.md](../reference/prior-auth-pack/README.md). It supplies realistic data, not a mandate to build prior-auth screens.
- How to build it: [IMPLEMENTATION.md](docs/IMPLEMENTATION.md).

## Ownership

- **Frontend:** everything under `frontend/src`, the package scripts and lockfile, the Vite dev proxy, the UI tests, and the frontend sections of the root README.
- **Data:** source cleanup, DuckDB transformations, lineage IDs, versioned seed exports, and coordination of the shared data model with backend.
- **Backend:** application persistence, Alembic migrations, validated imports and startup seeds, comment authorship and validation, and the OpenAPI contract. Frontend consumes API records, not DuckDB tables or raw exports.
- **Infra:** `infra/docker/frontend.Dockerfile`, nginx (SPA fallback and `/api` prefix stripping), Compose, `.env.example` and the CI workflow. The frontend supplies working commands and checks that the result runs.

## Checklist

Checked items record implementation with scoped evidence; they do not certify every interaction or the final integrated candidate. The dated handoff distinguishes demo, HTTP-contract and live results. Known review failures below remain open. Items marked *(addition)* are selected features beyond the original brief.

### 1. Agree on the API contract

- [x] Adopt the backend list envelope `{items, total, page, page_size}` and query params `q`, `status`, `sort_by`, `order`, `page` and `page_size`; candidate 03 exercised real queries.
- [x] Consume backend `notes_count`, counting active notes without a separate child request per patient.
- [x] Align patient IDs, status/blood values, conditions/allergies and flat contact/address fields with the live contract.
- [ ] Confirm the error envelope and how 422 field paths are reported, so server errors can be attached to the right form fields.
- [x] Adopt live note/summary/comment/user/link endpoints and cursor/read-through semantics; candidate 03 exercised their real HTTP behavior.

### 2. Tooling and project setup

- [x] Scaffold the Vite `react-ts` app in `frontend/` with `strict`, `noUncheckedIndexedAccess` and an `@/` path alias.
- [x] Add an ESLint flat config (typescript-eslint, react-hooks, react-refresh) and Prettier.
- [x] Add the scripts `dev`, `build`, `preview`, `lint`, `typecheck`, `format`, `format:check` and `test`, and include a lockfile and supported Node version.
- [x] Configure the Vite dev proxy to forward `/api` to the backend with the prefix stripped, so dev and Docker use the same URLs.
- [x] Keep secrets out of `VITE_*` variables. The frontend build needs no API keys.

### 3. Ascertain theme and first milestone

- [x] Install Tailwind and shadcn, and copy selected Ascertain values into app-owned theme variables. Do not import `tokens.css` globally, because its names collide with Tailwind's.
- [x] Apply the documented accessibility fixes: a visible focus ring, readable secondary text, visible control borders, and status-pill text with at least 4.5:1 contrast.
- [x] Use the fallback fonts and product-level density. Leave out marketing effects such as the text roll, scroll scenes and glass over imagery.
- [x] Adapt the primitives as their screens need them: Button, Input, Label, Textarea, Select, StatusPill, Card, Table, Tabs, Sheet, Dialog, AlertDialog, Skeleton and Toast.
- [x] **First milestone:** the app shell and one patient-list screen with search, status pills and pagination, plus a small form sample, built from typed fixtures and checked at desktop width and at 375 px.
- [x] Keep the fixtures small, typed and inside `frontend/`, and replace them with API data feature by feature. The app never imports the CSV at runtime.

### 4. App shell and routes

- [x] Build the layout with a small contextual header, a vertical sidebar and the main table area; the sidebar can collapse to icons and becomes a compact menu on phones.
- [x] Show navigation tooltips on hover and keyboard focus when the sidebar is collapsed, and suppress them when the labels are visible.
- [x] Add the routes `/`, `/patients`, `/patients/new`, `/patients/:id`, `/patients/:id/edit` and a catch-all 404 page with a link home.
- [x] Add a route-level error boundary with a retry, active nav highlighting, a title per page, a skip link and labelled page/dialog headings.
- [x] Make deep links survive a refresh: build with absolute asset paths, and rely on infra's nginx fallback to `index.html`.

### 5. API client and server state

- [x] Write one fetch wrapper that adds the `/api` prefix, parses JSON, handles a 204 with no body, and distinguishes network, validation, identity, permission, not-found, deleted-note, conflict and server errors.
- [ ] Keep the API types in one module that mirrors the OpenAPI schema. Generated types can replace it later.
- [x] Configure TanStack Query with one query key per resource and filter set, cancel stale requests through `AbortSignal`, and never retry 4xx responses.
- [x] Make each mutation refresh exactly the list, detail, notes, summary or comments queries it affects.

### 6. Dashboard home and patient list

- [x] Home provides patient-list and add-patient shortcuts; include global counts or recent visits only through an agreed complete-data query, never by treating the current page as the full dataset.
- [x] Each patient row shows name, age, last visit and a status pill. Wide screens get a table, narrow screens get cards, and clicking a patient opens their page.
- [x] Show the active clinical-note count in a Notes column; clicking it opens the patient's Notes tab, including an empty state when the count is zero.
- [x] Delegate complete-dataset search/filter/sort/page operations to the API adapter. Keep typing instant, debounce requests and retain prior results while loading the next response.
- [x] Filter by status, and sort by name, age and last visit in both directions with `aria-sort`. Sorting by age reverses the date-of-birth sort.
- [x] Add page controls, page size and the total count. Return to page 1 whenever the search, filter or sort changes.
- [x] Keep search, filter, sort and page in Zod-validated URL params, so refresh, the back button and shared links all keep the view.
- [x] Show a loading skeleton, an empty state that tells "no patients" apart from "no matches", and an error state with a retry.
- [ ] Check against the backend's 100+ seeded patients that search, sort and paging stay fast.
- [ ] Virtualize offscreen rows and preserve keyboard access, scroll and origin focus. Implementation exists; repeated-history focus and the original scroll proof remain under review.

### 7. Patient detail and summary

- [x] Show the full profile in personal, contact, address and medical sections, distinguishing unknown blood type or allergies from explicitly recorded no known allergies.
- [x] On wider screens, show patient details in a two-panel modal workspace over a blurred structural backdrop; remove the underlying patient rows from the DOM and disable background interaction while it is open.
- [x] Compact the patient identity header during detail scrolling while keeping name, DOB, age and patient number readable; expand it again at the top.
- [ ] Verify full-screen phone detail and complete return-state restoration after the fixes. Candidate 03 verifies modal bounds and first returns; repeated history/scroll adjudication remain open.
- [x] A missing or deleted patient shows a not-found state, not a crash or a generic error.
- [x] Show the summary panel: identifiers (name, age, blood type), the narrative, conditions and allergies, with loading and error states.
- [x] Refresh the summary after a note is added or deleted and after the patient is edited.

### 8. Patient form, edit and delete

- [x] Build one TanStack Form for create and edit, covering name, date of birth, phone, email, address, last visit, allergies and allergy status, conditions, blood type and patient status.
- [ ] Mirror the server rules in a Zod schema, and show inline, plain-language errors on blur and on submit.
- [x] Put server 422 errors on the matching fields. Errors that match no field go in a form-level alert.
- [x] If the network fails, keep what the user typed, explain what happened and allow a retry. Disable submit while saving so nothing is sent twice.
- [x] Edit mode pre-fills from the API and sends a complete `PUT`. On success, show a toast, go to the patient page and refresh cached data.
- [x] Delete only after a confirmation dialog, then return to the list and drop the cached patient data.

### 9. Clinical notes

- [x] List notes newest first, with timestamps shown in the viewer's time zone.
- [x] The add-note form has text and an editable clinical date and time that defaults to now, sent as a timezone-aware ISO timestamp.
- [x] Delete an owned note after confirmation, then refresh notes, summary and comment links; handle a server refusal without losing the current view.
- [x] Give each note a stable link that opens it directly, plus a copy-link action. *(addition)*

### 10. Comments and note links *(addition)*

- [x] Label comments as team discussion and keep them visually separate from clinical notes and the summary. Comments never feed the summary.
- [x] Multiple demo users can comment. Each comment shows its author, when it was created and when it was last edited.
- [x] Choose the acting user from the backend's seeded demo users, and label the picker as a demo identity, not a login. Never use a free-text name field.
- [x] Authors can edit and delete their own comments. The server enforces this, and the UI shows the server's message if it refuses.
- [x] A comment can link one or more of the same patient's notes by stable ID. Each link opens the note, and a deleted note shows a clear indicator, including when opening an old direct link.
- [x] Render comment and note text as plain text. External file links from the backend open in a new tab with a visible cue.
- [x] Show total comments with a New badge for unread activity, and open Discussion from the table/card action.
- [x] Show a global unread-comment bell and a patient queue with independent filters, pagination and all-caught-up behavior.
- [x] Acknowledge only displayed comments for the current viewer, keep visit-only New markers, and preserve newer unread counts when older requests finish.

### 11. Errors, accessibility and responsive layout

- [x] A failed query shows an inline error with a retry, failed mutations show visible feedback beside the affected action, and a 5xx gets a friendly message. Nothing fails silently.
- [ ] Complete control-level keyboard/focus/touch acceptance, including visible invalid-submit recovery and singular announced counts. Existing labels/focus/status treatments do not close the outstanding findings.
- [ ] Recheck every screen at 1280, 1024, 768 and 375 px after mobile-density and clipped-tab/pagination fixes; preserve clean console and page reflow.
- [x] Respect the reduced-motion setting.

### 12. Tests and verification

- [x] Unit-test error normalization, 204 handling, URL param parsing, the age-sort mapping and the date helpers, with the date helpers run in a non-UTC time zone.
- [x] Component-test the list states and debounced search, form errors from client and server, adding and deleting notes, and comment authorship and links.
- [x] Test behavior, not snapshots or token values.
- [ ] Run the main journey in a real browser against the running stack at desktop width and at 375 px: list, search, open, add a note, comment with a note link, edit, delete.
- [ ] Before final hand-off, run `lint`, `typecheck`, `format:check`, `test` and `build` on the working tree and record exact evidence.

### 13. Containers, CI and hand-off

- [x] Give infra the install and build commands, the `dist/` output folder, the Node version and any build-time variables.
- [ ] In the Compose build, check deep-link refresh, that `/api` reaches the backend, and that API errors are not replaced by the HTML page.
- [ ] Supply final frontend evidence/limitations to PM for the root README; PM owns that file.
- [x] Update this checklist as items are verified. Never check another role's items.

## Selected additions awaiting final review

- [ ] Default to the first actual demo user after discovery; preserve a valid saved second user and replace stale IDs. Automatic selection and saved-user preservation are implemented.
- [ ] Personalize Overview from stored backend assignments for the selected user, with an explicit cohort/denominator label. The all-patient directory remains shared. The backend contract is implemented; assignment seeding supplies the per-user cohorts. Global directory access is unchanged.
- [ ] Light/Dark/System with default Dark only without a saved choice, lightbulb icons, readable native controls/dialogs and pointerless tooltips. Implemented; retain final candidate evidence.
- [ ] Four compact charts from one complete projection, including keyboard/touch inspection and distinct partial-current-month treatment. Implemented; Opus visual fixes/acceptance remain open.

## Optional stretch and deferred work

Nothing here is promised. Pick items only after the required work passes.

- [x] Stretch: lazy-loaded routes (code splitting).
- [ ] Stretch: advanced filters (blood type, condition, age range, last-visit range), if the backend supports them.
- [ ] Stretch: adding external file links to notes from the UI, if the backend's attachment endpoint ships.
- [ ] Deferred: real authentication and roles, file upload and storage, rich-text notes, real-time updates, LLM summary controls, and prior-authorization request screens.
