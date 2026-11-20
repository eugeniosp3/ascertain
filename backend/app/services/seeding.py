"""One selected seed path: validated DuckDB sources to approved SQLAlchemy tables.

``run_seed`` owns the connection and transaction. Preflight is read-only; only after
every check passes does a new transaction take the shared, bounded patient-import
lock, recheck state, and insert both markers and all fixtures atomically. There are
no ORM sessions, implicit commits, schema repairs, or calls to the JSONL prototype.
"""

import hashlib
import os
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal, cast
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from alembic.script import ScriptDirectory
from alembic.util.exc import CommandError
from patient_data.utils.checks import CheckReport
from patient_data.utils.database import (
    DatabaseInspector,
    TargetColumn,
    TargetConstraint,
    TargetContract,
    TargetTable,
    is_safe_identifier,
    type_family,
)
from sqlalchemy import (
    CheckConstraint,
    Connection,
    Engine,
    ForeignKeyConstraint,
    PrimaryKeyConstraint,
    Table,
    UniqueConstraint,
    create_engine,
    func,
    insert,
    inspect,
    or_,
    select,
    text,
    update,
)
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import ArgumentError, SQLAlchemyError
from sqlalchemy.pool import NullPool

from app.db import Base
from app.schemas.imports import ImportedPatient, SeedReport, SeedStatus
from app.utils.database_checks import DatabaseChecks
from app.utils.duckdb_source import (
    DEFAULT_BRONZE_PATH,
    DEFAULT_SILVER_PATH,
    DuckDBSnapshot,
    DuckDBSourceError,
    load_duckdb_source,
)

# Shared with the data package prototype so manually invoked importers also serialize.
PATIENT_IMPORT_LOCK_KEY = int.from_bytes(
    hashlib.sha256(b"ascertain:patient-import:v1").digest()[:8], "big", signed=True
)
DEMO_DATASET_KEY = "demo-fixtures-v1"
DEMO_NAMESPACE = uuid5(NAMESPACE_URL, "ascertain:backend:demo:v1")
DEMO_USER_IDS = (uuid5(DEMO_NAMESPACE, "user:clinician"), uuid5(DEMO_NAMESPACE, "user:coordinator"))
DEMO_NOTE_IDS = (uuid5(DEMO_NAMESPACE, "note:one"), uuid5(DEMO_NAMESPACE, "note:two"))
DEMO_COMMENT_IDS = (uuid5(DEMO_NAMESPACE, "comment:one"), uuid5(DEMO_NAMESPACE, "comment:two"))
DEMO_COUNTS = {"users": 2, "notes": 2, "comments": 2, "comment_note_links": 1}
_WRITTEN_TABLES = frozenset({"seed_runs", "patients", *DEMO_COUNTS})
_SUPPLIED_COLUMNS = {
    "seed_runs": frozenset(
        {"id", "dataset_key", "dataset_date", "source_hashes", "export_manifest", "row_counts"}
    ),
    "patients": frozenset({"id", "seed_run_id", *ImportedPatient.model_fields}),
    "users": frozenset({"id", "display_name", "display_role", "is_active"}),
    "notes": frozenset(
        {"id", "patient_id", "author_id", "title", "timestamp", "content", "source_type"}
    ),
    "comments": frozenset({"id", "patient_id", "author_id", "body"}),
    "comment_note_links": frozenset({"comment_id", "note_id", "patient_id"}),
}
_ALEMBIC_DIR = Path(__file__).resolve().parents[2] / "alembic"
ImportState = Literal["absent", "complete", "conflict"]


@dataclass(frozen=True)
class _Target:
    tables: dict[str, Table]
    contract: TargetContract
    patient_id: Callable[[str], UUID]


