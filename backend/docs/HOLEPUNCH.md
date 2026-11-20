# Backend hole punch checklist

Backend requirements are tracked below. Verification results and current commands are in [README.md](../README.md). Use the [implementation guide](IMPLEMENTATION.md), [data model](DATA_MODEL.md), and [DBML](schema.dbml) alongside this checklist. Shared frontend acceptance and optional future work require their own verification.

The brief is [project.md](../../reference/project.md); compact source tags refer to item IDs in [the original Holepunch checklist](../../reference/holepunch.html). `User` marks requested additions. `Pack` refers only to [patients_100.csv](../../reference/prior-auth-pack/data/patients_100.csv), the source dataset in scope: 100 patients and 76 fields.

Backend owns the reviewed PostgreSQL model, Alembic, the direct-DuckDB seed command, APIs, and tests. Data engineering owns source preparation and the bronze/silver snapshots. Infra packages those components and runs migrations, app.seed, then the API. JSONL and the old package-seed prototype are not required by the runtime.

## Required patient dashboard

- [x] B-001 — Provide a FastAPI backend backed by PostgreSQL, with a patient schema that another developer can recreate. [Brief · b-init, b-db, b-recreate]
- [x] B-002 — Make `GET /health` return HTTP 200 with exactly `{"status":"ok"}`. [Brief · b-health]
- [x] B-003 — Store each patient's name, birth date, phone, email, structured address, blood type, patient status, allergies, conditions, last visit, and creation/update times. [Brief · d-patient, pf-personal, pf-medical]
- [x] B-004 — Calculate age from birth date when returning a patient, rather than storing an age that becomes stale. [Brief · d-patient, a-schemas, pl-cols]
- [x] B-005 — Seed realistic fictional patient data automatically during startup, meeting the brief's minimum of 15–20 patients. [Brief · b-seed]
- [x] B-006 — Make `GET /patients` return a page of patients and the matching total, with page numbers starting at 1 and a page size of 20 by default and 100 at most. [Brief · a-list, pl-page]
- [x] B-007 — Search names and email without case sensitivity, filter by patient status, and sort the matching patients before selecting a page. [Brief/Holepunch · a-query, pl-search, pl-filter]
- [x] B-008 — Allow name, birth date, last visit, and status sorting in either direction, with a stable secondary order so rows do not jump between pages. [Brief/Holepunch · a-query, pl-sort]
- [x] B-009 — Make `GET /patients/{id}` return the patient's profile, or a clear 404 response when the patient does not exist. [Brief · a-get, pd-view, pd-404]
- [x] B-010 — Make `POST /patients` create a patient and return HTTP 201, the saved record, and its location. [Brief · a-post]
- [x] B-011 — Make `PUT /patients/{id}` replace the editable patient profile, update its modification time, and return HTTP 200 or 404. [Brief/Holepunch · a-put]
- [x] B-012 — Make `DELETE /patients/{id}` remove the patient and its dependent application records, returning HTTP 204 or 404. [Brief · a-delete]
- [x] B-013 — Validate names, birth dates, contact details, medical lists, allowed blood types/statuses, and last-visit dates on the server, with useful field-level messages. [Brief · a-schemas, a-rules, pf-server]
- [x] B-014 — Reject invalid input with 422, missing records with 404, and expected data conflicts with 409; return a generic 500 for unexpected failures. [Brief · a-errors]
- [x] B-015 — Keep the same understandable error format across endpoints so the frontend can display errors and identify the affected fields. [Brief/Holepunch · d-contract, a-errors, pf-server]
- [x] B-016 — Make `POST /patients/{id}/notes` accept a client-supplied, timezone-aware timestamp and nonempty text, returning HTTP 201. [Brief · d-note, n-post]
- [x] B-017 — Keep the note's clinical timestamp separate from the times when its database record was created or updated. [Brief · d-note, n-post]
- [x] B-018 — Make `GET /patients/{id}/notes` list that patient's current notes newest first, and return 404 for an unknown patient. [Brief · n-get]
- [x] B-019 — Make `DELETE /patients/{id}/notes/{note_id}` remove the note from normal use and return HTTP 204; a missing note or a note belonging to another patient returns 404. [Brief · n-del]
- [x] B-020 — Make `GET /patients/{id}/summary` return readable prose containing the patient's name, age, blood type, conditions, allergies, and relevant clinical notes. [Brief · sm-ep, sm-tpl]
- [x] B-021 — Make summaries work without an external API key, handle patients with no notes, and reflect note additions or deletions immediately. [Brief/Holepunch · d-summary, sm-tpl, sm-ui]
- [x] B-022 — Keep listing, searching, sorting, and pagination practical with at least 100 patients. [Brief · pl-100, r-perf]
- [x] B-023 — Give infrastructure the backend runtime and command requirements for its Dockerfile and Compose setup, which must start PostgreSQL, the API, and the frontend together. [Brief · c-be, c-compose]
- [x] B-024 — Provide migrations and the direct-DuckDB app.seed command, which infrastructure runs during automatic startup. [Brief/Holepunch · b-recreate, c-be, c-clean]
- [x] B-025 — Give infrastructure the backend environment-variable contract for `.env.example`, including usable defaults for the fictional local demo. [Brief · c-env]
- [x] B-026 — Provide succinct run instructions for Docker and native development, including migration and seed commands and links to the app, API, and API documentation. [Brief · r-quick, r-local, r-short]
- [x] B-027 — Explain the backend's main library choices, folder layout, limitations, and completed features in the repository documentation. [Brief/Holepunch · r-decisions, r-api, r-trade, r-stretch]

