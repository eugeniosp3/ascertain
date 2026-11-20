# Model contract

Exact names for agents building endpoints, services, and the seed writer against the
PostgreSQL application model. The source of truth is [app/models.py](../app/models.py) and
[app/schemas/patient_details.py](../app/schemas/patient_details.py); the migration is
`alembic/versions/20261120_0001_initial_schema.py` and `alembic/versions/20261120_0002_patient_assignments.py` (head `20261120_0002`). Rationale and
the 76-field mapping are in [DATA_MODEL.md](DATA_MODEL.md).

Scope: patients only, plus users, clinical notes, note attachment links, discussion comments,
comment→note links, per-user discussion read markers, and seed markers. No prior-auth
requests, payer workflows, document checklists, or criteria.

Implementation handoff: all existing class, attribute, table, constraint, and index names
are preserved. Nullable imported JSONB columns now use `none_as_null=True`: assigning
Python `None` stores SQL NULL, so API-created profiles may explicitly omit all imported
context. `patients_source_provenance` also rejects JSON `null`, arrays, and scalars for
the three imported documents. Import writers continue to pass validated dictionaries.
Runtime seeding reads the DuckDB files directly using the paths from
`patient_data.settings.StageSettings`; `patient_data.seed` is an optional package prototype.
Run migration and integration checks against an owned disposable PostgreSQL database.
The shared development database is upgraded only during the coordinated infra cutover.
No source DuckDB file is opened for writes.

## Conventions

- Every table uses a `uuid` primary key `id`, except the link and read-marker tables, which use
  composite keys, and `patient_summaries`, whose primary key is its `patient_id` FK. The ORM default is `uuid.uuid4()` and the server default is `gen_random_uuid()`.
- Every timestamp is `timestamptz`, and the ORM uses `datetime` values with a timezone.
  `created_at` and `updated_at` default to `now()` on the server. The ORM sets `updated_at` to
  `now()` on every ORM UPDATE, and CHECK constraints require `updated_at >= created_at`.
- All constraint and index names are explicit and listed below. Map `IntegrityError` by
  constraint name, not by message text.
- JSONB columns are not mutation-tracked. Assign a new list or dict, for example
  `patient.allergies = [*patient.allergies, "Latex"]`. Never mutate the stored value in place.
- Identifiers such as source patient ID, MRN, postal code, phone, and ICD-10 codes are always
  text.
- Current age is never stored. Use `Patient.age_on(today)`. Sort by age with
  `date_of_birth` (youngest first means `date_of_birth DESC`).

## Shared types: `app.schemas.patient_details`

| Name | Definition |
| --- | --- |
| `PatientStatus`, `PATIENT_STATUSES` | `Literal["active", "inactive"]` |
| `BloodType`, `BLOOD_TYPES` | `Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]`; unknown is `None` |
| `AllergyStatus`, `ALLERGY_STATUSES` | `Literal["unknown", "no_known", "reported"]` |
| `NoteSourceType`, `NOTE_SOURCE_TYPES` | `Literal["manual", "seed"]` |
| `Condition` | `{code: str \| None, label: str}`; `code` is null for form-entered conditions |
| `SourceLineage` | `bronze_id: UUID`, `silver_id: UUID`, `source_row_number: int ≥ 1`, optional `export_id`, `source_file_id: UUID \| None`, optional `transformation_version: str \| None`. Store with `model_dump(mode="json", exclude_none=True)` |
| `ProfileDetails` | `identity: IdentityDetails`, `contact: ContactDetails`, `care_team: CareTeamDetails`, `coverage: CoverageDetails`, `clinical: ClinicalDetails`, `labs: LabsDetails`, `social: SocialDetails`. The field names match the source fields; see DATA_MODEL.md |
| `ClinicalDetails.medication_items` | A property that splits the `active_medications` source text on `;` and returns `list[str]` for display. Nothing is stored separately |

All shared models are frozen and reject extra keys. Decimals serialize to JSON as exact strings,
and dates serialize as ISO strings.

## ORM classes: `app.models`

Module constants: `DEFAULT_PATIENT_STATUS = "active"`, `DEFAULT_ALLERGY_STATUS = "unknown"`,
`DEFAULT_NOTE_TITLE = "Clinical note"`, `NOTE_TITLE_MAX_LENGTH = 80`,
`NOTE_CONTENT_MAX_LENGTH = 20000`, `COMMENT_BODY_MAX_LENGTH = 10000`,
`DISPLAY_NAME_MAX_LENGTH = 120`, `DISPLAY_ROLE_MAX_LENGTH = 80`, `SOURCE_URL_MAX_LENGTH = 2048`,
`PATIENT_ID_NAMESPACE`, and `seeded_patient_id(source_patient_id: str) -> UUID`, which is
uuid5 of the fixed namespace `ascertain:backend:patient:v1`. The seed must use
`seeded_patient_id` for imported patients. API-created patients get uuid4.