def _load_target(report: CheckReport) -> _Target | None:
    """Derive expectations from approved metadata, never from CSV headers or a draft."""
    try:
        from app.models import seeded_patient_id
    except ImportError:
        report.add("backend.metadata", "blocked", "Approved application models are unavailable")
        return None
    tables = {table.name: table for table in Base.metadata.tables.values()}
    if not tables.keys() >= _WRITTEN_TABLES:
        report.add("backend.metadata", "blocked", "Required application table metadata is missing")
        return None
    if (
        any(
            not set(tables[name].columns.keys()) >= names
            for name, names in _SUPPLIED_COLUMNS.items()
        )
        or "completed_at" not in tables["seed_runs"].columns
    ):
        report.add("backend.metadata", "blocked", "Required seed column metadata is missing")
        return None
    try:
        heads = frozenset(ScriptDirectory(str(_ALEMBIC_DIR)).get_heads())
    except (CommandError, OSError):
        heads = frozenset()
    if not heads:
        report.add("backend.migrations", "blocked", "Expected migration revision is unavailable")
        return None
    constraints = []
    targets = []
    for table in tables.values():
        if table.name not in _WRITTEN_TABLES:
            continue
        targets.append(
            TargetTable(
                table.name,
                tuple(
                    TargetColumn(
                        column.name,
                        frozenset({type_family(column.type)}),
                        supplied=column.name in _SUPPLIED_COLUMNS[table.name],
                        may_write_null=bool(column.nullable)
                        and column.name in _SUPPLIED_COLUMNS[table.name],
                        min_length=getattr(column.type, "length", None),
                    )
                    for column in table.columns
                ),
                privileges=(
                    frozenset({"SELECT", "INSERT", "UPDATE"})
                    if table.name == "seed_runs"
                    else frozenset({"SELECT", "INSERT"})
                    if table.name in _WRITTEN_TABLES
                    else frozenset({"SELECT"})
                ),
            )
        )
        for constraint in table.constraints:
            if not isinstance(
                constraint, PrimaryKeyConstraint | UniqueConstraint | ForeignKeyConstraint
            ):
                continue
            columns = tuple(column.name for column in constraint.columns)
            if isinstance(constraint, PrimaryKeyConstraint):
                constraints.append(TargetConstraint("primary_key", table.name, columns))
            elif isinstance(constraint, UniqueConstraint):
                constraints.append(TargetConstraint("unique", table.name, columns))
            elif isinstance(constraint, ForeignKeyConstraint):
                constraints.append(
                    TargetConstraint(
                        "foreign_key",
                        table.name,
                        columns,
                        constraint.elements[0].column.table.name,
                        tuple(element.column.name for element in constraint.elements),
                    )
                )
    report.add(
        "backend.metadata", "passed", "Approved model metadata and migration heads are available"
    )
    return _Target(
        tables, TargetContract(tuple(targets), tuple(constraints), heads), seeded_patient_id
    )


def _metadata_details(
    connection: Connection, target: _Target, schema: str, report: CheckReport
) -> None:
    """Supplement the shared inspector with approved CHECKs and strict nullability."""
    inspector = inspect(connection)
    present = set(inspector.get_table_names(schema=schema))
    for name, table in target.tables.items():
        if name not in present:
            report.add(f"metadata.{name}", "failed", "Approved application table is missing")
            continue
        reflected = {
            column["name"]: column for column in inspector.get_columns(name, schema=schema)
        }
        wrong = [
            column.name
            for column in table.columns
            if column.name in reflected and column.nullable != reflected[column.name]["nullable"]
        ]
        report.add(
            f"nullability.{name}",
            "failed" if wrong else "passed",
            "Column nullability differs from approved metadata"
            if wrong
            else "Nullability matches metadata",
        )
        expected = {
            constraint.name
            for constraint in table.constraints
            if isinstance(constraint, CheckConstraint)
        }
        actual = {
            constraint["name"]
            for constraint in inspector.get_check_constraints(name, schema=schema)
        }
        missing = expected - actual
        report.add(
            f"checks.{name}",
            "failed" if missing else "passed",
            "Required CHECK constraints are missing"
            if missing
            else "Required CHECK constraints exist",
        )
    unvalidated: int = connection.execute(
        text(
            "SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid "
            "JOIN pg_namespace n ON n.oid = t.relnamespace "
            "WHERE n.nspname = :schema AND t.relname = ANY(:tables) AND NOT c.convalidated"
        ),
        {"schema": schema, "tables": list(target.tables)},
    ).scalar_one()
    report.add(
        "constraints.validated",
        "failed" if unvalidated else "passed",
        "Required tables have unvalidated constraints"
        if unvalidated
        else "Constraints are validated",
    )


def _demo_manifest(source: DuckDBSnapshot) -> dict[str, object]:
    return {
        "fixture_version": DEMO_DATASET_KEY,
        "patient_dataset_key": source.dataset_key,
        "patient_source_id": source.patients[0].source_patient_id,
        "synthetic": True,
    }


