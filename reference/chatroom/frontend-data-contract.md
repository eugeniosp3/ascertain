# Frontend and backend integration contract

The frontend now adopts the existing [backend API contract](../../backend/docs/API_CONTRACT.md) and its running OpenAPI schema. This document describes the wire contract and the small UI-facing normalization boundary in [client.ts](../../frontend/src/api/client.ts), [dto.ts](../../frontend/src/api/dto.ts), and [types.ts](../../frontend/src/api/types.ts). It replaces the earlier incompatible observed-comment-ID proposal.

Project references: [root README](../../README.md), [master progress](../PROGRESS.md), [interactive punch card](../holepunch.html), [frontend guide](../../frontend/docs/IMPLEMENTATION.md), and [dated verification handoff](frontend-updates.md). Backend owns persistence and wire semantics; frontend owns UI composition and adaptation. Infra owns shared stack lifecycle and API-mode rollout.

**Verification status:** the required per-comment `is_unread` field is implemented. After the initial failed run, compiled candidate 03 passed 16/16 live API/PostgreSQL browser cases. The [handoff](frontend-updates.md) records exact source/artifact identity, the missing immutable backend identity, preserved failures and remaining form/navigation/visual gates. Demo and intercepted-contract passes are separate evidence.

## Modes and identity

API is the application default. `VITE_DATA_MODE=demo` explicitly selects isolated synthetic in-memory fixtures; there is no fallback to fixtures after an HTTP failure. Public `VITE_*` settings are embedded at build time. `VITE_API_BASE` defaults to `/api`; the proxy strips that prefix before forwarding to FastAPI.

`GET /users` discovers active demo identities. The selected UX defaults to its first actual result (User A), preserves a valid saved B/other choice, and replaces stale IDs after validating discovery in both API and demo modes. No initial selection is required. The UI sends `X-Demo-User-ID`; it never sends `author_id` in note/comment bodies. This is a synthetic identity switcher, not authentication. All viewer-dependent caches include actor identity. PM completed the narrow actor-provider/test implementation; the dated handoff records its five unit and eleven intercepted-browser checks separately from compiled/live acceptance.

## Assigned-workload overview — agreed contract, implementation in flight

- `Patient.assigned_user_id` is an indexed nullable UUID foreign key to `users.id`, with `ON DELETE SET NULL`. List/detail/dashboard previews include it as a read-only value.
- `GET /patients?assigned_to=me` requires a valid active `X-Demo-User-ID`, filtering before total/counts/pagination and combining with search/status/unread/sort. Omit it for the shared directory. Other values return 422, absent/invalid/inactive actor 401, disabled demo identity 503.
- `GET /dashboard/overview?scope=assigned` requires an actor and scopes every total (including active notes) and preview to that cohort. Default `scope=global` preserves the global endpoint. Response adds `scope: "assigned"|"global"` and `assigned_user: {id,display_name,display_role}|null`; global uses null.
- POST assigns the selected actor server-side; without an actor, a new patient is unassigned. Assignment input is rejected. The 17 editable profile fields remain unchanged and PUT preserves assignment. Shared CRUD access remains global; assignments organize workload, not authorization.
- Backend owns additive migration `20261120_0002` and marker `demo-assignments-v1`. Seed/backfill uses SHA-256 of the exact canonical `source_patient_id` UTF-8 bytes, unsigned first eight bytes big-endian modulo two (`digest[7] & 1`), mapped to the existing Clinician/Coordinator roster in that order. Once the marker exists, repeated seed runs preserve reassignment, explicit unassignment and deletion; API-created unassigned rows are not backfilled. No clinical/status/visit values change.
- Independent data calculation gives 52 Clinician / 48 Coordinator in the pristine 100-source-record cohort. The running user preview is mutable and is not that oracle. Backend owns the migration and seed lifecycle. An empty assigned cohort must render honestly while assignment seeding is incomplete; the frontend never substitutes global or fabricated data.

Frontend will use ONE cached/cancelable complete assigned projection for all four charts and recent patients, label the selected person and assigned denominator, partition caches by actor/scope and refresh after relevant mutations. The shared all-patient directory remains unchanged, with at least 100 records; unread notifications remain their existing personal global scope. No clinical/status/visit values are modified or chart data shuffled to force visible differences. Equal or empty metrics are honest outcomes. New two-user live proof and seed/migration verification are required; the prior global-overview proof is historical only.

