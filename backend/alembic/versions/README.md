# Migration revisions

`20261120_0001_initial_schema.py` (revision `20261120_0001`, no parent) creates the
eight application tables: `patients`, `users`, `notes`, `note_attachments`, `comments`,
`comment_note_links`, `discussion_reads`, and `seed_runs`. It freezes the reviewed schema
from `app/models.py`, with named constraints and indexes. Its downgrade drops the child
tables before their parents. No source DuckDB file is modified by migrations.

From `backend/`, set `DATABASE_URL` to a PostgreSQL connection URL, then run:

```sh
uv run alembic upgrade head
uv run alembic check
```

Migrations create schema only; the backend's direct DuckDB seed command owns data import.
Use `patient_data.settings.StageSettings` for the current stage paths (defaults:
`data/assets/silver/silver.duckdb` and `data/assets/bronze/bronze.duckdb`). The older
`patient_data.seed` JSONL prototype is optional and is not the runtime seed command.

The migration environment imports all application tables, requires `DATABASE_URL`, and
compares both column types and server defaults when checking for drift. The exact model
names and integration rules are in [MODEL_CONTRACT.md](../../docs/MODEL_CONTRACT.md); the
complete source mapping is in [DATA_MODEL.md](../../docs/DATA_MODEL.md).

`20261120_0002_patient_assignments.py` adds only the nullable `patients.assigned_user_id` FK and its index. Existing rows stay unassigned until the versioned seed extension runs. Downgrade removes assignment metadata while preserving patient profiles. The existing 0001 revision is unchanged. Apply migrations before starting the new API; shared bind-mounted reload services require an infra-coordinated cutover, not file-by-file live edits.