def _import_state(
    connection: Connection, target: _Target, source: DuckDBSnapshot, report: CheckReport
) -> tuple[ImportState, UUID | None]:
    runs = target.tables["seed_runs"]
    rows = (
        connection.execute(
            select(runs).where(
                or_(
                    runs.c.dataset_key.like("patients-%"),
                    runs.c.dataset_key.like("demo-fixtures-%"),
                )
            )
        )
        .mappings()
        .all()
    )
    if rows:
        by_key = {row["dataset_key"]: row for row in rows}
        patient_run, demo_run = by_key.get(source.dataset_key), by_key.get(DEMO_DATASET_KEY)
        expected_keys = {source.dataset_key, DEMO_DATASET_KEY}
        same = (
            set(by_key) == expected_keys
            and patient_run is not None
            and demo_run is not None
            and patient_run["source_hashes"] == source.source_hashes
            and patient_run["export_manifest"] == source.manifest
            and patient_run["row_counts"] == {"patients": len(source.patients)}
            and patient_run["completed_at"] is not None
            and demo_run["source_hashes"] == source.source_hashes
            and demo_run["export_manifest"] == _demo_manifest(source)
            and demo_run["row_counts"] == DEMO_COUNTS
            and demo_run["completed_at"] is not None
        )
        if same:
            report.add(
                "import.state",
                "passed",
                "Completed markers match; preserve all application edits and deletions",
            )
            assert patient_run is not None
            return "complete", cast(UUID, patient_run["id"])
        report.add(
            "import.state",
            "failed",
            "Partial or different patient/demo seed markers exist; refusing to overwrite",
        )
        return "conflict", None
    patients = target.tables["patients"]
    conflicts = connection.execute(
        select(func.count())
        .select_from(patients)
        .where(
            or_(
                patients.c.source_patient_id.in_(
                    [patient.source_patient_id for patient in source.patients]
                ),
                patients.c.id.in_(
                    [target.patient_id(patient.source_patient_id) for patient in source.patients]
                ),
                patients.c.mrn.in_([patient.mrn for patient in source.patients]),
            )
        )
    ).scalar_one()
    for name, ids in (
        ("users", DEMO_USER_IDS),
        ("notes", DEMO_NOTE_IDS),
        ("comments", DEMO_COMMENT_IDS),
    ):
        table = target.tables[name]
        conflicts += connection.execute(
            select(func.count()).select_from(table).where(table.c.id.in_(ids))
        ).scalar_one()
    report.add(
        "import.state",
        "failed" if conflicts else "passed",
        "Source keys or demo identities exist without complete markers"
        if conflicts
        else "No conflicting seed rows or markers",
    )
    return ("conflict" if conflicts else "absent"), None


def _transaction_settings(
    connection: Connection,
    schema: str,
    lock_timeout_ms: int,
    statement_timeout_ms: int,
    *,
    read_only: bool,
) -> None:
    if read_only:
        connection.exec_driver_sql("SET TRANSACTION READ ONLY")
    quote = connection.dialect.identifier_preparer.quote
    connection.exec_driver_sql(f"SET LOCAL search_path TO {quote(schema)}")
    for setting, value in (
        ("lock_timeout", lock_timeout_ms),
        ("statement_timeout", statement_timeout_ms),
    ):
        connection.execute(
            text("SELECT set_config(:setting, :value, true)"),
            {"setting": setting, "value": str(value)},
        )


def _patient_rows(source: DuckDBSnapshot, target: _Target, run_id: UUID) -> list[dict[str, Any]]:
    rows = []
    for patient in source.patients:
        row = patient.model_dump(mode="python")
        row.update(
            {
                "id": target.patient_id(patient.source_patient_id),
                "seed_run_id": run_id,
                "profile_details": patient.profile_details.model_dump(mode="json"),
                "conditions": [
                    condition.model_dump(mode="json") for condition in patient.conditions
                ],
                "source_lineage": patient.source_lineage.model_dump(mode="json", exclude_none=True),
            }
        )
        rows.append(row)
    return rows


