"""One selected seed path: validated DuckDB sources to approved SQLAlchemy tables.

``run_seed`` owns the connection and transaction. Preflight is read-only; only after
every check passes does a new transaction take the shared, bounded patient-import
lock, recheck state, and commit fixtures and versioned markers atomically. Completed
legacy imports can receive the assignment extension without reimporting patients.
There are no ORM sessions, implicit commits, schema repairs, or prototype calls.
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

# One advisory-lock key, so startup and manually invoked seed runs serialize.
PATIENT_IMPORT_LOCK_KEY = int.from_bytes(
    hashlib.sha256(b"ascertain:patient-import:v1").digest()[:8], "big", signed=True
)
DEMO_DATASET_KEY = "demo-fixtures-v1"
DEMO_ASSIGNMENTS_DATASET_KEY = "demo-assignments-v1"
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
    "patients": frozenset({"id", "seed_run_id", "assigned_user_id", *ImportedPatient.model_fields}),
    "users": frozenset({"id", "display_name", "display_role", "is_active"}),
    "notes": frozenset(
        {"id", "patient_id", "author_id", "title", "timestamp", "content", "source_type"}
    ),
    "comments": frozenset({"id", "patient_id", "author_id", "body"}),
    "comment_note_links": frozenset({"comment_id", "note_id", "patient_id"}),
}
_ALEMBIC_DIR = Path(__file__).resolve().parents[2] / "alembic"
ImportState = Literal["absent", "assignments_pending", "complete", "conflict"]


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
                    if table.name in {"seed_runs", "patients"}
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


def _assignment_user_id(source_patient_id: str) -> UUID:
    """Synthetic cohort membership depends only on the exact, validated source key.

    SHA-256 of the UTF-8 bytes; the first eight digest bytes as an unsigned big-endian
    integer, modulo two, index the fixed roster (equivalently ``digest[7] & 1``).
    """
    digest = hashlib.sha256(source_patient_id.encode("utf-8")).digest()
    return DEMO_USER_IDS[int.from_bytes(digest[:8], "big") % 2]


def _assignment_manifest(source: DuckDBSnapshot) -> dict[str, object]:
    return {
        "fixture_version": DEMO_ASSIGNMENTS_DATASET_KEY,
        "patient_dataset_key": source.dataset_key,
        "assignment_algorithm": "sha256-utf8-first8-big-endian-modulo2",
        "roster_user_ids": [str(user_id) for user_id in DEMO_USER_IDS],
        "synthetic": True,
    }


def _assignment_marker(marker_id: UUID, source: DuckDBSnapshot) -> dict[str, object]:
    return {
        "id": marker_id,
        "dataset_key": DEMO_ASSIGNMENTS_DATASET_KEY,
        "dataset_date": source.dataset_date,
        "source_hashes": source.source_hashes,
        "export_manifest": _assignment_manifest(source),
        "row_counts": {},
    }


def _assignment_roster_ready(connection: Connection, target: _Target, report: CheckReport) -> bool:
    users = target.tables["users"]
    active_ids: set[UUID] = set(
        connection.execute(
            select(users.c.id).where(users.c.id.in_(DEMO_USER_IDS), users.c.is_active.is_(True))
        ).scalars()
    )
    ready = active_ids == set(DEMO_USER_IDS)
    report.add(
        "assignments.roster",
        "passed" if ready else "failed",
        "Both existing demo assignment users are active"
        if ready
        else "Assignment backfill requires both existing, active demo users",
    )
    return ready


def _assignment_marker_matches(marker: Any, source: DuckDBSnapshot) -> bool:
    counts = marker["row_counts"]
    return bool(
        marker["dataset_date"] == source.dataset_date
        and marker["source_hashes"] == source.source_hashes
        and marker["export_manifest"] == _assignment_manifest(source)
        and marker["completed_at"] is not None
        and isinstance(counts, dict)
        and set(counts) == {"patients"}
        and type(counts["patients"]) is int
        and 0 <= counts["patients"] <= len(source.patients)
    )


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
                    runs.c.dataset_key.like("demo-assignments-%"),
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
            set(by_key) in (expected_keys, expected_keys | {DEMO_ASSIGNMENTS_DATASET_KEY})
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
            assert patient_run is not None
            run_id = cast(UUID, patient_run["id"])
            assignment_run = by_key.get(DEMO_ASSIGNMENTS_DATASET_KEY)
            if assignment_run is None:
                if not _assignment_roster_ready(connection, target, report):
                    return "conflict", None
                report.add(
                    "import.state",
                    "passed",
                    "Completed legacy markers match; only synthetic assignments are pending",
                )
                return "assignments_pending", run_id
            if not _assignment_marker_matches(assignment_run, source):
                report.add("assignments.state", "failed", "Assignment seed marker is invalid")
                return "conflict", None
            report.add(
                "import.state",
                "passed",
                "All completed markers match; preserve application edits and deletions",
            )
            return "complete", run_id
        report.add(
            "import.state",
            "failed",
            "Partial or different patient/demo/assignment markers exist; refusing to overwrite",
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


def _write_import(connection: Connection, target: _Target, source: DuckDBSnapshot) -> UUID:
    """Write the original release's import: both markers, patients, and demo fixtures."""
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
    return run_id


