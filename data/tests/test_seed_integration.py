"""Seed command against a disposable PostgreSQL database.

Opt-in: set ``PATIENT_DATA_TEST_DATABASE_URL`` to an **explicitly disposable** database.
Every test creates its own uniquely named schema (and, for the permission test, a role)
and drops it afterwards; nothing else in the database is touched.

Honest scope: backend has no models, migrations, or persistence operation yet. The schema
created here is a *test fixture* shaped like the unapproved backend draft, and
``FixturePatientWriter`` is a *test double* standing in for the backend writer. These
tests prove the data-owned gate, transaction, lock, and repeat behavior; they are not
backend integration.
"""

import os
import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

import pytest
from pydantic import SecretStr
from sqlalchemy import Connection, Engine, create_engine, text
from sqlalchemy.engine import make_url

from patient_data.package import ValidatedPackage
from patient_data.seed import PATIENT_IMPORT_LOCK_KEY, SeedOutcome, run_seed
from patient_data.settings import SeedSettings
from patient_data.utils.database import TargetColumn, TargetContract, TargetTable, TypeFamily
from patient_data.utils.identifiers import canonical_json

TEST_URL = os.environ.get("PATIENT_DATA_TEST_DATABASE_URL")
pytestmark = [
    pytest.mark.postgres,
    pytest.mark.skipif(not TEST_URL, reason="PATIENT_DATA_TEST_DATABASE_URL not set"),
]
REVISION = "fixture_revision_1"

FIXTURE_DDL = """
CREATE TABLE {s}.alembic_version (version_num varchar(32) PRIMARY KEY);
INSERT INTO {s}.alembic_version VALUES ('{revision}');
CREATE TABLE {s}.seed_runs (
  id uuid PRIMARY KEY,
  dataset_key varchar(100) NOT NULL UNIQUE,
  dataset_date date NOT NULL,
  source_hashes jsonb NOT NULL,
  export_manifest jsonb NOT NULL,
  row_counts jsonb NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE {s}.patients (
  id uuid PRIMARY KEY,
  source_patient_id varchar(40) UNIQUE,
  first_name varchar(100) NOT NULL,
  last_name varchar(100) NOT NULL,
  date_of_birth date NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'active',
  source_record jsonb,
  source_lineage jsonb,
  seed_run_id uuid REFERENCES {s}.seed_runs (id),
  created_at timestamptz NOT NULL DEFAULT now()
);
"""


@dataclass
class FixturePatientWriter:
    """TEST DOUBLE ONLY: inserts a few columns so the seed transaction can be exercised."""

    schema: str
    fail_after: int | None = None
    count_delta: int = 0
    commit: bool = False
    delay_s: float = 0.0
    calls: list[UUID] = field(default_factory=list)

    def target_contract(self) -> TargetContract:
        text_type: frozenset[TypeFamily] = frozenset({"text"})
        return TargetContract(
            tables=(
                TargetTable(
                    "patients",
                    (
                        TargetColumn("id", frozenset({"uuid"})),
                        TargetColumn("first_name", text_type),
                        TargetColumn("last_name", text_type),
                        TargetColumn("date_of_birth", frozenset({"date"})),
                        TargetColumn("source_record", frozenset({"jsonb"})),
                    ),
                ),
            ),
            supported_revisions=frozenset({REVISION}),
        )

    def write_patients(
        self, package: ValidatedPackage, connection: Connection, *, seed_run_id: UUID
    ) -> int:
        self.calls.append(seed_run_id)
        statement = text(
            f"INSERT INTO {self.schema}.patients (id, source_patient_id, first_name, last_name, "
            "date_of_birth, source_record, source_lineage, seed_run_id) VALUES (:id, :sid, "
            ":first, :last, :dob, CAST(:record AS jsonb), CAST(:lineage AS jsonb), :run)"
        )
        for index, line in enumerate(package.lines):
            if self.fail_after is not None and index == self.fail_after:
                raise RuntimeError("simulated failure inside the persistence operation")
            record = line.record
            connection.execute(
                statement,
                {
                    "id": uuid5(NAMESPACE_URL, f"fixture:{record.source_patient_id}"),
                    "sid": record.source_patient_id,
                    "first": record.first_name,
                    "last": record.last_name,
                    "dob": record.date_of_birth,
                    "record": canonical_json(record.source_record),
                    "lineage": canonical_json(line.lineage.model_dump(mode="json")),
                    "run": seed_run_id,
                },
            )
        time.sleep(self.delay_s)
        if self.commit:
            connection.commit()
        return len(package.lines) + self.count_delta


