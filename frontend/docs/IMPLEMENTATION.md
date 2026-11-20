# Frontend implementation guide

This guide describes the implemented frontend structure and its remaining integration work. [README.md](../README.md) contains run commands and progress. The adopted wire interface is recorded in the [data contract](../../reference/chatroom/frontend-data-contract.md). The [dated handoff](../../reference/chatroom/frontend-updates.md) separates demo/HTTP-contract checks, the 16/16 compiled live candidate, and remaining review/final-candidate gates. Master acceptance stays in [PROGRESS.md](../../reference/PROGRESS.md).

The [frontend updates handoff](../../reference/chatroom/frontend-updates.md) records the additional workspace and conversation requirements and their acceptance tests for the final project punch list. The original [assessment](../../reference/project.md) remains the baseline.

The [frontend data and endpoint contract](../../reference/chatroom/frontend-data-contract.md) lists every required DTO field, read/write rule, API endpoint and requested backend extension. The domain endpoints are implemented; frontend normalization follows their existing contract. Future source changes require candidate-specific verification.

## Principles

- Keep it simple. Route components do the fetching and layout, feature components render, and `api/` talks to the server. Add a shared helper only when two places really need the same code. Don't build a generic abstraction framework.
- Server data lives in TanStack Query. Live list filters live in the URL through TanStack Router. Form state lives in TanStack Form. A small typed Zustand store holds shared UI state: sidebar preferences, the selected demo actor, last-visited patient and saved view/scroll snapshots used when returning to a list. Persist only suitable UI preferences; do not duplicate fetched patient/note/comment data or persist clinical drafts in that store.
- Compose screens from focused components and reuse concrete helpers for dates, patient labels/initials, count presentation, query keys and API/form errors. Shared form-field, loading, error and empty-state components should have small explicit props; keep feature-specific behavior beside its feature and avoid generic controller or service hierarchies.
- Get the design right first, on fixtures. Then replace fixtures with API data one feature at a time.

## Patient workspace interaction

The first design pass uses standalone HTML mockups in `UI_mocks/`, with inline styles, scripts and synthetic records. They open directly in a browser and do not install shadcn or connect to the database. The React components follow this reference, with current Opus review fixes tracked in the handoff.

- **Navigation:** a vertical sidebar expands to labelled items or collapses to icons. Show tooltips on hover and keyboard focus only when labels are hidden. Retain a small contextual header; use a compact menu on phones.
- **Table:** place search and filters above the patient table. Include a Notes column counting active clinical note records; clicking the count opens that patient's Notes view, including when the count is zero. A file-attachment count is a separate concept.
- **Conversation column:** show the total comment count and a lilac `New` badge when the current viewer has unread comments. Its accessible label includes both total and unread counts; clicking it opens Discussion. Include it on mobile cards, with zero still allowing a conversation to be started.
- **Detail on wider screens:** open a modal workspace with two surfaces: a patient identity bar and a larger detail panel. Use a blurred decorative backdrop and keep underlying navigation inert. Remove the table's patient rows from the DOM while detail is open, retaining its data and view state in memory.
- **Identity while scrolling:** begin with the expanded patient header, then compact it as the detail panel scrolls. Keep name, DOB, age and patient number available in readable lines, and expand again at the top. Avoid a threshold that repeatedly changes the scroll position.
- **Mobile:** use available width rather than device-name detection. Below the mock's 768px breakpoint, show full-screen patient detail with a Back control and a compact sticky identity header. Preserve readable text and touch targets without horizontal scrolling.
- **Return to list:** closing via the close control, Escape or browser Back restores search, filters, sort, page and scroll position, returns keyboard focus, and highlights the most recently viewed patient in lilac. If the record no longer exists or no longer matches the filter, preserve the remaining list state and use a sensible focus fallback.
- **Production rendering:** use TanStack Virtual to render the visible rows when the selected page can exceed the viewport. Virtualization limits DOM rows; it does not erase fetched data or make blur a privacy boundary. Keep keyboard navigation and focus restoration compatible with offscreen rows.
- **List counts:** consume `notes_count` in the patient-list response, calculated over nondeleted notes by the backend, without a separate notes request per row. Unknown counts must not display as zero. Refresh the count after note mutations.

