"""Synthetic workload assignment seeding: cohorts, legacy backfill, reruns, and safety.

PostgreSQL tests use the parent-owned ``pg_engine`` fixture and an independent schema per
test, because seeding owns its real commit/rollback boundary. ``legacy_import`` commits
exactly what the pre-assignment release seeded (patient and demo markers, 100 patients,
demo fixtures, no assignment marker) by running the seed without its assignment step.
"""

import hashlib
from collections import Counter
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from threading import Barrier
from typing import Any
from uuid import UUID, uuid4

import pytest
from alembic.script import ScriptDirectory
from patient_data.utils.checks import CheckReport
from patient_data.utils.database import TargetConstraint
from sqlalchemy import Connection, Engine, create_engine, event, func, insert, select, text, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.pool import NullPool
from sqlalchemy.schema import CreateSchema, DropSchema
from sqlalchemy.sql.base import Executable

from app.db import Base
from app.models import seeded_patient_id
from app.schemas.imports import SeedReport
from app.services import seeding
from app.utils.duckdb_source import DuckDBSnapshot, load_duckdb_source

CLINICIAN = UUID("dbb2a520-ebc6-5d4e-a8f5-3f078475bdf9")
COORDINATOR = UUID("16473cca-a94f-5f5c-b71e-c09f6a466e49")
PATIENTS = Base.metadata.tables["patients"]
RUNS = Base.metadata.tables["seed_runs"]
USERS = Base.metadata.tables["users"]


@pytest.fixture
def seed_schema(pg_engine: Engine) -> Iterator[str]:
    schema = "seed_test_" + uuid4().hex
    with pg_engine.begin() as connection:
        connection.execute(CreateSchema(schema))
        connection = connection.execution_options(schema_translate_map={None: schema})
        Base.metadata.create_all(connection)
        connection.execute(
            text(f'CREATE TABLE "{schema}".alembic_version (version_num varchar(32) PRIMARY KEY)')
        )
        for head in ScriptDirectory(str(seeding._ALEMBIC_DIR)).get_heads():
            connection.execute(
                text(f'INSERT INTO "{schema}".alembic_version VALUES (:head)'), {"head": head}
            )
    try:
        yield schema
    finally:
        with pg_engine.begin() as connection:
            connection.execute(DropSchema(schema, cascade=True))


def counts(engine: Engine, schema: str) -> dict[str, int]:
    with engine.connect() as connection:
        connection = connection.execution_options(schema_translate_map={None: schema})
        return {
            name: connection.execute(select(func.count()).select_from(table)).scalar_one()
            for name, table in Base.metadata.tables.items()
        }


def patient_rows(engine: Engine, schema: str) -> dict[UUID, dict[str, Any]]:
    with engine.connect() as connection:
        connection = connection.execution_options(schema_translate_map={None: schema})
        return {row["id"]: dict(row) for row in connection.execute(select(PATIENTS)).mappings()}


def markers(engine: Engine, schema: str) -> dict[str, dict[str, Any]]:
    with engine.connect() as connection:
        connection = connection.execution_options(schema_translate_map={None: schema})
        return {
            row["dataset_key"]: dict(row) for row in connection.execute(select(RUNS)).mappings()
        }


def apply(engine: Engine, schema: str, *statements: Executable) -> None:
    with engine.begin() as connection:
        connection = connection.execution_options(schema_translate_map={None: schema})
        for statement in statements:
            connection.execute(statement)


def message(outcome: SeedReport, name: str) -> str:
    return next(check.message for check in reversed(outcome.checks) if check.name == name)


def assignment_manifest(source: DuckDBSnapshot) -> dict[str, object]:
    return {
        "fixture_version": "demo-assignments-v1",
        "patient_dataset_key": source.dataset_key,
        "assignment_algorithm": "sha256-utf8-first8-big-endian-modulo2",
        "roster_user_ids": [str(CLINICIAN), str(COORDINATOR)],
        "synthetic": True,
    }


def without_assignment(row: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in row.items() if key != "assigned_user_id"}