@pytest.fixture(scope="module")
def engine() -> Iterator[Engine]:
    assert TEST_URL is not None
    created = create_engine(make_url(TEST_URL).set(drivername="postgresql+psycopg"))
    yield created
    created.dispose()


@pytest.fixture
def schema(engine: Engine) -> Iterator[str]:
    name = f"seedtest_{uuid4().hex[:12]}"
    with engine.begin() as connection:
        connection.exec_driver_sql(f"CREATE SCHEMA {name}")
        connection.exec_driver_sql(FIXTURE_DDL.format(s=name, revision=REVISION))
    yield name
    with engine.begin() as connection:
        connection.exec_driver_sql(f"DROP SCHEMA {name} CASCADE")


def _settings(package: Path, schema: str, url: str | None = None, **extra: object) -> SeedSettings:
    assert TEST_URL is not None
    values = {
        "database_url": SecretStr(url or TEST_URL),
        "schema_name": schema,
        "package_dir": package,
        "connect_timeout_s": 3,
        **extra,
    }
    return SeedSettings.model_construct(**{**SeedSettings().model_dump(), **values})


def _scalar(engine: Engine, sql: str) -> object:
    with engine.connect() as connection:
        return connection.execute(text(sql)).scalar_one()


def _counts(engine: Engine, schema: str) -> tuple[object, object]:
    return (
        _scalar(engine, f"SELECT count(*) FROM {schema}.patients"),
        _scalar(engine, f"SELECT count(*) FROM {schema}.seed_runs"),
    )


def _failed(outcome: SeedOutcome) -> set[str]:
    return {r.name for r in outcome.report.results if r.status == "failed"}


def test_check_only_reports_ready_and_writes_nothing(
    engine: Engine, schema: str, exported_package: Path
) -> None:
    writer = FixturePatientWriter(schema)
    outcome = run_seed(_settings(exported_package, schema), check_only=True, persistence=writer)
    assert outcome.status == "ready", _failed(outcome)
    assert outcome.exit_code == 0
    assert writer.calls == [] and _counts(engine, schema) == (0, 0)


def test_seed_imports_all_patients_with_marker_and_lineage(
    engine: Engine, schema: str, exported_package: Path
) -> None:
    writer = FixturePatientWriter(schema)
    outcome = run_seed(_settings(exported_package, schema), check_only=False, persistence=writer)
    assert outcome.status == "seeded", _failed(outcome)
    assert _counts(engine, schema) == (100, 1)
    assert _scalar(engine, f"SELECT count(DISTINCT seed_run_id) FROM {schema}.patients") == 1
    assert _scalar(engine, f"SELECT row_counts->>'patients' FROM {schema}.seed_runs") == "100"
    assert (
        _scalar(
            engine, f"SELECT count(*) FROM {schema}.patients WHERE source_lineage ? 'bronze_id'"
        )
        == 100
    )


def test_repeat_is_a_no_op_that_preserves_edits_and_deletions(
    engine: Engine, schema: str, exported_package: Path
) -> None:
    settings = _settings(exported_package, schema)
    assert (
        run_seed(settings, check_only=False, persistence=FixturePatientWriter(schema)).status
        == "seeded"
    )
    with engine.begin() as connection:
        connection.execute(
            text(
                f"UPDATE {schema}.patients SET first_name = 'Edited' "
                "WHERE source_patient_id = 'PT-0001'"
            )
        )
        connection.execute(
            text(f"DELETE FROM {schema}.patients WHERE source_patient_id = 'PT-0002'")
        )
    writer = FixturePatientWriter(schema)
    outcome = run_seed(settings, check_only=False, persistence=writer)
    assert outcome.status == "already_complete" and outcome.exit_code == 0
    assert writer.calls == []
    assert _counts(engine, schema) == (99, 1)
    assert (
        _scalar(
            engine, f"SELECT first_name FROM {schema}.patients WHERE source_patient_id = 'PT-0001'"
        )
        == "Edited"
    )