Whole noninteractive row/card clicks open Overview; child Notes/Discussion actions retain their own navigation. Preserve text selection, modified clicks and native keyboard links. The HTML reference never proves backend enforcement or persistence.

## Unread conversations and notifications

These are selected additions to the assessment's patient dashboard. Keep conversation activity separate from clinical notes, clinical status and summary generation.

1. **Define unread per viewer.** A comment is new when it was posted by someone else and this viewer has not read it. Reading it as one user must not clear another user's state. Editing an existing comment shows its edited time; it does not create a new-comment notification in this initial scope. Backend owns durable read state and derives the viewer from the current actor.
2. **Show counts consistently.** Patient rows/cards show total comments and a `New` pill only when the unread count is positive. The Discussion tab can show the same indication before it is opened. A note count counts active clinical notes; a comment count counts discussion comments. Neither counts external file attachments.
3. **Show a global bell badge.** Add a Notifications destination to the vertical nav, with a bubble counting unread comments across all accessible patients. The desktop collapsed state uses an accessible name and tooltip; expanded navigation shows the label. A mobile bell/menu entry exposes the same count. Hide the bubble at zero and announce `No unread comments`; a visual `99+` cap must retain the full accessible count.
4. **Open an unread-patient queue.** `/notifications` reuses patient table/cards with an unread filter applied across the entire dataset before pagination. Its summary distinguishes unread comments from affected patients. Enter with independent search/status/page state so an old Patients filter cannot hide the queue. Provide an All patients action that restores the regular list's saved view.
5. **Read only what was opened.** Opening Overview, Notes, Summary, or the notifications queue does not mark discussion read. When Discussion is visible and its comments have loaded, acknowledge the exact server-issued `read_through` for the displayed chronological prefix. Next must follow `next_cursor`; do not acknowledge unloaded pages. Keep a local snapshot of newly read comment IDs during this record visit so the relevant comment cards can still be labelled `New` while the user reads them; later visits omit those labels.
6. **Handle acknowledgments safely.** Use the backend’s idempotent `{through: read_through}` operation. Preserve its microsecond string, queue the highest eligible displayed boundary while a read is pending, and keep new arrivals after that snapshot unread. If the read operation fails, retain the unread count and provide a retry; do not silently dismiss notifications. Posting one's own comment increments the total but does not create self-unread activity.
7. **Preserve the route back.** Closing a record opened from Notifications returns to that queue. A just-read patient can leave the queue; clamp pagination and move focus to the next visible row or the heading instead of a detached trigger. Normal Patients-view closing still restores filters, sort, page, scroll, focus and last-record highlight.
8. **Handle zero and updates.** Use an all-caught-up state when no unread conversations remain, distinct from a search with no matches. Refresh affected counts/queues after comment creation, deletion and read acknowledgment, and on ordinary query revalidation. WebSockets and push notifications are not required.

The HTML mock uses deterministic unread fixtures for one local viewer and session-scoped read IDs. It is a visual/interaction reference, not a substitute for server authorization or durable per-user read tracking.

## Folder layout

```text
frontend/
  index.html  vite.config.ts  tsconfig*.json  components.json  package.json
  src/
    main.tsx
    app/                     # Router, Query, theme/actor providers, Zustand UI state
    routes/                  # home, patients-list, notifications, patient-workspace, errors
    components/ui/           # themed shadcn primitives, StatusPill and CountPill
    components/shared/       # reusable field, error, empty and theme controls
    features/
      patient-list/          # filters, table/cards, pagination, view restoration
      patient-form/          # schema, write mapping, field/list editors, error recovery
      patient-detail/        # identity, profile, notes, summary, discussion and read cursor
      notifications/         # counts/labels and actor-scoped query
      overview/              # one complete projection, pure aggregates, React/SVG charts
    api/                     # types, HTTP client/DTO mapping, validation, explicit memory adapter
    fixtures/                # synthetic demo data only
    utils/                   # concrete date/count/patient/error/class helpers
    styles/                  # global theme and shell/list layout
    test/                    # shared test setup
  e2e/                       # explicit demo regression journeys
  e2e-api/                   # intercepted HTTP contract/error regressions
  e2e-live/                  # real API/PostgreSQL journeys, no HTTP interception
  UI_mocks/                  # standalone HTML references
```

