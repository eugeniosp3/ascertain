# Patient data

[Project overview](../README.md) · [Project punch card](../reference/PROGRESS.md)

This folder prepares the **100 fictional patients** in [patients_100.csv](../reference/prior-auth-pack/data/patients_100.csv) for the healthcare dashboard. DuckDB stores the original and cleaned stages, Pydantic validates their shapes, and reusable Python transformations keep each cleaned value traceable to its source. The backend's implemented seed command reads these files to initialize PostgreSQL.

## What is here

| File or folder | Purpose |
| --- | --- |
| [assets/bronze/bronze.duckdb](assets/bronze/bronze.duckdb) | Original patient values, source metadata, and a UUID for each row. |
| [assets/silver/silver.duckdb](assets/silver/silver.duckdb) | Cleaned, typed values beside all 76 original fields. Each row has a silver UUID and retains its bronze UUID. |
| [src/patient_data/](src/patient_data/) | Python pipeline, Pydantic models, and reusable transformation/checking utilities in `utils/`. |
| [tests/](tests/) | Checks for data preservation, types, lineage, repeatability, exports, and shared database contracts. |
| [docs/](docs/) | [Checklist](docs/HOLEPUNCH.md), [data contract](docs/DATA_CONTRACT.md), [implementation guide](docs/IMPLEMENTATION.md), and [data model](docs/schema.dbml). |
| [assets/exports/](assets/exports/) | Optional generated patient JSONL and manifest snapshots. Runtime seeding uses the DuckDB files directly. |
| [pyproject.toml](pyproject.toml), [uv.lock](uv.lock) | Package setup, locked dependencies, linting, and type-checking configuration. |

Both DuckDB files contain 100 patients. Bronze preserves the source strings; silver keeps every original value beside its transformed value. Identifiers stay text, dates/numbers/flags receive explicit types, and meaningful values such as `None` and `NKDA` are preserved. There is no gold stage or authorization-request import.

## Run the pipeline

From this `data/` folder, with uv installed:

```sh
uv run --locked python -m patient_data all
```

This builds both stages, validates them, and refreshes the optional export. Unchanged input reuses the existing files and UUIDs. The original CSV is never modified. The pipeline reads the source from `reference/` while retaining its original identity label.

To see counts and metadata:

```sh
uv run --locked python -m patient_data inspect
```

To query cleaned values in a DuckDB session opened from this folder:

```sql
ATTACH 'assets/silver/silver.duckdb' AS silver (READ_ONLY);
SELECT patient_id_clean, date_of_birth_raw, date_of_birth_clean
FROM silver.main.patients;
```

## How this fits the project

**Backend** opens bronze and silver read-only through its [source reader](../backend/app/utils/duckdb_source.py), validates the handoff, and imports cleaned values with [app.seed](../backend/app/seed.py). Bronze retains original values; silver provides typed values and lineage. The importer owns the PostgreSQL transaction and protects existing edits and deletions on repeat startup.

**Frontend** consumes application records through FastAPI in API mode; its explicit demo mode uses separate in-memory fixtures. **Infra** reproduces the DuckDB snapshots from the committed CSV during the image build, then runs Alembic followed by `python -m app.seed` during configured startup. See the [backend runbook](../backend/README.md) for import commands and verification.

Running `patient_data all` prepares and validates data; it does not insert patients into PostgreSQL. There is one runtime seed owner: backend's `app.seed`. The optional JSONL export is an inspection artifact, not a second database-loading path. The [project punch card](../reference/PROGRESS.md) tracks the cross-project handoff.

Keep the two DuckDB files under `assets/` in the project. Temporary builds live under `.cache/work/`; caches, local environments, and database sidecars are excluded from version control. The 2026-11-20 pipeline verification passed all 21 stage checks. Backend import tests and live frontend integration are separate checks.
