# API contract for the patient UI

The implemented contract supports [the patient workspace mock](../../frontend/docs/ui-mocks/index.html) and the selected patient-dashboard requirements. Backend paths have no `/api` prefix. The frontend proxy strips `/api` before forwarding. The running API's `/openapi.json` is the authoritative machine-readable schema.

## Identity and shared formats

IDs are application UUID strings. `source_patient_id` and `mrn` are separate display/search identifiers, preserved as text. Dates are `YYYY-MM-DD`; timestamps are timezone-aware ISO 8601. Display timestamp instants in the viewer's timezone, but preserve date-only values without timezone conversion.

`GET /users` returns active demo users with `id`, `display_name`, and nullable `display_role`. Send the chosen UUID as `X-Demo-User-ID`. This is a synthetic demo selector, not a login. Notes, comments, attachments, read acknowledgments, and notification totals require an actor. Patient reads/writes support the demo without a selected actor; an invalid supplied actor is rejected. Data routes fail closed when demo identity is disabled.

Errors use `{error: {code, message, fields: [{path, code, message}]}}`. Paths are arrays such as `["body", "date_of_birth"]`. Handle 401/403, 404, 409, 410, 422, and 503 explicitly; unexpected failures return a generic 500. A 204 has no response body.

Validation messages come from a fixed public catalog and never echo submitted values or exception context. Phone/email errors describe the required format; future dates and clinical timestamps explain the time restriction. Allergy consistency errors target `["body", "allergies"]` so the form can show how to fix the list or status. Each operation declares its applicable failure statuses with the shared `ErrorResponse` schema in OpenAPI, including its 422 response.

## Patients and overview

| Endpoint | Behavior |
| --- | --- |
| `GET /patients` | `{items, total, page, page_size}`; search/filter/sort before pagination |
| `GET /patients/{patient_id}` | Current profile, counts, typed source context, and source audit/lineage fields; excludes `source_record` |
| `POST /patients` | 201 with saved detail and `Location`; name and DOB required |
| `PUT /patients/{patient_id}` | Full replacement of all editable fields; nullable values must be explicitly supplied |
| `DELETE /patients/{patient_id}` | 204; cascades owned notes, comments, links, attachments, and read state |
| `GET /dashboard/overview` | `{totals, recent_visits, no_visit_patients}`; each preview has at most six patients |

Patient list parameters: `page >= 1`, `page_size` 1–100 (default 20), `q`, optional `status`, `sort_by`, `order`, and `unread_only`. Search includes first/last/full names, MRN, source ID, UUID, and email. Supported sorts are `name`, `dob`, `last_visit`, `status`, `notes_count`, and `comments_count`; `notes`/`comments` are aliases. Order is `asc` or `desc`, with a stable UUID tie-break and null visits last. Age sorting reverses DOB direction.

Each row includes `id`, read-only nullable `assigned_user_id`, `source_patient_id`, `mrn`, names, `date_of_birth`, computed `age`, `last_visit`, `status`, `conditions`, `notes_count`, `comments_count`, and `unread_comments_count`. Note counts exclude tombstones. Without an actor, unread counts are zero; `unread_only=true` requires an actor.

Editable patient fields are `first_name`, `middle_initial`, `last_name`, `date_of_birth`, `phone`, `email`, `address_line1`, `address_line2`, `city`, `state`, `postal_code`, `blood_type`, `status`, `last_visit`, `conditions`, `allergies`, and `allergy_status`. Conditions are `{code: string|null, label: string}` objects; allergies are strings. Allergy states are `unknown`, `no_known`, and `reported`; only `reported` has a nonempty allergy list.

Dashboard totals are `patients`, `active`, `inactive`, `clinical_notes`, and `no_visit`. These span the requested scope (`global` by default, or `assigned` for the selected actor); do not derive them from one patient page. The seed uses `active` as an explicitly documented default and null blood type, so totals differ from the mock's invented 70/30 status distribution.

## Assigned workload

`GET /patients?assigned_to=me` requires a valid selected actor and restricts the cohort before total, filters, sorting, and pagination. Omit `assigned_to` to browse all patients. Only `me` is accepted; missing actor returns 401 and invalid filter values return 422. The page envelope is unchanged.

`GET /dashboard/overview?scope=assigned` uses the same cohort for every total and preview, including active clinical notes belonging to assigned patients. `scope=global` (the default) retains the all-patient overview. Responses include `scope: "global" | "assigned"` and `assigned_user: {id, display_name, display_role} | null`; the global scope returns null. Previews also expose `assigned_user_id`. An empty assigned cohort has zero totals and empty previews.

POST assigns the selected actor server-side, or null when no actor is selected. PUT preserves assignment; neither write body accepts `assigned_user_id`. Assignment grants no additional access restrictions or permissions. Notes/comments still use their own authors, and notifications remain the actor’s unread comments across all patients.