def _assign_surviving_patients(
    connection: Connection, target: _Target, source: DuckDBSnapshot, run_id: UUID
) -> tuple[int, int]:
    """Assign this import's surviving, unassigned patients; return (assigned, preserved).

    The roster is share-locked and this import's patient rows are locked in id order
    before any decision, so concurrent API writes either commit first (and are
    preserved) or wait for this transaction. API-created patients never match
    ``seed_run_id`` and deleted patients are absent, so neither is assigned or
    recreated. Only ``assigned_user_id`` changes: Core would otherwise apply the
    ``updated_at`` onupdate, but server-owned workload membership is not a profile edit.
    """
    users, patients = target.tables["users"], target.tables["patients"]
    roster: set[UUID] = set(
        connection.execute(
            select(users.c.id)
            .where(users.c.id.in_(DEMO_USER_IDS), users.c.is_active.is_(True))
            .with_for_update(read=True)
        ).scalars()
    )
    if roster != set(DEMO_USER_IDS):
        raise ValueError("Synthetic assignment roster is not both existing, active demo users")
    cohorts = {
        target.patient_id(patient.source_patient_id): (
            patient.source_patient_id,
            _assignment_user_id(patient.source_patient_id),
        )
        for patient in source.patients
    }
    locked = connection.execute(
        select(patients.c.id, patients.c.source_patient_id, patients.c.assigned_user_id)
        .where(patients.c.seed_run_id == run_id)
        .order_by(patients.c.id)
        .with_for_update(key_share=True)
    ).all()
    if any(row.id not in cohorts or cohorts[row.id][0] != row.source_patient_id for row in locked):
        raise ValueError("Imported patient identities did not match the validated source")
    expected = {
        row.id: cohorts[row.id][1] if row.assigned_user_id is None else row.assigned_user_id
        for row in locked
    }
    pending = [row.id for row in locked if row.assigned_user_id is None]
    for user_id in DEMO_USER_IDS:
        ids = [patient_id for patient_id in pending if cohorts[patient_id][1] == user_id]
        if not ids:
            continue
        updated = connection.execute(
            update(patients)
            .where(
                patients.c.id.in_(ids),
                patients.c.seed_run_id == run_id,
                patients.c.assigned_user_id.is_(None),
            )
            .values(assigned_user_id=user_id, updated_at=patients.c.updated_at)
        ).rowcount
        if updated != len(ids):
            raise ValueError("Synthetic assignments did not update every locked patient")
    actual: dict[UUID, UUID | None] = {
        row.id: row.assigned_user_id
        for row in connection.execute(
            select(patients.c.id, patients.c.assigned_user_id).where(
                patients.c.seed_run_id == run_id
            )
        )
    }
    if actual != expected:
        raise ValueError("Synthetic assignments did not match the deterministic cohorts")
    return len(pending), len(locked) - len(pending)


def _write_assignments(
    connection: Connection, target: _Target, source: DuckDBSnapshot, run_id: UUID
) -> tuple[int, int]:
    """Claim the unique assignment marker, assign cohorts, then finalize its count."""
    runs = target.tables["seed_runs"]
    marker_id = uuid4()
    connection.execute(insert(runs), _assignment_marker(marker_id, source))
    assigned, preserved = _assign_surviving_patients(connection, target, source, run_id)
    connection.execute(
        update(runs)
        .where(runs.c.id == marker_id)
        .values(row_counts={"patients": assigned}, completed_at=func.now())
    )
    return assigned, preserved


def _write(
    connection: Connection,
    target: _Target,
    source: DuckDBSnapshot,
    report: CheckReport,
    schema: str,
    lock_timeout_ms: int,
    statement_timeout_ms: int,
) -> tuple[SeedStatus, UUID | None]:
    """Under the bounded lock: fresh import plus assignments, or assignments only."""
    with connection.begin():
        _transaction_settings(
            connection, schema, lock_timeout_ms, statement_timeout_ms, read_only=False
        )
        connection.execute(
            text("SELECT pg_advisory_xact_lock(:key)"), {"key": PATIENT_IMPORT_LOCK_KEY}
        )
        state, run_id = _import_state(connection, target, source, report)
        if state == "complete":
            return "already_complete", run_id
        if state == "absent":
            run_id = _write_import(connection, target, source)
        elif state != "assignments_pending" or run_id is None:
            return "failed", None
        assigned, preserved = _write_assignments(connection, target, source, run_id)
    report.add(
        "seed.write",
        "passed",
        "Patients, synthetic fixtures, assignments and all three markers committed atomically"
        if state == "absent"
        else "Completed import kept; synthetic assignments and their marker committed atomically",
    )
    report.add(
        "seed.assignments",
        "passed",
        f"{assigned} surviving imported patients assigned; "
        f"{preserved} existing assignments preserved",
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
