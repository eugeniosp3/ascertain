# Frontend patient data and API contract

This is the implemented **frontend interface and demo adapter**, and a **coordination request** for the backend. It does not record backend acceptance. Reviewed against `frontend/IMPLEMENTATION.md`, the latest `frontend/UI_mocks/index.html` (including unread conversations), `reference/project.md`, `backend/IMPLEMENTATION.md`, the implemented backend error schemas/handlers, `data/docs/DATA_CONTRACT.md`, and `reference/prior-auth-pack/generator/schema_patient.py`.

Source review on 2026-11-20: `backend/app/main.py` now registers health, patients, users, notes, comments, summaries, notifications and dashboard routers. Their schemas/services contain patient CRUD, authored notes/discussion, note tombstones, summary generation, activity/unread counts and transactional database writes. **Registered implementation is not verified running integration or persistence**: this scope performs no live backend requests, database checks, imports or persistence tests. The binding frontend interface below is unchanged; current compatibility differences are recorded separately. Frontend consumes DTOs only, never CSV, DuckDB, raw source records, or pipeline lineage.

Scope is the patient dataset. There are no prior-authorization requests, request queues, request mutations, uploads, note editing, attachment mutations, real authentication, or WebSocket requirements in this pass. Historical `pa_request_count` is optional imported context only.

## Using the frontend interface now

`src/api/types.ts` is the binding shared TypeScript interface. `src/api/index.ts` exports `api: DashboardApi` and `dataMode: 'demo' | 'api'`. Unset `VITE_DATA_MODE` or `demo` explicitly selects the demo. `VITE_DATA_MODE=api` selects HTTP, with `VITE_API_BASE` defaulting to `/api`. Invalid modes fail visibly. API errors never cause fixture fallback. Vite environment values are build-time values; the UI owns the prominent demo banner.

`createMockApi()` makes an isolated store of 100 fictional patients and two synthetic selectable users. The index module creates one singleton only in demo mode. Changes last in memory until reload; this is neither database persistence nor browser local-storage persistence. The demo has no clinical files or attachments. Its source-shaped IDs/context are synthetic, not records imported from the supplied dataset. It starts with 12 unread comments on 12 patients for the first viewer and nine on nine patients for the second; most historical comments are already read.

Call `listUsers()` first, select a user, then pass `{actorId: user.id, signal?}` as the final context to domain calls. The mock requires a valid actor for every domain operation, including reads with viewer counts; missing/unknown actors return 401. `/users` discovery requires none. HTTP forwards the actor as `X-Demo-User-ID` only when supplied and never invents a default actor. The current backend accepts absent identity on ordinary reads and patient CRUD, requires identity on authored note/comment writes, read acknowledgments, notifications and `unread_only=true`, and rejects supplied unknown/inactive identities. All identity-dependent routes also require backend `demo_mode=true`, otherwise 503. Frontend explicitly gates domain calls on user selection in API mode; read identity agreement remains open. This selection is not a login.

All methods return Promises. Their exact signatures are:

```ts
type RequestContext = { actorId?: string; signal?: AbortSignal }
interface DashboardApi {
  listUsers(ctx?: RequestContext): Promise<User[]>
  listPatients(params: PatientListParams, ctx?: RequestContext): Promise<Page<PatientListItem>>
  getPatient(id: string, ctx?: RequestContext): Promise<PatientDetail>
  createPatient(input: PatientWrite, ctx?: RequestContext): Promise<PatientDetail>
  updatePatient(id: string, input: PatientWrite, ctx?: RequestContext): Promise<PatientDetail>
  deletePatient(id: string, ctx?: RequestContext): Promise<void>
  listNotes(patientId: string, ctx?: RequestContext): Promise<Note[]>
  getNote(patientId: string, noteId: string, ctx?: RequestContext): Promise<Note>
  createNote(patientId: string, input: NoteWrite, ctx?: RequestContext): Promise<Note>
  deleteNote(patientId: string, noteId: string, ctx?: RequestContext): Promise<void>
  getSummary(patientId: string, ctx?: RequestContext): Promise<PatientSummary>
  listComments(patientId: string, params: CommentPageParams, ctx?: RequestContext): Promise<Page<Comment>>
  createComment(patientId: string, input: CommentWrite, ctx?: RequestContext): Promise<Comment>
  updateComment(patientId: string, commentId: string, input: CommentWrite, ctx?: RequestContext): Promise<Comment>
  deleteComment(patientId: string, commentId: string, ctx?: RequestContext): Promise<void>
  markCommentsRead(patientId: string, commentIds: string[], ctx?: RequestContext): Promise<ReadReceipt>
  getNotificationSummary(ctx?: RequestContext): Promise<NotificationSummary>
}
```

## Exact HTTP endpoints requested

Paths in this table are backend bare paths. Every default frontend fetch prefixes `/api`; for example `/api/patients/{id}/comments/read`. Vite/nginx strip that prefix. A configured API base replaces the prefix. `{id}` is the application patient UUID; `{note_id}` and `{comment_id}` are child UUIDs. New endpoints must register literal `comments/read` safely alongside comment-ID routes.

Request/response columns retain the **binding frontend expectation**. “Registered” in State means source-registered routes and reviewed service code, not live acceptance or persistence evidence. Differences are detailed in the alignment table below; an expected response in this table does not mean the backend currently returns it.

