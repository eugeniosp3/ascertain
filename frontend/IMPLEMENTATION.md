# Frontend implementation guide

This guide describes the implemented frontend structure and its remaining integration work. [README.md](README.md) contains run commands and progress. The binding frontend interface and the current backend differences are recorded in the [data contract](../chatroom/frontend-data-contract.md); verify live OpenAPI and persistence after those differences are resolved. **Pending** identifies integration choices rather than an absence of all backend implementation.

The [frontend updates handoff](../chatroom/frontend-updates.md) records the additional workspace and conversation requirements and their acceptance tests for the final project punch list. The original [assessment](../reference/project.md) remains the baseline.

The [frontend data and endpoint contract](../chatroom/frontend-data-contract.md) lists every required DTO field, read/write rule, API endpoint and requested backend extension. It describes the implemented frontend adapter; backend acceptance and domain endpoint implementation remain separate integration work.

## Principles

- Keep it simple. Route components do the fetching and layout, feature components render, and `api/` talks to the server. Add a shared helper only when two places really need the same code. Don't build a generic abstraction framework.
- Server data lives in TanStack Query. Live list filters live in the URL through TanStack Router. Form state lives in TanStack Form. A small typed Zustand store holds shared UI state: sidebar preferences, the selected demo actor, last-visited patient and saved view/scroll snapshots used when returning to a list. Persist only suitable UI preferences; do not duplicate fetched patient/note/comment data or persist clinical drafts in that store.
- Compose screens from focused components and reuse concrete helpers for dates, patient labels/initials, count presentation, query keys and API/form errors. Shared form-field, loading, error and empty-state components should have small explicit props; keep feature-specific behavior beside its feature and avoid generic controller or service hierarchies.
- Get the design right first, on fixtures. Then replace fixtures with API data one feature at a time.

## Patient workspace interaction

The first design pass uses standalone HTML mockups in `UI_mocks/`, with inline styles, scripts and synthetic records. They open directly in a browser and do not install shadcn or connect to the database. The production components will follow the reviewed interaction and visual design.

- **Navigation:** a vertical sidebar expands to labelled items or collapses to icons. Show tooltips on hover and keyboard focus only when labels are hidden. Retain a small contextual header; use a compact menu on phones.
- **Table:** place search and filters above the patient table. Include a Notes column counting active clinical note records; clicking the count opens that patient's Notes view, including when the count is zero. A file-attachment count is a separate concept.
- **Conversation column:** show the total comment count and a lilac `New` badge when the current viewer has unread comments. Its accessible label includes both total and unread counts; clicking it opens Discussion. Include it on mobile cards, with zero still allowing a conversation to be started.
- **Detail on wider screens:** open a modal workspace with two surfaces: a patient identity bar and a larger detail panel. Use a blurred decorative backdrop and keep underlying navigation inert. Remove the table's patient rows from the DOM while detail is open, retaining its data and view state in memory.
- **Identity while scrolling:** begin with the expanded patient header, then compact it as the detail panel scrolls. Keep name, DOB, age and patient number available in readable lines, and expand again at the top. Avoid a threshold that repeatedly changes the scroll position.
- **Mobile:** use available width rather than device-name detection. Below the mock's 768px breakpoint, show full-screen patient detail with a Back control and a compact sticky identity header. Preserve readable text and touch targets without horizontal scrolling.
- **Return to list:** closing via the close control, Escape or browser Back restores search, filters, sort, page and scroll position, returns keyboard focus, and highlights the most recently viewed patient in lilac. If the record no longer exists or no longer matches the filter, preserve the remaining list state and use a sensible focus fallback.
- **Production rendering:** use TanStack Virtual to render the visible rows when the selected page can exceed the viewport. Virtualization limits DOM rows; it does not erase fetched data or make blur a privacy boundary. Keep keyboard navigation and focus restoration compatible with offscreen rows.
- **API addition to agree:** request `notes_count` in the patient-list response, calculated over nondeleted notes by the backend, so the list does not need a separate notes request per row. Unknown counts must not display as zero. Refresh the count after note mutations.

The HTML examples establish these interactions with local fixtures. Production routing, virtualization, API authorization and persistence remain application work.

## Unread conversations and notifications

These are selected additions to the assessment's patient dashboard. Keep conversation activity separate from clinical notes, clinical status and summary generation.