The real backend persists patients, notes, comments and read watermarks in PostgreSQL. The explicit memory adapter lasts only until reload. Zustand stores UI preferences/return snapshots, not clinical records or drafts. Data engineering remains responsible for source preparation; the browser never loads CSV, DuckDB, raw source snapshots or pipeline lineage.

## Wire endpoints

Paths below are backend bare paths. The browser calls the corresponding `/api/...` path. A successful DELETE returns 204 without a JSON body. Registered implementation is not proof of end-to-end persistence verification.

| Method | Path | Input | Response and behavior |
| --- | --- | --- | --- |
| GET | `/health` | None | `{status:"ok"}` |
| GET | `/ready` | None | `{status:"ready"}` or 503; database connectivity |
| GET | `/users` | None | Array of `{id,display_name,display_role}`; role may be null |
| GET | `/patients` | `page`, `page_size`, `q`, `status`, `sort_by`, `order`, `unread_only`, optional `assigned_to=me` | `{items,total,page,page_size}` after complete-dataset filtering/sorting |
| POST | `/patients` | Complete frontend `PatientWrite` | 201 saved detail plus Location; backend also permits its documented create defaults |
| GET | `/patients/{id}` | UUID | Profile, activity counts, nullable source context and audit data |
| PUT | `/patients/{id}` | Every writable field, including nulls/arrays | 200 saved detail; source/audit fields stay read-only |
| DELETE | `/patients/{id}` | UUID | 204; cascades owned application records |
| GET | `/patients/{id}/notes` | Patient UUID | All active notes, newest clinical timestamp first |
| POST | `/patients/{id}/notes` | `{timestamp,content}`; backend additionally accepts optional title | 201 authored note; author comes from selected actor |
| GET | `/patients/{id}/notes/{note_id}` | Parent and note UUIDs | Note plus attachment metadata; 404 missing/wrong parent, 410 deleted |
| DELETE | `/patients/{id}/notes/{note_id}` | Author identity | 204; content-free tombstone retained for links |
| GET | `/patients/{id}/summary` | Patient UUID | `{patient_id,summary,generated_at,method:"template"}` |
| GET | `/patients/{id}/comments` | First page uses page 1/page_size; following pages use opaque cursor/page_size | Chronological `CommentPage`, oldest first, with `read_through` and `next_cursor` |
| POST | `/patients/{id}/comments` | `{body,note_ids}` | 201 authored comment, including `is_unread:false` for its author |
| PUT | `/patients/{id}/comments/{comment_id}` | `{body,note_ids}` replacement | Author only; preserve creation time/authorship |
| DELETE | `/patients/{id}/comments/{comment_id}` | Author identity | 204; removes comment and references |
| POST | `/patients/{id}/comments/read` | `{through: read_through}` from a displayed prefix | `{patient_id,last_read_at}`; bounded monotonic viewer watermark |
| GET | `/notifications/summary` | Current actor | `{unread_comments,patients_with_unread}` across accessible patients |
| GET | `/dashboard/overview` | Optional dashboard read | Existing totals/previews endpoint; current frontend charts do not require it |

Optional note editing and attachment-metadata writes exist in the backend but are not required frontend actions in this pass. Actual file upload/storage, real authentication and WebSockets remain outside this scope.

## Boundary mapping and validation

| UI-facing value | Actual wire behavior |
| --- | --- |
| `has_unread_comments` query option | Serialized as `unread_only`; true filters unread, false/omitted means no unread filter |
| Notification `unread_comments_count` | Mapped from `unread_comments`, checked as a nonnegative integer |
| Notification `patients_with_unread_comments` | Mapped from `patients_with_unread`, checked as a nonnegative integer |
| List `middle_initial` | Omitted wire field becomes null internally; the backend's full `name` remains the display value; detail includes the actual initial |
| Optional UI `profile_details` | A null wire context becomes absent UI context; no clinical values are fabricated |
| `CommentPage` | `{items,total,page,page_size,read_through,next_cursor}`; cursor/boundary strings are preserved |
| `DiscussionReadInput` and `ReadReceipt` | `{through}` and `{patient_id,last_read_at}`; no observed-ID request or absolute unread-count receipt |

