# Patient data implementation

**Current handoff:** the two DuckDB stage files are ready for backend work and belong in the project. Final seeding from those files is deferred. The package-based seed interface described below remains reference implementation work.

Implementation guide for the patient-only pipeline in [README.md](../README.md) and its [data contract](DATA_CONTRACT.md). Both DuckDB stages, export, validation, and seed orchestration are implemented. Real PostgreSQL application integration still requires backend's approved schema, migrations, and writer.

## Folder structure

Use a standard Python `src` layout with one package. Source code lives under `data/src/patient_data/`; generated database files and exports stay outside the source tree.

```text
data/
  README.md
  docs/
    HOLEPUNCH.md
    DATA_CONTRACT.md
    IMPLEMENTATION.md
    schema.dbml
    schema.dbdiagram
  pyproject.toml
  src/
    patient_data/
      __init__.py
      __main__.py           # Build, validate, inspect, and export commands
      settings.py           # Typed environment/path settings
      models.py             # Pydantic patient, lineage, and manifest models
      patient_rules.py      # Patient field rules and export mapping
      stages.py             # Build bronze.duckdb and silver.duckdb
      export.py             # Produce the patient package from silver
      package.py            # Validate packages without importing DuckDB
      errors.py             # Actionable errors without patient values
      seed.py               # Public seed command and preflight orchestration
      utils/
        __init__.py
        models.py           # Small shared Pydantic base
        transformations.py  # FieldRule, RowTransformer, parsing functions
        checks.py           # CheckResult and CheckReport
        database.py         # DatabaseInspector and connection checks
        identifiers.py      # UUID and checksum helpers
  tests/
    conftest.py
    test_checks.py
    test_identifiers.py
    test_transformations.py
    test_stages.py
    test_export.py
    test_seed_preflight.py
    test_seed_integration.py
  assets/
    bronze/bronze.duckdb
    silver/silver.duckdb
    exports/<dataset-key>/
  .cache/work/              # Temporary builds and reports
```

These modules and databases exist. The `src` package installs through `pyproject.toml`; imports do not modify `sys.path`.

## Reusable abstractions

| Abstraction | Responsibility | Reuse |
| --- | --- | --- |
| `FieldRule` | Describe a source field, parser, allowed blanks, target type, and validation rule | Use the same definitions for input validation, silver conversion, and schema coverage |
| `RowTransformer` | Apply field rules while keeping original/clean pairs and collecting field-specific errors | Transform every patient consistently, with no patient-specific parsing in the stage runner |
| `CheckResult` | Describe one named check, its pass/fail/blocked state, and an actionable message | Represent file, database, schema, and package checks consistently |
| `CheckReport` | Collect check results and allow continuation only when every required check passed | Drive seed output, failure exit codes, and `--check-only` |
| `DatabaseInspector` | Inspect a supplied database connection and compare actual schema with the expected import contract | Reuse connectivity, table, column, and constraint checks in the seed command and integration tests |

Use simple dataclasses/Pydantic models for these data structures and ordinary functions for stateless parsers, hashing, and UUID generation. Keep patient mapping rules in `patient_rules.py`; utilities should not contain application workflow logic. Use composition and established database APIs, without adding a class hierarchy for every field type.

For PostgreSQL inspection, use SQLAlchemy's supported inspector and backend metadata for table names, columns, types, and constraints. See [SQLAlchemy schema reflection](https://docs.sqlalchemy.org/en/20/core/reflection.html). DuckDB stage checks use a connection to the selected file and its catalog metadata; do not force both engines behind a large custom database framework.

## Seed command and ownership

The public seed entry point is `data/src/patient_data/seed.py`. Run `python -m patient_data.seed`, with `--check-only` for validation without seeding. Data owns this command and its required checks.

Backend owns PostgreSQL models, Alembic migrations, application UUID rules, and the reusable persistence operation. It must provide `PatientPersistence.target_contract()` and `write_patients(package, connection, *, seed_run_id)`. The data command invokes the writer only after its checks pass; the writer must use the supplied connection and must not independently commit, roll back, or create another transaction. The command owns the transaction. The interface is implemented, but the real backend writer is not available yet.