1. **Define unread per viewer.** A comment is new when it was posted by someone else and this viewer has not read it. Reading it as one user must not clear another user's state. Editing an existing comment shows its edited time; it does not create a new-comment notification in this initial scope. Backend owns durable read state and derives the viewer from the current actor.
2. **Show counts consistently.** Patient rows/cards show total comments and a `New` pill only when the unread count is positive. The Discussion tab can show the same indication before it is opened. A note count counts active clinical notes; a comment count counts discussion comments. Neither counts external file attachments.
3. **Show a global bell badge.** Add a Notifications destination to the vertical nav, with a bubble counting unread comments across all accessible patients. The desktop collapsed state uses an accessible name and tooltip; expanded navigation shows the label. A mobile bell/menu entry exposes the same count. Hide the bubble at zero and announce `No unread comments`; a visual `99+` cap must retain the full accessible count.
4. **Open an unread-patient queue.** `/notifications` reuses patient table/cards with an unread filter applied across the entire dataset before pagination. Its summary distinguishes unread comments from affected patients. Enter with independent search/status/page state so an old Patients filter cannot hide the queue. Provide an All patients action that restores the regular list's saved view.
5. **Read only what was opened.** Opening Overview, Notes, Summary, or the notifications queue does not mark discussion read. When Discussion is visible and its comments have loaded, acknowledge the displayed comment IDs. With paged comments, do not mark unloaded pages read. Keep a local snapshot of newly read comment IDs during this record visit so the relevant comment cards can still be labelled `New` while the user reads them; later visits omit those labels.
6. **Handle acknowledgments safely.** Use an idempotent read operation that acknowledges only the observed IDs or a server-issued bounded cursor. A comment arriving after that snapshot must remain unread. If the read operation fails, retain the unread count and provide a retry; do not silently dismiss notifications. Posting one's own comment increments the total but does not create self-unread activity.
7. **Preserve the route back.** Closing a record opened from Notifications returns to that queue. A just-read patient can leave the queue; clamp pagination and move focus to the next visible row or the heading instead of a detached trigger. Normal Patients-view closing still restores filters, sort, page, scroll, focus and last-record highlight.
8. **Handle zero and updates.** Use an all-caught-up state when no unread conversations remain, distinct from a search with no matches. Refresh affected counts/queues after comment creation, deletion and read acknowledgment, and on ordinary query revalidation. WebSockets and push notifications are not required.

The HTML mock uses deterministic unread fixtures for one local viewer and session-scoped read IDs. It is a visual/interaction reference, not a substitute for server authorization or durable per-user read tracking.

## Folder layout

```text
frontend/
  index.html  vite.config.ts  tsconfig*.json  eslint.config.js  .prettierrc  components.json  .nvmrc
  src/
    main.tsx                 # mounts providers + router
    app/                     # router.tsx, query-client.ts, query-keys.ts, AppShell.tsx, actor-context.tsx, ui-store.ts
    routes/                  # one file per page: home, patients-list, patient-detail, patient-new,
                             # patient-edit, note-detail, notifications, not-found
    components/ui/           # shadcn components after adapting them, plus StatusPill and TagInput
    features/
      patients/              # queries.ts, search-params.ts, schema.ts (Zod), PatientTable, PatientCards,
                             # PatientFilters, PatientProfile, PatientForm, SummaryPanel
      notes/                 # queries.ts, NotesSection, NoteForm, NoteItem, NoteView
      comments/              # queries.ts, CommentsSection, CommentForm, CommentItem, NoteLinkPicker
      notifications/         # queries.ts, NotificationBadge, UnreadConversations; reuse patient list components
    api/                     # client.ts (fetch wrapper, ApiError), types.ts (API types)
    utils/                   # cn.ts, dates.ts, patient.ts, form-errors.ts. Concrete helpers shared by features.
    styles/globals.css       # Tailwind import, app theme variables, base styles
    fixtures/                # small typed fixtures for the first milestone and tests
    test/                    # setup.ts, renderWithProviders.tsx
  e2e/                       # Playwright browser journey (added later)
```

`frontend/Dockerfile` will also live here, but infra owns it.

## Build order