| Method | Backend path | Request | Response | Success / expected failures | State |
| --- | --- | --- | --- | --- | --- |
| GET | `/health` | none | `{status:"ok"}` | 200 | Registered |
| GET | `/ready` | none | `{status:"ready"}` | 200 / 503 | Registered; DB connectivity only |
| GET | `/users` | none | `User[]` | 200 / 500 | Registered; active-user array, additive `display_role` |
| GET | `/patients` | `PatientListParams` query | `Page<PatientListItem>` | 200 / 401, 422, 500 | Registered; unread query and list shape gaps |
| POST | `/patients` | `PatientWrite` JSON | `PatientDetail` | 201 + `Location: /patients/{id}` / 401, 409, 422, 500 | Registered; see identity/validation differences below |
| GET | `/patients/{id}` | none | `PatientDetail` | 200 / 401, 404, 422, 500 | Registered; see identity/validation differences below |
| PUT | `/patients/{id}` | complete `PatientWrite` JSON | `PatientDetail` | 200 / 401, 404, 409, 422, 500 | Registered; see identity/validation differences below |
| DELETE | `/patients/{id}` | none | no body | 204 / 401, 404, 422, 500 | Registered; see identity/validation differences below |
| GET | `/patients/{id}/notes` | none | `Note[]` of active notes | 200 / 401, 404, 422, 500 | Registered; see identity/validation differences below |
| POST | `/patients/{id}/notes` | `{timestamp,content}` | `Note` | 201 + note Location / 401, 404, 422, 500 | Registered; see identity/validation differences below |
| GET | `/patients/{id}/notes/{note_id}` | none | `Note` | 200 / 401, 404, 410, 422, 500 | Registered; see note validation/order differences below |
| DELETE | `/patients/{id}/notes/{note_id}` | none | no body; retain tombstone | 204 / 401, 403, 404, 422, 500 | Registered; see identity/validation differences below |
| GET | `/patients/{id}/summary` | none | `PatientSummary` | 200 / 401, 404, 422, 500 | Registered; see identity/validation differences below |
| GET | `/patients/{id}/comments` | `CommentPageParams` query | `Page<Comment>` | 200 / 401, 404, 422, 500 | Registered; cursor/order/`is_unread` differences |
| POST | `/patients/{id}/comments` | `{body,note_ids}` | `Comment` | 201 + comment Location / 401, 404, 422, 500 | Registered; note-reference limits/error-path differences |
| PUT | `/patients/{id}/comments/{comment_id}` | `{body,note_ids}` replacement | `Comment` | 200 / 401, 403, 404, 422, 500 | Registered; author-only, reference limits/error-path differences |
| DELETE | `/patients/{id}/comments/{comment_id}` | none | no body | 204 / 401, 403, 404, 422, 500 | Registered; author-only, physical deletion |
| POST | `/patients/{id}/comments/read` | `{comment_ids:string[]}` | `ReadReceipt` | 200 / 401, 404, 422, 500 | Registered at this path, incompatible `{through}` body/receipt |
| GET | `/notifications/summary` | none; current viewer | `NotificationSummary` | 200 / 401, 500 | Registered; incompatible response field names |

All non-success responses use the existing error envelope. Other infrastructure failures can include 5xx/503; HTTP handles all 5xx generically. Path UUID syntax failures are 422; missing or other-patient children are 404, checked before author permissions. Known uniqueness conflicts are 409; the mock invents no uniqueness constraint on writable names/email and therefore has no artificial conflict trigger. Already-deleted notes return 410 on GET, 404 on another DELETE. Patient deletion cascades notes, comments, links and read state. Only note deletion and comment update/delete are author-only; selected actors can edit patient profiles. Backend authorization remains authoritative.

The backend additionally registers `PUT /patients/{id}/notes/{note_id}`, `POST /patients/{id}/notes/{note_id}/attachments`, `DELETE /patients/{id}/notes/{note_id}/attachments/{attachment_id}` and `GET /dashboard/overview`. These are not exported by the binding `DashboardApi`; note editing/attachment writes remain outside this frontend scope. No mandatory note PUT or attachment write endpoint is exported. No separate clinician endpoint is needed: the listed clinician comes from optional `profile_details.care_team.pcp_name`.

## Current alignment decisions (source review, not backend acceptance)

Priority P0 items block the current unread queue/discussion path; P1 items affect complete DTOs or valid writes. Frontend expectations in the field inventory and examples below are intentionally preserved.

