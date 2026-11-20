"""Public patient seed command: ``python -m patient_data.seed [--check-only]``.

Order of work:

1. Validate configuration and read/validate the complete patient package once.
2. Resolve the backend persistence operation (see ``PatientPersistence``).
3. In a READ ONLY transaction: authenticate, query, and inspect the schema, Alembic
   revision, tables, columns, constraints, privileges, and existing import state.
4. ``--check-only`` stops here. Otherwise, only if every required check passed: open one
   write transaction, take the shared patient-import advisory lock (bounded by
   ``lock_timeout``), recheck the import state, insert the ``seed_runs`` marker, call the
   backend operation on the same connection, verify inserted count and lineage, commit.
   Any failure rolls back patients and marker together.

Ownership: backend owns the application schema, Alembic migrations, and the patient
writer. This module never creates or repairs schema. **No backend writer exists yet**, so
the default run reports ``backend.persistence`` as blocked and writes nothing.

The PostgreSQL column/constraint expectations below are provisional: they follow the
unapproved backend draft (``backend/schema.dbml``) only where the importer itself needs
them (marker table, source key, lineage, seed-run foreign key). The backend writer adds
its own columns and supported revisions through ``target_contract()``.
"""

import argparse
import hashlib
import importlib
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Protocol, runtime_checkable
from uuid import UUID, uuid4

from pydantic import SecretStr, ValidationError
from sqlalchemy import Connection, Engine, create_engine, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import ArgumentError, DBAPIError, SQLAlchemyError
from sqlalchemy.pool import NullPool

from patient_data.errors import PatientDataError
from patient_data.package import ValidatedPackage, load_package
from patient_data.settings import EXPECTED_ROW_COUNT, SeedSettings, StageSettings
from patient_data.utils.checks import CheckReport
from patient_data.utils.database import (
    DatabaseInspector,
    TargetColumn,
    TargetConstraint,
    TargetContract,
    TargetTable,
    is_safe_identifier,
)
from patient_data.utils.identifiers import canonical_json

DATASET_KEY_PREFIX = "patients-"
# One shared transaction-level advisory lock for every patient import (any version).
# Backend must use the same key if it ever writes patient imports itself.
PATIENT_IMPORT_LOCK_KEY = int.from_bytes(
    hashlib.sha256(b"ascertain:patient-import:v1").digest()[:8], "big", signed=True
)

DATA_IMPORT_CONTRACT = TargetContract(
    tables=(
        TargetTable(
            "seed_runs",
            (
                TargetColumn("id", frozenset({"uuid"})),
                TargetColumn("dataset_key", frozenset({"text"}), min_length=64),
                TargetColumn("dataset_date", frozenset({"date"})),
                TargetColumn("source_hashes", frozenset({"jsonb"})),
                TargetColumn("export_manifest", frozenset({"jsonb"})),
                TargetColumn("row_counts", frozenset({"jsonb"})),
                TargetColumn("completed_at", frozenset({"timestamptz"}), supplied=False),
            ),
        ),
        TargetTable(
            "patients",
            (
                TargetColumn("source_patient_id", frozenset({"text"}), min_length=7),
                TargetColumn("seed_run_id", frozenset({"uuid"})),
                TargetColumn("source_lineage", frozenset({"jsonb"})),
            ),
        ),
    ),
    constraints=(
        TargetConstraint("primary_key", "seed_runs", ("id",)),
        TargetConstraint("unique", "seed_runs", ("dataset_key",)),
        TargetConstraint("unique", "patients", ("source_patient_id",)),
        TargetConstraint("foreign_key", "patients", ("seed_run_id",), "seed_runs", ("id",)),
    ),
)