1. **Tooling.** Scaffold with Vite `react-ts`. In `tsconfig`, turn on `strict` and `noUncheckedIndexedAccess`, and add the `@/*` alias (in Vite too). Add ESLint (flat config), Prettier, Vitest with jsdom and Testing Library, and the scripts listed under Commands. Set Vite's `base: '/'` so that `/patients/:id/edit` can load its assets after a refresh. In dev, proxy `/api` to `http://localhost:8000` and strip the prefix; read the proxy target from a variable that is not `VITE_*`.
2. **Theme and primitives (first milestone).** Set up Tailwind and shadcn, then the theme described below. Start with Button, Input, Label, Select, Card, Table, Sheet, Skeleton and StatusPill. Build the app shell and patient list from `fixtures/`, with a small form sample; review at 1280 and 375 px before API work. Add Textarea, Tabs, Checkbox, Dialog, AlertDialog, toasts and medical-list inputs as their screens need them.
3. **Shell and routes.** Define the route tree in `app/router.tsx`, including `/notifications`, using code-based routes. Give the root route a `notFoundComponent` and an `errorComponent` with retry. AppShell provides a contextual header, the collapsible vertical nav and a compact menu on phones, a skip link and `<main>`. Use available width; the mock changes to mobile navigation and full-screen patient detail below 768px.
4. **API layer.** Write `api/client.ts` and `api/types.ts`, then `queries.ts` for each feature (query keys, `useQuery` hooks, mutation hooks). Each route component calls the hooks and passes data to its feature components.
5. **Patient list and home.** Use TanStack Table with `manualPagination`, `manualSorting` and `manualFiltering`. Below 768 px, render cards from the same rows. Home starts with patient-list and add-patient shortcuts. Agree complete-data counts/recent visits with backend before adding them: filtered list totals or a small aggregate endpoint are both possible. Do not calculate global totals from one loaded page.
6. **Detail and summary.** A patient 404 shows a not-found state inside the page. The summary loads in its own query, so a slow or failed summary never blocks the profile.
7. **Patient form.** One `PatientForm` handles both modes: `new` starts empty, `edit` pre-fills from the cached detail. Then add delete with an AlertDialog.
8. **Notes, then conversations.** Build notes and their detail route, then comments and note links. Add the Conversation column, per-viewer unread indications, read acknowledgment and Notifications queue after agreeing the count/read contracts with backend.
9. **Hardening.** Accessibility pass, checks at all four widths, a clean console, tests, the browser journey, and the README hand-off.

## Theme rules

- **Isolate the namespace.** Do not import `reference/design-system/tokens.css` into the app. Its raw names collide with Tailwind v4 theme variables: `--text-xs` is 18px, `--text-xl` is 80px, `--radius-xs` is 4px and `--radius-xl` is 24px. If those load globally they silently resize Tailwind's `text-xs`, `rounded-xl` and the other utilities. Instead, copy the selected values into app variables prefixed `--ac-*` in `styles/globals.css`, map shadcn's semantic variables onto them (`--background`, `--foreground`, `--card`, `--primary`, `--muted-foreground`, `--border`, `--input`, `--ring`), and set the radii explicitly (`--radius-md: 8px`, `--radius-lg: 10px`, `--radius-xl: 12px`). Leave `reference/design-system/` unchanged as the source of truth. Note the source file and its tag in a comment next to each copied value.
- **Values to use:** product paper `#f4f3ef` for the app canvas, white for cards and inputs, ink `#121212` for text and primary actions, selected grey `#e7e6e2` for row/menu highlights, and violet `#d4c1ff` for branded focus and button hover. Keep surfaces flat with decorative hairlines. Radius is 8 for tags, 10 for controls and 12 for cards.
- **Accessibility fixes from [05](../reference/design-system/05_accessibility_and_responsive.md):**
  - Focus ring on everything interactive: `outline: 2px solid var(--ac-ink); outline-offset: 2px; box-shadow: 0 0 0 4px var(--ac-violet)`.
  - Secondary text is `#5e5a56` or darker. Use `#9b9b9b` only for disabled elements.
  - Control borders are `#767676` (4.5:1 on white); decorative hairlines can stay faint.
  - Status pills keep their tinted fills, but the text is darkened to at least 4.5:1: mint text `#17785c`, straw `#7a6110`, sky `#286d9b`, lilac `#664bc7`, grey `#5f5f5f`. Rose `#b3203a` already passes.
