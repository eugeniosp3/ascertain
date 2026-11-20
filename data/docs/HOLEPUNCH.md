# Patient data checklist

Scope: [patients_100.csv](../../reference/prior-auth-pack/data/patients_100.csv) only — 100 fictional patients and 76 source fields. Backend owns PostgreSQL seeding and assignments; this package owns preparation and shared validation.

## Structure and contracts

- [x] Keep Python code under `src/patient_data/`, reusable utilities under `utils/`, and generated artifacts under `assets/`.
- [x] Use typed rules, small Pydantic models, and ordinary parsing/hash functions.
- [x] Lock dependencies and configure Ruff, formatting, strict mypy, and pytest.
- [x] Define all 76 fields, null rules, units, and current export destinations.
- [x] Keep source identifiers, stage UUIDs, and application identity distinct.
- [x] Keep one runtime seed command in backend, with no duplicate database-writing entry point in data.

## Bronze and silver

- [x] Preserve all original strings, blanks, leading zeros, source order, and the CSV bytes.
- [x] Record source filename, hash, snapshot date, parsed row number, row hash, and bronze UUID.
- [x] Build a separate silver file with its own UUID and retained bronze UUID.
- [x] Keep all 76 original/clean pairs adjacent and in source order.
- [x] Parse dates, UTC timestamps, exact decimals, integers, and Y/N flags with explicit rules.
- [x] Preserve meaningful text categories such as `None` and `NKDA`.
- [x] Preserve clinical text and units without inventing clinical corrections.
- [x] Validate temporary files before promotion and preserve the old stage on failure.
- [x] Reuse unchanged stage files and identities on repeated builds.

## Validation

- [x] Open each stage independently and verify the expected tables and columns.
- [x] Reconcile all 100 rows, all 7,600 source values, and bronze/silver lineage.
- [x] Check patient/MRN uniqueness, date ordering, snapshot age, and paired condition lists.
- [x] Treat `pa_request_count` as source context without importing other datasets.
- [x] Test malformed values, failed builds, modified packages, and direct timestamp queries.
- [x] Keep reports free of patient field values and stop when required checks fail.
- [x] Retain database-inspection helpers used by backend and preserve their unit tests.

## Optional exports and application handoff

- [x] Produce deterministic JSONL and a manifest for optional inspection.
- [x] Keep original source strings and row numbers alongside exported lineage.
- [x] Reject modified values, invalid source-derived IDs, and conflicting package contents.
- [x] Publish complete versioned export directories atomically.
- [x] Let backend read DuckDB directly and map the clean values to its approved model.
- [x] Keep application users, notes/comments, assignments, transactions, and seed markers backend-owned.
- [x] Document runnable commands and the actual container/runtime handoff.
- [ ] Reassess memory materialization and batching before applying this design to substantially larger datasets.

## Verification boundary

The current data checks are documented in the README and the study-guide quality page. The earlier 160-test count included an unused database-writing path and is historical; current test totals are reported after cleanup. Backend's own tests cover real seed transactions and repeat behavior. Data tests do not certify a live application deployment.
