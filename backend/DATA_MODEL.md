# Backend data model

The PostgreSQL application model for the patient dashboard. It is implemented in
[app/models.py](app/models.py), shared value types are in
[app/schemas/patient_details.py](app/schemas/patient_details.py), and the initial Alembic
revision is `20261120_0001`. Exact class, attribute, and constraint names are listed in
[MODEL_CONTRACT.md](MODEL_CONTRACT.md). [schema.dbml](schema.dbml) is the diagram source.

**Scope:** the 100 patients in `patients_100.csv` (76 fields; snapshot 2026-11-18), together
with the application's own users, clinical notes, note attachment links, team discussion,
per-user discussion read markers, and seed markers. There are no prior-authorization
requests, payer workflows, document checklists, or criteria tables.

## Tables

| Table | One row | Key relationships |
| --- | --- | --- |
| `patients` | An editable patient profile, with optional read-only imported context | Has notes, comments, and read markers |
| `users` | An application actor (`display_name`, optional `display_role` label) | Authors notes, comments, and attachments |
| `notes` | A clinical note with a title, clinical `timestamp`, and content | Belongs to one patient and one author |
| `note_attachments` | Metadata for an external HTTPS file link | Belongs to one note |
| `comments` | A discussion message | Belongs to one patient and one author |
| `comment_note_links` | A reference from a comment to a note of the same patient | Composite FKs to both |
| `discussion_reads` | How far one user has read one patient's discussion | (user, patient) |
| `seed_runs` | A completed import, committed atomically with its rows | Imported patients point to it |

## Design decisions

**Columns for what the application edits, queries, and sorts.** The task's patient form and
list (name, DOB, contact, address, blood type, status, last visit, conditions, allergies) map
to typed columns. `conditions` (`[{code, label}]`) and `allergies` (`[str]`) are JSONB arrays
validated with Pydantic, because they are short lists that are always read with the patient.
A child table would add joins without enabling any query we need.

**Read-only imported context lives in one typed JSONB document.** The remaining 59 source
fields (demographics, care team, coverage on file, clinical flags, labs, social) are displayed
but never edited, filtered, or joined. They live in `patients.profile_details`, in seven
named sections whose field names are the source names, typed by `ProfileDetails`. Exact
decimals are stored as strings. Medications stay as the source's semicolon text
(`clinical.active_medications`). `ClinicalDetails.medication_items` splits that text for a
structured list view, without a medication table or any clinical parsing beyond the
separator.

**Provenance is separate and immutable.** `source_patient_id`, `source_lineage`
(`bronze_id`, `silver_id`, `source_row_number`, `export_id`, `source_file_id`, and
`transformation_version` for the direct DuckDB import), `source_record` (all 76 original strings,
including blanks), `seed_run_id`, and the source audit times `source_created_at` and
`source_updated_at` are written once by the seed. Patient edits never touch them, and the
ordinary API never returns `source_record`, which is loaded on demand. The CHECK
`patients_source_provenance` requires these seven columns to be either all SQL NULL (an
API-created patient) or all set (an imported patient), with the three JSONB documents
stored as objects. Nullable JSONB uses `none_as_null=True`, so explicit Python `None`
has the same meaning as an omitted imported document. The application's own `created_at` and
`updated_at` track application changes only.

**Identity.** Primary keys are UUIDs. An imported patient's UUID is
`seeded_patient_id(source_patient_id)`, a uuid5 in the fixed backend namespace
`ascertain:backend:patient:v1`. It is independent of file checksums and data-stage UUIDs, so
rebuilding the pipeline does not change application identity. API-created patients get
uuid4. Every identifier (source patient ID, MRN, NPI, member IDs, postal codes, phones,
ICD-10 codes) is text, so leading zeros survive. `mrn` is unique, server-owned, and null for
patients created through the API.

**No stored age or counts.** Current age comes from `date_of_birth` (`Patient.age_on`); the
source `age_years` is retained only as snapshot context. `notes_count` (notes that are not
deleted) and `comments_count` are computed per list query. A partial index on active notes
and the `(patient_id, created_at, id)` comment index make these counts cheap and sortable at
this scale.