- **Density and type:** use the documented sans-serif fallbacks (`Arial`, system sans) until licensed font assets are supplied. Body and table text is 14px on desktop and at least 16px on narrow screens; inputs are 16px and labels at least 12px. Controls are about 36px tall on desktop, with 44px touch targets on narrow or coarse-pointer screens.
- **Motion:** only quick fades for hover and state changes. Leave out the text roll, scroll scenes, blobs, marquees and glass over images, and honor `prefers-reduced-motion`.
- **Status mapping:** follow the backend proposal: `active` uses mint and `inactive` uses grey. Keep this in one map and show the status word. Other palette tones are available for later states, not extra patient-status values. Preserve unknown values in a neutral fallback; never map authorization outcomes onto patient status.

## Behavior and contracts

| Topic | Plan | State |
| --- | --- | --- |
| Paths | The browser calls `/api/...`. Vite and nginx strip `/api` before forwarding to FastAPI's unprefixed routes. nginx serves `index.html` for frontend deep links, while API errors remain API responses. | Planned with backend and infra |
| List | Response is `{items, total, page, page_size}`. Params: `q` (name or email), `status`, `sort_by` (`name`, `dob`, `last_visit`, `status`), `order` (`asc`, `desc`), `page` (starting at 1) and `page_size` (default 20, max 100). | Planned on both sides |
| Age sort | The Age column sorts with `sort_by=dob` and the opposite order: youngest first means `dob desc`. One helper converts the order and the displayed `aria-sort`. The URL stores the API params. | Backend proposal |
| Nulls | A missing `last_visit` shows "No visit recorded"; the server puts nulls last in either direction. Blood type may be null and displays "Unknown". | Backend proposal |
| Patient ID | Treat UUIDs as opaque strings in routes and keys. Source `PT-*` identifiers and MRNs remain separate display fields; never parse IDs as numbers. | Backend proposal; shared identity review pending |
| Patient shape | Conditions are `{code: string or null, label: string}` objects. Allergies are strings with `allergy_status` of `unknown`, `no_known` or `reported`. The proposed address uses `address_line1`, `address_line2`, `city`, `state`, `postal_code`; contact uses `phone` and `email`. MRN and imported context are read-only. | Model proposal; confirm API serialization |
| PUT | Send every documented writable field, preserving middle initial, last visit, condition codes and allergy status. Use null only for nullable fields, and empty arrays for empty lists; omit source/audit fields. | Backend proposal |
| Errors | Read `{error: {code, message, fields: [{path, code, message}]}}`; map body paths such as `["body", "date_of_birth"]` to form fields. Normalize 401, 403, 404, 409, 410 and 422 separately; unexpected 5xx messages stay generic. | Backend proposal |
| Delete | A 204 has no body; never call `res.json()` on it. Patient deletion clears its cached resources and returns to `/patients`. | Backend proposal |
| Notes | `POST /patients/{id}/notes` sends `{timestamp, content}` with a timezone-aware ISO instant. GET on the collection returns an array, newest first. GET on `/patients/{id}/notes/{note_id}` opens the note or returns 410 for a tombstone and 404 for a missing/other-patient note. DELETE is author-only. | Backend proposal |
| Summary | `GET /patients/{id}/summary` returns `{patient_id, summary, generated_at, method: "template"}`. Render `summary` as plain text; identifiers and medical context are in the narrative/profile, not invented response fields. | Backend proposal |
| Comments | GET on `/patients/{id}/comments` returns the page envelope. POST sends `{body, note_ids}`; PUT on `/patients/{id}/comments/{comment_id}` replaces both; DELETE removes an owned comment. Responses include author, creation/edit times and `note_links: [{id, label, url, is_deleted}]`. | Backend proposal |
| List activity counts | Add `notes_count`, `comments_count` and viewer-specific `unread_comments_count` to patient list rows. Counts cover the corresponding records, not just one loaded page. Unknown/loading counts are not zero. Avoid one notes/comments request per patient row. | Pending backend contract |
| Notifications | Support a complete-data unread-patient filter, for example `has_unread_comments=true` on the patient list, plus a global summary with unread-comment and affected-patient totals. Filter before paging; keep the global bell count independent of the current search/page. Endpoint names remain to be agreed. | Pending backend contract |
| Read acknowledgment | An idempotent operation accepts observed comment IDs or a bounded server-issued cursor for this patient. Return the resulting unread count; enforce actor and patient scope. Comments created after the acknowledged snapshot remain unread. | Pending backend contract and persistence model |
| Demo identity | `GET /users` supplies selectable active people. Send the selected UUID as `X-Demo-User-ID` when demo mode is enabled; never send `author_id` in write bodies. Missing/invalid identity is 401; denied ownership is 403. Label this as a demo identity, not a login. | Backend proposal |
| File links | External HTTPS links on notes are display-only at first. They open in a new tab with `rel="noopener noreferrer"` and a visible cue. Uploads are out of scope. | Backend-selected |

