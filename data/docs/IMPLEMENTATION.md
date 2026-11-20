# Patient data implementation

The pipeline owns source preparation and validation. Backend owns application mapping, migrations, PostgreSQL transactions, and startup seeding. The two components share validation helpers; they do not maintain competing seed commands.

## Structure

```text
data/
  README.md
  docs/                     # Contract, implementation notes, checklist, DBML
  pyproject.toml
  uv.lock
  src/patient_data/
    __main__.py             # Build, validate, inspect, export, all
    settings.py             # Typed paths and version constants
    patient_rules.py        # 76 fields, null rules, cross-field validation
    models.py               # Pydantic export records and manifests
    stages.py               # Bronze/silver builders and validators
    export.py               # Optional JSONL package publication
    package.py              # Optional export validation
    errors.py               # Errors without patient values
    utils/
      models.py             # Small Pydantic base
      transformations.py    # FieldRule, RowTransformer, typed parsers
      checks.py             # Named check results
      database.py           # Schema checks reused by backend
      identifiers.py        # UUIDs and hashes
  tests/
  assets/
    bronze/bronze.duckdb
    silver/silver.duckdb
    exports/<dataset-key>/
  .cache/work/              # Temporary builds
```

## Responsibilities

| Component | Job |
| --- | --- |
| `FieldRule` | Defines a field's type, optionality, format, and permitted values |
| `RowTransformer` | Applies rules while retaining adjacent original/clean values |
| `CheckResult` / `CheckReport` | Reports passed, failed, or blocked checks; an empty required set never passes |
| `StageSettings` | Keeps physical paths and rule/contract versions explicit |
| `DatabaseInspector` / `TargetContract` | Checks target tables, columns, types, constraints, privileges, and migration expectations for backend's importer |

Ordinary functions handle stateless conversions, hashing, and UUID creation. Patient-specific rules stay in `patient_rules.py`; utilities do not decide application behavior.

## Building the stages

Bronze reads the unchanged CSV from `reference/`, requires the expected header and row count, and stores the original strings with checksums and row identities. Silver opens bronze read-only and creates typed values beside their originals. Validation re-derives identities, compares all raw values, checks types, and reapplies the declared field rules.

Builders write into temporary files under `.cache/work/`. A file is promoted only after validation succeeds. Identical deterministic contents preserve the existing file and processing timestamps. Close other readers before rebuilding; this is a single-writer local preparation workflow.

The current implementation materializes the 100-row snapshot in memory. It is intentionally not presented as a streaming or distributed pipeline. Larger sources would need measured batching, projection, or SQL-side operations before retaining the same approach.

## Backend consumption

The selected command is `python -m app.seed` from `backend/`, after Alembic. Its [source reader](../../backend/app/utils/duckdb_source.py) attaches both existing files read-only, calls `check_bronze` and `check_silver`, and projects stored clean values into backend's `ImportedPatient` schema.

The [backend seed service](../../backend/app/services/seeding.py) owns target-schema checks, transaction settings, the shared import lock, import markers, inserts, and repeat/conflict behavior. It imports `DatabaseInspector` and `TargetContract` from this package, so those helpers remain part of the supported interface. Application UUIDs and demo assignments are backend-owned; stage UUIDs remain provenance.

The image builds stage files from committed source via `patient_data build`. The runtime reader does not require CSV cleanup, stage rebuilding, or JSONL. Optional exports remain available through `patient_data export` and `all` for inspection; they are not the runtime database input.

## Verification

Run the commands in [README.md](../README.md). Data tests use isolated stage files and cover raw-value preservation, parsing, null semantics, lineage, fingerprints, failed builds, package integrity, and shared database-contract utilities. Actual PostgreSQL import transactions are tested in backend.

[DATA_CONTRACT.md](DATA_CONTRACT.md) defines the stage and optional export formats. [HOLEPUNCH.md](HOLEPUNCH.md) records the data scope and verification status.