### `Patient` → `patients`

Editable columns (API create and update):

| Attribute | Type | Null | Default / notes |
| --- | --- | --- | --- |
| `first_name` | `String(100)` | no | must not be blank |
| `middle_initial` | `String(1)` | yes | |
| `last_name` | `String(100)` | no | must not be blank |
| `date_of_birth` | `Date` | no | |
| `phone` | `String(40)` | yes | seeded from mobile, otherwise home |
| `email` | `String(254)` | yes | |
| `address_line1` | `String(255)` | yes | |
| `address_line2` | `String(255)` | yes | null for all seeded patients |
| `city` | `String(100)` | yes | |
| `state` | `String(2)` | yes | |
| `postal_code` | `String(10)` | yes | text |
| `blood_type` | `String(3)` | yes | null means unknown; CHECK `patients_blood_type` |
| `status` | `String(16)` | no | `'active'`; CHECK `patients_status` |
| `last_visit` | `Date` | yes | seeded from the last PCP visit |
| `conditions` | `JSONB` (`list[dict]`) | no | `'[]'`; array of `Condition` |
| `allergies` | `JSONB` (`list[str]`) | no | `'[]'` |
| `allergy_status` | `String(16)` | no | `'unknown'`; CHECK `patients_allergy_consistency`: `reported` requires a non-empty list, other statuses require an empty list |

Server-owned or read-only columns:

| Attribute | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | `Uuid` | no | PK |
| `assigned_user_id` | `Uuid` | yes | FK `users.id` ON DELETE SET NULL; workload membership, server-owned, not an editable profile field |
| `mrn` | `Text` | yes | UNIQUE `patients_mrn_key`; null for API-created patients; do not accept it in create or update |
| `source_patient_id` | `Text` | yes | UNIQUE `patients_source_patient_id_key`; for example `PT-0001` |
| `seed_run_id` | `Uuid` | yes | FK `seed_runs.id` ON DELETE RESTRICT |
| `source_lineage` | `JSONB` (`dict`) | yes | `SourceLineage` |
| `source_record` | `JSONB` (`dict[str, str]`) | yes | Exact copy of the 76-field source row. **Deferred load**; never returned by ordinary APIs |
| `profile_details` | `JSONB` (`dict`) | yes | `ProfileDetails`; read-only imported context |
| `source_created_at`, `source_updated_at` | `DateTime(tz)` | yes | Source audit times, separate from the application's own times |
| `created_at`, `updated_at` | `DateTime(tz)` | no | Application times |

CHECK `patients_source_provenance` requires these seven columns to be either all null (an
API-created patient) or all non-null (an imported patient): `source_patient_id`, `seed_run_id`,
`source_lineage`, `source_record`, `profile_details`, `source_created_at`, `source_updated_at`.
When imported, the three JSONB documents must be JSON objects. Their field-level shape is
validated by the shared models and seed loader. For an API-created patient, explicit
`None` for these documents means SQL NULL, not JSON `null`.
Other checks: `patients_names`, `patients_status`, `patients_blood_type`,
`patients_allergy_status`, `patients_medical_arrays`, `patients_allergy_consistency`,
`patients_timestamps`.

Indexes: `ix_patients_name (last_name, first_name, id)`, `ix_patients_status (status, id)`,
`ix_patients_last_visit (last_visit, id)`, `ix_patients_date_of_birth (date_of_birth, id)`,
`ix_patients_assigned_user_id (assigned_user_id, id)`.

Relationships: `Patient.notes` → `list[Note]` and `Patient.comments` → `list[Comment]`. Both use
`cascade="all, delete-orphan"` and `passive_deletes=True`, so the database cascades the delete.
`Patient.seed_run` → `SeedRun | None`. Method: `age_on(on: date) -> int`.

List counts are not stored. Compute `notes_count` as notes where `deleted_at IS NULL`, which uses
the partial index `ix_notes_active_patient`. Compute `comments_count` as all comments for the
patient, which uses `ix_comments_patient_created`. Use correlated scalar subqueries or grouped
outer joins, and sort on the expressions.

### `User` → `users`

`id`, `display_name String(120)` (not null, must not be blank), `display_role String(80)`
(nullable; a display label such as "Physician", **not** a permission role),
`is_active Boolean` (default true), `created_at`, `updated_at`. Checks: `users_display_name`,
`users_display_role`, `users_timestamps`. Deactivate users; never delete one who has authored
content, because the FKs are RESTRICT.