def legacy_import(engine: Engine, schema: str, monkeypatch: pytest.MonkeyPatch) -> UUID:
    """Commit the previous release's completed import, with golden marker shapes."""
    with monkeypatch.context() as patch:
        patch.setattr(seeding, "_write_assignments", lambda *args, **kwargs: (0, 0))
        outcome = seeding.run_seed(engine=engine, schema=schema)
    assert outcome.status == "seeded" and outcome.seed_run_id is not None, outcome
    source = load_duckdb_source()
    found = markers(engine, schema)
    assert set(found) == {source.dataset_key, seeding.DEMO_DATASET_KEY}
    assert found[source.dataset_key]["row_counts"] == {"patients": 100}
    assert found[source.dataset_key]["export_manifest"] == source.manifest
    assert found[seeding.DEMO_DATASET_KEY]["export_manifest"] == {
        "fixture_version": "demo-fixtures-v1",
        "patient_dataset_key": source.dataset_key,
        "patient_source_id": "PT-0001",
        "synthetic": True,
    }
    assert found[seeding.DEMO_DATASET_KEY]["row_counts"] == {
        "users": 2,
        "notes": 2,
        "comments": 2,
        "comment_note_links": 1,
    }
    rows = patient_rows(engine, schema).values()
    assert len(rows) == 100 and all(row["assigned_user_id"] is None for row in rows)
    return outcome.seed_run_id


def test_roster_and_cohorts_follow_the_documented_hash() -> None:
    assert seeding.DEMO_USER_IDS == (CLINICIAN, COORDINATOR)
    cohorts: Counter[UUID] = Counter()
    for patient in load_duckdb_source().patients:
        digest = hashlib.sha256(patient.source_patient_id.encode("utf-8")).digest()
        expected = (CLINICIAN, COORDINATOR)[digest[7] & 1]
        assert (CLINICIAN, COORDINATOR)[int.from_bytes(digest[:8], "big") % 2] == expected
        assert seeding._assignment_user_id(patient.source_patient_id) == expected
        cohorts[expected] += 1
    assert cohorts == {CLINICIAN: 52, COORDINATOR: 48}
    assert seeding._assignment_user_id("PT-0001") == CLINICIAN
    for key in (" PT-0001", "pt-0001", "PT-0001\n", "PT-0001é"):
        digest = hashlib.sha256(key.encode("utf-8")).digest()
        assert seeding._assignment_user_id(key) == (CLINICIAN, COORDINATOR)[digest[7] & 1]


def test_preflight_contract_requires_patient_update_and_nullable_assignment_fk() -> None:
    target = seeding._load_target(CheckReport())
    assert target is not None
    tables = {table.name: table for table in target.contract.tables}
    assert {"SELECT", "INSERT", "UPDATE"} <= tables["patients"].privileges
    column = next(item for item in tables["patients"].columns if item.name == "assigned_user_id")
    assert column.supplied and column.may_write_null
    assert (
        TargetConstraint("foreign_key", "patients", ("assigned_user_id",), "users", ("id",))
        in target.contract.constraints
    )


def test_fresh_seed_assigns_every_imported_patient_and_no_api_patient(
    pg_engine: Engine, seed_schema: str
) -> None:
    api_patient = uuid4()
    apply(
        pg_engine,
        seed_schema,
        insert(PATIENTS).values(
            id=api_patient, first_name="Api", last_name="Created", date_of_birth=date(1990, 1, 1)
        ),
    )
    outcome = seeding.run_seed(engine=pg_engine, schema=seed_schema)
    assert outcome.status == "seeded", outcome
    assert message(outcome, "seed.assignments") == (
        "100 surviving imported patients assigned; 0 existing assignments preserved"
    )
    rows = patient_rows(pg_engine, seed_schema)
    assert rows[api_patient]["assigned_user_id"] is None
    imported = [row for row in rows.values() if row["source_patient_id"] is not None]
    assert len(imported) == 100
    for row in imported:
        assert row["assigned_user_id"] == seeding._assignment_user_id(row["source_patient_id"])
        assert row["updated_at"] == row["created_at"]
    assert Counter(row["assigned_user_id"] for row in imported) == {CLINICIAN: 52, COORDINATOR: 48}
    source = load_duckdb_source()
    marker = markers(pg_engine, seed_schema)[seeding.DEMO_ASSIGNMENTS_DATASET_KEY]
    assert marker["row_counts"] == {"patients": 100}
    assert marker["export_manifest"] == assignment_manifest(source)
    assert marker["dataset_date"] == source.dataset_date
    assert marker["source_hashes"] == source.source_hashes


