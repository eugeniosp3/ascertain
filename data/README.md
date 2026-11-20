# Patient data

This folder prepares the **100 fictional patients** in [patients_100.csv](../reference/prior-auth-pack/data/patients_100.csv) for the healthcare dashboard. The data is ready for backend model and seed-script work.

## What is here

| File or folder | Purpose |
| --- | --- |
| [assets/bronze/bronze.duckdb](assets/bronze/bronze.duckdb) | Original patient values, source metadata, and a UUID for each row. |
| [assets/silver/silver.duckdb](assets/silver/silver.duckdb) | Cleaned, typed values beside all 76 original fields. Each row has a silver UUID and retains its bronze UUID. |
| [src/patient_data/](src/patient_data/) | Python pipeline, Pydantic models, and reusable transformation/checking utilities in `utils/`. |
| [tests/](tests/) | Checks for data preservation, types, lineage, repeatability, and seed-readiness behavior. |
| [docs/](docs/) | [Checklist](docs/HOLEPUNCH.md), [data contract](docs/DATA_CONTRACT.md), [implementation guide](docs/IMPLEMENTATION.md), and [data model](docs/schema.dbml). |
| [assets/exports/](assets/exports/) | Optional generated patient JSONL and manifest snapshots. The DuckDB files are the handoff for the later seed script. |
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

**Backend** uses silver to review the data model and later seed PostgreSQL; bronze provides the original values and traceable lineage. **Frontend** reads patient data through the backend API. **Infra** packages the required data files and runs the eventual seed command after migrations.

The existing package-based seed prototype is reference code; final seeding from these DuckDB files is a later task. Running the pipeline does not insert patients into PostgreSQL.

Keep the two DuckDB files under `assets/` in the project. Temporary builds live under `.cache/work/`; caches, local environments, and database sidecars are excluded from version control. The latest pipeline run passed all 21 stage checks.