Infra owns the frontend Dockerfile under `infra/docker/`, nginx, Compose and CI.

## Build order

1. **Tooling.** Scaffold with Vite `react-ts`. In `tsconfig`, turn on `strict` and `noUncheckedIndexedAccess`, and add the `@/*` alias (in Vite too). Add ESLint (flat config), Prettier, Vitest with jsdom and Testing Library, and the scripts listed under Commands. Set Vite's `base: '/'` so that `/patients/:id/edit` can load its assets after a refresh. In dev, proxy `/api` to `http://localhost:8000` and strip the prefix; read the proxy target from a variable that is not `VITE_*`.
2. **Theme and primitives (first milestone).** Set up Tailwind and shadcn, then the theme described below. Start with Button, Input, Label, Select, Card, Table, Sheet, Skeleton and StatusPill. Build the app shell and patient list from `fixtures/`, with a small form sample; review at 1280 and 375 px before API work. Add Textarea, Tabs, Checkbox, Dialog, AlertDialog, toasts and medical-list inputs as their screens need them.
3. **Shell and routes.** Define the route tree in `app/router.tsx`, including `/notifications`, using code-based routes. Give the root route a `notFoundComponent` and an `errorComponent` with retry. AppShell provides a contextual header, the collapsible vertical nav and a compact menu on phones, a skip link and `<main>`. Use available width; the mock changes to mobile navigation and full-screen patient detail below 768px.
4. **API layer.** Write `api/client.ts` and `api/types.ts`, then `queries.ts` for each feature (query keys, `useQuery` hooks, mutation hooks). Each route component calls the hooks and passes data to its feature components.
5. **Patient list and home.** Use TanStack Table with `manualPagination`, `manualSorting` and `manualFiltering`. Below 768 px, render cards from the same rows. Home uses one shared complete paged patient projection for all four charts and recent-record context. Do not calculate global totals from one loaded page or fetch separately per chart. No new aggregate endpoint is required at the current 100+ patient scale.
6. **Detail and summary.** A patient 404 shows a not-found state inside the page. The summary loads in its own query, so a slow or failed summary never blocks the profile.
7. **Patient form.** One `PatientForm` handles both modes: `new` starts empty, `edit` pre-fills from the cached detail. Then add delete with an AlertDialog.
8. **Notes, then conversations.** Build notes and their detail route, then comments and note links. Add the Conversation column, per-viewer unread indications, read acknowledgment and Notifications queue using the adopted count/read contracts below.
9. **Hardening.** Accessibility pass, checks at all four widths, a clean console, tests, the browser journey, and the README hand-off.

## Theme rules

- **Isolate the namespace.** Do not import `reference/design-system/tokens.css` into the app. Its raw names collide with Tailwind v4 theme variables: `--text-xs` is 18px, `--text-xl` is 80px, `--radius-xs` is 4px and `--radius-xl` is 24px. If those load globally they silently resize Tailwind's `text-xs`, `rounded-xl` and the other utilities. Instead, copy the selected values into app variables prefixed `--ac-*` in `styles/globals.css`, map shadcn's semantic variables onto them (`--background`, `--foreground`, `--card`, `--primary`, `--muted-foreground`, `--border`, `--input`, `--ring`), and set the radii explicitly (`--radius-md: 8px`, `--radius-lg: 10px`, `--radius-xl: 12px`). Leave `reference/design-system/` unchanged as the source of truth. Note the source file and its tag in a comment next to each copied value.
- **Values to use:** product paper `#f4f3ef` for the app canvas, white for cards and inputs, ink `#121212` for text and primary actions, selected grey `#e7e6e2` for row/menu highlights, and violet `#d4c1ff` for branded focus and button hover. Keep surfaces flat with decorative hairlines. Radius is 8 for tags, 10 for controls and 12 for cards.
- **Accessibility fixes from [05](../../reference/design-system/05_accessibility_and_responsive.md):**
  - Focus ring on everything interactive: `outline: 2px solid var(--ac-ink); outline-offset: 2px; box-shadow: 0 0 0 4px var(--ac-violet)`.
  - Secondary text is `#5e5a56` or darker. Use `#9b9b9b` only for disabled elements.
  - Control borders are `#767676` (4.5:1 on white); decorative hairlines can stay faint.
  - Status pills keep their tinted fills, but the text is darkened to at least 4.5:1: mint text `#17785c`, straw `#7a6110`, sky `#286d9b`, lilac `#664bc7`, grey `#5f5f5f`. Rose `#b3203a` already passes.
