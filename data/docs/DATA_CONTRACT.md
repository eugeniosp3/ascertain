# Patient data contract

**Current handoff:** backend reads `data/assets/bronze/bronze.duckdb` and `data/assets/silver/silver.duckdb` directly. JSONL exports are optional inspection artifacts. PostgreSQL seeding is owned by backend.

Implemented data contract for [patients_100.csv](../../reference/prior-auth-pack/data/patients_100.csv) only. The current export contract is `patient-export-v2`, with transformation rules `patient-rules-v1`. The optional JSONL patient projection is versioned separately from backend's approved direct-DuckDB import. Source code lives under `data/src/patient_data/`, with reusable abstractions in `utils/`; see [IMPLEMENTATION.md](IMPLEMENTATION.md).

## Files and tables

| File | Tables | Contents |
| --- | --- | --- |
| `data/assets/bronze/bronze.duckdb` | `main.source_files`, `main.patients` | One source metadata row and all original patient rows |
| `data/assets/silver/silver.duckdb` | `main.build_metadata`, `main.patients` | One build metadata row and the corresponding cleaned patients |

Each file contains one selected patient snapshot. Keep the original CSV unchanged. Build a replacement file in a temporary location, validate it, detach/close readers and writers, then promote it. Failed builds leave the previous valid file intact. Silver opens bronze read-only.

The [DBML](schema.dbml) uses file names as logical namespaces. Its cross-file references describe lineage checks performed with queries; they are not physical foreign keys between DuckDB files.

## Identity

Keep the original `patient_id` string, the pipeline UUIDs, and the application's patient UUID separate.

Use UUIDv5 namespaces derived from UUID's standard URL namespace and the fixed names `ascertain:data:source_file:v1`, `ascertain:data:bronze:v1`, `ascertain:data:silver:v1`, and `ascertain:data:export:v1`. Serialize each namespace's input as a compact UTF-8 JSON array of strings in the following order:

| Identifier | Inputs |
| --- | --- |
| `source_file_id` | Repository-relative patient CSV path, SHA-256 of its original bytes |
| `bronze_id` | Source-file ID, one-based parsed CSV data-record number |
| `silver_id` | Bronze ID, transformation version |
| `export_id` | Patient source-file ID, transformation version, patient export-contract version |

Use lowercase UUID strings and base-10 record numbers. Record numbers exclude the header and count parsed records, not physical lines. Row checksums hash the ordered original string values serialized in the same compact JSON form. The physical input now lives under `reference/`; the stable identity label remains `prior-auth-pack/data/patients_100.csv` so this folder move does not change existing UUIDs.

The silver UUID differs from bronze, but unchanged inputs and rule versions reuse both IDs. Export lineage also carries `source_row_number`, the original one-based CSV record position, so the loader can re-derive bronze identity and check complete row coverage. Export order is by patient key, not necessarily original row position. A changed source may produce new lineage; backend must derive application identity from its own fixed namespace and source patient ID, independently of file checksums and stage UUIDs.

## Source preservation and cleaning

Bronze retains all 76 original fields as text, in source order, including empty strings. Silver places `<field>_raw` immediately before `<field>_clean` for every field, even when values are unchanged. Stage metadata comes first.

| Source kind | Silver type | Handling |
| --- | --- | --- |
| String, code, enum, text | `VARCHAR` | Preserve content; any normalization must be explicitly assigned to that field |
| Integer | `BIGINT` | Require a complete integer value |
| Decimal | `DECIMAL(18,6)` | Preserve exact value and units; reject overflow or excess nonzero fractional digits |
| Date | `DATE` | Parse complete `YYYY-MM-DD` values |
| Datetime | `TIMESTAMPTZ` | Parse the documented UTC instant |
| Flag | `BOOLEAN` | Map `Y`/ `N` to true/false; reject other nonblank values |

Empty strings become typed null only for the fields declared optional in `patient_rules.py`: middle initial, home/mobile phones, primary group number, secondary payer/member ID, active medications, and drug allergies. Other blanks fail validation. A failed cast is an error, not a valid null. Keep `None` as a diabetes category, `NKDA` as a meaningful allergy value, and unknown information separate from zero or false.