| Frontend expectation | Current backend | Effect | Which side / action needs agreement |
| --- | --- | --- | --- |
| P0: `has_unread_comments=true` (and false for zero unread) | `PatientListQuery.unread_only:boolean=false`; no frontend-name alias declared | Frontend queue query cannot reliably filter unread; unknown query input may be ignored rather than fail; false semantics cannot be represented | Backend add agreed alias/semantics, or coordinated frontend contract change; do not rename only the tests |
| P0: notifications `{unread_comments_count,patients_with_unread_comments}` | `{unread_comments,patients_with_unread}` | Bell/subtitle read undefined fields; counts are not interchangeable with filtered list totals | Agree response names and update the owning implementation; tests currently assert binding frontend names |
| P0: newest comments first, offset `Page<Comment>`, per-card `is_unread` | Oldest first by `(created_at,id)` ascending; page/page_size plus opaque `cursor`; response adds `read_through`, `next_cursor`; no `is_unread` | Ordering/highlights differ; frontend cannot follow reliable backend cursor chain or decide which cards need acknowledgment | Joint design: preserve observed-ID model or explicitly adopt cursor/watermark model and update DTOs, UI and race tests together |
| P0: `POST /patients/{id}/comments/read` with `{comment_ids:[...]}` → `{patient_id,read_comment_ids,unread_comments_count}` | **Same current path**; body `{through:timezone-aware timestamp}` with extras forbidden → `{patient_id,last_read_at}` | Current frontend request fails validation; simply renaming body fields would lose observed-ID semantics | Joint acknowledgment/race agreement required; backend clamps to DB clock and monotonically advances watermark; frontend must not silently acknowledge unseen comments |
| P1: `middle_initial:string|null` on list and detail | List schema/projection omit it; detail includes it; derived `name` includes it | List DTO is incomplete even where display name renders | Backend supply list field or explicitly renegotiate binding list shape |
| P1: `profile_details?:ProfileDetails` (object or omitted), optional section keys | `profile_details:ProfileDetails|null`; non-null object requires all seven sections; adds nullable `source_lineage` | New/manual profiles can return null outside frontend type; imported object is stricter; lineage is additive read-only data | Agree null normalization/DTO typing; preserve catalog and immutable context; never send lineage in patient writes |
| P1: current form/mock limits below | Backend names ≤100 vs frontend ≤60; address ≤255 vs ≤200; state exactly 2 vs frontend ≤100; postal ≤10 vs ≤20; condition code ≤16 vs ≤40; labels/allergies ≤500 vs ≤200; phone 7–20 digits and length 7–40 vs frontend permissive punctuation syntax; EmailStr vs frontend basic email regex | Some frontend-valid state/postal/code/phone/email values get 422; some backend-valid imported values cannot be saved unchanged by frontend | Joint validation agreement, then align form, adapter/demo and backend; keep server-field errors visible until resolved |
| P1: one-letter initial and timezone-valid note timestamps, with no future-note constraint | Backend initial any one character; note timestamp rejects future instants; content ≤20,000 and discussion ≤10,000 align; optional note title defaults to `Clinical note` (≤80) | Numeric initials differ; future clinical drafts pass frontend and fail backend; omitted title is accepted | Agree initial/future-time rules; frontend should keep timestamp errors/drafts; no new mandatory title requirement |
| P1: max 20 note IDs/comment, deduplicate; invalid reference error at `note_ids[index]` | Max 100 UUIDs, rejects duplicates; service invalid-reference 422 has no indexed fields | Boundary behavior differs; invalid-link error appears at form level rather than exact note field | Agree count/dedup behavior and return structured field path from backend when applicable |
| Frontend selects a user before every domain operation and uses `X-Demo-User-ID` | Anonymous ordinary reads/patient CRUD allowed in backend demo mode; authored writes/read receipts/notifications and unread-only true require active actor; supplied invalid actors 401 | UI is stricter than several routes; selection is not production authentication | Agree read/write identity policy; backend remains authorization authority |
| Deterministic notes timestamp descending, UUID ascending ties; note links derive labels from content | Notes use timestamp descending, UUID **descending** ties; links use stored title/date and add title/timestamp fields; notes/users/attachments have additive metadata | Tie order and chip labels differ; extra response fields alone do not break the fetch adapter | Agree tie/label contract; keep additional metadata read-only unless a coordinated extension is made |
| Complete 17-field patient POST/PUT with nulls/arrays, no author/source/computed fields; note `{timestamp,content}`; comment `{body,note_ids}` | Registered schemas accept these exact core shapes; POST patient defaults also allowed; all write schemas forbid extras; authors derive from header; note title optional | Core payload shape aligns, subject to validation gaps and read RPC above | Retain explicit write allowlists; verify actual DB writes separately |
| Patient hard delete cascades; note soft delete keeps stable links and GET 410, repeated DELETE 404; retained tombstone links allowed on comment edit | Services implement patient deletion/cascade intent, note content/title clearing and attachment removal, tombstone links, ownership checks, retained-link exception; comments/links physically deleted | Source behavior broadly aligns; actual DB cascades/atomicity not proven by intercepted browser tests | Backend must verify with running DB/integration tests; no persistence claim from this document |
| Whole-dataset search, count sorts, viewer counts and template summary | Source implements search fields/escaping and all sorts; counts exclude deleted notes/own unread comments; summary shape matches; adds `/dashboard/overview` totals and two ≤6-row previews | Earlier “missing implementation” claims are obsolete; frontend home still uses binding list DTOs, not the added overview endpoint | Retain list contract; coordinate dashboard extension separately if adopted; run live integration after P0 decisions |

Exact incompatible wire examples (fictional IDs, not responses captured from a live backend):

```http
# Binding frontend queue request; backend declares unread_only instead:
GET /api/patients?page=1&page_size=20&has_unread_comments=true
X-Demo-User-ID: 40000000-0000-4000-8000-000000000001

# Current backend query dialect (bare registered route behind /api proxy):
GET /api/patients?page=1&page_size=20&unread_only=true
```

```json
{"unread_comments":12,"patients_with_unread":12}
```

The JSON above is the **backend** notification shape; the binding frontend example remains `{ "unread_comments_count": 12, "patients_with_unread_comments": 12 }`.

Current backend comment page shape (empty items abbreviates the DTO; it is not evidence of an empty database):

```json
{"items":[],"total":0,"page":1,"page_size":20,"read_through":"2026-11-20T15:00:00Z","next_cursor":null}
```

For nonempty pages backend items have `id`, `patient_id`, `body`, `author`, `created_at`, `updated_at`, `note_links` and **no `is_unread`**. To advance a reliable read cutoff, backend requires page 1 followed by `next_cursor` continuations; offset pages after page 1 return minimum `read_through` and no cursor. This differs from the binding frontend newest-first offset page and observed-ID examples below.

```http
POST /api/patients/10000000-0000-4000-8000-000000000001/comments/read
Content-Type: application/json
X-Demo-User-ID: 40000000-0000-4000-8000-000000000001

{"through":"2026-11-20T15:00:00Z"}
```

```json
{"patient_id":"10000000-0000-4000-8000-000000000001","last_read_at":"2026-11-20T15:00:00Z"}
```

Backend patient detail may include `"profile_details":null,"source_lineage":null,"source_created_at":null,"source_updated_at":null`; `middle_initial` is present on detail but absent from list. The frontend HTTP adapter currently trusts success DTOs rather than validating/normalizing them; successful status alone does not establish compatibility.

## List, paging and count contract

`Page<T> = {items:T[], total:number, page:number, page_size:number}`; only users/notes return arrays. Defaults: page 1, page_size 20; page_size 1–100. Invalid paging is 422. A page beyond the end returns empty items and the full filtered total; UI clamps after deletions. Search/filter/sort apply over the entire accessible dataset before slicing. `q` is trimmed, case-insensitive, at most 200 characters, with `%` and `_` literal. Current backend source covers first/last/full names (including the middle initial in full names), email, source patient ID, MRN and application UUID, with literal escaped `%`/`_`, case-insensitive matching and filtering before paging. This search extension is now implemented in source, without a live dataset verification here.