@runtime_checkable
class PatientPersistence(Protocol):
    """The backend-owned operation that writes validated patients.

    ``write_patients`` must insert every patient in ``package.lines`` using **only** the
    given connection, set ``seed_run_id`` on each row and ``source_lineage`` to
    the three string UUIDs ``export_id``, ``silver_id``, ``bronze_id`` and integer
    ``source_row_number``, return the number of rows inserted, and never commit, roll
    back, or open another transaction. The seed command owns and verifies the transaction.

    ``target_contract`` declares the columns/constraints the writer relies on and the
    Alembic revisions it supports, taken from backend metadata.
    """

    def target_contract(self) -> TargetContract: ...

    def write_patients(
        self, package: ValidatedPackage, connection: Connection, *, seed_run_id: UUID
    ) -> int: ...


SeedStatus = Literal["ready", "not_ready", "seeded", "already_complete", "failed"]


@dataclass
class SeedOutcome:
    status: SeedStatus
    report: CheckReport

    @property
    def exit_code(self) -> int:
        return 0 if self.status in ("ready", "seeded", "already_complete") else 1


ImportState = Literal["absent", "complete", "conflict"]


class _PersistenceTransactionError(PatientDataError):
    """An adapter ended the transaction; its writes may already be committed."""


# --- Configuration and package ---------------------------------------------------------


def load_persistence(spec: str) -> PatientPersistence:
    """Resolve ``module:attribute`` to a persistence object (or a zero-argument factory)."""
    module_name, _, attribute = spec.partition(":")
    if not module_name or not attribute:
        raise PatientDataError("PATIENT_SEED_WRITER must look like 'package.module:attribute'")
    try:
        target: object = getattr(importlib.import_module(module_name), attribute)
    except (ImportError, AttributeError) as error:
        raise PatientDataError(
            f"cannot load backend persistence operation {spec} ({type(error).__name__})"
        ) from error
    # A class (or any other factory) satisfies the Protocol structurally, so call it first.
    if isinstance(target, type) or (
        not isinstance(target, PatientPersistence) and callable(target)
    ):
        target = target()
    if not isinstance(target, PatientPersistence):
        raise PatientDataError(f"{spec} does not provide target_contract() and write_patients(...)")
    return target


def _database_url(secret: SecretStr | None, report: CheckReport) -> URL | None:
    if secret is None:
        report.add(
            "config.database_url",
            "failed",
            "set PATIENT_SEED_DATABASE_URL to the PostgreSQL target",
        )
        return None
    try:
        url = make_url(secret.get_secret_value())
    except ArgumentError:
        report.add("config.database_url", "failed", "database URL cannot be parsed")
        return None
    if url.get_backend_name() != "postgresql":
        report.add("config.database_url", "failed", "database URL must be a PostgreSQL URL")
        return None
    report.add("config.database_url", "passed", "PostgreSQL URL configured (not shown)")
    return url.set(drivername="postgresql+psycopg")


def _default_package_dir() -> Path | None:
    exports = StageSettings().exports_dir
    candidates = sorted(p for p in exports.glob(f"{DATASET_KEY_PREFIX}*") if p.is_dir())
    return candidates[0] if len(candidates) == 1 else None


def _load_package(
    settings: SeedSettings, report: CheckReport, expected_row_count: int
) -> ValidatedPackage | None:
    directory = settings.package_dir or _default_package_dir()
    if directory is None:
        report.add(
            "config.package_dir",
            "failed",
            "set PATIENT_SEED_PACKAGE_DIR to one data/assets/exports/<dataset-key> directory",
        )
        return None
    report.add("config.package_dir", "passed", f"package {directory.name}")
    try:
        package = load_package(directory, expected_row_count=expected_row_count)
    except PatientDataError as error:
        report.add("package", "failed", str(error))
        return None
    report.add(
        "package",
        "passed",
        f"{len(package.lines)} patients, checksums, versions, lineage and mapping verified",
    )
    return package


# --- Import state ----------------------------------------------------------------------


def _quote(connection: Connection, schema: str, table: str) -> str:
    quote = connection.dialect.identifier_preparer.quote
    return f"{quote(schema)}.{quote(table)}"