**Explicit unknowns and defaults.** The source has no blood type, so `blood_type` is NULL,
meaning unknown; it is never guessed. The source has no dashboard status, so `status`
defaults explicitly to the application value `active` (allowed: `active`, `inactive`).
`address_line2` is null. `allergy_status` separates `no_known` (`NKDA`), `unknown` (blank),
and `reported` (the source text kept whole). A CHECK keeps the status consistent with the
list. `has_diabetes = "None"` is a category, not a null.

**Clinical notes and discussion are separate.** Notes are clinical content and feed the
summary. Comments are team discussion and never do. A comment can reference several notes
through `comment_note_links`. The link table carries `patient_id`, and its composite FKs to
`notes(id, patient_id)` and `comments(id, patient_id)` make cross-patient references
impossible in the database, not just in the service. Links are stable because note IDs are
never reused or removed while the patient exists.

**Note titles.** The UI lists notes by title (at most 80 characters). The task's
`POST /patients/{id}/notes` only requires timestamp and content, so `title` defaults to
`Clinical note` in both the ORM and the server, and existing clients keep working.

**Authors.** `users` are stable actors with `display_name` and an optional `display_role`.
The role is only a label shown next to a name, such as "Physician"; it grants no
permissions. The server derives the author from the acting user, never from the request
body, and never from PCP names in the source. Users are deactivated, not deleted (the FKs
are RESTRICT).