`PatientListParams` has optional `q:string`, `status:'active'|'inactive'`, `sort_by:'name'|'dob'|'last_visit'|'status'|'notes_count'|'comments_count'`, `order:'asc'|'desc'`, `page:number`, `page_size:number`, `has_unread_comments:boolean`. Current backend source accepts all six frontend sort names and adds `notes`/`comments` aliases. Unread filtering remains incompatible: backend uses `unread_only:boolean=false`, which only selects positive unread counts when true; it has no zero-unread-only equivalent. `has_unread_comments=true` includes positive counts; false includes zero; omitted includes both. Filtering occurs before paging. Default order is name ascending, comparing last name, first name, then UUID. Other sorts use UUID ascending as a deterministic tie-break, independent of sort direction. Null last visits sort last in both directions. UI age sorting uses reversed DOB order.

`notes_count` counts active clinical note records, `comments_count` counts current discussion comments, and `unread_comments_count` counts this viewer's unread comments. These fields are needed on list **and detail**. They are not attachment counts, page lengths, source historical request counts, or clinical status. Unknown counts must remain loading/unknown in UI, never fabricated zero. Compute all activity counts in the patient projection without per-row HTTP requests. SQL batching/aggregation is backend-owned.

Status tabs get All/Active/Inactive counts from filtered `total` values using the same search and optional unread filter, issuing at most three collection queries with the relevant status or none and `page_size=1`. Home patient/status totals use unfiltered collection totals. Recent visits use `sort_by=last_visit&order=desc`, excluding null rows client-side. The HTML mock's global clinical-note total and “No visit recorded” total/list require the complete list projection: at 100 rows, `page_size=100` suffices; if the dataset grows, retrieve all list pages before computing those values, or coordinate a future aggregate extension. Never sum a single incomplete page or add a fake aggregate endpoint to this interface. No extra endpoint is required for avatar, clinician or note titles.

## Complete core field inventory

All non-optional DTO properties are present even when nullable. `string|null` means explicit JSON null is allowed. All arrays are present and never null. Source mappings below describe the proposed real dataset projection; demo values are independently invented. “Read-only” means excluded from writes, even when the displayed value changes after another operation.

| Fields | Type / nullability | Source / authority | Screens |
| --- | --- | --- | --- |
| `id` | string UUID, required | Backend application identity, not pipeline/source ID | Routes, query keys, identity, note/comment parent scope |
| `source_patient_id` | string|null | Source `patient_id` (`PT-*`); null for manually created records | List/card secondary ID, detail, search, source label |
| `mrn` | string|null | Source MRN, preserving leading zeros; read-only | List/card, identity, detail, search |
| `first_name`, `last_name` | nonempty string | Source legal name, then editable current profile | List/card, identity, form, summary |
| `middle_initial` | string|null | Source initial, then editable current profile | Full name, form; preserve on PUT |
| `name` | string, read-only | API derives current full display name | List/card, identity, summary facts |
| `date_of_birth` | YYYY-MM-DD, required | Source DOB, then editable current profile | Identity, list/card, form, summary |
| `age` | integer, read-only | API computes at response time from DOB using UTC current date | List/card, sticky identity, summary facts; never stale fixture/source age |
| `last_visit` | YYYY-MM-DD|null | Source `pcp_last_visit_date`, then editable | Table/card, identity, profile, recent visits, form |
| `status` | active or inactive | Application state; real source has no dashboard status, seed default active | List/status filters, identity/profile, form, home |
| `conditions` | `{code:string|null,label:string}[]` | Paired source problem codes/text, then editable | List tags, profile, form, summary |
| `notes_count`, `comments_count`, `unread_comments_count` | integers >=0, read-only | Active notes/current comments/per-viewer unread | Table/card entry controls, tab indicators, queue, accessible counts |
| `phone` | string|null | Prefer source mobile, then home, then editable | Identity, contact, form |
| `email` | string|null | Source email, then editable | Contact, identity, search, form |
| `address_line1`, `city`, `state`, `postal_code` | string|null | Source address/`zip`, then editable; postal stays text | Profile composed address, form |
| `address_line2` | string|null | Absent from source; initial null, editable | Profile address, form |
| `blood_type` | string|null | Absent from source; initial null, editable | Profile, form, summary facts/narrative |
| `allergies` | string[] | Source drug allergies, then editable | Profile/form/summary; empty does not decide status |
| `allergy_status` | unknown, no_known or reported | Blank source means unknown; `NKDA` means no_known | Profile/form/summary distinguish uncertainty from no known allergy |
| `created_at`, `updated_at` | ISO timestamp, read-only | Application-managed creation/update audit | Record created/updated labels |
| `profile_details?` | named typed sections, read-only | Optional imported snapshot, catalog below | Additional profile context and listed clinician |
| `source_created_at?`, `source_updated_at?` | ISO timestamp|null, read-only | Original registration-system audit; optional projection request | Source audit if provided; never substitute for application audit |

`PatientDetail` includes all list fields plus the contact/address/medical/audit/context fields. `PatientWrite` contains **exactly** first_name, middle_initial, last_name, date_of_birth, phone, email, address_line1, address_line2, city, state, postal_code, blood_type, status, last_visit, conditions, allergies, allergy_status. Both frontend create and update send this complete shape. PUT requires every field; nullable fields use null, empty arrays use `[]`. No ID, MRN, source ID/context, name, age, counts or audit timestamps are writable. The registered backend `PatientCreate` allows POST defaults; `PatientReplace` requires all 17 fields, forbids extras and preserves imported provenance. This shared frontend interface deliberately supplies every field for both methods.

The demo trims text and maps blank nullable text to null. Proposed validation limits, **requiring backend agreement where not already specified**: names 1–60 characters, initial one letter/null, email <=254 with basic email syntax, phone <=40 allowing international punctuation/extensions, address lines <=200, city/state <=100, postal <=20 as text, condition code <=40/null and label 1–200, allergies 1–200 each; medical lists <=100 items. Blood type is null or A+/A-/B+/B-/AB+/AB-/O+/O-. DOB/last visit must be real calendar dates no later than UTC today. `reported` requires at least one allergy; `unknown`/`no_known` require an empty list. Conditions with no code use null; preserve existing codes. Unknown input fields and missing complete-write fields fail 422.