def test_completed_legacy_import_backfills_only_surviving_unassigned_imports(
    pg_engine: Engine, seed_schema: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    legacy_run = legacy_import(pg_engine, seed_schema, monkeypatch)
    deleted, preassigned, cross_assigned, edited = (
        seeded_patient_id(f"PT-{number:04d}") for number in (2, 3, 4, 5)
    )
    opposite = next(
        user for user in seeding.DEMO_USER_IDS if user != seeding._assignment_user_id("PT-0004")
    )
    other_user, api_unassigned, api_assigned = uuid4(), uuid4(), uuid4()
    apply(
        pg_engine,
        seed_schema,
        insert(USERS).values(id=other_user, display_name="Application user", is_active=True),
        PATIENTS.delete().where(PATIENTS.c.id == deleted),
        update(PATIENTS).where(PATIENTS.c.id == preassigned).values(assigned_user_id=other_user),
        update(PATIENTS).where(PATIENTS.c.id == cross_assigned).values(assigned_user_id=opposite),
        update(PATIENTS)
        .where(PATIENTS.c.id == edited)
        .values(first_name="Application edit", status="inactive", last_visit=None),
        insert(PATIENTS).values(
            id=api_unassigned, first_name="Api", last_name="Open", date_of_birth=date(1990, 1, 1)
        ),
        insert(PATIENTS).values(
            id=api_assigned,
            first_name="Api",
            last_name="Owned",
            date_of_birth=date(1991, 2, 3),
            assigned_user_id=COORDINATOR,
        ),
    )
    before, before_counts = patient_rows(pg_engine, seed_schema), counts(pg_engine, seed_schema)

    outcome = seeding.run_seed(engine=pg_engine, schema=seed_schema)

    assert outcome.status == "seeded", outcome
    assert outcome.seed_run_id == legacy_run
    assert message(outcome, "seed.assignments") == (
        "97 surviving imported patients assigned; 2 existing assignments preserved"
    )
    after = patient_rows(pg_engine, seed_schema)
    assert after.keys() == before.keys() and deleted not in after
    assert counts(pg_engine, seed_schema) == {**before_counts, "seed_runs": 3}
    for patient_id, row in after.items():
        # Profile, status, visit, identifiers, provenance and updated_at are untouched.
        assert without_assignment(row) == without_assignment(before[patient_id])
        previous = before[patient_id]["assigned_user_id"]
        if previous is None and row["source_patient_id"] is not None:
            assert row["assigned_user_id"] == seeding._assignment_user_id(row["source_patient_id"])
        else:
            assert row["assigned_user_id"] == previous
    assert after[preassigned]["assigned_user_id"] == other_user
    assert after[cross_assigned]["assigned_user_id"] == opposite
    assert after[api_unassigned]["assigned_user_id"] is None
    assert after[api_assigned]["assigned_user_id"] == COORDINATOR
    assert after[edited]["first_name"] == "Application edit"
    assert after[edited]["status"] == "inactive" and after[edited]["last_visit"] is None
    marker = markers(pg_engine, seed_schema)[seeding.DEMO_ASSIGNMENTS_DATASET_KEY]
    assert marker["row_counts"] == {"patients": 97}
    assert marker["export_manifest"] == assignment_manifest(load_duckdb_source())

    repeated = seeding.run_seed(engine=pg_engine, schema=seed_schema)
    assert repeated.status == "already_complete", repeated
    assert patient_rows(pg_engine, seed_schema) == after


@pytest.mark.parametrize("origin", ["fresh", "upgraded"])
def test_completed_assignments_preserve_reassignment_unassignment_and_deletion(
    pg_engine: Engine, seed_schema: str, monkeypatch: pytest.MonkeyPatch, origin: str
) -> None:
    if origin == "upgraded":
        legacy_import(pg_engine, seed_schema, monkeypatch)
    first = seeding.run_seed(engine=pg_engine, schema=seed_schema)
    assert first.status == "seeded", first
    reassigned, unassigned, deleted = (
        seeded_patient_id(f"PT-{number:04d}") for number in (1, 6, 7)
    )
    assert seeding._assignment_user_id("PT-0001") == CLINICIAN
    apply(
        pg_engine,
        seed_schema,
        update(PATIENTS).where(PATIENTS.c.id == reassigned).values(assigned_user_id=COORDINATOR),
        update(PATIENTS).where(PATIENTS.c.id == unassigned).values(assigned_user_id=None),
        PATIENTS.delete().where(PATIENTS.c.id == deleted),
        # Roster changes after completion do not block or re-arm the backfill.
        update(USERS).where(USERS.c.id == CLINICIAN).values(is_active=False),
    )
    before, before_counts = patient_rows(pg_engine, seed_schema), counts(pg_engine, seed_schema)

    for _ in range(2):
        repeated = seeding.run_seed(engine=pg_engine, schema=seed_schema)
        assert repeated.status == "already_complete", repeated
        assert repeated.seed_run_id == first.seed_run_id
    assert seeding.run_seed(engine=pg_engine, schema=seed_schema, check_only=True).status == (
        "ready"
    )

    after = patient_rows(pg_engine, seed_schema)
    assert after == before and counts(pg_engine, seed_schema) == before_counts
    assert after[reassigned]["assigned_user_id"] == COORDINATOR
    assert after[unassigned]["assigned_user_id"] is None
    assert deleted not in after


def test_backfill_failure_rolls_back_marker_and_every_assignment(
    pg_engine: Engine, seed_schema: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    legacy_import(pg_engine, seed_schema, monkeypatch)
    before, before_counts = patient_rows(pg_engine, seed_schema), counts(pg_engine, seed_schema)
    original = seeding._assign_surviving_patients

    def fail_after_assigning(*args: Any, **kwargs: Any) -> tuple[int, int]:
        original(*args, **kwargs)
        raise RuntimeError("secret patient payload should never be printed")

    monkeypatch.setattr(seeding, "_assign_surviving_patients", fail_after_assigning)
    outcome = seeding.run_seed(engine=pg_engine, schema=seed_schema)
    assert outcome.status == "failed", outcome
    assert "secret" not in str(outcome)
    assert patient_rows(pg_engine, seed_schema) == before
    assert counts(pg_engine, seed_schema) == before_counts
    assert seeding.DEMO_ASSIGNMENTS_DATASET_KEY not in markers(pg_engine, seed_schema)

    monkeypatch.setattr(seeding, "_assign_surviving_patients", original)
    assert seeding.run_seed(engine=pg_engine, schema=seed_schema).status == "seeded"
    assert all(row["assigned_user_id"] for row in patient_rows(pg_engine, seed_schema).values())


def test_check_only_reports_pending_backfill_without_writes_or_locks(
    pg_engine: Engine, seed_schema: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    legacy_run = legacy_import(pg_engine, seed_schema, monkeypatch)
    before, before_counts = patient_rows(pg_engine, seed_schema), counts(pg_engine, seed_schema)
    statements: list[str] = []

    def record(connection: Connection, cursor: object, statement: str, *args: object) -> None:
        statements.append(statement)

    event.listen(pg_engine, "before_cursor_execute", record)
    try:
        outcome = seeding.run_seed(engine=pg_engine, schema=seed_schema, check_only=True)
    finally:
        event.remove(pg_engine, "before_cursor_execute", record)
    assert outcome.status == "ready", outcome
    assert outcome.seed_run_id == legacy_run
    assert "only synthetic assignments are pending" in message(outcome, "import.state")
    assert "SET TRANSACTION READ ONLY" in statements
    assert all(
        statement.lstrip().split()[0].upper() in {"SELECT", "SET", "SHOW"}
        for statement in statements
    )
    assert not any(
        marker in statement
        for statement in statements
        for marker in ("pg_advisory", "FOR UPDATE", "FOR NO KEY UPDATE", "FOR SHARE")
    )
    assert patient_rows(pg_engine, seed_schema) == before
    assert counts(pg_engine, seed_schema) == before_counts


def test_backfill_requires_both_existing_active_roster_users(
    pg_engine: Engine, seed_schema: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    legacy_import(pg_engine, seed_schema, monkeypatch)
    apply(
        pg_engine,
        seed_schema,
        update(USERS).where(USERS.c.id == COORDINATOR).values(is_active=False),
    )
    before, before_counts = patient_rows(pg_engine, seed_schema), counts(pg_engine, seed_schema)
    for check_only in (True, False):
        outcome = seeding.run_seed(engine=pg_engine, schema=seed_schema, check_only=check_only)
        assert outcome.status == "not_ready", outcome
        assert any(
            check.name == "assignments.roster" and check.status == "failed"
            for check in outcome.checks
        )
    assert patient_rows(pg_engine, seed_schema) == before
    assert counts(pg_engine, seed_schema) == before_counts


def test_concurrent_backfills_recheck_the_marker_under_the_shared_lock(
    pg_engine: Engine, seed_schema: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    legacy_import(pg_engine, seed_schema, monkeypatch)
    ready = Barrier(2)
    original = seeding._write

    def start_together(*args: Any, **kwargs: Any) -> Any:
        ready.wait(timeout=10)
        return original(*args, **kwargs)

    monkeypatch.setattr(seeding, "_write", start_together)
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(seeding.run_seed, engine=pg_engine, schema=seed_schema)
            for _ in range(2)
        ]
        outcomes = [future.result(timeout=20) for future in futures]
    assert sorted(outcome.status for outcome in outcomes) == ["already_complete", "seeded"]
    assert counts(pg_engine, seed_schema)["seed_runs"] == 3
    marker = markers(pg_engine, seed_schema)[seeding.DEMO_ASSIGNMENTS_DATASET_KEY]
    assert marker["row_counts"] == {"patients": 100}


def test_backfill_row_lock_wait_is_bounded_and_rolls_back(
    pg_engine: Engine, seed_schema: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    legacy_import(pg_engine, seed_schema, monkeypatch)
    before, before_counts = patient_rows(pg_engine, seed_schema), counts(pg_engine, seed_schema)
    with pg_engine.connect() as blocker:
        blocker = blocker.execution_options(schema_translate_map={None: seed_schema})
        with blocker.begin():
            blocker.execute(
                select(PATIENTS.c.id)
                .where(PATIENTS.c.source_patient_id == "PT-0050")
                .with_for_update()
            ).one()
            outcome = seeding.run_seed(engine=pg_engine, schema=seed_schema, lock_timeout_ms=100)
    assert outcome.status == "failed", outcome
    assert patient_rows(pg_engine, seed_schema) == before
    assert counts(pg_engine, seed_schema) == before_counts
    assert seeding.run_seed(engine=pg_engine, schema=seed_schema).status == "seeded"


def test_missing_patient_update_privilege_is_not_ready_before_any_write(
    pg_engine: Engine, seed_schema: str
) -> None:
    role = f"{seed_schema}_no_update"
    try:
        with pg_engine.begin() as connection:
            connection.exec_driver_sql(f'CREATE ROLE "{role}" NOLOGIN')
    except DBAPIError:
        pytest.skip("The test database user cannot create a restricted role")
    limited = create_engine(pg_engine.url, poolclass=NullPool, hide_parameters=True)

    @event.listens_for(limited, "connect")
    def assume_role(dbapi_connection: Any, _record: object) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute(f'SET ROLE "{role}"')
        cursor.close()
        dbapi_connection.commit()

    try:
        with pg_engine.begin() as connection:
            connection.exec_driver_sql(f'GRANT USAGE ON SCHEMA "{seed_schema}" TO "{role}"')
            connection.exec_driver_sql(
                f'GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA "{seed_schema}" TO "{role}"'
            )
            connection.exec_driver_sql(f'REVOKE UPDATE ON "{seed_schema}".patients FROM "{role}"')
        for check_only in (True, False):
            outcome = seeding.run_seed(engine=limited, schema=seed_schema, check_only=check_only)
            assert outcome.status == "not_ready", outcome
            failed = {check.name for check in outcome.checks if check.status == "failed"}
            assert "privilege.patients" in failed
        assert all(value == 0 for value in counts(pg_engine, seed_schema).values())
    finally:
        limited.dispose()
        with pg_engine.begin() as connection:
            connection.exec_driver_sql(f'DROP OWNED BY "{role}"')
            connection.exec_driver_sql(f'DROP ROLE "{role}"')