**Unread discussion.** The mock's notifications are per-user unread comment counts, and
opening a patient's Discussion marks them read. `discussion_reads(user_id, patient_id,
last_read_at)` stores a creation-time cutoff. A comment is unread for a user when someone
else wrote it and its `created_at` is after the cutoff. Edits do not make it unread again.
Marking comments read upserts `GREATEST(existing, cutoff)` with the cutoff clamped to
`now()`, so the marker never moves backwards. There are no per-comment receipts and no
general notification system.

**Explicit constraint names** throughout, so services can translate `IntegrityError` by
name and future migrations stay reviewable.

## Deletion and integrity

| Operation | Behavior |
| --- | --- |
| Delete a patient | Physical delete. The database cascades notes, attachment metadata, comments, links, and read markers. Users and seed markers remain. The seed marker prevents startup from recreating the patient |
| Delete a note | Tombstone: in one flush, set `deleted_at`, `deleted_by_id`, `title = NULL`, and `content = NULL`, and delete its attachment rows (CHECKs enforce the tombstone shape). The row, ID, author, and timestamps remain, and comment links keep pointing at it. Lists, counts, and summaries exclude it, and GET returns 410 |
| Delete a comment | Physical delete; its link rows cascade |
| Remove an attachment | Delete the metadata row only; the external file is never touched |
| Delete a user | Not supported. Deactivate with `is_active = false` |

Only the author may edit or delete a note or comment. Attachment changes follow note
ownership. Every nested endpoint resolves the parent patient first, and a child of another
patient returns 404. A comment that references a missing, deleted, or other-patient note is
rejected as a whole.

## Seeding

The runtime command `python -m app.seed` reads the DuckDB stage files directly, using
`patient_data.settings.StageSettings` for default paths:
`data/assets/silver/silver.duckdb` (clean values) and
`data/assets/bronze/bronze.duckdb` (lineage). It opens both files read-only; optional JSONL
exports are not runtime input. It writes one patient `seed_runs` marker and all 100 patients
in one transaction. For each patient it maps the fields as in the table below, builds
`profile_details` with `ProfileDetails`, and stores `source_lineage` from silver
`silver_id`/`bronze_id`/`transformation_version`, bronze `source_row_number`, and
`source_file_id`, plus the import's `export_id`. `source_record` holds all 76 original
strings from silver's raw columns, validated against bronze. `source_hashes` maps
the source path to its SHA-256, and `export_manifest` holds the build document (silver
`build_metadata`, bronze `source_files`, and rule versions).

These names stay compatible with the optional `patient_data.seed` package prototype:
`seed_runs(id, dataset_key, dataset_date, source_hashes, export_manifest, row_counts, completed_at)` and
`patients(source_patient_id, seed_run_id, source_lineage)`. The prototype is not the backend
runtime command. Its four-key lineage (`export_id`, `silver_id`, `bronze_id`,
`source_row_number`) remains accepted by `SourceLineage`. Patient datasets use keys that
start with `patients-`. The demonstration users, notes (`source_type = 'seed'`), and comments
are application fixtures with fixed IDs and their own marker key (for example
`demo-fixtures-v1`). They are never derived from patient data.

## Complete source mapping (76 fields)

**Ordinary** fields become application profile columns or lists (MRN remains server-owned).
**Context** fields become read-only
`profile_details` sections. **Provenance** fields are source identity and audit times. Every
field is also kept verbatim in `source_record`, and the full raw/clean pairs remain in the
DuckDB files.

**Identity** (15)

| Source field | Kind | Destination |
| --- | --- | --- |
| `patient_id` | provenance | `source_patient_id` |
| `mrn` | ordinary | `mrn` |
| `first_name` | ordinary | `first_name` |
| `middle_initial` | ordinary | `middle_initial` |
| `last_name` | ordinary | `last_name` |
| `date_of_birth` | ordinary | `date_of_birth` |
| `age_years` | context | `profile_details.identity.age_years` |
| `sex_at_birth` | context | `profile_details.identity.sex_at_birth` |
| `gender_identity` | context | `profile_details.identity.gender_identity` |
| `race` | context | `profile_details.identity.race` |
| `ethnicity` | context | `profile_details.identity.ethnicity` |
| `preferred_language` | context | `profile_details.identity.preferred_language` |
| `interpreter_needed` | context | `profile_details.identity.interpreter_needed` |
| `marital_status` | context | `profile_details.identity.marital_status` |
| `employment_status` | context | `profile_details.identity.employment_status` |

**Contact** (10)

| Source field | Kind | Destination |
| --- | --- | --- |
| `address_line1` | ordinary | `address_line1` |
| `city` | ordinary | `city` |
| `state` | ordinary | `state` |
| `zip` | ordinary | `postal_code` |
| `home_phone` | ordinary | `phone` fallback + `profile_details.contact.home_phone` |
| `mobile_phone` | ordinary | `phone` (preferred) + `profile_details.contact.mobile_phone` |
| `email` | ordinary | `email` |
| `emergency_contact_name` | context | `profile_details.contact.emergency_contact_name` |
| `emergency_contact_relationship` | context | `profile_details.contact.emergency_contact_relationship` |
| `emergency_contact_phone` | context | `profile_details.contact.emergency_contact_phone` |

**Care team and registration** (5)

| Source field | Kind | Destination |
| --- | --- | --- |
| `pcp_name` | context | `profile_details.care_team.pcp_name` |
| `pcp_npi` | context | `profile_details.care_team.pcp_npi` |
| `pcp_last_visit_date` | ordinary | `last_visit` (last PCP visit) |
| `home_facility_key` | context | `profile_details.care_team.home_facility_key` |
| `first_registered_date` | context | `profile_details.care_team.first_registered_date` |

**Coverage on file** (9)

| Source field | Kind | Destination |
| --- | --- | --- |
| `primary_payer_name` | context | `profile_details.coverage.primary_payer_name` |
| `primary_line_of_business` | context | `profile_details.coverage.primary_line_of_business` |
| `primary_plan_name` | context | `profile_details.coverage.primary_plan_name` |
| `primary_plan_type` | context | `profile_details.coverage.primary_plan_type` |
| `primary_member_id` | context | `profile_details.coverage.primary_member_id` |
| `primary_group_number` | context | `profile_details.coverage.primary_group_number` |
| `primary_coverage_effective_date` | context | `profile_details.coverage.primary_coverage_effective_date` |
| `secondary_payer_name` | context | `profile_details.coverage.secondary_payer_name` |
| `secondary_member_id` | context | `profile_details.coverage.secondary_member_id` |

**Clinical profile** (22)

| Source field | Kind | Destination |
| --- | --- | --- |
| `primary_clinical_story` | context | `profile_details.clinical.primary_clinical_story` |
| `height_cm` | context | `profile_details.clinical.height_cm` |
| `weight_kg` | context | `profile_details.clinical.weight_kg` |
| `bmi` | context | `profile_details.clinical.bmi` |
| `smoking_status` | context | `profile_details.clinical.smoking_status` |
| `alcohol_use` | context | `profile_details.clinical.alcohol_use` |
| `problem_list_icd10` | ordinary | `conditions[].code` |
| `problem_list_text` | ordinary | `conditions[].label` |
| `has_hypertension` | context | `profile_details.clinical.has_hypertension` |
| `has_diabetes` | context | `profile_details.clinical.has_diabetes` |
| `has_ckd` | context | `profile_details.clinical.has_ckd` |
| `has_copd` | context | `profile_details.clinical.has_copd` |
| `has_heart_failure` | context | `profile_details.clinical.has_heart_failure` |
| `has_cad` | context | `profile_details.clinical.has_cad` |
| `has_afib` | context | `profile_details.clinical.has_afib` |
| `has_osa` | context | `profile_details.clinical.has_osa` |
| `has_depression` | context | `profile_details.clinical.has_depression` |
| `has_obesity` | context | `profile_details.clinical.has_obesity` |
| `has_cancer_history` | context | `profile_details.clinical.has_cancer_history` |
| `charlson_comorbidity_index` | context | `profile_details.clinical.charlson_comorbidity_index` |
| `active_medications` | context | `profile_details.clinical.active_medications` |
| `drug_allergies` | ordinary | `allergies` + `allergy_status` |

**Recent labs and utilization** (8)

| Source field | Kind | Destination |
| --- | --- | --- |
| `last_labs_date` | context | `profile_details.labs.last_labs_date` |
| `last_hba1c_pct` | context | `profile_details.labs.last_hba1c_pct` |
| `last_egfr` | context | `profile_details.labs.last_egfr` |
| `last_creatinine_mg_dl` | context | `profile_details.labs.last_creatinine_mg_dl` |
| `last_ldl_mg_dl` | context | `profile_details.labs.last_ldl_mg_dl` |
| `last_hemoglobin_g_dl` | context | `profile_details.labs.last_hemoglobin_g_dl` |
| `hospitalizations_12mo` | context | `profile_details.labs.hospitalizations_12mo` |
| `ed_visits_12mo` | context | `profile_details.labs.ed_visits_12mo` |

**Social and administrative** (5)

| Source field | Kind | Destination |
| --- | --- | --- |
| `housing_status` | context | `profile_details.social.housing_status` |
| `transportation_barrier` | context | `profile_details.social.transportation_barrier` |
| `advance_directive_on_file` | context | `profile_details.social.advance_directive_on_file` |
| `code_status` | context | `profile_details.social.code_status` |
| `pa_request_count` | context | `profile_details.social.pa_request_count` |

**System audit fields** (2)

| Source field | Kind | Destination |
| --- | --- | --- |
| `created_at` | provenance | `source_created_at` |
| `updated_at` | provenance | `source_updated_at` |

Totals: 16 ordinary (`home_phone` and `mobile_phone` also appear in context), 57 context
only, and 3 provenance. `age_years` and `pa_request_count` are snapshot context only. Age is
computed from DOB, and there is no request relationship or live request count.

## Source caveats

- `pcp_last_visit_date` is the last PCP visit, not the latest encounter anywhere.
- Every source row has a value in `drug_allergies` (68 are `NKDA`), so seeded patients are
  `no_known` or `reported`. `unknown` remains the default for patients created through the API.
- Problem codes and descriptions are semicolon-paired lists, and data rejects unequal
  lengths. Narratives may contain semicolons, so only `active_medications` is split, and only
  for display.
- Seeded patients all have `state = OH` and five-digit ZIP codes. `postal_code` allows
  ZIP+4 for patients created through the API.