## Notes, discussion, summary and notification fields

| DTO / fields | Type / nullability / authority | Screens |
| --- | --- | --- |
| `User.id`, `display_name` | UUID string, string; server-selected identity | User picker, authors, avatars, ownership controls |
| `Note.id`, `patient_id` | UUID strings, read-only | Note list/detail, stable links, parent routing |
| `Note.timestamp` | timezone-aware ISO instant; client submits clinical event time | Note form, list/detail chronological display |
| `Note.content` | trimmed nonempty plain string, <=20,000 | Notes preview/body, summary input |
| `Note.author` | User; derived from actor, read-only | Recorded-by label, delete visibility |
| `Note.created_at`, `updated_at` | system timestamps, read-only | Audit labels; distinct from clinical timestamp |
| `Note.attachments` | `NoteAttachment[]`, read-only | External-file links/count, separate from number of notes |
| `NoteAttachment.id`, `display_name`, `source_url` | UUID, string, external HTTPS URL | Attachment label and external-link cue |
| `NoteAttachment.media_type?`, `source_description?` | string|null, optional | Optional file type/source context |
| `Comment.id`, `patient_id` | UUID strings, read-only | Comment keys, parent routing, acknowledgment |
| `Comment.body` | trimmed nonempty plain string, <=10,000 | Discussion body/form |
| `Comment.author` | User; actor-derived, read-only | Author name/initials, edit/delete visibility |
| `Comment.created_at`, `updated_at` | system timestamps, read-only | Time; “edited” iff updated_at > created_at |
| `Comment.is_unread` | boolean, viewer-specific | New-comment highlight; false for own comments |
| `Comment.note_links` | `{id:string,label:string,url:string,is_deleted:boolean}[]` | Note chips/picker; deleted-note chips |
| `note_links[].label` | string derived from note content/date, or “Deleted note” | Chip label; no persisted title field required |
| `note_links[].url` | bare canonical backend note path | Map to frontend note route for navigation; prefix API base when fetching |
| `NoteWrite` | `{timestamp:string,content:string}` only | Clinical note creation; no title/author_id |
| `CommentWrite` | `{body:string,note_ids:string[]}` only | Create/edit complete replacement; no author_id |
| `PatientSummary.patient_id`, `summary`, `generated_at`, `method` | UUID, plain narrative string, system ISO instant, literal `template` | Summary panel; method/generation-time label |
| `NotificationSummary.unread_comments_count`, `patients_with_unread_comments` | nonnegative integers for viewer across all accessible patients | Global bell and unread-queue subtitle |
| `ReadReceipt.patient_id`, `read_comment_ids`, `unread_comments_count` | UUID, acknowledged ID array, remaining patient unread count | Discussion acknowledgment and resulting count |

Notes list all active notes ordered by clinical timestamp descending, then UUID ascending. Comments are paged by creation timestamp descending, then UUID ascending; editing does not reorder them. `CommentPageParams` has optional page/page_size with the same defaults/bounds as patient paging. Note timestamps require an actual timezone and valid calendar/clock values; demo normalizes to UTC. No extra future-note restriction is invented by the adapter.

Note references must belong to the same patient. Proposed maximum 20 note IDs per comment, deduplicated, and 100 observed IDs per acknowledgment. Invalid/missing/other-patient note references in a write body fail 422 under `note_ids[index]`; wrong-parent direct child routes fail 404. Validate the whole replacement before changing any comment or links. After note deletion, omit it from notes/counts/summary and return 410 on its detail GET. Existing comment links become tombstones (`is_deleted:true`, label “Deleted note”) with the same ID and canonical path. An unchanged tombstone reference may survive an unrelated comment edit; newly adding/restoring a deleted-note link fails 422. Deletion clears note content/attachments. No attachment upload/download-content API is implied by metadata.

Summary is one narrative string generated from the current profile and active clinical notes, with generated_at and `method:'template'`. It distinguishes unknown blood/allergies, no conditions and no notes. The UI's summary fact strip and condition/allergy sections use PatientDetail. Do not invent separate narrative sections/summary response fields. Discussion, deleted notes, source historical request counts and external file contents never enter the clinical summary automatically.

## Viewer read state, races and cache requirements

A comment is unread iff authored by another user and never acknowledged by this viewer. Reading as A cannot clear B. Comment edits preserve read state and creation time. Deleted comments stop contributing to total/unread counts; own comments never contribute to unread. Opening a profile, notes, summary or queue does not mark discussion read. Listing comments also has no acknowledgment side effect.

After Discussion is visible and a comment page has loaded, snapshot the displayed IDs and POST only those IDs. The operation is idempotent. Do not acknowledge unloaded pages, every patient comment, a current high-water timestamp, or a refreshed list that may include unseen arrivals. Comments created after the snapshot remain unread even if they arrive before acknowledgment commits. Proposed race behavior: deduplicate IDs; ignore already-deleted/missing IDs so deletion during reading is harmless; return only existing same-patient IDs accepted. Any ID known to belong to a different patient returns 404 before changing any read state. Backend persistence/transaction design must make these semantics durable; the memory demo is not a concurrency substitute.

ReadReceipt is authoritative at acknowledgment time but can already be stale after a later arrival. Revalidate comments, relevant list/detail counts, queues and notification summary; do not blanket-zero them or decrement a newer count with an older receipt. On failure retain unread state and show retry. The UI keeps a per-visit snapshot of newly acknowledged IDs to retain “New” card labels while reading; clear that snapshot on a later visit and on actor changes. Offset paging can move under insertions; deduplicate cards by ID and acknowledge only actual displayed IDs. There is no WebSocket requirement; normal query revalidation handles changes.