- **Density and type:** use the documented sans-serif fallbacks (`Arial`, system sans) until licensed font assets are supplied. Body and table text is 14px on desktop and at least 16px on narrow screens; inputs are 16px and labels at least 12px. Controls are about 36px tall on desktop, with 44px touch targets on narrow or coarse-pointer screens.
- **Motion:** only quick fades for hover and state changes. Leave out the text roll, scroll scenes, blobs, marquees and glass over images, and honor `prefers-reduced-motion`.
- **Status mapping:** follow the backend proposal: `active` uses mint and `inactive` uses grey. Keep this in one map and show the status word. Other palette tones are available for later states, not extra patient-status values. Preserve unknown values in a neutral fallback; never map authorization outcomes onto patient status.

## Behavior and contracts

The canonical field inventory is the [data contract](../../reference/chatroom/frontend-data-contract.md). These decisions are implemented, rather than pending proposals; the dated handoff defines what has been verified live.

| Topic | Adopted behavior |
| --- | --- |
| Transport | API is the source default; explicit `VITE_DATA_MODE=demo` uses memory only. Same-origin `/api` is stripped by Vite/nginx. SPA deep links return HTML; API errors remain JSON. No fixture fallback. |
| Patient pages | `{items,total,page,page_size}`; 1-based pages, default 20, max 100. Use backend search/status/sort; age reverses DOB sort, missing visits sort last. Treat UUID, source ID and MRN separately. |
| Patient writes | Complete 17-field POST/PUT shape with explicit nullable values/arrays. Conditions are `{code,label}`; allergies have `unknown/no_known/reported` status. Read-only source/context/audit fields never enter writes. Follow `api/constraints.ts`. |
| Errors/deletes | `{error:{code,message,fields:[{path,code,message}]}}`; field paths map to inputs, unknown/root issues remain visible. Keep safe messages and distinguish 401/403/404/409/410/422/503. A 204 has no body. |
| Notes/summary | Clinical timestamp/content writes, newest-first note collection, detail 404/410, author-only delete. Summary is plain-text `{patient_id,summary,generated_at,method:"template"}`. No discussion content enters it. |
| Comments | Oldest-first `CommentPage` with `read_through` and opaque `next_cursor`; each comment includes `is_unread`, author, dates and note links. Own edits replace body/note_ids; tombstones remain navigable as deleted-note states. |
| Counts/queue | Backend returns notes/comments/unread counts per patient. UI `has_unread_comments` maps to wire `unread_only=true`. Global `{unread_comments,patients_with_unread}` is normalized once to frontend field names. |
| Read acknowledgment | Send exact `{through:read_through}` for the eligible displayed prefix; response `{patient_id,last_read_at}`. Preserve microseconds, tied groups, unseen arrivals and pending highest-boundary behavior. Revalidate authoritative counts. |
| Identity | Discover `/users`, preserve a valid saved user or default to its first actual result (User A), and replace stale IDs after validation. Send `X-Demo-User-ID`, never body author IDs. No initial selection gate. Patient content/directory remain shared; identity controls authorship/ownership, unread state and the newly selected assigned-workload overview. This is not authentication/RBAC. |
| Sources | Note links navigate canonical patient/note routes. Optional external HTTPS sources are separate; no uploads or invented file link from an imported Attached flag. |

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