For charts, fetch one complete paged assigned projection keyed by actor and scope, then use that same collection for all charts and recent patients. Label it `Assigned to <display_name>` and `<N> assigned patients`. Keep the directory global and the notification bell separately labelled. [ASSIGNMENTS.md](ASSIGNMENTS.md) defines the deterministic synthetic seed and cutover.

## Clinical notes and external source links

| Endpoint | Behavior |
| --- | --- |
| `GET /patients/{patient_id}/notes` | Array of active notes, newest clinical timestamp first |
| `POST /patients/{patient_id}/notes` | 201 from `{timestamp, content, title?}`; title defaults to `Clinical note` |
| `GET /patients/{patient_id}/notes/{note_id}` | Openable detail; deleted notes return 410 |
| `PUT /patients/{patient_id}/notes/{note_id}` | Author replaces title, clinical timestamp, and content |
| `DELETE /patients/{patient_id}/notes/{note_id}` | Author creates a content-free tombstone; existing comment links remain identifiable |
| `POST /patients/{patient_id}/notes/{note_id}/attachments` | Author adds HTTPS URL metadata |
| `DELETE /patients/{patient_id}/notes/{note_id}/attachments/{attachment_id}` | Author removes metadata only |
| `GET /patients/{patient_id}/summary` | `{patient_id, summary, generated_at, method: "template"}` |

Notes return `author`, clinical `timestamp`, application `created_at`/`updated_at`, and `attachments`. Titles are at most 80 characters; note content at most 20,000. Clinical timestamps must include a timezone and cannot be in the future. These canonical API/storage limits supersede smaller specimen form limits in the HTML mock.

Attachment input is `{display_name, source_url, media_type?, source_description?}`. URLs must be HTTPS without embedded credentials. The application stores a reference; it neither uploads nor fetches the external file. No attachment files came with the dataset.

Summaries use current editable profile facts and active clinical notes. They exclude discussion comments and deleted notes and require no external API key.

## Discussion and notifications

| Endpoint | Behavior |
| --- | --- |
| `GET /patients/{patient_id}/comments` | Chronological page with `items`, `total`, `page`, `page_size`, `read_through`, and `next_cursor` |
| `POST /patients/{patient_id}/comments` | 201 from `{body, note_ids?}`; server derives author |
| `PUT /patients/{patient_id}/comments/{comment_id}` | Author replaces body and note IDs atomically |
| `DELETE /patients/{patient_id}/comments/{comment_id}` | Author removes the comment and its links |
| `POST /patients/{patient_id}/comments/read` | Actor acknowledges `{through}`; watermark advances monotonically |
| `GET /notifications/summary` | `{unread_comments, patients_with_unread}` for the actor |

Comments return author information, creation/edit timestamps, viewer-specific `is_unread`, and `note_links` with `id`, `title`, `label`, `timestamp`, `url`, and `is_deleted`. Body limit is 10,000 characters. References must be distinct notes belonging to the same patient. New links to deleted notes fail; an existing tombstone link can remain when its comment is edited.

`is_unread` is true only for another user's comment created strictly after the viewer's read watermark for this patient; an absent watermark means none have been read. Own comments and anonymous reads return false. Authored POST/PUT responses return false for the current author. Editing uses the original creation time and does not change read state. Use the flag for each comment's New badge; do not infer it from aggregate counts. GETs never advance a watermark.

To display a discussion safely:

1. Fetch the first page with the desired `page_size` and display its items oldest first.
2. After display, acknowledge that response's `read_through` value. GETs do not change read state.
3. Fetch each following page using `cursor=next_cursor`; treat the cursor as opaque. `null` means the snapshot is complete.
4. Acknowledge each displayed prefix. New arrivals after the snapshot stay unread; refresh the first page to fetch them.

Cursor pagination remains stable if earlier comments are deleted. Equal-timestamp groups remain unread until their full group has been fetched. Legacy offset pages after page 1 return a non-advancing `read_through` and no cursor; use cursor continuation for unread-aware UI. Very large out-of-range page numbers return an empty page.

Only comments from other users created after the read watermark count as unread. Edits do not make old comments unread again. The server clamps future acknowledgment timestamps to database time; it never moves a watermark backward.

## Frontend refreshes

After patient writes, refresh affected detail/list/dashboard queries. After note changes, refresh notes, summary, list/dashboard counts, and linked comment chips. After comment changes or read acknowledgments, refresh discussion, patient counts, unread-filter results, and notification totals. Keep clinical notes and team discussion visually separate, as in the mocks.

Include the viewer's user ID in query keys for unread-sensitive data, or invalidate that data when the demo identity changes, so one user's read state is never shown as another's.