Preserve MRNs, postal codes, phone numbers, and diagnosis codes as text. Keep clinical narratives and units intact. Silver keeps list-valued source columns as strings; export projections create the application's arrays.

Retain `age_years` as age at the source snapshot date and `pa_request_count` as supplied historical context. Neither is recomputed from excluded datasets. Current application age is calculated from birth date.

## Patient export

Produce only `patients.jsonl` and `manifest.json`. The JSONL file has 100 records, sorted by source patient ID, with UTF-8 encoding and a final newline. Each line contains exactly:

- `lineage`: `export_id`, `silver_id`, `bronze_id`, and integer `source_row_number`.
- `record`: normalized patient fields, typed `profile_details`, source audit timestamps, and the complete original all-string `source_record`.

Use ISO dates, UTC timestamps ending in `Z`, JSON booleans/nulls, and exact decimal strings. Do not route decimals through binary floating point or export processing times as application audit times.

The optional JSONL projection follows the early patient mapping and remains labelled `provisional` in its manifest. Backend's authoritative mapping is [DATA_MODEL.md](../../backend/docs/DATA_MODEL.md), implemented by its direct-DuckDB reader. The relevant source mappings are:

| Source | Patient export |
| --- | --- |
| `patient_id` | `source_patient_id`; backend assigns its application UUID |
| Name, birth date, MRN, email, address fields | Corresponding patient fields; `zip` becomes `postal_code` |
| Mobile/home phone | Prefer nonblank mobile for `phone`; retain both in source context |
| `pcp_last_visit_date` | `last_visit`, explicitly a PCP visit |
| Paired condition codes/descriptions | Ordered condition objects; reject mismatched list lengths |
| `drug_allergies` | Allergy list plus status: no known, unknown, or reported |
| `created_at`, `updated_at` | Source audit timestamps, separate from application creation/edit times |
| Other patient fields | Agreed typed profile sections or immutable source snapshot, with all fields retained in DuckDB |

Unknown blood type and absent address line 2 stay null. Initial dashboard status is the documented synthetic default `active`. Do not infer clinical facts or manufacture notes, comments, or authors. Backend supplies its own demonstration fixtures.

## Manifest and repeatability

Use `dataset_key = patients-<dataset-date>-<export-id>` for both the export directory and the backend seed marker. The source snapshot date is `2026-11-18`.

The manifest records that key, export ID, dataset date, transformation/contract/UUID-namespace versions, the one source path/checksum/source-file ID, 100 source rows, 76 source columns, the patient export checksum/count, and validation results.

Publish a complete temporary package to `data/assets/exports/<dataset-key>/` only after validation passes. Reuse an existing package when identity and content match; differing content under the same identity is an error. Changes to field rules or export mapping advance their version. Processing timestamps do not affect deterministic payloads. Version 2 adds original row numbers and verifies bronze UUID derivation; the earlier generated v1 package is outside the active export directory and is not supported by the v2 loader.

## Backend and infra handoff

Backend's [DuckDB reader](../../backend/app/utils/duckdb_source.py) attaches both stage files read-only, validates them with the shared data checks, maps stored clean values to `ImportedPatient`, and retains source strings and lineage. It does not call the CSV cleaner or depend on an optional export.

The backend-owned command is `python -m app.seed`, implemented by [app.seed](../../backend/app/seed.py) and [services/seeding.py](../../backend/app/services/seeding.py). That service owns migration/schema readiness, required columns/types/constraints/permissions, transaction settings, import locks, patient inserts, fixture/assignment steps, and durable completion markers.

The shared `DatabaseInspector` and `TargetContract` remain in this data package because the real backend imports them. Their schema checks are reusable; they are not another seeding implementation.

Infra builds the snapshots from the committed source during image construction, then runs Alembic followed by `app.seed` before starting the API when initialization is enabled. Repeated imports preserve application edits and deletions; failures or conflicting source versions are handled by backend's seed contract. See the [backend runbook](../../backend/README.md) for command configuration and acceptance tests.
