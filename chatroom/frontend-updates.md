# Frontend updates

Updated 2026-11-20. This handoff records additions for the project manager's final implementation and testing punch list. The build details are in [frontend/IMPLEMENTATION.md](../frontend/IMPLEMENTATION.md); [project.md](../reference/project.md) remains the original assessment.

## Delivery status

- The [patient workspace](../frontend/UI_mocks/index.html) and [component gallery](../frontend/UI_mocks/components.html) are standalone HTML design mocks. They open directly in a browser with local synthetic data.
- The workspace and conversation/unread-notification interactions have passed local Chrome checks, including phone touch emulation and 375–1440px widths.
- The React frontend is implemented with Vite, TypeScript, Tailwind/shadcn, TanStack Router/Query/Table/Virtual/Form and Zustand. It includes responsive navigation/list/detail, patient CRUD forms, notes, summaries, authored comments and unread notifications. [Frontend run commands](../frontend/README.md) cover demo and API modes.
- The [frontend data and endpoint contract](frontend-data-contract.md) is ready for backend review. It inventories all fields and endpoints and records current source-registered backend implementations versus incompatible DTO/query/read behavior. It does not claim live PostgreSQL integration.
- Default demo mode holds patient/note/comment changes in browser memory and resets them on reload. API mode uses HTTP only, with no fixture fallback. Stateful read behavior is per demo actor; real backend persistence and enforcement require the final integrated checks below.

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

Unread activity is not a clinical status or urgency signal. The bell counts comments, while the notification queue counts affected patients; its subtitle should distinguish the two. Comments remain separate from clinical notes and never silently feed the patient summary.

## Backend and integration dependencies

- **List enrichment:** agree `notes_count`, `comments_count` and per-viewer `unread_comments_count` on patient rows. Compute counts in the API without one child-resource request per row. Loading/unknown counts must not look like zero.
- **Complete-data notifications:** agree server-side unread-patient filtering before pagination, and a global summary of unread comments and affected patients. A filtered page is not the global badge total.
- **Read state:** backend owns durable per-user tracking. Agree an idempotent acknowledgment of displayed comment IDs or a bounded cursor, excluding newer arrivals and other patients/users. Do not use a single patient-wide read flag.
- **Read policy:** opening Overview/Notes/Summary or the queue does not mark discussion read. Own comments do not create self-unread; editing an existing comment only shows its edited timestamp in this scope. Failed acknowledgment retains unread state and offers retry.
- **Query invalidation:** comment changes and read acknowledgment refresh comments, list counts, unread queues and the global summary. Note changes refresh note counts. Partition viewer-specific query data by actor; preserve the clinical summary's separate inputs.
- **Ownership:** frontend builds the UI, routing and query behavior; backend supplies models, contracts and enforcement; data remains responsible for patient preparation/exports; infra supplies proxy, container and CI wiring. These proposed API additions are not already shipped endpoints.
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

## React verification and integration handoff

- Full frontend lint, formatting, strict TypeScript and production build pass. The current full unit/component suite passes 168 tests.
- The 22 demo browser journeys pass on desktop and mobile, including actual virtualization with 50/100-row pages, the 101st patient, notes, ownership controls, paged unread queues, linked-note draft preservation and return-state behavior.
- Seven API-mode browser tests pass with intercepted HTTP contract responses, covering headers, serialization, errors, writes, tombstones, cache ordering, draft preservation and a mobile path. These are transport/UI tests, not evidence of a running database.
- Independent reviews led to fixes for draft loss on cached refresh failure and note-route remounting, stale PUT/read-receipt counts, and terminal-access cache resurrection. Terminal errors now discard exact patient/actor cached detail; success is required to restore it, while recoverable outages preserve drafts.
- The final backend alignment gates include `has_unread_comments` versus `unread_only`, notification response names, comment ordering and `is_unread`, observed-ID versus cursor-based read acknowledgment, and several nullable/validation differences. The contract lists concrete expectations and current implementations. Coordinate changes across DTOs, UI, backend and race tests before marking integration complete.
- Infra owns serving `dist/`, setting `VITE_DATA_MODE=api` for a live-integration build, SPA fallback, API proxying, database startup/seed invocation and CI. Run the final project-manager acceptance list against that assembled stack; the unchecked boxes above intentionally remain for that stage.