- Zod schemas live beside their feature. On blur/change, show errors only for fields the user has interacted with; validate the complete form on submit. Array/status changes must clear obsolete allergy errors. An invalid submit focuses a visible summary or first invalid input, including keyboard and touch flows; do not leave errors above the viewport. In `onSubmit`, call `mutateAsync`. On a validation `ApiError`, set each mapped field's error through the form API (`setFieldMeta` errorMap, or `{ fields }` returned from an `onSubmitAsync` validator; check which the installed version supports). Errors that match no field go in a form-level alert. On a network error, keep the values and show a retry. Don't use React Hook Form's `setError` pattern.
- Date of birth and `last_visit` are date-only `YYYY-MM-DD` strings. Use native `<input type="date">`, and compare and format them with string-based helpers. `new Date('1948-05-10')` is read as UTC midnight and shows the previous day in US time zones. Age comes from the API.
- Note and comment timestamps are instants. The note form uses `<input type="datetime-local">` with a default of now and converts the local value to ISO with an offset before sending. Show timestamps with `Intl.DateTimeFormat` in the viewer's zone, and label a comment "edited" when `updated_at` is later than `created_at`.
- Allergies use a small text-list input plus an explicit allergy-status choice; an empty list alone cannot mean "No known allergies." Conditions preserve each `{code, label}` object when edited; a new condition can use a null code. Blood type offers "Unknown" mapped to null, and patient status follows the `active`/`inactive` values. Keep read-only source/audit fields out of write payloads.

## Notes and comments

- Notes are plain text with a stable ID. The note route opens one note directly, and "Copy link" copies its absolute URL. No rich text and no uploads.
- `DiscussionPanel` sits under "Team discussion", separate from notes and summary, with page controls for the paged comment response. `NoteLinkPicker` offers only this patient's active notes. Show existing tombstone links as "Deleted note" chips; preserve them during an unrelated comment edit unless explicitly removed. Opening an old direct note link handles 410 with a deleted-note view.
- Render all user text as React text nodes. Never use `dangerouslySetInnerHTML` or a Markdown renderer. Keep line breaks with `white-space: pre-wrap`.
- Delete-note and edit/delete-comment controls appear only for their author. Refresh those controls when the selected demo user changes; the backend remains responsible for enforcement. A 401 prompts selection of a valid demo user, while 403/409 errors explain the failure without discarding a draft.
- Treat the canonical note `url` as an API path: add `/api` when fetching, and map it to the frontend note route for navigation/copying. External attachment `source_url` values are separate HTTPS sources; never invent a file link from a source "Attached" flag.

## Fixtures

- `fixtures/` holds a small set of clearly synthetic patients, notes, comments and demo users typed against `api/types.ts`. Include unknown blood type/allergies and nullable visits. These are temporary UI fixtures; data owns source transformations and versioned exports, and backend owns database imports. The browser never loads CSVs, DuckDB tables, medallion records or lineage fields directly.
- Fixtures are used by the first milestone and by tests. They remain available only in explicit demo mode and its tests; API mode never imports source data as a substitute for the backend.

## Commands and ownership

- Scripts: `dev`, `build` (`tsc -b && vite build`), `preview`, `lint`, `typecheck` (`tsc -b --noEmit`), `format`, `format:check`, `test` (`vitest run`), `e2e` (demo), `e2e:api` (intercepted contracts), and `e2e:live` (existing compiled API stack). Use one package manager and commit its lockfile. Record the Node LTS version in `.nvmrc` and `engines`.
- The frontend owns these commands and keeps them passing locally. Infra owns the Dockerfile, nginx, Compose and the CI workflow that calls them. The build output is `dist/`.

## Tests and acceptance

