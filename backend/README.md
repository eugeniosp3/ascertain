# Patient backend

FastAPI, Pydantic, SQLAlchemy, PostgreSQL, and Alembic power the patient dashboard. The API includes patient CRUD, notes, discussion, source-file links, per-user unread counts, summaries, and dashboard totals. The reviewed model uses eight tables and accounts for all 76 fields in the 100-patient dataset.

## Run

From the repository root, Docker Compose runs migrations and the seed command before starting the API:

```sh
MIGRATE_ON_STARTUP=true SEED_ON_STARTUP=true docker compose up --build
```

The API is available at `http://127.0.0.1:8000`, with interactive documentation at `/docs` and the generated contract at `/openapi.json`. `/health` returns exactly `{"status":"ok"}`. `/ready` checks database connectivity; migration and seed failures prevent automatic startup from reaching that point.

For native development, use Python 3.12 and uv. From `backend/`, point `DATABASE_URL` at the intended PostgreSQL database, using its actual credentials:

```sh
uv sync --frozen
export DATABASE_URL='postgresql+psycopg://sample_user:sample_password@127.0.0.1:5432/sample_db'
uv run --frozen alembic upgrade head
uv run --frozen python -m app.seed --check-only
uv run --frozen python -m app.seed
uv run --frozen uvicorn app.main:create_app --factory --reload --no-access-log
```

The sample URL matches the fresh Compose template; an existing database may use different credentials. The optional [environment example](.env.example) documents backend settings. `DEMO_MODE=true` enables the synthetic user selector. It is not authentication; a real authentication dependency is outside this demo's scope.

## Data and seeding

The selected inputs are [silver](../data/assets/silver/silver.duckdb) and [bronze](../data/assets/bronze/bronze.duckdb). The reader opens both read-only, validates their metadata, lineage, all 76 source fields, and 100 patient records, then maps stored `_clean` values to the application model. JSONL files and the old package-seed prototype are not runtime dependencies.

The seed command checks PostgreSQL connectivity, migration revision, tables, columns, types, nullability, keys, checks, permissions, and existing import state before writing. It then takes a bounded advisory lock and uses one transaction for patient data, demonstration records, and completion markers. `--check-only` performs no seed writes. Repeated startup preserves edits and deletions; conflicting or incomplete imports fail instead of silently overwriting records.

Initial data contains 100 patients, two clearly labeled demo users, two demo clinical notes, two comments, and one comment-to-note link. No file attachments are fabricated. Blood type is unknown/null; `active` is an explicit application default because the source has no dashboard status. Current age is calculated from birth date. Application UUIDs are separate from pipeline UUIDs and source identifiers.

The container build uses the data package to reproduce the validated snapshots from the committed patient CSV and marks them read-only. Runtime seeding reads those DuckDB files and does not rebuild the pipeline.

## API behavior

[API_CONTRACT.md](API_CONTRACT.md) maps the implemented endpoints to the UI mocks and explains pagination, identity, counts, and read acknowledgment.

- Patient search/filter/sort runs across the complete dataset before pagination. Search includes names, MRN, source ID, application UUID, and email. Lists expose active-note, comment, and per-viewer unread counts.
- Patient PUT replaces all editable fields and preserves source provenance. Patient deletion cascades owned records.
- Notes have titles, authors, clinical timestamps, and application audit timestamps. Deletion keeps a content-free tombstone so existing comment links remain identifiable.
- Comments are separate from clinical notes. Only their author may edit/delete them. Linked notes must belong to the same patient.
- Discussion cursors keep pagination stable when comments are deleted. Explicit acknowledgments advance a per-user read watermark; normal GETs do not mark discussion read.
- Summaries use current profiles and active notes, with no external model key. Comments and deleted notes never become summary input.
- Attachments are HTTPS URL metadata. The backend neither uploads files nor downloads external URLs.

## Structure and write ownership

```text
app/
  main.py, config.py, db.py   # App assembly, typed configuration, engine/session lifetime
  models.py                  # Reviewed SQLAlchemy tables and constraints
  dependencies.py            # Demo identity resolution
  errors.py                  # Standard exception handlers and safe JSON responses
  seed.py                    # Thin direct-DuckDB seed CLI
  routers/                   # HTTP boundaries
  schemas/                   # Pydantic contracts and typed patient context
  services/                  # Named read/write operations with explicit transactions
  utils/                     # Dates, pagination, database checks, DuckDB reader, logging
alembic/versions/             # Reviewed schema revisions
tests/                      # Unit and PostgreSQL regressions
```

API services own their commits/rollbacks. `services/seeding.py` owns the seed transaction. Utilities never commit application data. Source documents are retained for provenance and excluded from ordinary API responses. Unexpected errors use standard framework handling; server logging keeps exception types and stack locations while omitting exception values and source-line text. The documented launch commands disable raw access logs so patient identifiers and search terms are not written into request URLs in logs.

## Checks

Use a dedicated, migrated PostgreSQL database whose name ends in `_tests`. Integration tests skip when `TEST_DATABASE_URL` is absent; set it to run the full suite.

```sh
export TEST_DATABASE_URL='postgresql+psycopg://sample_user:sample_password@127.0.0.1:5432/ascertain_tests'
DATABASE_URL="$TEST_DATABASE_URL" uv run --frozen alembic upgrade head
uv run --frozen ruff check .
uv run --frozen ruff format --check .
uv run --frozen mypy app
uv run --frozen pytest
```

Verification on 2026-11-20: **194 tests passed**, including real PostgreSQL API, migration, seed rollback/idempotence, ownership, same-patient links, and unread concurrency checks. Ruff and strict mypy passed. A fresh isolated Docker stack migrated and seeded automatically; an HTTP journey exercised the endpoints. Recreating its API preserved an edited patient and a deliberately deleted seed patient without duplicates. Hosted CI has not been claimed as run.

## Model and implementation references

- [DATA_MODEL.md](DATA_MODEL.md): design choices and complete source mapping.
- [MODEL_CONTRACT.md](MODEL_CONTRACT.md): exact ORM names and constraints.
- [schema.dbml](schema.dbml): dbdocs-compatible model, validated locally; no hosted project published.
- [IMPLEMENTATION.md](IMPLEMENTATION.md): implementation conventions and extension boundaries.
- [HOLEPUNCH.md](HOLEPUNCH.md): requirement tracking.