Patient pages start at 1, default to 20 rows and allow 1–100. Search covers names, MRN, source ID, application UUID and email; sort keys include name, DOB, last visit, status, notes_count and comments_count. Missing last visits sort last. Age sorting reverses DOB order. Activity counts come in list/detail responses, avoiding per-row child-resource requests.

Frontend forms and the memory adapter use shared [constraints](../../frontend/src/api/constraints.ts): names ≤100, one-character initial or null, address lines ≤255, city ≤100, state exactly two characters or null, postal code ≤10, condition code ≤16, condition/allergy labels ≤500, medical arrays ≤100. Phones have 7–20 digits, length 7–40, and supported punctuation/extensions. Email is bounded to 254; backend EmailStr remains authoritative. Nullable blank inputs become null in form mapping. Conditions keep their codes. `reported` allergy status requires a nonempty list; other states require an empty list.

DOB and last visit are valid nonfuture date-only strings. Notes require a timezone-aware clinical timestamp that is not in the future, and ≤20,000 characters of content. Comments allow ≤10,000 characters and at most 100 distinct note references. All fields used in full patient PUT are explicitly sent; source IDs, MRN, computed names/ages/counts, lineage and audit values are excluded from writes.

## Complete core field inventory

All non-optional DTO properties are present even when nullable. `string|null` means explicit JSON null is allowed. All arrays are present and never null. Source mappings below describe the proposed real dataset projection; demo values are independently invented. “Read-only” means excluded from writes, even when the displayed value changes after another operation.

| Fields | Type / nullability | Source / authority | Screens |
| --- | --- | --- | --- |
| `assigned_user_id` | string UUID or null, read-only | Stored synthetic workload assignment; preserved on profile PUT | Assigned overview cohort; never access control |
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

## Notes and discussion data

| Object | Fields used by frontend |
| --- | --- |
| User | `id`, `display_name`; optional/additive nullable `display_role` |
| Note | `id`, `patient_id`, `timestamp`, `content`, optional `title`, `author`, `created_at`, `updated_at`, `attachments` |
| Note attachment | `id`, `display_name`, HTTPS `source_url`, optional media_type/source_description; these are links, not uploaded files |
| Comment | `id`, `patient_id`, `body`, `author`, `created_at`, `updated_at`, required viewer-specific `is_unread`, `note_links` |
| Linked note | `id`, `label`, canonical `url`, `is_deleted`; backend additionally supplies title/timestamp |
| Summary | Patient UUID, plain narrative `summary`, generated_at and method=template |
| Discussion page | Items/total/page/page_size plus exact `read_through` and opaque `next_cursor` or null |
| Read response | Patient UUID and persisted `last_read_at`; never use this as an absolute count |

Clinical note time is distinct from application creation/edit time. Note cards may derive a short display label from content/date; no new persisted title is required. Notes and comments render as plain text. Deleted notes disappear from active counts and summaries but retain stable comment links; deleted source-file references do not delete external files. Existing tombstone links can survive a comment edit, while newly adding a deleted/wrong-patient note reference is rejected.

## Discussion cursor and read rules

1. Fetch page one, render it in active visible Discussion, and acknowledge exactly its server-issued `read_through` value. No date reformatting or JavaScript millisecond round-trip is allowed for that boundary.
2. Next follows `next_cursor`; Previous uses the known cursor history. Never skip a hidden/unrendered prefix or use legacy offset pages beyond page one for unread-aware navigation.
3. New arrivals after the snapshot remain unread. Earlier-row deletion cannot shift a cursor past an unseen record. A timestamp group crossing a boundary stays unread until its final page has been displayed.
4. `is_unread` comes from the backend for this viewer, excluding own comments and comparing original created_at with that patient's read watermark. GETs and edits do not mark discussion read.
5. Keep visit-only New labels for displayed unread cards. Queue the highest eligible displayed boundary if another read is pending; navigating backward must not lose it. Flush only while Discussion is active/visible, and retry failed writes explicitly.
6. Read responses invalidate authoritative patient/notification counts; never replace a newer count with an old receipt. Patient save responses enter cache before refetch so a newer GET wins.
7. Refresh starts a new snapshot without destroying drafts. Posting on a later page shows an immediate posted-comment preview rather than jumping over and acknowledging unseen pages. Edits and note links preserve draft state across canonical note routes.