## Selected architecture and data additions

- [x] B-028 — Use Pydantic v2 for validated input/output types and settings, and typed SQLAlchemy models with psycopg for PostgreSQL access. [User · d-be, a-schemas]
- [x] B-029 — Keep a small, predictable folder structure with routes, services, schemas, models, and reusable utilities; avoid adding layers that have no clear responsibility. [User · d-growth, s-tree]
- [x] B-030 — Reuse established package capabilities for validation, database sessions, migrations, and testing, and keep shared application functions and classes in `app/utils/`. [User · d-be, d-growth]
- [x] B-031 — Use synchronous database sessions and ordinary `def` routes for database work, keeping the request flow straightforward. [Selected design · d-be, b-db]
- [x] B-032 — Use Alembic for schema changes, including database constraints, relationships, and indexes; document how to recreate the database from an empty state. [User · b-schema, b-recreate, n-migr, x-alembic]
- [x] B-033 — Review the cleaned patient dataset and shared data-engineering model, then implement and document the backend schema and source mapping. [User · Pack]
- [x] B-034 — Import all 100 patients from the validated read-only DuckDB snapshots, preserving source IDs and pipeline lineage. [Selected design · d-seed-src · Pack]
- [x] B-035 — Account for all 76 source patient fields in the model and mapping without making the main table a copy of the spreadsheet. Keep `pa_request_count` as source metadata, without a request-table relationship. [User · Pack]
- [x] B-036 — Preserve source identifiers and codes as text, source timestamps as source timestamps, and inapplicable blank values without turning them into zero or false. [Pack]
- [x] B-037 — Set imported patient status to the documented synthetic default `active` and leave unknown blood type empty; do not present either value as a source clinical fact. [Selected design · d-seed-src · Pack]
- [x] B-040 — Build a versioned PostgreSQL importer that makes automatic seeding transactional and repeatable, records completed seed runs, and avoids duplicate records, resurrected deletions, or overwritten user edits on restart. [Selected design · b-seed-safe]
- [x] B-041 — Include two clearly labeled synthetic demonstration notes and two demonstration comments, without inventing historical authors or attachment files for the supplied source data. [Selected design · b-seed-notes]
- [x] B-042 — Create two explicitly labeled synthetic demo users for note/comment examples and document that the selector is not authentication. [Selected design · User]