## Types, server state and caching

- **Types:** start with hand-written `api/types.ts`, which covers fixtures and early work before the backend runs. Once OpenAPI is stable, it can switch to `openapi-typescript` output without changing the exported names. Don't run both side by side.
- **Query keys:** use the shared `patientKeys` helpers for `['patients','list',actorId,params]`, `['patients','detail',id,actorId]`, `['patients',id,'notes']`, `['patients',id,'notes',noteId]`, `['patients',id,'summary']`, `['patients',id,'comments',actorId,pageParams]`, `['notifications',actorId,'summary']` and `['demo-users']`. Notification queues reuse list keys with the unread filter. Partition all viewer-specific counts/read data, including patient detail, by actor and prevent results from the previous actor flashing during a switch. Pass TanStack's `signal` into `fetch`; cancellation is not a user-facing failure.
- **Defaults:** `staleTime` around 30 s. Retry network errors and 5xx up to twice; never retry 4xx or mutations. The list uses `placeholderData: keepPreviousData`.
- **Patient access boundary:** reuse `patientDetailOptions` for workspace and edit reads. Ordinary refresh failures retain cached content and drafts. A 401/403/404/410 clears that exact patient/actor detail cache; later transient failures or remounts cannot reveal it until a successful read restores access.
- **Response ordering:** write a successful patient mutation response to cache before invalidating/refetching. A later fetch wins. Read receipts update only acknowledged comment IDs and invalidate totals; never overwrite newer absolute unread counts with an older receipt.
- **Visit lifetime:** keep the patient workspace parent mounted across its canonical note child route. Linked-note navigation preserves drafts, comment pagination and visit-only New markers, while changing patient or actor starts a separate visit.
- **Invalidation after each change:**
  - Create patient: lists.
  - Update patient: lists, detail, summary. Write the response straight into the detail cache.
  - Delete patient: lists and notification summary; remove the patient's cached queries.
  - Add note: notes, summary and lists containing note counts.
  - Delete note: notes, that note, summary, lists and comments (so deleted-note indicators update).
  - Comment changes: comments, patient lists/notification queues and the global unread summary; never the clinical summary solely because discussion changed.
  - Read acknowledgment: this actor's comments, lists/notification queues and unread summary; keep any newer unread comments intact.
- **Search input:** local state updates on every keystroke. After about 300 ms the value is written to the URL with `replace: true`, and `page` is reset to 1. `useDeferredValue` is optional on top of this.
- Keep the draft search input synchronized with browser back/forward navigation, cancel an obsolete debounce when navigation changes the URL, and distinguish retained old results from a finished empty response. After deleting the last row of a page, return to the nearest valid page.
- **URL params:** `validateSearch` on the list route uses a Zod schema with defaults, so a hand-edited URL with bad values falls back to the defaults instead of crashing. Use the Zod adapter if the installed router version needs one.

## Forms and dates

- Zod schemas live in `features/*/schema.ts` and are passed straight to TanStack Form validators (Standard Schema). Field errors appear on blur and on submit. In `onSubmit`, call `mutateAsync`. On a validation `ApiError`, set each mapped field's error through the form API (`setFieldMeta` errorMap, or `{ fields }` returned from an `onSubmitAsync` validator; check which the installed version supports). Errors that match no field go in a form-level alert. On a network error, keep the values and show a retry. Don't use React Hook Form's `setError` pattern.
- Date of birth and `last_visit` are date-only `YYYY-MM-DD` strings. Use native `<input type="date">`, and compare and format them with string-based helpers. `new Date('1948-05-10')` is read as UTC midnight and shows the previous day in US time zones. Age comes from the API.
- Note and comment timestamps are instants. The note form uses `<input type="datetime-local">` with a default of now and converts the local value to ISO with an offset before sending. Show timestamps with `Intl.DateTimeFormat` in the viewer's zone, and label a comment "edited" when `updated_at` is later than `created_at`.
- Allergies use a small text-list input plus an explicit allergy-status choice; an empty list alone cannot mean "No known allergies." Conditions preserve each `{code, label}` object when edited; a new condition can use a null code. Blood type offers "Unknown" mapped to null, and patient status follows the proposed `active`/`inactive` values. Keep read-only source/audit fields out of write payloads.