def _write_demo(connection: Connection, target: _Target, patient_id: UUID) -> None:
    connection.execute(
        insert(target.tables["users"]),
        [
            {
                "id": DEMO_USER_IDS[0],
                "display_name": "Demo Clinician",
                "display_role": "Synthetic demo clinician",
                "is_active": True,
            },
            {
                "id": DEMO_USER_IDS[1],
                "display_name": "Demo Coordinator",
                "display_role": "Synthetic demo coordinator",
                "is_active": True,
            },
        ],
    )
    connection.execute(
        insert(target.tables["notes"]),
        [
            {
                "id": note_id,
                "patient_id": patient_id,
                "author_id": DEMO_USER_IDS[index],
                "title": f"Synthetic demonstration note {index + 1}",
                "timestamp": datetime(2026, 11, 18, 14 + index, tzinfo=UTC),
                "content": (
                    "Synthetic demo fixture for note editing and discussion links. "
                    "This is not a clinical observation or a fact imported from the patient source."
                ),
                "source_type": "seed",
            }
            for index, note_id in enumerate(DEMO_NOTE_IDS)
        ],
    )
    connection.execute(
        insert(target.tables["comments"]),
        [
            {
                "id": comment_id,
                "patient_id": patient_id,
                "author_id": DEMO_USER_IDS[index],
                "body": (
                    "Synthetic demo discussion. This application fixture demonstrates "
                    "collaboration and contains no source clinical findings."
                ),
            }
            for index, comment_id in enumerate(DEMO_COMMENT_IDS)
        ],
    )
    connection.execute(
        insert(target.tables["comment_note_links"]),
        {
            "comment_id": DEMO_COMMENT_IDS[0],
            "note_id": DEMO_NOTE_IDS[0],
            "patient_id": patient_id,
        },
    )


def _verify_written(
    connection: Connection,
    target: _Target,
    rows: list[dict[str, Any]],
    run_id: UUID,
) -> None:
    table = target.tables["patients"]
    actual = connection.execute(select(table).where(table.c.seed_run_id == run_id)).mappings().all()
    expected = {row["id"]: row for row in rows}
    if len(actual) != len(rows) or any(
        row["id"] not in expected
        or any(row[key] != value for key, value in expected[row["id"]].items())
        for row in actual
    ):
        raise ValueError("Inserted patient values or lineage did not match validated source")
    for name, ids in (
        ("users", DEMO_USER_IDS),
        ("notes", DEMO_NOTE_IDS),
        ("comments", DEMO_COMMENT_IDS),
    ):
        fixture_table = target.tables[name]
        count = connection.execute(
            select(func.count()).select_from(fixture_table).where(fixture_table.c.id.in_(ids))
        ).scalar_one()
        if count != DEMO_COUNTS[name]:
            raise ValueError("Inserted demo fixture counts did not match expectations")
    links = target.tables["comment_note_links"]
    link_count = connection.execute(
        select(func.count()).select_from(links).where(links.c.comment_id.in_(DEMO_COMMENT_IDS))
    ).scalar_one()
    if link_count != DEMO_COUNTS["comment_note_links"]:
        raise ValueError("Inserted demo link counts did not match expectations")


def _write(
    connection: Connection,
    target: _Target,
    source: DuckDBSnapshot,
    report: CheckReport,
    schema: str,
    lock_timeout_ms: int,
    statement_timeout_ms: int,
) -> tuple[SeedStatus, UUID | None]:
    with connection.begin():
        _transaction_settings(
            connection, schema, lock_timeout_ms, statement_timeout_ms, read_only=False
        )
        connection.execute(
            text("SELECT pg_advisory_xact_lock(:key)"), {"key": PATIENT_IMPORT_LOCK_KEY}
        )
        state, existing_id = _import_state(connection, target, source, report)
        if state != "absent":
            return ("already_complete" if state == "complete" else "failed"), existing_id
        run_id, demo_run_id = uuid4(), uuid4()
        runs = target.tables["seed_runs"]
        # Markers precede the FK-bearing patient inserts but remain invisible until
        # the same transaction has verified and finalized every count.
        connection.execute(
            insert(runs),
            [
                {
                    "id": run_id,
                    "dataset_key": source.dataset_key,
                    "dataset_date": source.dataset_date,
                    "source_hashes": source.source_hashes,
                    "export_manifest": source.manifest,
                    "row_counts": {},
                },
                {
                    "id": demo_run_id,
                    "dataset_key": DEMO_DATASET_KEY,
                    "dataset_date": source.dataset_date,
                    "source_hashes": source.source_hashes,
                    "export_manifest": _demo_manifest(source),
                    "row_counts": {},
                },
            ],
        )
        rows = _patient_rows(source, target, run_id)
        connection.execute(insert(target.tables["patients"]), rows)
        _write_demo(connection, target, cast(UUID, rows[0]["id"]))
        _verify_written(connection, target, rows, run_id)
        for marker_id, counts in ((run_id, {"patients": len(rows)}), (demo_run_id, DEMO_COUNTS)):
            connection.execute(
                update(runs)
                .where(runs.c.id == marker_id)
                .values(row_counts=counts, completed_at=func.now())
            )
    report.add(
        "seed.write", "passed", "Patients, synthetic fixtures and both markers committed atomically"
    )
    return "seeded", run_id