## Notes, attachments, and comments

- [x] B-043 — Let multiple demo users leave comments on the same patient, with a stored author and visible creation/update times. [User]
- [x] B-044 — Allow a comment's author to edit or delete it, while preserving its original author and creation time when it is edited. [User]
- [x] B-045 — Keep discussion comments separate from clinical notes so casual discussion is not silently included in the clinical summary. [User · sm-ep]
- [x] B-046 — Give every note a stable ID and a detail endpoint so a linked note can be opened directly. [User]
- [x] B-047 — Let a comment reference one or more notes using stored note IDs, and return enough information for the frontend to show understandable links. [User]
- [x] B-048 — Reject a comment link to a note belonging to another patient, and apply the same patient ownership checks to note attachments. [User · n-del]
- [x] B-049 — Mark deleted notes as deleted so existing comments retain a clear deleted-note indicator; exclude those notes from normal lists, detail content, and summaries. [Selected design · User · n-del]
- [x] B-050 — Attach external HTTPS file-link metadata to a note, including a readable name, source URL, and who added it, so the frontend can open the original source. [Selected design · User]
- [x] B-051 — Treat external file URLs as links, without downloading their contents in the backend; keep actual file uploads and storage for a later feature. [Selected design · User]
- [x] B-052 — Delete the patient's notes, attachments, comments, and note links when the patient is deleted, including previously deleted note tombstones. [User · a-delete]

## Quality, startup, and CI

- [x] B-053 — Supply lint, format, type-check, API-test, and migration/seed verification commands for infrastructure's CI YAML, and coordinate the backend image-build check. [User · x-ci, q-lint, q-tests]
- [x] B-054 — Test the API against a disposable PostgreSQL database, including patient CRUD, validation, missing records, notes, summaries, comment authorship, and cross-patient link rejection. [Selected engineering work · x-tests]
- [x] B-055 — Verify empty-database migration, automatic seed import, repeat startup, zero writes after failed preflight checks, atomic rollback on import failure, and preservation of user changes. [Selected engineering work · b-recreate, b-seed-safe, c-clean]
- [x] B-056 — Use one database session per request and clear transaction boundaries, rolling back failed writes. [Recommended · b-db, a-errors]
- [x] B-057 — Use database constraints and indexes for the chosen relationships, patient lookups, list sorting, and note/comment retrieval. [Recommended · b-schema, n-migr]
- [x] B-058 — Lock dependency versions and make local checks use the same dependencies and commands as CI. [Recommended · d-be, b-ruff, x-ci]
- [x] B-059 — Configure settings from the environment, limit cross-origin access to known frontend origins, and keep secrets outside committed files. [Recommended · b-init, c-env, q-secrets]
- [x] B-060 — Give infrastructure the backend health-check and filesystem requirements for a nonroot container, persistent PostgreSQL storage, and correct database/API startup order. [Recommended · c-be, c-health, c-vol]
- [x] B-061 — Package the validated DuckDB seed inputs with infrastructure so clean startup needs no local-only path or JSONL export. [Recommended · b-seed-safe, c-clean]
- [x] B-062 — Document API schemas and error responses in OpenAPI, and exercise both successful requests and expected failures. [Recommended · a-docs, a-smoke]
- [x] B-063 — Check the finished backend against the original brief, remove unused/debug code, and verify clean startup with infrastructure in an isolated disposable Compose project. [Recommended · q-spec, q-clean, c-clean]
- [x] B-064 — Keep patient data, comment text, note text, and secrets out of logs, error responses, and diagnostic artifacts. [Recommended · x-log, q-secrets]

## Frontend handoff