The backend owns durable per-user watermarks and transactions. The memory adapter mirrors this protocol for separately labelled demo tests; it is not persistence evidence.

## Optional read-only source context

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

This catalog plus the core mapping accounts for all 76 source columns: identity 15 (six core + nine context), contact 10 (five core including zip + five context), care/registration 5 (PCP last visit core + four context), coverage 9, clinical 22 (paired problem-list columns to conditions, drug_allergies to allergy fields, remaining 19 context), labs/utilization 8, social 5, and original audit 2. Source `created_at`/`updated_at` project to optional source audit fields, separate from application audit. Backend `ProfileDetails` declares all seven sections required when an object exists, with decimal string serializers; the wire permits the entire object to be null. `PatientDetailDto` accepts that null and the adapter normalizes it to an omitted UI `profile_details`; UI sections tolerate missing context. This inventory does not verify the import/seed pipeline or modification of imported profiles. The live suite deliberately mutates only disposable records with null imported context. Imported context remains immutable through current-profile PUTs and cannot override edited conditions/allergies in summaries.

## UI derivation, caching and errors

Avatar initials, formatted names/dates, percentages, age bands and chart buckets are derived display values. Sidebar/theme/return state belongs to Zustand; URL filters belong to Router; server data belongs to Query; drafts belong to Form. Dark is the default only when no saved Light/Dark/System choice exists.

The overview reuses one cached, cancelable complete patient projection. Four charts use status, API-computed age, last_visit and active notes_count. The monthly line means **patients by most recent recorded visit month**, not total appointments. Missing/earlier dates stay explicit. Failed/partial projections are not final totals; no hover request or per-patient detail fetch is required.

Use shared query-key helpers and actor-partition every response containing unread data, including patient detail. Mutations invalidate affected list/detail/notes/summary/discussion/notification projections. Comment changes never enter the clinical summary. Recoverable refetch failures preserve mounted drafts; terminal 401/403/404/410 patient reads discard exact actor/patient cached detail until a successful fetch restores access.

Error envelope: `{error:{code,message,fields:[{path,code,message}]}}`. Body paths such as `["body","conditions",0,"label"]` map to the matching form field. Unknown field errors stay visible at form level. Handle 401/403,404,409,410,422,503 explicitly; do not show raw server-error bodies. Abort is cancellation, not a failure toast. 204 is not parsed as JSON. Neither failed reads nor writes switch to demo fixtures.

Backend's post-OPR-003 source uses fixed actionable validation messages without echoing submitted values/context. Allergy consistency targets `["body","allergies"]`, with `Add at least one allergy when allergy status is reported.` or `Clear the allergy list or choose the reported allergy status.` The frontend preserves these messages in a focused summary and maps its link to the allergy-list control or status choice when the editor is closed. This source handoff is in `backend/tests/qa_faults/artifacts/20261120T190254373956Z-post-opr-final-checks-699f2c9a/handoff.json`; it does not imply the shared `8000` service was rebuilt. The final isolated candidate must verify the new wire responses together with browser recovery.

## Verification interface

From frontend/: `PLAYWRIGHT_LIVE_BASE_URL=<existing compiled API frontend> npm run e2e:live -- --workers=1`.

The live suite uses same-origin `/api`, discovers real actors, creates unique disposable records and cleans only their tracked UUIDs. It has no webServer or HTTP interception; desktop and touch-mobile projects retain failure artifacts under ignored `e2e-live/results/`. Infra separately verifies container restart/seed preservation. Demo (`e2e`) and intercepted HTTP (`e2e:api`) remain separate regression suites.

Current source and compiled-run results, including failures and remaining acceptance gates, belong in [frontend-updates.md](frontend-updates.md) and the coordinator's [master progress](../PROGRESS.md). No standalone unit or mocked HTTP pass establishes live PostgreSQL/browser acceptance.
