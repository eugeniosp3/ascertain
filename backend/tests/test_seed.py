"""Real PostgreSQL transaction tests, isolated from the application's public schema.

Use the parent-owned ``pg_engine`` fixture, which requires a migrated, disposable
``TEST_DATABASE_URL`` ending in ``_tests``. Each test gets an independent schema
because seeding must own its commit/rollback boundary instead of using db_session.
"""

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from alembic.script import ScriptDirectory
from sqlalchemy import Connection, Engine, MetaData, event, func, insert, select, text, update
from sqlalchemy.schema import CreateSchema, DropSchema

from app import seed
from app.db import Base
from app.models import Patient, seeded_patient_id
from app.schemas.imports import SeedReport
from app.services import seeding
from app.utils.duckdb_source import load_duckdb_source


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


def test_no_database_configuration_is_redacted(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    outcome = seeding.run_seed(check_only=True)
    assert outcome.status == "not_ready"
    assert outcome.exit_code == 1
    assert any(check.name == "config.database_url" for check in outcome.checks)
    failure = seeding.run_seed("postgresql://private:secret@127.0.0.1:1/missing", check_only=True)
    assert not failure.passed
    assert "secret" not in str(failure)
    assert "private" not in str(failure)


def test_unavailable_metadata_is_blocked_without_connecting(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine = MagicMock(spec=Engine)
    monkeypatch.setattr(Base, "metadata", MetaData())
    outcome = seeding.run_seed(engine=engine)
    assert outcome.status == "blocked"
    engine.connect.assert_not_called()


def test_check_only_executes_no_writes_or_advisory_lock(
    pg_engine: Engine, seed_schema: str
) -> None:
    statements = []

    def record(connection: Connection, cursor, statement: str, *args: object) -> None:
        statements.append(statement)

    event.listen(pg_engine, "before_cursor_execute", record)
    try:
        outcome = seeding.run_seed(engine=pg_engine, schema=seed_schema, check_only=True)
    finally:
        event.remove(pg_engine, "before_cursor_execute", record)
    assert outcome.status == "ready", outcome
    assert all(value == 0 for value in counts(pg_engine, seed_schema).values())
    assert "SET TRANSACTION READ ONLY" in statements
    assert all(
        statement.lstrip().split()[0].upper() in {"SELECT", "SET", "SHOW"}
        for statement in statements
    )
    assert not any("pg_advisory" in statement for statement in statements)


def test_seed_is_atomic_and_preserves_edits_deletions_and_tombstones(
    pg_engine: Engine,
    seed_schema: str,
) -> None:
    operations = []
    connections = set()

    def record(connection: Connection, cursor, statement: str, *args: object) -> None:
        operations.append(statement)
        connections.add(id(connection))

    event.listen(pg_engine, "before_cursor_execute", record)
    try:
        outcome = seeding.run_seed(engine=pg_engine, schema=seed_schema)
    finally:
        event.remove(pg_engine, "before_cursor_execute", record)
    assert outcome.status == "seeded", outcome
    assert len(connections) == 1
    lock = next(index for index, sql in enumerate(operations) if "pg_advisory_xact_lock" in sql)
    first_write = next(index for index, sql in enumerate(operations) if sql.startswith("INSERT"))
    assert lock < first_write
    assert operations[first_write].startswith(f"INSERT INTO {seed_schema}.seed_runs")
    expected = {name: 0 for name in Base.metadata.tables}
    expected.update({"seed_runs": 3, "patients": 100, **seeding.DEMO_COUNTS})
    assert counts(pg_engine, seed_schema) == expected

    snapshot = load_duckdb_source()
    patient_table = Base.metadata.tables["patients"]
    with pg_engine.begin() as connection:
        connection = connection.execution_options(schema_translate_map={None: seed_schema})
        rows = (
            connection.execute(select(patient_table).order_by(patient_table.c.source_patient_id))
            .mappings()
            .all()
        )
        for row, source in zip(rows, snapshot.patients, strict=True):
            assert row["id"] == seeded_patient_id(source.source_patient_id)
            assert row["id"] not in {
                source.source_lineage.bronze_id,
                source.source_lineage.silver_id,
            }
            assert row["source_record"] == source.source_record
            assert row["source_lineage"] == source.source_lineage.model_dump(
                mode="json", exclude_none=True
            )
            assert row["source_created_at"] == source.source_created_at
            assert row["source_updated_at"] == source.source_updated_at
            assert row["profile_details"] == source.profile_details.model_dump(mode="json")
            assert row["blood_type"] is None and row["status"] == "active"
        runs = Base.metadata.tables["seed_runs"]
        markers = connection.execute(select(runs)).mappings().all()
        assert {row["dataset_key"] for row in markers} == {
            snapshot.dataset_key,
            seeding.DEMO_DATASET_KEY,
            seeding.DEMO_ASSIGNMENTS_DATASET_KEY,
        }
        assert all(row["completed_at"] is not None for row in markers)
        connection.execute(
            update(patient_table)
            .where(patient_table.c.id == rows[0]["id"])
            .values(first_name="Application edit")
        )
        connection.execute(patient_table.delete().where(patient_table.c.id == rows[1]["id"]))
        notes = Base.metadata.tables["notes"]
        connection.execute(
            update(notes)
            .where(notes.c.id == seeding.DEMO_NOTE_IDS[0])
            .values(
                title=None,
                content=None,
                deleted_at=func.now(),
                deleted_by_id=seeding.DEMO_USER_IDS[0],
            )
        )
        connection.execute(
            Base.metadata.tables["comments"]
            .delete()
            .where(Base.metadata.tables["comments"].c.id == seeding.DEMO_COMMENT_IDS[1])
        )
    before_repeat = counts(pg_engine, seed_schema)

    repeated = seeding.run_seed(engine=pg_engine, schema=seed_schema)

    assert repeated.status == "already_complete", repeated
    assert repeated.seed_run_id == outcome.seed_run_id
    assert counts(pg_engine, seed_schema) == before_repeat
    with pg_engine.connect() as connection:
        connection = connection.execution_options(schema_translate_map={None: seed_schema})
        assert (
            connection.execute(
                select(patient_table.c.first_name).where(
                    patient_table.c.id == seeded_patient_id("PT-0001")
                )
            ).scalar_one()
            == "Application edit"
        )
        assert connection.execute(
            select(notes.c.title, notes.c.content, notes.c.deleted_by_id).where(
                notes.c.id == seeding.DEMO_NOTE_IDS[0]
            )
        ).one() == (None, None, seeding.DEMO_USER_IDS[0])


@pytest.mark.parametrize("step", ["_write_demo", "_assign_surviving_patients"])
def test_write_failure_rolls_back_patients_users_assignments_and_markers(
    pg_engine: Engine,
    seed_schema: str,
    monkeypatch: pytest.MonkeyPatch,
    step: str,
) -> None:
    original = getattr(seeding, step)

    def fail_after_step(*args: object, **kwargs: object) -> object:
        original(*args, **kwargs)
        raise RuntimeError("secret patient payload should never be printed")

    monkeypatch.setattr(seeding, step, fail_after_step)
    outcome = seeding.run_seed(engine=pg_engine, schema=seed_schema)
    assert outcome.status == "failed", outcome
    assert "secret" not in str(outcome)
    assert all(value == 0 for value in counts(pg_engine, seed_schema).values())
    monkeypatch.setattr(seeding, step, original)
    assert seeding.run_seed(engine=pg_engine, schema=seed_schema).status == "seeded"


def test_concurrent_startup_rechecks_markers_under_the_shared_lock(
    pg_engine: Engine,
    seed_schema: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ready = Barrier(2)
    original = seeding._write

    def start_together(*args, **kwargs):
        ready.wait(timeout=10)
        return original(*args, **kwargs)

    monkeypatch.setattr(seeding, "_write", start_together)
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(seeding.run_seed, engine=pg_engine, schema=seed_schema)
            for _ in range(2)
        ]
        outcomes = [future.result(timeout=20) for future in futures]
    assert {outcome.status for outcome in outcomes} == {"seeded", "already_complete"}, outcomes
    assert outcomes[0].seed_run_id == outcomes[1].seed_run_id
    actual = counts(pg_engine, seed_schema)
    assert actual["patients"] == 100 and actual["seed_runs"] == 3
    assert all(actual[name] == count for name, count in seeding.DEMO_COUNTS.items())


@pytest.mark.parametrize(
    "damage",
    [
        "ALTER TABLE patients DROP COLUMN source_record",
        "ALTER TABLE patients DROP CONSTRAINT patients_source_patient_id_key",
        "ALTER TABLE patients DROP CONSTRAINT patients_source_provenance",
        "ALTER TABLE patients ALTER COLUMN source_patient_id TYPE integer USING NULL",
        "ALTER TABLE patients ALTER COLUMN first_name DROP NOT NULL",
        "ALTER TABLE patients DROP COLUMN assigned_user_id",
        "ALTER TABLE patients DROP CONSTRAINT patients_assigned_user_id_fkey",
        "ALTER TABLE patients ALTER COLUMN assigned_user_id SET NOT NULL",
        "ALTER TABLE users ALTER COLUMN created_at DROP DEFAULT",
        "DROP TABLE comments CASCADE",
        "UPDATE alembic_version SET version_num = 'outdated'",
    ],
)
def test_schema_or_revision_failure_writes_no_markers(
    pg_engine: Engine,
    seed_schema: str,
    damage: str,
) -> None:
    with pg_engine.begin() as connection:
        connection.execute(text(f'SET LOCAL search_path TO "{seed_schema}"'))
        connection.execute(text(damage))
    outcome = seeding.run_seed(engine=pg_engine, schema=seed_schema)
    assert outcome.status == "not_ready", outcome
    with pg_engine.connect() as connection:
        assert (
            connection.execute(text(f'SELECT count(*) FROM "{seed_schema}".seed_runs')).scalar_one()
            == 0
        )
        assert (
            connection.execute(text(f'SELECT count(*) FROM "{seed_schema}".patients')).scalar_one()
            == 0
        )


ASSIGNMENT_MARKER_DAMAGE = {
    "assignment_hash": {"source_hashes": {"changed": "hash"}},
    "assignment_count": {"row_counts": {"patients": 101}},
    "assignment_manifest": {"export_manifest": {"fixture_version": "demo-assignments-v1"}},
    "assignment_version": {"dataset_key": "demo-assignments-v0"},
}


@pytest.mark.parametrize(
    "damage", ["hash", "count", "missing_demo", "version", *ASSIGNMENT_MARKER_DAMAGE]
)
def test_marker_conflicts_never_overwrite(pg_engine: Engine, seed_schema: str, damage: str) -> None:
    assert seeding.run_seed(engine=pg_engine, schema=seed_schema).status == "seeded"
    runs = Base.metadata.tables["seed_runs"]
    with pg_engine.begin() as connection:
        connection = connection.execution_options(schema_translate_map={None: seed_schema})
        if damage in ASSIGNMENT_MARKER_DAMAGE:
            connection.execute(
                update(runs)
                .where(runs.c.dataset_key == seeding.DEMO_ASSIGNMENTS_DATASET_KEY)
                .values(**ASSIGNMENT_MARKER_DAMAGE[damage])
            )
        elif damage == "hash":
            connection.execute(update(runs).values(source_hashes={"changed": "hash"}))
        elif damage == "count":
            connection.execute(update(runs).values(row_counts={}))
        elif damage == "missing_demo":
            connection.execute(runs.delete().where(runs.c.dataset_key == seeding.DEMO_DATASET_KEY))
        else:
            connection.execute(
                update(runs)
                .where(runs.c.dataset_key == seeding.DEMO_DATASET_KEY)
                .values(dataset_key="demo-fixtures-v0")
            )
    before = counts(pg_engine, seed_schema)
    assert seeding.run_seed(engine=pg_engine, schema=seed_schema).status == "not_ready"
    assert counts(pg_engine, seed_schema) == before


def test_unmarked_source_conflict_is_not_overwritten(pg_engine: Engine, seed_schema: str) -> None:
    table = Patient.__table__
    with pg_engine.begin() as connection:
        connection = connection.execution_options(schema_translate_map={None: seed_schema})
        connection.execute(
            insert(table).values(
                id=seeded_patient_id("PT-0001"),
                first_name="Existing",
                last_name="Patient",
                date_of_birth=load_duckdb_source().patients[0].date_of_birth,
            )
        )
    outcome = seeding.run_seed(engine=pg_engine, schema=seed_schema)
    assert outcome.status == "not_ready"
    assert counts(pg_engine, seed_schema)["patients"] == 1
    assert counts(pg_engine, seed_schema)["seed_runs"] == 0


def test_advisory_lock_is_bounded_and_prevents_partial_write(
    pg_engine: Engine, seed_schema: str
) -> None:
    with pg_engine.connect() as blocker, blocker.begin():
        blocker.execute(
            text("SELECT pg_advisory_xact_lock(:key)"), {"key": seeding.PATIENT_IMPORT_LOCK_KEY}
        )
        outcome = seeding.run_seed(engine=pg_engine, schema=seed_schema, lock_timeout_ms=100)
    assert outcome.status == "failed", outcome
    assert all(value == 0 for value in counts(pg_engine, seed_schema).values())


def test_cli_passes_custom_paths_and_exits_nonzero_safely(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    from patient_data.utils.checks import CheckResult

    run = MagicMock(
        return_value=SeedReport(
            "not_ready",
            (CheckResult(name="database", status="failed", message="Database is unavailable"),),
        )
    )
    monkeypatch.setattr(seed, "run_seed", run)
    assert seed.main(["--check-only", "--bronze", "b.duckdb", "--silver", "s.duckdb"]) == 1
    assert run.call_args.kwargs["check_only"] is True
    assert str(run.call_args.kwargs["bronze"]) == "b.duckdb"
    assert "FAILED database" in capsys.readouterr().out