- [x] B-065 — Keep the backend's required routes unprefixed, and coordinate a frontend proxy that strips `/api` before forwarding requests. [Handoff · d-paths, f-proxy, c-nginx]
- [x] B-066 — Publish the list envelope `{items, total, page, page_size}`, query names, null handling, timestamp formats, and validation-error field paths. [Handoff · d-contract, f-api, pf-zod, pf-server]
- [x] B-067 — Explain that sorting by age reverses the birth-date sort direction, and return name, age, last visit, and status for each patient row. [Handoff · pl-cols, pl-sort, a-query]
- [x] B-068 — Provide complete-dataset search/filter results while the frontend handles debouncing, request cancellation, loading states, and page resets. [Handoff · pl-search, pl-page, pl-states]
- [x] B-069 — Return the authors, edit times, note references, deleted-note indicators, and attachment URLs needed to display discussion and open its sources. [Handoff · User]
- [ ] B-070 — Coordinate cache refreshes after patient, note, and comment changes so the profile, list, notes, and summary stay consistent. [Handoff · pf-submit, n-delete-ui, sm-ui]
- [x] B-071 — Support dashboard counts through the list endpoint's filtered total and recent visits through last-visit sorting, so both use the full dataset. [Handoff · l-home]
- [ ] B-072 — Coordinate frontend container routing and error states so direct patient links, missing patients, and unavailable backend responses behave correctly. [Handoff · c-nginx, pd-404, e-global]

## Data handoff

- [x] B-073 — Validate DuckDB metadata, versions, checksums, all source fields, row counts, and lineage before importing the stored clean values. Backend does not repeat source cleaning. [Handoff · User · Pack]
- [x] B-074 — Preserve the supplied `export_id`, `silver_id`, and `bronze_id` on imported patients so every imported patient stays traceable through the data pipeline. [Handoff · User · Pack]

## Reusable helpers and seed safety

- [x] B-075 — Make calculation and validation helpers return results without changing their inputs, global state, files, or database records. [User]
- [x] B-076 — Document which functions and classes write data, what they change, and which caller owns the transaction; keep those writes out of shared validation helpers. [User]
- [x] B-077 — Before any seed writes, use read-only checks to confirm database connectivity, supported PostgreSQL and migration versions, and the importer's required permissions. [User]
- [x] B-078 — Inspect the target tables, columns, and data types against the agreed model before any seed writes. [User]
- [x] B-079 — If a preflight check fails, stop with a clear explanation and make no seed writes or automatic schema repairs; schema changes belong to the separate Alembic step. [User]
- [x] B-080 — Use one locked transaction in app.seed for patient data, demo fixtures, and completion markers, rolling back the entire operation if any write fails. [User]

## Future options, outside the initial implementation

- [ ] F-001 — Add a real authentication provider and role-based permissions before using the application with authenticated users or real patient data. [Future · d-growth, r-growth]
- [ ] F-002 — Add file upload/storage support if notes need application-managed files rather than external source links. [Future · User]
- [ ] F-003 — Add an optional external LLM summarizer with a timeout and template fallback if that feature is selected. [Future · sm-llm]
- [ ] F-004 — Add safe request-duration logging, more advanced patient filters, dashboard charts, or Docker hot reload if those extras are selected. [Future · x-log, x-adv-search, x-chart, c-hot]
- [ ] F-009 — Add real-time updates or background jobs only when a selected feature needs them. [Future · d-growth, r-growth]

## UI-driven additions

- [x] UI-001 — Return note titles and active-note/comment counts, with server-side count sorting.
- [x] UI-002 — Track unread discussion per user and mark displayed comments read using stable cursor pagination and bounded monotonic acknowledgments.
- [x] UI-003 — Return global dashboard totals and limited recent/no-visit previews from PostgreSQL.

## Later submission

- [ ] S-001 — Obtain the existing checklist's required go-ahead before initializing Git, creating commits, or creating/pushing the public GitHub repository. [Later gate · g-ok, g-init, g-push]
- [ ] S-002 — Verify that a fresh clone starts successfully with Compose, then provide the repository link for submission. [Later gate · g-verify, g-send]