Include actor ID in **every cache key carrying viewer data**, including patient detail and create/update responses containing unread counts, not just list/comments/notifications. Use the shared [query-key helpers](../frontend/src/app/query-keys.ts): `['patients','list',actorId,params]`, `['patients','detail',id,actorId]`, `['patients',id,'comments',actorId,pageParams]`, `['notifications',actorId,'summary']`. The detail prefix `['patients','detail',id]` invalidates all actor variants for that patient. Notes/summary are content-shared but permission controls still update with the actor. On actor switch, cancel old requests, partition caches and avoid previous-actor placeholder data; never flash the previous actor's unread/ownership view.

| Mutation | Required invalidation / cache action |
| --- | --- |
| Patient create | Patient lists/home totals |
| Patient update | Lists, all actor detail variants, summary; populate current actor detail from response |
| Patient delete | Lists/queues/home and global notifications; remove that patient's detail/notes/comments/summary caches |
| Note create | Notes, patient detail/list note counts, summary |
| Note delete | Notes, individual note, patient detail/list counts, summary, comments for tombstone chips |
| Comment create/update/delete | Comments, patient detail/lists/queues, all affected actor notification summaries; summary text unchanged |
| Read acknowledgment | This actor's comments/detail/lists/queues/notifications; preserve newer unread arrivals |

For a single patient, detail + notes + summary + current comment page are independently fetched when relevant. The table gets activity counts in its list response and never fetches notes/comments per row. Reuse the patient notes collection for previews and note-link choices. The mock's “linked from N comments” note label can only be computed exactly from all comment pages, if that UI is retained; a loaded page cannot prove the total, and there is no reference-count endpoint/field in this pass.

## Optional read-only source-context catalog

These are typed named sections in `ProfileDetails`, matching data's current provisional models. Each section may be omitted; when present, its documented fields have the types below. Frontend must not invent absent clinical values. String enums stay source text where not part of the binding application enums. Decimal measurements are exact decimal **strings**, not floats. Dates are YYYY-MM-DD, timestamps UTC ISO. No arbitrary writable blob or raw source snapshot is exposed.

| Section | Named fields and types | Source / display |
| --- | --- | --- |
| `identity` | age_years:number; sex_at_birth:string; gender_identity:string; race:string; ethnicity:string; preferred_language:string; interpreter_needed:boolean; marital_status:string; employment_status:string | Same source columns. age_years is snapshot age at 2026-11-18, never live age. Optional profile identity/language context |
| `contact` | home_phone:string|null; mobile_phone:string|null; emergency_contact_name:string; emergency_contact_relationship:string; emergency_contact_phone:string | Original source contact fields; optional profile context, separate from editable preferred phone |
| `care_team` | pcp_name:string; pcp_npi:string; home_facility_key:string; first_registered_date:date | Same source columns. Identity's listed clinician uses pcp_name; registration/facility context. NPI stays text |
| `coverage` | primary_payer_name:string; primary_line_of_business:string; primary_plan_name:string; primary_plan_type:string; primary_member_id:string; primary_group_number:string|null; primary_coverage_effective_date:date; secondary_payer_name:string|null; secondary_member_id:string|null | Same source columns; optional coverage profile, no authorization workflow |
| `clinical` | primary_clinical_story:string; height_cm:decimal-string; weight_kg:decimal-string; bmi:decimal-string; smoking_status:string; alcohol_use:string; has_hypertension:boolean; has_diabetes:string; has_ckd:boolean; has_copd:boolean; has_heart_failure:boolean; has_cad:boolean; has_afib:boolean; has_osa:boolean; has_depression:boolean; has_obesity:boolean; has_cancer_history:boolean; charlson_comorbidity_index:number; active_medications:string|null | Same source columns; optional historical clinical context. Diabetes “None” is a category. Measurements retain cm, kg, kg/m²; medications retain source dose/schedule text |
| `labs` | last_labs_date:date; last_hba1c_pct:decimal-string; last_egfr:number; last_creatinine_mg_dl:decimal-string; last_ldl_mg_dl:number; last_hemoglobin_g_dl:decimal-string; hospitalizations_12mo:number; ed_visits_12mo:number | Same source columns. Units: %, mL/min/1.73m², mg/dL, mg/dL, g/dL; utilization counts describe snapshot's prior 12 months |
| `social` | housing_status:string; transportation_barrier:boolean; advance_directive_on_file:boolean; code_status:string; pa_request_count:number | Same source columns. Optional profile context only; historical request count is not a live workflow/count |

This catalog plus the core mapping accounts for all 76 source columns: identity 15 (six core + nine context), contact 10 (five core including zip + five context), care/registration 5 (PCP last visit core + four context), coverage 9, clinical 22 (paired problem-list columns to conditions, drug_allergies to allergy fields, remaining 19 context), labs/utilization 8, social 5, and original audit 2. Source `created_at`/`updated_at` project to optional source audit fields, separate from application audit. Backend `ProfileDetails` now declares all seven sections required when a profile object exists, with decimal string serializers; the response permits the entire object to be null. The frontend allows omitted sections but currently types the whole object as optional without null. Final serialization/nullability agreement and live import verification remain outstanding; this review does not verify any import/seed run. Imported context remains immutable through current-profile PUTs and cannot override edited conditions/allergies in summaries.

## UI-derived values and local state

All UI data is supplied above or derived explicitly as follows:

| UI point | Derivation / limitation |
| --- | --- |
| Patient/author avatar initials and tint | Names/author display_name; deterministic client presentation; no image URL or avatar endpoint |
| Full-name labels and name order | API `name` or preserved name components; short labels are presentation |
| Patient number / MRN / route | Display source_patient_id and MRN when present; route with opaque UUID. Do not fabricate source IDs/MRNs for new patients |
| Status/condition/allergy labels | Enum-to-label mapping and supplied labels; neutral fallback for unsupported future values; no invented clinical state |
| Unknown/no visit/not recorded labels | Explicit null and allergy_status; “None listed” for empty conditions. Never confuse unknown with known absence |
| Source / fictional-data label | `dataMode` plus presence of source_patient_id; source context if supplied. No persisted freeform `source` string required |
| Record created and edited timestamps | Application created_at/updated_at; original registration audit labeled separately if supplied |
| Note title/excerpt | Short first line/sentence from content and formatted date. HTML mock title input is not an API field and must not become required persisted data |
| Note author role | Not provided by User; do not infer a profession from a display name or PCP relationship |
| Active notes/attachments | notes_count or active collection length; per-note attachmentCount = attachments.length. No supplied clinical files; empty fixture attachment arrays are intentional |
| Discussion total / New pill / accessible label | comments_count and unread_comments_count; loaded cards use is_unread plus current-visit read snapshot |
| Bell / 99+ / all caught up | Global notification summary; cap visual text only, preserve exact accessible count; hide at zero. Queue total and global unread are distinct |
| Summary facts, conditions, allergies | PatientDetail plus plain summary narrative, method and generated_at; no additional summary fields |
| Pagination range and page count | page/page_size/total, accounting for empty and out-of-range pages |
| Search, filters, sorting, selected tab, navigation, focus/scroll, last viewed patient, drafts, loading/error/retry/confirm states | Router owns live URL state; Query owns API state; TanStack Form owns drafts; a small Zustand store owns shared UI preferences and return snapshots. These are not patient database columns |

Clinical and discussion text render as literal text with preserved line breaks. External HTTPS attachment links use a new-tab cue and `noopener noreferrer`. Canonical note URLs are API paths and are mapped to frontend routes for copy/open actions; they are not external file URLs.

## Dates, IDs and errors

Application UUIDs are opaque strings; source IDs/MRN/ZIP/NPI/member IDs/phones stay strings with leading zeros. App UUIDs are distinct from data lineage UUIDs; no fixed demo UUID implies the backend has accepted that namespace. Patient status is exactly active/inactive; allergy status exactly unknown/no_known/reported; summary method exactly template.

`formatDate(YYYY-MM-DD|null)` formats a calendar date without a timezone shift (null => “Not recorded”). `formatDateTime(ISO)` displays an instant in the viewer's zone. `toDateTimeLocal(ISO?)` defaults to now with minute precision for the note input; `toIsoTimestamp(datetime-local)` interprets valid local input in the browser zone and returns a UTC ISO instant. Invalid calendar/time input and local DST gaps throw RangeError; repeated fall-back times follow JavaScript's earlier-instant resolution. Only timestamp inputs convert timezones; DOB/last visit stay date-only. Age is API output, calculated when read, not imported snapshot age.

The implemented backend envelope is:

```json
{"error":{"code":"validation_error","message":"Request validation failed.","fields":[{"path":["body","conditions",0,"label"],"code":"missing","message":"Field is required."}]}}
```

`ApiError` has status, code, message, `fieldErrors:Record<string,string>`, and kind: network/validation/not_found/gone/unauthorized/forbidden/conflict/server. Strip only the body prefix: the example maps to `conditions[0].label`; query/path locations remain e.g. `query.page_size` and `path.id`. Mock validation emits the same form-field map. Network has status 0; 400/422 validation, 401 unauthorized, 403 forbidden, 404 not_found, 409 conflict, 410 gone. Every 5xx gets a fixed generic message/code with no raw body/field errors. Malformed success JSON gets a generic invalid-response error. AbortError/canceled signals propagate and must not trigger a failure toast. A successful 204 is never parsed as JSON. The adapter performs no automatic retry, especially on writes; a UI query policy may retry selected network/5xx reads only. Authorship is always the header-selected actor; write bodies contain no author_id.

## Compact synthetic payload examples

Examples use fictional identifiers. The list row below is complete; detail is shown as additions to that same row to keep the shared fields visible without duplicating them. All API JSON uses ordinary string keys and explicit nulls.

List (`GET /api/patients?page_size=20&has_unread_comments=true`):

```json
{"items":[{"id":"10000000-0000-4000-8000-000000000001","source_patient_id":"PT-0001","mrn":"01000001","first_name":"Ana","middle_initial":"J","last_name":"Silva","name":"Ana J Silva","date_of_birth":"1940-01-01","age":86,"last_visit":null,"status":"inactive","conditions":[],"notes_count":4,"comments_count":3,"unread_comments_count":1}],"total":12,"page":1,"page_size":20}
```

Detail additions to the row (`GET /api/patients/{id}`; row fields are also present in the actual response):

```json
{"phone":"+1 (212) 555-0100","email":"ana.1@example.com","address_line1":"101 Fictional Cedar Lane","address_line2":"Unit 1","city":"Albany","state":"NY","postal_code":"01234","blood_type":null,"allergies":[],"allergy_status":"unknown","created_at":"2020-01-15T14:00:00.000Z","updated_at":"2026-01-01T15:00:00.000Z","profile_details":{"care_team":{"pcp_name":"Dr. Taylor Example (synthetic)","pcp_npi":"0000000000","home_facility_key":"DEMO","first_registered_date":"2020-01-15"}}}
```

Comments (`GET /api/patients/{id}/comments?page_size=1`):

```json
{"items":[{"id":"30000000-0000-4000-8000-000000000012","patient_id":"10000000-0000-4000-8000-000000000001","body":"Synthetic team discussion: please confirm the next appointment time.","author":{"id":"40000000-0000-4000-8000-000000000002","display_name":"Demo User 2 · Alex Morgan"},"created_at":"2026-11-03T16:00:00.000Z","updated_at":"2026-11-03T16:00:00.000Z","is_unread":true,"note_links":[{"id":"20000000-0000-4000-8000-000000000010","label":"Synthetic intake: contact details and recorded history reviewe","url":"/patients/10000000-0000-4000-8000-000000000001/notes/20000000-0000-4000-8000-000000000010","is_deleted":false}]}],"total":3,"page":1,"page_size":1}
```

Summary (narrative shortened for illustration):

