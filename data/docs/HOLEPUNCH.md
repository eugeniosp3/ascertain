# Patient data checklist

**Current handoff:** bronze and silver are ready and retained as project files. The next database-seeding task will read the DuckDB files directly; the package-based seed checks below describe the existing prototype.

Scope: [patients_100.csv](../../reference/prior-auth-pack/data/patients_100.csv) only — 100 fictional patients and 76 source fields.

Checked items have implementation and verification evidence. PostgreSQL behavior below was verified against a disposable PostgreSQL 16 fixture with a test writer; it is not a completed integration with backend's deferred application schema.

## Organize the implementation

- [x] Put code under `data/src/patient_data/`, with tests, DuckDB files, and exports outside `src`.
- [x] Create `utils/` for reusable transformations, check reports, database inspection, and UUID/hash helpers.
- [x] Define `FieldRule` and `RowTransformer`, with patient-specific mappings in `patient_rules.py`.
- [x] Use typed Pydantic models, `CheckResult`, `CheckReport`, and `DatabaseInspector`.
- [x] Add the public seed command with a shared backend-writer interface instead of another production insertion implementation.
- [x] Lock dependencies and configure Ruff, formatting, strict mypy, pytest, and package builds.

## Define the patient contract

- [x] Define all 76 source fields, types, units, null rules, and their current export destinations.
- [x] Keep stage UUIDs separate from original source identifiers and application identity.
- [x] Produce one patient export and manifest without dependencies on other source datasets.
- [x] Include original source row numbers and verify source-file/row-derived bronze UUIDs in export contract v2.
- [ ] Agree the provisional application projection and absent-field defaults with backend before enabling real writes.

## Build bronze.duckdb

- [x] Create `data/assets/bronze/bronze.duckdb` with original patient rows and source metadata.
- [x] Preserve all 100 rows and 76 fields, including source order, text values, blanks, and leading zeros.
- [x] Record the filename, file checksum, dataset date, parsed row number, and row checksum.
- [x] Give every source row a reproducible UUID, with distinct identities for different source positions.
- [x] Reuse an unchanged stage without duplicates or changed bytes.
- [x] Validate a temporary database before replacing an existing file, leaving the CSV unchanged.

## Build silver.duckdb

- [x] Build `data/assets/silver/silver.duckdb` from a read-only bronze connection.
- [x] Give each patient a distinct silver UUID while retaining the bronze UUID and source patient ID.
- [x] Keep all 76 original/clean pairs adjacent and in source order.
- [x] Parse dates, UTC timestamps, exact decimals, integers, and Y/N flags through field rules.
- [x] Preserve identifiers as text and distinguish meaningful categories, blanks, zero, and false.
- [x] Preserve clinical text and units; report explicit rule violations without inventing clinical corrections.
- [x] Store the selected source version and transformation version in silver.
- [x] Leave the previous silver file intact on transformation failure and report row/field errors.

## Query and validate the stages

- [x] Open each file independently and verify its tables and columns.
- [x] Query timestamp columns directly through the locked DuckDB Python environment.
- [x] Attach both files and reconcile all 100 patients, 76 fields, and distinct linked UUIDs.
- [x] Check unique patient IDs/MRNs, date ordering, snapshot age, and paired condition lists.
- [x] Preserve `pa_request_count` as source context without importing another dataset.
- [x] Verify unchanged inputs reproduce identities and byte-identical export payloads.
- [x] Exercise malformed values, blanks, duplicate IDs, failed builds, and modified packages.
- [x] Confirm the original CSV checksum remains unchanged.

## Check readiness before seeding PostgreSQL

- [x] Validate configuration, checksums, versions, 76-field source records, unique source IDs, original row positions, and the 100-patient count.
- [x] Authenticate and execute a database query with finite connection/query timeouts.
- [x] Check the explicit schema, supported Alembic revision, and actual `patients`/`seed_runs` tables.
- [x] Compare target columns with the writer's contract for presence, types, nullability, and defaults.
- [x] Detect unsupplied required columns while allowing compatible optional/defaulted columns.
- [x] Check required keys, uniqueness, foreign keys, and permissions.
- [x] Report failed/blocked checks and prevent all seed writes when a required check does not pass.
- [x] Support `--check-only` without modifying application records.
- [x] Explain missing schema and leave creation/repair to Alembic.

## Seed safely after checks pass

- [x] Use READ COMMITTED isolation, a bounded shared import lock, and an in-transaction completion/conflict recheck.
- [x] Pass the validated package and existing connection to the writer, retaining transaction ownership.
- [x] Commit patients and their completion marker together, or roll back failures from a conforming writer.
- [x] Detect a writer that ends the transaction and report that rows/marker may already be committed.
- [x] Make a matching completed import a no-op that preserves user edits and deletions.
- [x] Reject conflicting hashes, partial records, and unsupported replacement packages.
- [x] Verify readiness failures, check-only behavior, rollback, repeat imports, concurrency, and lock timeouts on disposable PostgreSQL.

## Export and hand off

- [x] Export one canonical `patients.jsonl` with typed records, original strings, and lineage.
- [x] Publish a manifest with counts, hashes, versions, and validation outcomes.
- [x] Publish complete versioned packages atomically and reject conflicting content under the same identity.
- [x] Keep notes, comments, and users outside this patient preparation pipeline.
- [x] Document build, validation, export, seed configuration, queries, and package dependencies.
- [x] Align the DBML and documentation with the implemented patient-only stages.
- [ ] Connect backend's approved writer, application UUID rules, and real Alembic migrations.
- [ ] Write the final PostgreSQL seed script against the validated DuckDB files after backend model review.
- [ ] Verify an actual application import and restart behavior against the real backend.
- [ ] Have infra package the data entry point, writer, and export together and verify the Compose startup sequence.
- [ ] Run the checks in hosted CI with its disposable PostgreSQL service.

## Verification record

On 2026-11-20:

- All 160 tests passed against isolated PostgreSQL 16.2, including all seed-fixture tests; the server default was SERIALIZABLE to exercise the seed's explicit READ COMMITTED setting.
- Ruff lint, format checks, and strict mypy passed across source and tests.
- The real pipeline validated all 21 stage checks and published the v2 patient package.
- Independent SQL checks confirmed all 7,600 source cells, 76 adjacent silver pairs, and 100 distinct bronze/silver relationships.
- The source SHA-256 remains `f04b95e0b28e825674c32ab803d48dba8f3c5db515365ef5ad0ecdab9e58deef`.
- Default seed check-only mode exits nonzero with clear missing-configuration/backend-writer results and no writes.

The application projection is provisional. Real backend import, Compose, and hosted CI are not claimed complete.