## Notes and comments

- Notes are plain text with a stable ID. The note route opens one note directly, and "Copy link" copies its absolute URL. No rich text and no uploads.
- `CommentsSection` sits under "Team discussion", separate from notes and summary, with page controls for the paged comment response. `NoteLinkPicker` offers only this patient's active notes. Show existing tombstone links as "Deleted note" chips; preserve them during an unrelated comment edit unless explicitly removed. Opening an old direct note link handles 410 with a deleted-note view.
- Render all user text as React text nodes. Never use `dangerouslySetInnerHTML` or a Markdown renderer. Keep line breaks with `white-space: pre-wrap`.
- Delete-note and edit/delete-comment controls appear only for their author. Refresh those controls when the selected demo user changes; the backend remains responsible for enforcement. A 401 prompts selection of a valid demo user, while 403/409 errors explain the failure without discarding a draft.
- Treat the canonical note `url` as an API path: add `/api` when fetching, and map it to the frontend note route for navigation/copying. External attachment `source_url` values are separate HTTPS sources; never invent a file link from a source "Attached" flag.

## Fixtures

- `fixtures/` holds a small set of clearly synthetic patients, notes, comments and demo users typed against `api/types.ts`. Include unknown blood type/allergies and nullable visits. These are temporary UI fixtures; data owns source transformations and versioned exports, and backend owns database imports. The browser never loads CSVs, DuckDB tables, medallion records or lineage fields directly.
- Fixtures are used by the first milestone and by tests. Once each feature is wired to the API, only tests use them.

## Commands and ownership

- Scripts: `dev`, `build` (`tsc -b && vite build`), `preview`, `lint`, `typecheck` (`tsc -b --noEmit`), `format`, `format:check`, `test` (`vitest run`), and `e2e` added later. Use one package manager and commit its lockfile. Record the Node LTS version in `.nvmrc` and `engines`.
- The frontend owns these commands and keeps them passing locally. Infra owns the Dockerfile, nginx, Compose and the CI workflow that calls them. The build output is `dist/`.

## Tests and acceptance

- **Unit:** `ApiError` normalization (network, 401/403, 422 field map, 404, 410, 500, empty 204), search-param defaults and coercion, the age-sort mapping, and date helpers under `TZ=America/Los_Angeles`.
- **Component:** list loading, empty and error states; debounced search updates the URL and resets the page; the form shows client errors, maps server 422s to fields and keeps values on a network error; notes create with a timestamp and delete after confirmation; comments show the author and "edited", link to a note, and render HTML-like text literally.
- **Workspace acceptance:** collapsed-only nav tooltips on hover/focus, note-count entry, inert background with patient rows unmounted, two-panel desktop overlay, stable compact/expanded identity header, full-screen mobile Back, and list scroll/filter/page/focus restoration with the lilac highlight. Test zero notes, deep links, browser Back/Forward and reduced motion.
- **Conversation acceptance:** totals versus unread counts, own-comment exclusion, unread markers surviving Overview/Notes visits, acknowledgment only after Discussion loads, per-user read isolation, a new comment arriving during acknowledgment, failure/retry, partial-page reads and edits/deletions. Bell count remains global; queue pagination, independent filters, empty state and removed-row focus all work.
- **Browser journey (Playwright, against Compose):** list → filtered patient → Notes → note link → Discussion → add comment → close and restore; then Notifications → unread patient → Discussion acknowledgment → close to the remaining queue → All patients with the saved list state. Keep patient edit/delete coverage from the brief. Test at 1440, 1024, 768, 390 and 375px, plus keyboard-only operation and reduced motion.
- **Avoid:** snapshot-heavy tests and tests that assert theme token values.
- **Done means** lint, typecheck, format check, tests and build all pass, and the results are recorded honestly in the README.

## Agree before building on it, and keep deferred

- **To confirm before integration:** reconcile patient model/IDs with data and actual OpenAPI types; check writable field names, limits and null behavior; agree note/comment/unread counts, global unread summary, unread-patient filtering, per-user read persistence and the acknowledgment operation; choose home aggregates; and confirm demo-mode detection. With infra: Node version, package manager, lockfile/install commands, ports and proxy target. Update this plan when contracts change.
- **Deferred:** authentication and roles, uploads, rich text, real-time updates, the prior-auth request views (the 382-column data), LLM controls, and dark mode. Stretch items stay optional.