def import_state(
    connection: Connection, schema: str, package: ValidatedPackage, report: CheckReport
) -> ImportState:
    """Classify the target as not yet imported, already complete, or conflicting."""
    runs = connection.execute(
        text(
            "SELECT dataset_key, source_hashes, export_manifest "
            f"FROM {_quote(connection, schema, 'seed_runs')} WHERE dataset_key LIKE :prefix"
        ),
        {"prefix": DATASET_KEY_PREFIX + "%"},
    ).all()
    mine = [run for run in runs if run.dataset_key == package.dataset_key]
    others = sorted(run.dataset_key for run in runs if run.dataset_key != package.dataset_key)
    if mine:
        run = mine[0]
        same = canonical_json(run.export_manifest) == canonical_json(
            package.manifest_document()
        ) and canonical_json(run.source_hashes) == canonical_json(package.source_hashes())
        if same:
            report.add(
                "import.state",
                "passed",
                f"{package.dataset_key} is already complete; nothing will be written",
            )
            return "complete"
        report.add(
            "import.state",
            "failed",
            f"{package.dataset_key} was imported with different hashes; refusing to "
            "overwrite. Investigate the package version before retrying",
        )
        return "conflict"
    if others:
        report.add(
            "import.state",
            "failed",
            f"another patient dataset {others} is already imported; replacing it needs "
            "an explicit, backend-approved update policy",
        )
        return "conflict"
    existing: int = connection.execute(
        text(
            f"SELECT count(*) FROM {_quote(connection, schema, 'patients')} "
            "WHERE source_patient_id = ANY(:ids)"
        ),
        {"ids": [line.record.source_patient_id for line in package.lines]},
    ).scalar_one()
    if existing:
        report.add(
            "import.state",
            "failed",
            f"{existing} patient(s) with this package's source IDs exist without a "
            "completion marker (partial or manual import); resolve them first",
        )
        return "conflict"
    report.add("import.state", "passed", "no prior patient import; ready to import")
    return "absent"


# --- Database work ---------------------------------------------------------------------


def make_engine(url: URL, settings: SeedSettings) -> Engine:
    """A pool-less engine with finite connect, statement, lock, and idle timeouts."""
    options = (
        f"-c statement_timeout={settings.statement_timeout_ms} "
        f"-c lock_timeout={settings.lock_timeout_ms} "
        f"-c idle_in_transaction_session_timeout={settings.statement_timeout_ms * 4}"
    )
    return create_engine(
        url,
        isolation_level="READ COMMITTED",
        poolclass=NullPool,
        connect_args={
            "connect_timeout": settings.connect_timeout_s,
            "options": options,
            "application_name": "patient_data.seed",
        },
    )


def _preflight(
    connection: Connection,
    schema: str,
    contract: TargetContract,
    package: ValidatedPackage | None,
    report: CheckReport,
) -> ImportState | None:
    """Read-only checks; returns the import state when it could be determined."""
    with connection.begin():
        connection.exec_driver_sql("SET TRANSACTION READ ONLY")
        DatabaseInspector(connection, schema).check_contract(contract, report)
        schema_ok = all(
            r.status == "passed"
            for r in report.results
            if r.name.startswith(("table.", "column.", "columns.", "constraint.", "privilege."))
        )
        if package is None or not schema_ok:
            report.add("import.state", "blocked", "needs a valid package and target schema")
            return None
        return import_state(connection, schema, package, report)


