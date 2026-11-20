# Backend implementation guide

The patient backend is implemented. Read [README.md](../README.md) for commands, [API_CONTRACT.md](API_CONTRACT.md) for UI integration, [MODEL_CONTRACT.md](MODEL_CONTRACT.md) for exact ORM names, and [DATA_MODEL.md](DATA_MODEL.md) for the reviewed source mapping. The scope remains the 100-patient dataset only.

## Ownership

Data engineering owns the bronze/silver files, field rules, cleaning, and lineage. Backend consumes the validated DuckDB snapshots and owns application tables, Alembic, persistence, APIs, and tests. Infra owns container configuration, startup sequencing, and workflow wiring. Frontend consumes the API and owns screen behavior.

The selected runtime seed path is `python -m app.seed`. The older `patient_data.seed` JSONL/package implementation is a reference prototype and is not automatically invoked. JSONL is not required to seed this application.

## Folder responsibilities

| Location | Responsibility |
| --- | --- |
| `app/main.py` | Assemble the API, app-owned resource lifetime, routers, and outer CORS middleware |
| `app/config.py` | Validate environment settings once; keep credentials out of representations/errors |
| `app/db.py` | ORM Base, engine factory, and request session dependency |
| `app/models.py` | Typed SQLAlchemy tables, constraints, indexes, and stable imported-patient IDs |
| `app/dependencies.py` | Resolve active demo identity and enforce disabled-mode behavior |
| `app/routers/` | HTTP input/output, dependency injection, status codes, and locations |
| `app/schemas/` | Pydantic input/output contracts, source context, and import types |
| `app/services/` | Named application operations with explicit transaction boundaries |
| `app/utils/` | Focused date, pagination, database-inspection, DuckDB-read, and logging helpers |
| `app/seed.py` | Thin CLI around the selected seed operation |
| `alembic/versions/` | Reviewed database changes |
| `tests/` | Behavior and regression tests against disposable PostgreSQL |

The normal call path is router → service → SQLAlchemy. Reuse the existing package mechanisms and small helpers. Add a class only when it groups a real dependency or coherent behavior, as `DatabaseChecks` groups reads on a caller-owned connection. Do not introduce generic repositories, controller hierarchies, or a custom dependency container.

## Types and mutations

Use named Pydantic schemas and explicit ORM attributes. Input models reject unexpected writable fields. Current patient fields are editable; source identifiers, lineage, original records, and source audit timestamps remain read-only. JSONB context is validated with named models, and changes assign a new list/dictionary rather than mutating nested values in place.

API write services own commit/rollback. The session dependency closes resources and never commits implicitly. Utilities perform no application-data commits. The seed service owns one connection and transaction for its import. Keep mutation statements in the named write operation and describe transaction ownership in its docstring.

Fetch database edit timestamps before dirtying an ORM object when the clock query could trigger autoflush. Note creation time, clinical time, and edit time have separate meanings. Explicit null note titles must remain null on tombstone inserts; omitted active titles use the default.

Use normal `def` routes for synchronous database I/O. Keep one engine per application lifetime and close request sessions. Handle SQLAlchemy exceptions without exposing SQL, parameters, or source patient values.

## HTTP and errors

Keep backend paths unprefixed; the browser proxy strips `/api`. Return schema-defined responses, not arbitrary ORM dictionaries. Preserve the error envelope and field paths described in API_CONTRACT.md. Known conflicts receive safe 409 responses; validation is 422; missing/wrong-parent resources are 404; other-author changes are 403; deleted-note detail is 410.

Use standard FastAPI/Starlette exception handlers. CORS wraps the entire application so framework 500 responses retain browser headers. Uvicorn's exception filter retains type and stack locations while omitting exception messages, local values, and source-line text. The filter is not permission to put patient values in ordinary log messages.

Demo identity comes from a known active `X-Demo-User-ID`; never accept an author ID in note/comment bodies. This selector is not production authentication. Apply the same disabled-mode check to all data routes.

## Database model and migration changes

The reviewed model has patients, users, notes, note attachments, comments, comment-note links, discussion read markers, and seed runs. Source fields are accounted for in ordinary columns, typed imported context, or immutable provenance. Do not add authorization requests or payer-workflow tables because historical source context mentions them.

When a model changes, create a reviewed Alembic revision and update DBML/model documentation. Check metadata drift and test the migration in an isolated PostgreSQL schema. DBML parsing alone does not prove migration correctness. Preserve source values and text identifiers during any migration.

Keep cross-patient references impossible using composite foreign keys as well as service validation. Deleting a patient cascades owned records; note deletion keeps a tombstone; retired authors remain identifiable. Avoid cascading deletion of user identities or import completion markers through patient deletion.

## DuckDB seed operation

`app/utils/duckdb_source.py` opens both stage files read-only, validates them through data-owned checks, maps `_clean` values, and retains original values/lineage. It does not read a JSONL export, clean the CSV again, or rebuild the stages. Defaults come from the data package's `StageSettings` asset paths.

Before writing, verify source completeness and types, database reachability, migration revision, required tables/columns, type families, nullability, keys/check constraints, permissions, and current import state. Expected database shape comes from approved ORM metadata. A failure exits without a seed marker or patient writes; the command never repairs schema.

After checks pass, take the bounded shared import lock, recheck state, insert the patient and demo completion markers as needed, write data, verify counts, and commit once. Any failure rolls back the complete operation. Repeating the same import preserves edits and deliberate deletions. Changed or unexplained partial imports require an explicit policy, not an automatic overwrite.

`--check-only` uses the same read-only checks and never invokes seed writes. A passing check is not a guarantee against later database changes; constraints and transaction rollback still protect the actual import.

Infra's order is PostgreSQL ready → Alembic → `app.seed` → API. The container builds validated snapshots through the data package at image-build time; API startup reads the resulting DuckDB files. There is one automatic seeder.

## Queries and UI behavior

Patient filters, count expressions, and sorts run before pagination; count totals use the same filters. Allowlist sort expressions, bind values, escape LIKE wildcards, keep stable UUID ties, and place missing visits last. Exclude raw source snapshots from ordinary responses.

Discussion lists use cursor continuation for reliable read acknowledgment. Preserve `(created_at, id)` ordering, the original snapshot boundary, equal-timestamp handling, and monotonic per-user watermarks. Do not revert to offset-only acknowledgment: deleting an earlier row could otherwise skip an unseen comment. GETs remain read-only.

A template summary is generated fresh from current patient fields and active clinical notes. Never include discussion, deleted notes, or fetched external-file content implicitly. Unknown allergies and no known allergies are distinct.

## Verification and future work

Use the commands in README.md. Full tests require `TEST_DATABASE_URL` pointing at a disposable PostgreSQL database ending in `_tests`; SQLite is not a replacement for JSONB, FK, migration, locking, or privilege tests. Keep source DuckDB files read-only and preserve their hashes during tests. Temporary PostgreSQL schemas/records belong to the tests that create them and must be cleaned up.

The local verification covers CRUD, complete-dataset search/counts, validation, ownership, link scoping, tombstones, summaries, unread pagination/concurrency, migration round trips/drift, source mapping, seed failures/rollback, repeated startup, and container HTTP behavior. Report hosted CI separately from local checks.

Future features require separate scope: real authentication/roles, file uploads, external LLM summaries, real-time delivery, and broader clinical workflows. Keep implementation and documentation aligned as each feature is added.