def test_conflicting_marker_and_partial_rows_stop_the_import(
    engine: Engine, schema: str, exported_package: Path
) -> None:
    settings = _settings(exported_package, schema)
    with engine.begin() as connection:
        connection.execute(
            text(
                f"INSERT INTO {schema}.patients (id, source_patient_id, first_name, last_name, "
                "date_of_birth) VALUES (gen_random_uuid(), 'PT-0001', 'A', 'B', '2000-01-01')"
            )
        )
    writer = FixturePatientWriter(schema)
    outcome = run_seed(settings, check_only=False, persistence=writer)
    assert outcome.status == "not_ready" and "import.state" in _failed(outcome)
    assert writer.calls == []

    with engine.begin() as connection:
        connection.execute(text(f"DELETE FROM {schema}.patients"))
    assert (
        run_seed(settings, check_only=False, persistence=FixturePatientWriter(schema)).status
        == "seeded"
    )
    with engine.begin() as connection:
        connection.execute(
            text(
                f"UPDATE {schema}.seed_runs SET export_manifest = jsonb_set(export_manifest, "
                "'{patients,sha256}', '\"0\"')"
            )
        )
    outcome = run_seed(settings, check_only=False, persistence=FixturePatientWriter(schema))
    assert outcome.status == "not_ready" and "import.state" in _failed(outcome)


@pytest.mark.parametrize(
    "mutation, failed_check",
    [
        ("DROP TABLE {s}.patients", "table.patients"),
        ("DROP TABLE {s}.patients; CREATE VIEW {s}.patients AS SELECT 1 AS id", "table.patients"),
        ("ALTER TABLE {s}.patients DROP COLUMN source_lineage", "column.patients.source_lineage"),
        (
            "ALTER TABLE {s}.patients ALTER COLUMN source_lineage TYPE text",
            "column.patients.source_lineage",
        ),
        (
            "ALTER TABLE {s}.seed_runs ALTER COLUMN dataset_key TYPE varchar(20)",
            "column.seed_runs.dataset_key",
        ),
        (
            "ALTER TABLE {s}.patients ADD COLUMN extra_required text NOT NULL",
            "columns.patients.extra_required",
        ),
        (
            "ALTER TABLE {s}.patients DROP CONSTRAINT patients_source_patient_id_key",
            "constraint.unique patients(source_patient_id)",
        ),
        (
            "ALTER TABLE {s}.patients DROP CONSTRAINT patients_seed_run_id_fkey",
            "constraint.patients(seed_run_id) -> seed_runs(id)",
        ),
        ("UPDATE {s}.alembic_version SET version_num = 'older'", "database.migration_revision"),
        ("DROP TABLE {s}.alembic_version", "database.migration_revision"),
    ],
)
def test_schema_defects_block_all_writes(
    engine: Engine, schema: str, exported_package: Path, mutation: str, failed_check: str
) -> None:
    with engine.begin() as connection:
        connection.exec_driver_sql(mutation.format(s=schema))
    writer = FixturePatientWriter(schema)
    outcome = run_seed(_settings(exported_package, schema), check_only=False, persistence=writer)
    assert outcome.status == "not_ready" and outcome.exit_code == 1
    assert failed_check in _failed(outcome)
    assert writer.calls == []
    assert _scalar(engine, f"SELECT count(*) FROM {schema}.seed_runs") == 0


def test_missing_schema_is_reported(engine: Engine, exported_package: Path) -> None:
    outcome = run_seed(
        _settings(exported_package, "seedtest_absent_schema"),
        check_only=True,
        persistence=FixturePatientWriter("seedtest_absent_schema"),
    )
    assert "database.schema" in _failed(outcome)
    assert outcome.status == "not_ready"