def _verify_written(
    connection: Connection, schema: str, package: ValidatedPackage, run_id: UUID, reported: int
) -> None:
    rows = connection.execute(
        text(
            "SELECT source_patient_id, source_lineage "
            f"FROM {_quote(connection, schema, 'patients')} WHERE seed_run_id = :run_id"
        ),
        {"run_id": run_id},
    ).all()
    expected = {
        line.record.source_patient_id: line.lineage.model_dump(mode="json")
        for line in package.lines
    }
    actual = {row.source_patient_id: row.source_lineage for row in rows}
    if reported != len(expected) or len(rows) != len(expected):
        raise PatientDataError(
            f"persistence operation reported {reported} and stored {len(rows)} patient(s); "
            f"expected {len(expected)}"
        )
    if actual != expected:
        raise PatientDataError("stored patient lineage does not match the package")


def _write(
    connection: Connection,
    schema: str,
    package: ValidatedPackage,
    persistence: PatientPersistence,
    report: CheckReport,
) -> SeedStatus:
    """One transaction: lock, recheck, marker, backend write, verify, commit."""
    with connection.begin() as transaction:
        connection.execute(
            text("SELECT pg_advisory_xact_lock(:key)"), {"key": PATIENT_IMPORT_LOCK_KEY}
        )
        recheck = CheckReport()
        state = import_state(connection, schema, package, recheck)
        report.results.extend(
            r.model_copy(update={"name": "locked." + r.name}) for r in recheck.results
        )
        if state == "complete":
            return "already_complete"
        if state == "conflict":
            transaction.rollback()
            return "failed"
        run_id = uuid4()
        connection.execute(
            text(
                f"INSERT INTO {_quote(connection, schema, 'seed_runs')} "
                "(id, dataset_key, dataset_date, source_hashes, export_manifest, row_counts) "
                "VALUES (:id, :key, :date, CAST(:hashes AS jsonb), CAST(:manifest AS jsonb), "
                "CAST(:counts AS jsonb))"
            ),
            {
                "id": run_id,
                "key": package.dataset_key,
                "date": package.manifest.dataset_date,
                "hashes": canonical_json(package.source_hashes()),
                "manifest": canonical_json(package.manifest_document()),
                "counts": canonical_json({"patients": len(package.lines)}),
            },
        )
        try:
            inserted = persistence.write_patients(package, connection, seed_run_id=run_id)
        finally:
            if not transaction.is_active or connection.get_transaction() is not transaction:
                raise _PersistenceTransactionError(
                    "the persistence operation ended the seed transaction; it must not commit "
                    "or roll back. Writes may already be committed; verify the database state "
                    "before retrying. A completion marker may exist and cause a rerun to "
                    "treat the import as complete"
                )
        _verify_written(connection, schema, package, run_id, inserted)
    report.add(
        "seed.write",
        "passed",
        f"imported {len(package.lines)} patients and marker {package.dataset_key}",
    )
    return "seeded"