### `Note` → `notes` (clinical note)

| Attribute | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | `Uuid` | no | PK; stable even after deletion |
| `patient_id` | `Uuid` | no | FK `patients.id` ON DELETE CASCADE |
| `author_id` | `Uuid` | no | FK `users.id` RESTRICT; the server sets it from the acting user |
| `title` | `String(80)` | yes* | ORM and server default `'Clinical note'` |
| `timestamp` | `DateTime(tz)` | no | Clinical time supplied by the client |
| `content` | `Text` | yes* | |
| `source_type` | `String(12)` | no | `'manual'`; seed fixtures use `'seed'` |
| `created_at`, `updated_at` | `DateTime(tz)` | no | |
| `deleted_at` | `DateTime(tz)` | yes | Tombstone marker |
| `deleted_by_id` | `Uuid` | yes | FK `users.id` RESTRICT |

\* CHECK `notes_content_or_tombstone`: an active note (`deleted_at IS NULL`) has a title and
content that contain a non-whitespace character. The title's column limits it to 80
characters, and the CHECK limits content to 20000 characters. A deleted
note has `title IS NULL AND content IS NULL`. CHECK `notes_deletion_actor`:
`(deleted_at IS NULL) = (deleted_by_id IS NULL)`. Other checks: `notes_source_type`,
`notes_timestamps`. UNIQUE `notes_id_patient_id_key (id, patient_id)` is the target for the
composite FK. Indexes: `ix_notes_patient_timestamp (patient_id, timestamp, id)`,
`ix_notes_active_patient (patient_id) WHERE deleted_at IS NULL`, `ix_notes_author (author_id)`.

To delete a note in one transaction, read the actor ID first, then run all of the following
inside `with session.no_autoflush:`: call `note.attachments.clear()`, then set
`deleted_at = func.now()`, `deleted_by_id = actor_id`, `title = None`, and
`content = None`. Then flush. Keep the row and its comment links. Without `no_autoflush`, a
lazy load can autoflush a half-built tombstone, and `notes_content_or_tombstone` rejects it
(this was verified). Lists, counts, and summaries exclude deleted notes. GET on a deleted note
returns 410. Only the author may edit or delete a note.

Relationships: `Note.patient`, `Note.author`, `Note.deleted_by`, and `Note.attachments` →
`list[NoteAttachment]` (ordered by `created_at`, cascade all/delete-orphan, passive deletes).
`Note.comment_links` → `list[CommentNoteLink]` is view-only. Property: `is_deleted`.

### `NoteAttachment` → `note_attachments`

Metadata for a link to an external file. Nothing is uploaded or fetched.

Columns: `id`, `note_id` (FK `notes.id` CASCADE), `added_by_id` (FK `users.id` RESTRICT),
`display_name String(255)` (not null, must not be blank), `source_url Text` (not null, must
start with `https://`, at most 2048 characters), `media_type String(100)` (nullable),
`source_description String(500)` (nullable), `created_at`. Checks:
`note_attachments_display_name`, `note_attachments_source_url`. Index:
`ix_note_attachments_note (note_id)`. Relationships: `NoteAttachment.note` and
`NoteAttachment.added_by`. Changes follow note ownership.

### `Comment` → `comments` (discussion; never input to the clinical summary)

Columns: `id`, `patient_id` (FK `patients.id` CASCADE), `author_id` (FK `users.id` RESTRICT),
`body Text` (not null; contains a non-whitespace character and is at most 10000 characters;
CHECK `comments_body`),
`created_at`, `updated_at` (CHECK `comments_timestamps`). The UI shows "Edited" when
`updated_at > created_at`. UNIQUE `comments_id_patient_id_key (id, patient_id)`. Indexes:
`ix_comments_patient_created (patient_id, created_at, id)` and `ix_comments_author (author_id)`.

Relationships: `Comment.patient` and `Comment.author`. `Comment.note_links` →
`list[CommentNoteLink]` is writable, cascades all/delete-orphan, and copies `comment_id` and
`patient_id` from the comment. `Comment.linked_notes` → `list[Note]` is view-only, ordered by
`Note.timestamp`, and **includes deleted notes**, which render as "Deleted note".

Only the author may edit or delete a comment. A comment is deleted physically, and its link
rows cascade with it.

### `CommentNoteLink` → `comment_note_links`