@pytest.mark.parametrize("deny_revision", [False, True])
def test_missing_privileges_are_reported(
    engine: Engine, schema: str, exported_package: Path, deny_revision: bool
) -> None:
    assert TEST_URL is not None
    role = f"{schema}_reader"
    with engine.begin() as connection:
        connection.exec_driver_sql(f"CREATE ROLE {role} LOGIN")
        connection.exec_driver_sql(f"GRANT USAGE ON SCHEMA {schema} TO {role}")
        connection.exec_driver_sql(f"GRANT SELECT ON ALL TABLES IN SCHEMA {schema} TO {role}")
        if deny_revision:
            connection.exec_driver_sql(f"REVOKE SELECT ON {schema}.alembic_version FROM {role}")
    try:
        url = make_url(TEST_URL).set(username=role).render_as_string(hide_password=False)
        writer = FixturePatientWriter(schema)
        outcome = run_seed(
            _settings(exported_package, schema, url=url), check_only=False, persistence=writer
        )
        if deny_revision:
            assert "database.inspect" in _failed(outcome)
            assert "database.connect" not in _failed(outcome)
        else:
            assert {"privilege.patients", "privilege.seed_runs"} <= _failed(outcome)
        assert writer.calls == []
    finally:
        with engine.begin() as connection:
            connection.exec_driver_sql(f"DROP OWNED BY {role}")
            connection.exec_driver_sql(f"DROP ROLE {role}")


@pytest.mark.parametrize(
    "writer_options, message",
    [
        ({"fail_after": 50}, "RuntimeError"),
        ({"count_delta": -1}, "reported 99"),
    ],
)
def test_write_failures_roll_back_patients_and_marker(
    engine: Engine,
    schema: str,
    exported_package: Path,
    writer_options: dict[str, int],
    message: str,
) -> None:
    writer = FixturePatientWriter(schema, **writer_options)  # type: ignore[arg-type]
    outcome = run_seed(_settings(exported_package, schema), check_only=False, persistence=writer)
    assert outcome.status == "failed" and outcome.exit_code == 1
    result = next(r for r in outcome.report.results if r.name == "seed.write")
    assert "rolled back" in result.message and message in result.message
    assert _counts(engine, schema) == (0, 0)


def test_writer_that_commits_is_detected(
    engine: Engine, schema: str, exported_package: Path
) -> None:
    writer = FixturePatientWriter(schema, commit=True)
    outcome = run_seed(_settings(exported_package, schema), check_only=False, persistence=writer)
    assert outcome.status == "failed"
    message = next(r.message for r in outcome.report.results if r.name == "seed.write")
    assert "must not commit" in message
    assert "rolled back" not in message
    assert "may already be committed" in message
    assert "completion marker may exist" in message
    assert _counts(engine, schema) == (100, 1)


def test_concurrent_invocations_import_once(
    engine: Engine, schema: str, exported_package: Path
) -> None:
    settings = _settings(exported_package, schema)
    outcomes: list[SeedOutcome] = []

    def invoke() -> None:
        outcomes.append(
            run_seed(
                settings, check_only=False, persistence=FixturePatientWriter(schema, delay_s=1.0)
            )
        )

    threads = [threading.Thread(target=invoke) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=60)
    assert sorted(o.status for o in outcomes) == ["already_complete", "seeded"]
    assert _counts(engine, schema) == (100, 1)


def test_import_lock_wait_is_bounded(engine: Engine, schema: str, exported_package: Path) -> None:
    settings = _settings(exported_package, schema, lock_timeout_ms=300)
    with engine.connect() as holder, holder.begin():
        holder.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": PATIENT_IMPORT_LOCK_KEY})
        started = time.monotonic()
        outcome = run_seed(settings, check_only=False, persistence=FixturePatientWriter(schema))
        elapsed = time.monotonic() - started
    assert outcome.status == "failed" and elapsed < 10
    message = next(r.message for r in outcome.report.results if r.name == "seed.write")
    assert "55P03" in message  # lock_not_available
    assert _counts(engine, schema) == (0, 0)