def run_seed(
    database_url: str | URL | None = None,
    *,
    bronze: Path | str = DEFAULT_BRONZE_PATH,
    silver: Path | str = DEFAULT_SILVER_PATH,
    check_only: bool = False,
    engine: Engine | None = None,
    schema: str = "public",
    lock_timeout_ms: int = 10_000,
    statement_timeout_ms: int = 15_000,
) -> SeedReport:
    """Check, then seed once. An injected engine stays caller-owned (tests use this).

    ``DATABASE_URL`` is used only when neither a URL nor an engine is supplied. An
    optional schema supports isolated PostgreSQL test fixtures. Never pass a
    connection already participating in a test/session transaction: this operation
    must own its real transaction to prove atomic rollback and advisory locking.
    """
    report = CheckReport()
    try:
        source = load_duckdb_source(bronze, silver)
    except DuckDBSourceError as error:
        report.add("source", "failed", str(error))
        return SeedReport("not_ready", tuple(report.results))
    report.results.extend(source.checks)
    target = _load_target(report)
    if target is None:
        return SeedReport("blocked", tuple(report.results), source.dataset_key)
    if (
        not is_safe_identifier(schema)
        or not 1 <= lock_timeout_ms <= 600_000
        or not 100 <= statement_timeout_ms <= 600_000
    ):
        report.add("config", "failed", "Schema or timeout configuration is invalid")
        return SeedReport("not_ready", tuple(report.results), source.dataset_key)
    owned_engine = engine is None
    try:
        if engine is None:
            value = database_url if database_url is not None else os.environ.get("DATABASE_URL")
            if value is None:
                report.add("config.database_url", "failed", "DATABASE_URL is required")
                return SeedReport("not_ready", tuple(report.results), source.dataset_key)
            url = make_url(value)
            if url.get_backend_name() != "postgresql":
                raise ArgumentError("PostgreSQL is required")
            engine = create_engine(
                url.set(drivername="postgresql+psycopg"),
                poolclass=NullPool,
                hide_parameters=True,
                connect_args={"connect_timeout": 5},
            )
        if engine.dialect.name != "postgresql":
            report.add("config.database_url", "failed", "A PostgreSQL database is required")
            return SeedReport("not_ready", tuple(report.results), source.dataset_key)
        with engine.connect() as connection:
            connection = connection.execution_options(
                schema_translate_map={None: schema}, isolation_level="READ COMMITTED"
            )
            with connection.begin():
                _transaction_settings(
                    connection, schema, lock_timeout_ms, statement_timeout_ms, read_only=True
                )
                DatabaseInspector(connection, schema).check_contract(target.contract, report)
                revision = DatabaseChecks(connection).migrations(
                    target.contract.supported_revisions
                )
                report.add(revision.name, revision.status, revision.message)
                _metadata_details(connection, target, schema, report)
                if report.passed:
                    _, run_id = _import_state(connection, target, source, report)
                else:
                    run_id = None
            if not report.passed:
                return SeedReport("not_ready", tuple(report.results), source.dataset_key)
            if check_only:
                status: SeedStatus = "ready"
            else:
                status, run_id = _write(
                    connection,
                    target,
                    source,
                    report,
                    schema,
                    lock_timeout_ms,
                    statement_timeout_ms,
                )
            return SeedReport(
                status,
                tuple(report.results),
                source.dataset_key,
                run_id,
                {"patients": len(source.patients), **DEMO_COUNTS},
            )
    except (ArgumentError, SQLAlchemyError, OSError, ValueError, RuntimeError) as error:
        # SQLAlchemy and drivers can embed DSNs, parameters and patient records in
        # exceptions. Return the exception class only, including failed writes.
        report.add(
            "database",
            "failed",
            f"Database seed failed ({type(error).__name__}); no seed transaction committed",
        )
        return SeedReport("failed", tuple(report.results), source.dataset_key)
    finally:
        if owned_engine and engine is not None:
            engine.dispose()