```json
{"patient_id":"10000000-0000-4000-8000-000000000001","summary":"Ana J Silva, age 86, is an inactive patient. Blood type: unknown. No conditions are listed. Allergy status is unknown.\n\n2026-10-01T14:30:00.000Z: Synthetic intake: contact details and recorded history reviewed.","generated_at":"2026-11-20T15:00:00.000Z","method":"template"}
```

Notification summary:

```json
{"unread_comments_count":12,"patients_with_unread_comments":12}
```

Read request and response (after acknowledging the one currently unread comment):

```json
{"comment_ids":["30000000-0000-4000-8000-000000000012"]}
```

```json
{"patient_id":"10000000-0000-4000-8000-000000000001","read_comment_ids":["30000000-0000-4000-8000-000000000012"],"unread_comments_count":0}
```

The remaining integration gate is agreement and implementation of the compatibility actions above, followed by live backend/database validation. Count sorts, expanded search, enriched counts and core routes are present in current backend source. No frontend type, fixture or test constitutes backend acceptance.

## Validation evidence

### API-mode intercepted browser integration, 2026-11-20

Run from `frontend/` with dependencies and Chrome already installed. The parent owns the existing Vite server at `http://127.0.0.1:5174`, configured with `VITE_DATA_MODE=api` and `VITE_API_BASE=/api`. This worker neither started nor stopped a server and used no installs, git or deployment commands.

```sh
PLAYWRIGHT_API_BASE_URL=http://127.0.0.1:5174 ./node_modules/.bin/playwright test --config playwright.api.config.ts --workers=2
./node_modules/.bin/eslint playwright.api.config.ts e2e-api/*.ts --max-warnings 0
./node_modules/.bin/tsc --ignoreConfig --noEmit --strict --noUncheckedIndexedAccess --noUnusedLocals --noUnusedParameters --verbatimModuleSyntax --target ES2023 --lib ES2023,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --skipLibCheck --types node playwright.api.config.ts e2e-api/*.ts
./node_modules/.bin/prettier --check playwright.api.config.ts e2e-api/*.ts
```

Result: **7 passed, 0 failed** in desktop Chrome, including one focused 390×844 mobile case; scoped lint, strict typing and formatting pass. The config uses one desktop Chrome project, fresh Playwright contexts, no test retries, and blocks service workers. With `PLAYWRIGHT_API_BASE_URL` unset, future standalone runs start a dedicated port **4175** server in API mode with `reuseExistingServer:false`. The parent supplies the npm script; this worker does not modify package/configuration files outside the owned API config/tests.

These tests exercise the real frontend `createHttpApi` fetch adapter through `page.route` and explicit synthetic frontend-contract fixtures. The bridge validates method, path, query names/values, actor/JSON headers and exact write-body keys, and rejects unexpected API/external requests. It supplies no app globals, React state or external backend traffic. The passing suite **does not** demonstrate that the current backend accepts these fixtures, that the database is running, or that any mutation persists after reload. In particular its notification, comments and observed-read responses deliberately follow the binding frontend contract, not the incompatible backend dialect.

Covered cases: `/users` discovery before explicit actor selection and actor headers on all domain requests; no demo workspace banner or 100-patient fallback under 404/503/network list errors; exact search/status/count-sort/page/size and unread-query serialization, independent global counts, direct patient/note URLs and literal response text; complete POST/PUT null/array bodies excluding read-only fields; nested 422 condition error attached to the actual field with draft preserved; blocked pending double-submit, network write failure and explicit user resubmission; newer post-save GET winning over PUT snapshot; clinical timestamp conversion to ISO with no author/title payload; comment note IDs and acknowledgment of only displayed other-author unread IDs while unloaded comments stay unread; empty 204 note deletion and tombstone chips; 401/403 recovery, distinct 404/410 note UI, eligible read retries; background profile GET failure preserving cached workspace and unsaved clinical draft across tab changes and successful retry. Initial canceled GET duplicates under React development StrictMode are allowed; mutation counts and explicit retry deltas remain asserted.

Delayed read-receipt/new-arrival ordering is deferred to parent-owned unit regressions; this browser scope does not verify that race. Source review supports the registered-route statements above; no actual live backend tests were run in this scope.

### Earlier data-layer unit evidence (retained historical record)

The following commands/results were recorded by the earlier data-layer worker, not rerun as part of the browser scope. Dependencies were already present and no install, server, git or deployment command was used.

```sh
TZ=America/Los_Angeles ./node_modules/.bin/vitest run src/api/client.test.ts src/api/mock-api.test.ts src/api/index.test.ts src/utils/dates.test.ts
./node_modules/.bin/eslint src/api src/fixtures src/utils/dates.ts src/utils/dates.test.ts --max-warnings 0
./node_modules/.bin/tsc --ignoreConfig --noEmit --strict --noUncheckedIndexedAccess --noUnusedLocals --noUnusedParameters --verbatimModuleSyntax --target ES2023 --lib ES2023,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --skipLibCheck --types vite/client src/vite-env.d.ts src/api/*.ts src/fixtures/*.ts src/utils/dates.ts src/utils/dates.test.ts
./node_modules/.bin/prettier --check src/api src/fixtures src/utils/dates.ts src/utils/dates.test.ts ../chatroom/frontend-data-contract.md
```

Results: 49 tests passed across four files, scoped ESLint passed, standalone strict typing passed, and scoped Prettier passed. The tests cover error/204/abort handling, explicit modes with no fallback, full-dataset query behavior, live age, actor isolation, partial-page/observed-only read races, own-comment exclusion, ownership, atomic validation and links, note tombstones, summary separation, and local/calendar/DST dates. Timestamp display accepts Python-style fractional seconds.

Also attempted `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`; at that point it failed on unfinished files/type errors in `app/`, `routes/` and `features/`, outside this worker's scope. No errors were reported for this data layer, and standalone typing above independently verifies it. The earlier explicit-files typing attempt required TypeScript 6's `--ignoreConfig`; the command above is the corrected passing invocation. Whole-app build/browser/backend integration is not claimed by these unit checks.