def run_seed(
    settings: SeedSettings,
    *,
    check_only: bool,
    persistence: PatientPersistence | None = None,
    expected_row_count: int = EXPECTED_ROW_COUNT,
    engine_factory: Callable[[URL, SeedSettings], Engine] = make_engine,
) -> SeedOutcome:
    """Run all checks, then (unless ``check_only``) the transactional import."""
    report = CheckReport()
    url = _database_url(settings.database_url, report)
    schema = settings.schema_name
    if schema is None or not is_safe_identifier(schema):
        report.add(
            "config.schema",
            "failed",
            "set PATIENT_SEED_SCHEMA to the explicit target schema (e.g. public)",
        )
        schema = None
    else:
        report.add("config.schema", "passed", f"target schema {schema}")
    package = _load_package(settings, report, expected_row_count)

    contract = DATA_IMPORT_CONTRACT
    if persistence is None and settings.writer:
        try:
            persistence = load_persistence(settings.writer)
        except PatientDataError as error:
            report.add("backend.persistence", "failed", str(error))
    if persistence is not None:
        try:
            contract = contract.merged(persistence.target_contract())
        except Exception as error:  # Adapter code is external; report instead of crashing.
            report.add(
                "backend.persistence",
                "failed",
                f"target_contract() failed ({type(error).__name__})",
            )
            persistence = None
        else:
            report.add(
                "backend.persistence",
                "passed",
                f"using {type(persistence).__module__}.{type(persistence).__qualname__}",
            )
    elif not any(r.name == "backend.persistence" for r in report.results):
        report.add(
            "backend.persistence",
            "blocked",
            "the backend patient persistence operation is not available yet; backend "
            "must provide it and PATIENT_SEED_WRITER=<module>:<attribute> must name it. "
            "No patients or seed marker were written",
        )

    if url is None or schema is None:
        report.add("database", "blocked", "database checks need a valid URL and schema")
        return SeedOutcome("not_ready", report)

    engine = engine_factory(url, settings)
    connected = False
    try:
        with engine.connect() as connection:
            connected = True
            report.add("database.connect", "passed", "connected and authenticated")
            state = _preflight(connection, schema, contract, package, report)
            if check_only or not report.passed:
                return SeedOutcome("ready" if report.passed else "not_ready", report)
            assert package is not None and persistence is not None
            if state == "complete":
                return SeedOutcome("already_complete", report)
            try:
                status = _write(connection, schema, package, persistence, report)
            except Exception as error:  # Includes external adapter errors; all roll back.
                detail = (
                    str(error)
                    if isinstance(error, PatientDataError)
                    else _db_error(error)
                    if isinstance(error, SQLAlchemyError)
                    else type(error).__name__
                )
                message = (
                    f"import failed; transaction outcome requires inspection: {detail}"
                    if isinstance(error, _PersistenceTransactionError)
                    else f"import rolled back: {detail}"
                )
                report.add("seed.write", "failed", message)
                return SeedOutcome("failed", report)
            return SeedOutcome(status, report)
    except DBAPIError as error:
        report.add(
            "database.inspect" if connected else "database.connect",
            "failed",
            (
                f"database inspection failed ({_db_error(error)}); check schema access, "
                "permissions, migrations and query timeouts"
                if connected
                else f"cannot connect or authenticate ({_db_error(error)}); check the "
                "host, port, credentials, timeouts and that PostgreSQL is running"
            ),
        )
        return SeedOutcome("not_ready", report)
    finally:
        engine.dispose()


def _db_error(error: SQLAlchemyError) -> str:
    # Driver messages can include values or user names, so only the class/SQLSTATE is shown.
    original = getattr(error, "orig", None)
    sqlstate = getattr(original, "sqlstate", None)
    name = type(original).__name__ if original is not None else type(error).__name__
    return f"{name}, SQLSTATE {sqlstate}" if sqlstate else name


# --- CLI -------------------------------------------------------------------------------


def _print_report(outcome: SeedOutcome) -> None:
    for result in outcome.report.results:
        marker = {"passed": "ok", "failed": "FAIL", "blocked": "BLOCKED"}[result.status]
        print(f"[{marker:7}] {result.name}: {result.message}")
    print(f"seed status: {outcome.status}")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m patient_data.seed", description=__doc__.split("\n")[0]
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="run every read-only check and never call the writer",
    )
    parser.add_argument(
        "--package-dir", type=Path, help="data/assets/exports/<dataset-key> directory"
    )
    parser.add_argument("--schema", help="target PostgreSQL schema (PATIENT_SEED_SCHEMA)")
    parser.add_argument("--writer", help="backend persistence operation as module:attribute")
    args = parser.parse_args(argv)
    overrides = {
        key: value
        for key, value in (
            ("package_dir", args.package_dir),
            ("schema_name", args.schema),
            ("writer", args.writer),
        )
        if value is not None
    }
    try:
        settings = SeedSettings().model_copy(update=overrides)
    except ValidationError as error:
        fields = sorted({str(e["loc"][0]) for e in error.errors(include_input=False)})
        print(f"invalid seed settings: {fields}", file=sys.stderr)
        return 2
    outcome = run_seed(settings, check_only=args.check_only)
    _print_report(outcome)
    return outcome.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