- **Unit:** `ApiError` normalization (network, 401/403, 422 field map, 404, 410, 500, empty 204), search-param defaults and coercion, the age-sort mapping, and date helpers under `TZ=America/Los_Angeles`.
- **Component:** list loading, empty and error states; debounced search updates the URL and resets the page; the form shows client errors, maps server 422s to fields and keeps values on a network error; notes create with a timestamp and delete after confirmation; comments show the author and "edited", link to a note, and render HTML-like text literally.
- **Workspace acceptance:** collapsed-only nav tooltips on hover/focus, note-count entry, inert background with patient rows unmounted, two-panel desktop overlay, stable compact/expanded identity header, full-screen mobile Back, and list scroll/filter/page/focus restoration with the lilac highlight. Test zero notes, deep links, browser Back/Forward and reduced motion.
- **Conversation acceptance:** totals versus unread counts, own-comment exclusion, unread markers surviving Overview/Notes visits, acknowledgment only after Discussion loads, per-user read isolation, a new comment arriving during acknowledgment, failure/retry, partial-page reads and edits/deletions. Bell count remains global; queue pagination, independent filters, empty state and removed-row focus all work.
- **Browser journey (Playwright, against Compose):** list → filtered patient → Notes → note link → Discussion → add comment → close and restore; then Notifications → unread patient → Discussion acknowledgment → close to the remaining queue → All patients with the saved list state. Keep patient edit/delete coverage from the brief. Test at 1440, 1024, 768, 390 and 375px, plus keyboard-only operation and reduced motion.
- **Avoid:** snapshot-heavy tests and tests that assert theme token values.
- **Completion checks:** `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm test`, `npm run e2e` and `npm run e2e:api` pass on the working tree. Report any remaining limitations plainly.

## Selected theme, charts and final review requirements

- **Personalized overview:** the [agreed assignment contract](../../reference/chatroom/frontend-data-contract.md) uses stored nullable `assigned_user_id`, list `assigned_to=me`, dashboard `scope=assigned`, and actor/scope cache keys. One complete assigned projection feeds all charts/recent patients. Label the selected person and assigned denominator. Keep directory/CRUD shared and personal unread totals separately scoped. Backend owns migration `20261120_0002` and idempotent assignment seed; POST assigns its actor, PUT preserves it. No medical values are changed for chart variation. Equal/empty values are honest. Keep focused coverage for default and switched users, assignment membership, and the unchanged global directory.
- **Theme:** a provider resolves Light/Dark/System without remounting content. Default Dark only when no saved choice exists. Respect saved choices; System follows OS changes. Apply the saved/default theme before paint. Use Lightbulb/LightbulbOff for resolved state and retain the System choice. Tooltips are rounded text-only boxes without a pointer. Verify dialogs, native controls, toasts and focus in both themes.
- **Overview:** status split, age bands, note coverage and an interactive 6/12-month latest-visit line share ONE cached/cancelable full-paged projection. Validate total/page continuity/duplicate IDs; never publish a partial population as final. Aggregate with reusable pure helpers and invalidate after relevant patient/note mutations. No per-patient detail fetch or hover request.
- **Honest chart semantics:** count patients by latest recorded visit, not clinic visit volume. Label the denominator and UTC as-of date. Keep earlier/missing/future/invalid values explicit; test UTC day/month and age boundaries. Default line inspection to a complete month and distinguish the partial current month in the line, marker, label and table. Show textual values, keyboard inspection, error/empty/all-active states and dark/light contrast.
- **Compact responsive presentation:** all four tabs/counts and page-size values must fit at 375px; do not conceal clipping with smaller essential text. Reduce mobile chrome/cards while preserving readable content and touch controls. Target at least three complete cards at 390×844 and two at 375×667, with virtual estimates based on measured compact cards. Keep Discussion's composer prominent, maintenance actions secondary and identity facts in one place.
- **Navigation recovery:** closing a workspace returns to the same page, filters and sort, near the originating row, with useful focus and the last patient highlighted. Keep the implementation simple; repeated Back/Forward should work. Exact pixel offsets and identical visible-row sets are not release requirements.
- **Finish and hand off:** complete the focused implementation, run the six working-tree checks above, fix failures, and give PM one concise report of changes, results and unfinished work. No extra snapshot, manifest or matrix gate is required. Shared deployment lifecycle remains with PM/infra.
- **Deferred:** authentication/RBAC, uploads, rich text, real-time push, prior-auth request flows and external LLM generation. Dark mode and four charts are selected work, not deferred stretch items.