The columns `comment_id`, `note_id`, and `patient_id` are all not null. The PK is
`(comment_id, note_id)`. There are two composite FKs:
`comment_note_links_comment_fkey (comment_id, patient_id) → comments(id, patient_id)` and
`comment_note_links_note_fkey (note_id, patient_id) → notes(id, patient_id)`, both ON DELETE
CASCADE. Index: `ix_comment_note_links_note (note_id, patient_id)`. Together the FKs guarantee
that a comment and the notes it links belong to the same patient.

Create links like this: `comment.note_links = [CommentNoteLink(note_id=n.id) for n in notes]`.
The comment relationship fills in `patient_id`. Before inserting, the service must validate
that each note exists, belongs to the patient, and is not deleted, and must return 422
without saving a partial comment if any check fails. Links to notes that are already
deleted may stay when a comment is edited. Relationships: `CommentNoteLink.comment` and
`CommentNoteLink.note` (view-only).

### `DiscussionRead` → `discussion_reads`

One per-user read marker for each patient discussion.

Columns: `user_id` (FK `users.id` CASCADE), `patient_id` (FK `patients.id` CASCADE),
`last_read_at DateTime(tz)` (not null), `updated_at`. The PK is `(user_id, patient_id)`.
Index: `ix_discussion_reads_patient (patient_id)`. Relationships: `DiscussionRead.user` and
`DiscussionRead.patient`.

A comment counts as unread for user U on patient P when
`comment.author_id != U AND comment.created_at > coalesce(last_read_at, '-infinity')`. Edits
do not make a comment unread again. To mark comments read, upsert with
`last_read_at = GREATEST(existing, cutoff)`, where `cutoff` is the client's newest seen
`created_at` clamped to `now()`. The marker never moves backwards. A missing row means
nothing has been read.

### `PatientSummary` → `patient_summaries`

The latest LLM-written summary of one patient; at most one row per patient.

Columns: `patient_id` (PK `patient_summaries_pkey`; FK `patient_summaries_patient_id_fkey` →
`patients.id` CASCADE), `summary Text` (not null), `method Text` (not null; CHECK
`patient_summaries_method`: `method IN ('llm')`), `model Text` (nullable),
`facts_hash CHAR(64)` (not null; hex `sha256(model + FACTS)`), `generated_at DateTime(tz)`
(not null). No relationships. The summaries service upserts on `patient_id`
(`ON CONFLICT DO UPDATE`), reuses a row only while `facts_hash` matches the current FACTS,
and never stores template fallbacks. Migration `20261120_0003`.

### `SeedRun` → `seed_runs`

Columns: `id`, `dataset_key Text` (not null; UNIQUE `seed_runs_dataset_key_key`),
`dataset_date Date`, `source_hashes JSONB`, `export_manifest JSONB`, `row_counts JSONB` (all
not null), and `completed_at DateTime(tz)` (not null, default `now()`). The marker row is written in the same transaction
as the rows it describes. Patient datasets use keys that start with `patients-`. The demo
fixtures (users, notes, comments) should use a separate key, for example
`demo-fixtures-v1`. The `demo-assignments-v1` marker records the separate one-time synthetic workload assignment, preserving later changes on reruns. `export_manifest` holds the import's silver/bronze build document.
Relationship: `SeedRun.patients`
(view-only).

Runtime seeding uses `python -m app.seed`, which reads the stage files directly and
derives its target contract from the model metadata. It sets `allergy_status` explicitly:
all 100 source rows have an allergy value (68 `NKDA`, 32 reported). Both marker names and
the patient provenance names remain compatible with the optional `patient_data.seed`
JSONL prototype; that prototype is not part of backend startup.

## Historical initial-schema validation

On PostgreSQL 17, the initial revision was applied to the dedicated
`ascertain_backend_tests` database; `alembic check` reports no drift. A separate temporary
schema in the same database passed upgrade/downgrade/upgrade and exact catalog comparison
with `Base.metadata.create_all`: 44 constraints, 25 indexes (12 explicit and 13 backing
PK/unique constraints), and 73 columns. That temporary schema and its data were rolled back.

The ORM checks covered explicit null imported documents and API defaults; all 100 imported
profiles; deferred loading of the 76-field raw record; rejection of partial provenance,
JSON `null`, blank names/titles, inconsistent allergy status, and cross-patient note links;
author deletion restrictions; title/content tombstones with attachment cleanup and retained
comment links; active-note counts; patient deletion cascades; and a monotonic discussion-read
upsert. All 76 documented source mappings match the pipeline field list. All seven context
sections match the pipeline projection, and every source patient round-trips through the
shared typed JSON models. Ruff, strict mypy for the owned Python files, and mapper
configuration with warnings treated as errors pass. The parent owns final API, CLI, and
migration-suite integration tests.