Infra installs/packages the data entry point and the backend persistence code together, includes the validated patient export, and runs: database ready → Alembic migrations → data seed command → API. Backend-owned demo notes/comments/users remain a separate application-fixture operation. The patient seed command writes only the patient import and its seed marker.

## Required checks before inserts

| Check | Required result |
| --- | --- |
| Configuration | A valid target connection, explicit schema, and readable patient package are configured |
| Patient package | Supported manifest/contract versions, matching checksum, 100 valid patients, unique source IDs, valid lineage, and all 76 original source fields |
| Database connection | Authenticate to the configured PostgreSQL database and execute a query with bounded connection/query timeouts |
| Migration state | The expected schema and a backend-supported Alembic revision exist |
| Target tables | Actual `patients` and `seed_runs` tables exist in the configured schema; an unrelated same-name object is insufficient |
| Target columns | Every column written by the importer exists with compatible type, nullability, and defaults |
| Required constraints | Primary keys, source-patient uniqueness, seed-key uniqueness, and import foreign keys match the backend contract |
| Access | The configured role has required schema usage, table read/write, and any applicable sequence permissions |
| Existing import state | A matching completed package is a successful no-op; conflicting hashes or unexplained partial records stop the import |

Input and destination checks are different: all 76 original fields must exist in `source_record`, while PostgreSQL columns follow the normalized backend model. Compatible extra nullable/defaulted columns are allowed. An additional required target column with no supplied value or default blocks seeding. Extra/missing input fields are handled by the versioned patient contract, not silently discarded.

Return clear failures such as “patients table is missing; apply Alembic migrations” or “patients.source_lineage is missing.” Report unavailable dependent checks as blocked, never passed. Do not print credentials or patient contents. A failed required check exits nonzero and prevents all patient and seed-marker writes.

Checks do not create missing application tables, add columns, or run migrations themselves. Infrastructure's startup sequence applies backend-owned migrations first. DuckDB build commands explicitly create their own stage files; read/validate/export commands must fail when an input file or table is missing instead of accidentally creating an empty database.

## Transaction and restart behavior

1. Read and validate the complete patient package once; retain those validated records for insertion so a later file change cannot bypass the checksum check.
2. Open the configured connection and run the database/schema checks. `--check-only` stops after read-only checks and reports current readiness; a later real seed run always checks again.
3. For a real seed, use `READ COMMITTED` isolation, acquire the bounded shared patient-import lock, and recheck completion/conflicting rows inside the same transaction before inserts. The shared key is `PATIENT_IMPORT_LOCK_KEY`; backend must use the same key for any other patient-import path.
4. If the package is already complete with matching hashes, return success without changing patients, even if users edited or deleted them.
5. Only when every required check passes, invoke the backend persistence operation and create the import marker in the same transaction. Check the inserted count and lineage before marking completion.
6. Commit patients and their marker together. Any failure rolls back both. Never mark success after a partial import, and never automatically overwrite user changes for a new package version.

The adapter contract is trusted: a writer that commits independently can persist unverified data and its marker. The command detects an ended transaction and reports that database inspection is required; it does not falsely claim rollback. Fix the adapter and inspect both patient rows and the marker before retrying, because a matching marker makes a later run a no-op.

SQLAlchemy provides transaction contexts for commit/rollback handling; use those rather than a custom transaction manager. See [SQLAlchemy transactions](https://docs.sqlalchemy.org/en/20/core/connections.html#using-transactions).

## Verification

Use focused tests that exercise behavior: invalid conversions preserve original values; a failed check prevents calling the writer; `--check-only` makes no changes; unreachable PostgreSQL, missing tables/columns, incompatible columns, and missing permissions fail clearly; a valid migrated database receives all 100 patients; a mid-import failure rolls back; repeat and concurrent invocations preserve edits/deletions without duplicates.

The PostgreSQL tests currently use a clearly labeled test schema and test writer to exercise the data-owned checks and transaction behavior. They do not prove compatibility with backend's deferred model or migrations. Actual backend integration remains a separate acceptance item. The stage tests verify independent file opening, all adjacent raw/clean pairs, lineage, failure preservation, and deterministic export. Runnable verification commands are in the README.
