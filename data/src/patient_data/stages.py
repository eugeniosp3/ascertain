"""Build, validate, and read ``bronze.duckdb`` and ``silver.duckdb``.

Each stage is built into a temporary file under ``data/work/``, validated there, and only
then promoted over the previous file with an atomic rename. A build whose deterministic
content equals the existing file keeps the existing file (and its original processing
timestamps), so unchanged inputs and rule versions preserve both identity and bytes.

Validation re-derives everything it can: lineage UUIDs, row checksums, the raw values in
both stages, and every clean value (by re-running the field rules on the stored raw text).
Read/validate functions never create a missing database file.
"""

import csv
import io
import os
import re
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Literal, cast
from uuid import UUID, uuid4

import duckdb

from patient_data.errors import PatientDataError
from patient_data.patient_rules import (
    FIELD_NAMES,
    PATIENT_FIELDS,
    SOURCE_COLUMN_COUNT,
    invariant_issues,
)
from patient_data.settings import StageSettings
from patient_data.utils.checks import CheckReport
from patient_data.utils.identifiers import (
    bronze_id,
    canonical_json,
    row_checksum,
    sha256_bytes,
    sha256_file,
    silver_id,
    source_file_id,
)
from patient_data.utils.models import DataModel
from patient_data.utils.transformations import (
    DUCKDB_CATALOG_TYPES,
    CleanValue,
    RowTransformer,
    TransformedRow,
)

TIMESTAMPTZ = "TIMESTAMP WITH TIME ZONE"
_IDENTIFIER = re.compile(r"[a-z_][a-z0-9_]*")

# (name, DuckDB catalog type, nullable) in physical column order.
ColumnSpec = tuple[str, str, bool]

BRONZE_SOURCE_FILE_COLUMNS: tuple[ColumnSpec, ...] = (
    ("source_file_id", "UUID", False),
    ("source_path", "VARCHAR", False),
    ("source_sha256", "VARCHAR", False),
    ("dataset_date", "DATE", False),
    ("row_count", "BIGINT", False),
    ("column_count", "INTEGER", False),
    ("ingested_at", TIMESTAMPTZ, False),
)
BRONZE_PATIENT_COLUMNS: tuple[ColumnSpec, ...] = (
    ("bronze_id", "UUID", False),
    ("source_file_id", "UUID", False),
    ("source_row_number", "BIGINT", False),
    ("source_row_sha256", "VARCHAR", False),
    ("ingested_at", TIMESTAMPTZ, False),
    *((name, "VARCHAR", False) for name in FIELD_NAMES),
)
SILVER_METADATA_COLUMNS: tuple[ColumnSpec, ...] = (
    ("patient_source_file_id", "UUID", False),
    ("source_path", "VARCHAR", False),
    ("source_sha256", "VARCHAR", False),
    ("dataset_date", "DATE", False),
    ("transformation_version", "VARCHAR", False),
    ("completed_at", TIMESTAMPTZ, False),
)
SILVER_PATIENT_COLUMNS: tuple[ColumnSpec, ...] = (
    ("silver_id", "UUID", False),
    ("bronze_id", "UUID", False),
    ("transformation_version", "VARCHAR", False),
    ("transformed_at", TIMESTAMPTZ, False),
    *(
        column
        for rule in PATIENT_FIELDS
        for column in (
            (f"{rule.name}_raw", "VARCHAR", False),
            (f"{rule.name}_clean", DUCKDB_CATALOG_TYPES[rule.kind], True),
        )
    ),
)
BRONZE_TABLES = {"source_files": BRONZE_SOURCE_FILE_COLUMNS, "patients": BRONZE_PATIENT_COLUMNS}
SILVER_TABLES = {"build_metadata": SILVER_METADATA_COLUMNS, "patients": SILVER_PATIENT_COLUMNS}


class StageResult(DataModel):
    stage: Literal["bronze", "silver"]
    path: Path
    status: Literal["built", "unchanged"]
    row_count: int
    fingerprint: str


@dataclass(frozen=True)
class SourceSnapshot:
    """The parsed, structurally valid patient CSV."""

    source_path: str
    sha256: str
    source_file_id: UUID
    rows: tuple[tuple[str, ...], ...]


@dataclass(frozen=True)
class SilverPatient:
    silver_id: UUID
    bronze_id: UUID
    raw: dict[str, str]
    clean: dict[str, CleanValue]


@dataclass(frozen=True)
class SilverMetadata:
    source_file_id: UUID
    source_path: str
    source_sha256: str
    dataset_date: date
    transformation_version: str


# --- Small DuckDB helpers ----------------------------------------------------------------


def _q(name: str) -> str:
    if _IDENTIFIER.fullmatch(name) is None:
        raise ValueError(f"unsafe identifier {name!r}")
    return f'"{name}"'


def _literal(text: str) -> str:
    return "'" + text.replace("'", "''") + "'"


def _col(name: str, table_alias: str = "") -> str:
    """Quote a selected column, with an optional internal table alias."""
    return f"{table_alias}.{_q(name)}" if table_alias else _q(name)


def _fetch(
    con: duckdb.DuckDBPyConnection, sql: str, params: Sequence[object] = ()
) -> list[tuple[object, ...]]:
    return con.execute(sql, list(params)).fetchall()


def _column_ddl(columns: Sequence[ColumnSpec]) -> str:
    ddl_types = {TIMESTAMPTZ: "TIMESTAMPTZ"}
    return ",\n  ".join(
        f"{_q(name)} {ddl_types.get(kind, kind)}{'' if nullable else ' NOT NULL'}"
        for name, kind, nullable in columns
    )


@contextmanager
def _connect(path: Path, *, read_only: bool) -> Iterator[duckdb.DuckDBPyConnection]:
    """Open a stage file; read-only opens refuse to create a missing file."""
    if read_only and not path.is_file():
        raise PatientDataError(f"{path.name} not found at {path}; build it first")
    try:
        con = duckdb.connect(str(path), read_only=read_only)
    except duckdb.Error as error:
        raise PatientDataError(
            f"cannot open {path.name} ({type(error).__name__}); close other connections "
            "to it and retry"
        ) from error
    try:
        con.execute("SET TimeZone = 'UTC'")
        yield con
    finally:
        con.close()


def _catalog_columns(con: duckdb.DuckDBPyConnection, catalog: str, table: str) -> list[ColumnSpec]:
    rows = con.execute(
        "SELECT column_name, data_type, is_nullable = 'YES' FROM information_schema.columns "
        "WHERE table_catalog = ? AND table_schema = 'main' AND table_name = ? "
        "ORDER BY ordinal_position",
        [catalog, table],
    ).fetchall()
    return [(str(name), str(kind), bool(nullable)) for name, kind, nullable in rows]


def _check_tables(
    con: duckdb.DuckDBPyConnection,
    catalog: str,
    expected: dict[str, tuple[ColumnSpec, ...]],
    report: CheckReport,
    prefix: str,
) -> bool:
    found = {
        str(row[0])
        for row in con.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_catalog = ? AND table_schema = 'main' AND table_type = 'BASE TABLE'",
            [catalog],
        ).fetchall()
    }
    if found != set(expected):
        report.add(
            f"{prefix}.tables",
            "failed",
            f"expected tables {sorted(expected)} but found {sorted(found)}; rebuild the stage",
        )
        return False
    report.add(f"{prefix}.tables", "passed", f"tables {sorted(expected)} present")
    ok = True
    for table, columns in expected.items():
        actual = _catalog_columns(con, catalog, table)
        if actual == list(columns):
            report.add(f"{prefix}.{table}.columns", "passed", f"{len(columns)} columns match")
            continue
        ok = False
        expected_names = [column[0] for column in columns]
        actual_names = [column[0] for column in actual]
        if actual_names != expected_names:
            detail = "column names/order differ from the contract"
        else:
            wrong = [e[0] for e, a in zip(columns, actual, strict=True) if e != a]
            detail = f"type or nullability differs for {wrong[:10]}"
        report.add(f"{prefix}.{table}.columns", "failed", f"{detail}; rebuild the stage")
    return ok


def _fingerprint_value(value: object) -> object:
    if value is None or isinstance(value, bool | int | str):
        return value
    if isinstance(value, Decimal | UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    if isinstance(value, date):
        return value.isoformat()
    raise TypeError(f"unsupported value type {type(value).__name__}")


def _fingerprint(
    con: duckdb.DuckDBPyConnection,
    catalog: str,
    tables: dict[str, tuple[ColumnSpec, ...]],
    exclude: frozenset[str],
) -> str:
    """Hash deterministic stage content, ignoring processing-time columns."""
    content: dict[str, list[list[object]]] = {}
    for table, columns in tables.items():
        names = [name for name, _, _ in columns if name not in exclude]
        select = ", ".join(_col(name) for name in names)
        rows = _fetch(con, f"SELECT {select} FROM {_q(catalog)}.main.{_q(table)} ORDER BY ALL")
        content[table] = [[_fingerprint_value(value) for value in row] for row in rows]
    return sha256_bytes(canonical_json(content).encode("utf-8"))


def _remove_database_file(path: Path) -> None:
    for candidate in (path, path.with_name(path.name + ".wal")):
        candidate.unlink(missing_ok=True)


def _promote(
    temp: Path, destination: Path, fingerprint: str, read_fingerprint: Callable[[Path], str]
) -> Literal["built", "unchanged"]:
    """Atomically replace ``destination`` unless it already holds identical content."""
    if temp.with_name(temp.name + ".wal").exists():
        raise PatientDataError(f"temporary {destination.name} was not checkpointed; not promoted")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        try:
            existing = read_fingerprint(destination)
        except PatientDataError:
            existing = None  # Unreadable or invalid: replace it with the validated build.
        else:
            if existing == fingerprint:
                _remove_database_file(temp)
                return "unchanged"
        # Refuse to swap the file underneath another process that holds DuckDB's lock.
        with _connect(destination, read_only=False):
            pass
        destination.with_name(destination.name + ".wal").unlink(missing_ok=True)
    os.replace(temp, destination)
    return "built"


def _failures(report: CheckReport) -> list[str]:
    return [f"{r.name}: {r.message}" for r in report.results if r.status != "passed"]


def _temp_path(settings: StageSettings, stage: str) -> Path:
    settings.work_dir.mkdir(parents=True, exist_ok=True)
    return settings.work_dir / f"{stage}_build_{uuid4().hex}.duckdb"


def _database_error(stage: str, error: duckdb.Error) -> PatientDataError:
    # DuckDB messages can quote values, so only the error class is reported.
    return PatientDataError(
        f"DuckDB rejected the {stage} build ({type(error).__name__}); the previous "
        f"{stage}.duckdb was left unchanged"
    )


# --- Source ------------------------------------------------------------------------------


def read_source(settings: StageSettings) -> SourceSnapshot:
    """Read the whole CSV once and validate its structure (not its values)."""
    path = settings.source_file
    if not path.is_file():
        raise PatientDataError(f"source CSV not found: {settings.source_file}")
    data = path.read_bytes()
    checksum = sha256_bytes(data)
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise PatientDataError(
            f"{settings.source_path} is not valid UTF-8 (byte {error.start})"
        ) from error
    if text.startswith("﻿"):
        raise PatientDataError(f"{settings.source_path} starts with a byte-order mark")
    reader = csv.reader(io.StringIO(text, newline=""), strict=True)
    try:
        records = [tuple(record) for record in reader]
    except csv.Error as error:
        raise PatientDataError(
            f"{settings.source_path} is not well-formed CSV near line {reader.line_num}"
        ) from error
    if not records:
        raise PatientDataError(f"{settings.source_path} is empty")
    issues = RowTransformer(PATIENT_FIELDS).header_issues(records[0])
    rows = records[1:]
    for number, row in enumerate(rows, start=1):
        if len(row) != SOURCE_COLUMN_COUNT:
            issues.append(
                f"record {number} has {len(row)} field(s); expected {SOURCE_COLUMN_COUNT}"
            )
    if len(rows) != settings.expected_row_count:
        issues.append(f"found {len(rows)} data record(s); expected {settings.expected_row_count}")
    if issues:
        raise PatientDataError(
            f"{settings.source_path} does not match the patient contract", issues
        )
    return SourceSnapshot(
        source_path=settings.source_path,
        sha256=checksum,
        source_file_id=source_file_id(settings.source_path, checksum),
        rows=tuple(rows),
    )


# --- Bronze ------------------------------------------------------------------------------


def _write_bronze(path: Path, snapshot: SourceSnapshot, settings: StageSettings) -> None:
    now = datetime.now(UTC)
    with _connect(path, read_only=False) as con:
        con.execute(
            f"CREATE TABLE source_files (\n  {_column_ddl(BRONZE_SOURCE_FILE_COLUMNS)},\n"
            "  PRIMARY KEY (source_file_id),\n  UNIQUE (source_path, source_sha256)\n)"
        )
        con.execute(
            f"CREATE TABLE patients (\n  {_column_ddl(BRONZE_PATIENT_COLUMNS)},\n"
            "  PRIMARY KEY (bronze_id),\n"
            "  FOREIGN KEY (source_file_id) REFERENCES source_files (source_file_id),\n"
            "  UNIQUE (source_file_id, source_row_number)\n)"
        )
        con.execute(
            "INSERT INTO source_files VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                snapshot.source_file_id,
                snapshot.source_path,
                snapshot.sha256,
                settings.dataset_date,
                len(snapshot.rows),
                SOURCE_COLUMN_COUNT,
                now,
            ],
        )
        placeholders = ", ".join("?" for _ in BRONZE_PATIENT_COLUMNS)
        con.executemany(
            f"INSERT INTO patients VALUES ({placeholders})",
            [
                [
                    bronze_id(snapshot.source_file_id, number),
                    snapshot.source_file_id,
                    number,
                    row_checksum(row),
                    now,
                    *row,
                ]
                for number, row in enumerate(snapshot.rows, start=1)
            ],
        )
        con.execute("CHECKPOINT")


def check_bronze(
    con: duckdb.DuckDBPyConnection,
    settings: StageSettings,
    *,
    catalog: str,
    source: SourceSnapshot | None = None,
    report: CheckReport | None = None,
) -> CheckReport:
    """Validate a bronze catalog; with ``source``, also reconcile it with the current CSV."""
    report = report if report is not None else CheckReport()
    if not _check_tables(con, catalog, BRONZE_TABLES, report, "bronze"):
        return report
    files = con.execute(
        "SELECT source_file_id, source_path, source_sha256, dataset_date, row_count, column_count"
        f" FROM {_q(catalog)}.main.source_files"
    ).fetchall()
    if len(files) != 1:
        report.add("bronze.source_files.row", "failed", f"expected 1 row, found {len(files)}")
        return report
    file_id, path, checksum, dataset_date, row_count, column_count = files[0]
    problems = []
    if path != settings.source_path:
        problems.append("source path differs from settings")
    if file_id != source_file_id(path, checksum):
        problems.append("source_file_id does not match its path and checksum")
    if dataset_date != settings.dataset_date:
        problems.append("dataset date differs from settings")
    if column_count != SOURCE_COLUMN_COUNT:
        problems.append(f"column_count is not {SOURCE_COLUMN_COUNT}")
    report.add(
        "bronze.source_files.row",
        "failed" if problems else "passed",
        "; ".join(problems) or "source metadata and source_file_id are consistent",
    )
    if source is not None:
        same = checksum == source.sha256
        report.add(
            "bronze.source_checksum",
            "passed" if same else "failed",
            "bronze matches the current source CSV bytes"
            if same
            else "the source CSV changed since bronze was built; rebuild bronze",
        )

    fields = ", ".join(_q(name) for name in FIELD_NAMES)
    rows = con.execute(
        f"SELECT bronze_id, source_file_id, source_row_number, source_row_sha256, {fields} "
        f"FROM {_q(catalog)}.main.patients ORDER BY source_row_number"
    ).fetchall()
    numbers = [row[2] for row in rows]
    count_ok = len(rows) == settings.expected_row_count == row_count
    report.add(
        "bronze.patients.count",
        "passed" if count_ok else "failed",
        f"{len(rows)} rows; expected {settings.expected_row_count} (metadata says {row_count})",
    )
    report.add(
        "bronze.patients.row_numbers",
        "passed" if numbers == list(range(1, len(rows) + 1)) else "failed",
        "row numbers are 1..N without gaps"
        if numbers == list(range(1, len(rows) + 1))
        else "row numbers are not contiguous from 1",
    )
    bad_ids = [row[2] for row in rows if row[1] != file_id or row[0] != bronze_id(file_id, row[2])]
    report.add(
        "bronze.patients.bronze_id",
        "failed" if bad_ids else "passed",
        f"lineage UUID mismatch in rows {bad_ids[:10]}"
        if bad_ids
        else "every bronze_id re-derives from source_file_id and row number",
    )
    bad_sums = [row[2] for row in rows if row[3] != row_checksum([str(v) for v in row[4:]])]
    report.add(
        "bronze.patients.row_checksum",
        "failed" if bad_sums else "passed",
        f"row checksum mismatch in rows {bad_sums[:10]}"
        if bad_sums
        else "every row checksum matches its stored values",
    )
    if source is not None:
        stored = tuple(tuple(str(v) for v in row[4:]) for row in rows)
        differing = [
            n for n, (a, b) in enumerate(zip(stored, source.rows, strict=False), start=1) if a != b
        ]
        same_rows = len(stored) == len(source.rows) and not differing
        report.add(
            "bronze.patients.reconcile_source",
            "passed" if same_rows else "failed",
            f"all {len(stored)} rows x {SOURCE_COLUMN_COUNT} fields equal the source"
            if same_rows
            else f"rows differ from the source CSV (first rows: {differing[:10]})",
        )
    return report


def _database_name(con: duckdb.DuckDBPyConnection) -> str:
    row = con.execute("SELECT current_database()").fetchone()
    assert row is not None
    return str(row[0])


def _bronze_fingerprint(path: Path) -> str:
    with _connect(path, read_only=True) as con:
        catalog = _database_name(con)
        if [n for n in _catalog_columns(con, catalog, "patients")] != list(BRONZE_PATIENT_COLUMNS):
            raise PatientDataError("existing bronze has a different layout")
        return _fingerprint(con, catalog, BRONZE_TABLES, frozenset({"ingested_at"}))


def build_bronze(settings: StageSettings) -> StageResult:
    """Load the unchanged CSV into a validated, atomically promoted ``bronze.duckdb``."""
    snapshot = read_source(settings)
    temp = _temp_path(settings, "bronze")
    try:
        try:
            _write_bronze(temp, snapshot, settings)
        except duckdb.Error as error:
            raise _database_error("bronze", error) from error
        with _connect(temp, read_only=True) as con:
            catalog = _database_name(con)
            report = check_bronze(con, settings, catalog=catalog, source=snapshot)
            if not report.passed:
                raise PatientDataError("bronze validation failed; not promoted", _failures(report))
            fingerprint = _fingerprint(con, catalog, BRONZE_TABLES, frozenset({"ingested_at"}))
        if sha256_file(settings.source_file) != snapshot.sha256:
            raise PatientDataError("source CSV changed during the bronze build; retry")
        status = _promote(temp, settings.bronze_path, fingerprint, _bronze_fingerprint)
    finally:
        _remove_database_file(temp)
    return StageResult(
        stage="bronze",
        path=settings.bronze_path,
        status=status,
        row_count=len(snapshot.rows),
        fingerprint=fingerprint,
    )


# --- Silver ------------------------------------------------------------------------------


def _transform(
    rows: Sequence[tuple[int, Sequence[str]]], settings: StageSettings
) -> list[TransformedRow]:
    transformer = RowTransformer(PATIENT_FIELDS)
    transformed, issues = transformer.transform_all(rows)
    if not issues:
        issues = invariant_issues(transformed, settings.dataset_date)
    if issues:
        raise PatientDataError(
            "patient values failed their field rules; silver was not changed",
            [str(issue) for issue in issues],
        )
    return transformed


def _read_bronze_for_silver(
    settings: StageSettings,
) -> tuple[tuple[UUID, str, str], list[tuple[UUID, int, tuple[str, ...]]]]:
    current_sha = sha256_file(settings.source_file) if settings.source_file.is_file() else None
    with _connect(settings.bronze_path, read_only=True) as con:
        catalog = _database_name(con)
        report = check_bronze(con, settings, catalog=catalog)
        if not report.passed:
            raise PatientDataError("bronze.duckdb is invalid; rebuild bronze", _failures(report))
        meta = con.execute(
            "SELECT source_file_id, source_path, source_sha256 FROM source_files"
        ).fetchone()
        assert meta is not None
        if current_sha is not None and current_sha != meta[2]:
            raise PatientDataError("the source CSV changed since bronze was built; rebuild bronze")
        fields = ", ".join(_q(name) for name in FIELD_NAMES)
        rows = con.execute(
            f"SELECT bronze_id, source_row_number, {fields} FROM patients "
            "ORDER BY source_row_number"
        ).fetchall()
    return (meta[0], meta[1], meta[2]), [
        (row[0], row[1], tuple(str(v) for v in row[2:])) for row in rows
    ]


def _write_silver(
    path: Path,
    settings: StageSettings,
    meta: tuple[UUID, str, str],
    bronze_rows: Sequence[tuple[UUID, int, tuple[str, ...]]],
    transformed: Sequence[TransformedRow],
) -> None:
    now = datetime.now(UTC)
    with _connect(path, read_only=False) as con:
        con.execute(f"CREATE TABLE build_metadata (\n  {_column_ddl(SILVER_METADATA_COLUMNS)}\n)")
        con.execute(
            f"CREATE TABLE patients (\n  {_column_ddl(SILVER_PATIENT_COLUMNS)},\n"
            "  PRIMARY KEY (silver_id),\n  UNIQUE (bronze_id, transformation_version)\n)"
        )
        con.execute(
            "INSERT INTO build_metadata VALUES (?, ?, ?, ?, ?, ?)",
            [
                meta[0],
                meta[1],
                meta[2],
                settings.dataset_date,
                settings.transformation_version,
                now,
            ],
        )
        placeholders = ", ".join("?" for _ in SILVER_PATIENT_COLUMNS)
        values = []
        for (b_id, _, _), row in zip(bronze_rows, transformed, strict=True):
            pairs = [value for pair in zip(row.raw, row.clean, strict=True) for value in pair]
            values.append(
                [
                    silver_id(b_id, settings.transformation_version),
                    b_id,
                    settings.transformation_version,
                    now,
                    *pairs,
                ]
            )
        con.executemany(f"INSERT INTO patients VALUES ({placeholders})", values)
        con.execute("CHECKPOINT")


def _read_silver_rows(con: duckdb.DuckDBPyConnection, catalog: str) -> list[SilverPatient]:
    columns = ", ".join(_col(f"{name}_{part}") for name in FIELD_NAMES for part in ("raw", "clean"))
    rows = _fetch(
        con,
        f"SELECT silver_id, bronze_id, {columns} FROM {_q(catalog)}.main.patients "
        f"ORDER BY {_q('patient_id_raw')}, silver_id",
    )
    patients = []
    for row in rows:
        values = row[2:]
        raw = {name: values[2 * i] for i, name in enumerate(FIELD_NAMES)}
        clean = {name: values[2 * i + 1] for i, name in enumerate(FIELD_NAMES)}
        ids = row[0], row[1]
        if not all(isinstance(value, UUID) for value in ids):
            raise PatientDataError("silver lineage columns are not UUIDs; rebuild silver")
        if not all(isinstance(value, str) for value in raw.values()):
            raise PatientDataError("silver raw columns are not text; rebuild silver")
        patients.append(
            SilverPatient(
                cast(UUID, row[0]),
                cast(UUID, row[1]),
                cast(dict[str, str], raw),
                cast(dict[str, CleanValue], clean),
            )
        )
    return patients


def check_silver(
    con: duckdb.DuckDBPyConnection,
    settings: StageSettings,
    *,
    catalog: str,
    bronze_catalog: str,
    report: CheckReport | None = None,
) -> CheckReport:
    """Validate silver against an attached bronze catalog and re-derive every clean value."""
    report = report if report is not None else CheckReport()
    if not _check_tables(con, catalog, SILVER_TABLES, report, "silver"):
        return report
    s, b = _q(catalog), _q(bronze_catalog)
    meta = con.execute(
        "SELECT patient_source_file_id, source_path, source_sha256, dataset_date, "
        f"transformation_version FROM {s}.main.build_metadata"
    ).fetchall()
    bronze_meta = con.execute(
        "SELECT source_file_id, source_path, source_sha256, dataset_date "
        f"FROM {b}.main.source_files"
    ).fetchall()
    if len(meta) != 1 or len(bronze_meta) != 1:
        report.add("silver.build_metadata.row", "failed", "expected exactly one metadata row")
        return report
    m = meta[0]
    same = tuple(m[:4]) == tuple(bronze_meta[0]) and m[4] == settings.transformation_version
    report.add(
        "silver.build_metadata.row",
        "passed" if same else "failed",
        "metadata matches bronze and the current transformation version"
        if same
        else "metadata does not match bronze or the transformation version; rebuild silver",
    )

    linked = con.execute(
        f"SELECT count(*) FILTER (WHERE bz.bronze_id IS NULL), "
        f"count(*) FILTER (WHERE sv.bronze_id IS NULL), count(*) "
        f"FROM {s}.main.patients sv FULL JOIN {b}.main.patients bz USING (bronze_id)"
    ).fetchone()
    assert linked is not None
    orphan_silver, unmatched_bronze, _ = linked
    link_ok = orphan_silver == 0 and unmatched_bronze == 0
    report.add(
        "silver.patients.lineage",
        "passed" if link_ok else "failed",
        "every silver row links to exactly one bronze row and vice versa"
        if link_ok
        else f"{orphan_silver} silver row(s) without bronze, {unmatched_bronze} bronze row(s) "
        "without silver; rebuild silver",
    )
    differences = " OR ".join(
        f"sv.{_q(name + '_raw')} IS DISTINCT FROM bz.{_q(name)}" for name in FIELD_NAMES
    )
    raw_mismatch = con.execute(
        f"SELECT count(*) FROM {s}.main.patients sv JOIN {b}.main.patients bz USING (bronze_id) "
        f"WHERE {differences}"
    ).fetchone()
    assert raw_mismatch is not None
    report.add(
        "silver.patients.raw_matches_bronze",
        "passed" if raw_mismatch[0] == 0 else "failed",
        f"all {SOURCE_COLUMN_COUNT} raw columns equal bronze"
        if raw_mismatch[0] == 0
        else f"{raw_mismatch[0]} row(s) have raw values that differ from bronze",
    )

    patients = _read_silver_rows(con, catalog)
    versions = con.execute(
        f"SELECT DISTINCT transformation_version FROM {s}.main.patients"
    ).fetchall()
    count_ok = len(patients) == settings.expected_row_count
    report.add(
        "silver.patients.count",
        "passed" if count_ok else "failed",
        f"{len(patients)} rows; expected {settings.expected_row_count}",
    )
    bad_ids = [
        str(p.bronze_id)
        for p in patients
        if p.silver_id != silver_id(p.bronze_id, settings.transformation_version)
    ]
    version_ok = [v[0] for v in versions] in ([settings.transformation_version], [])
    report.add(
        "silver.patients.silver_id",
        "passed" if not bad_ids and version_ok else "failed",
        "every silver_id re-derives from bronze_id and the transformation version"
        if not bad_ids and version_ok
        else f"{len(bad_ids)} silver_id(s) do not re-derive",
    )

    transformer = RowTransformer(PATIENT_FIELDS)
    rederived, issues = transformer.transform_all(
        (n, tuple(p.raw[name] for name in FIELD_NAMES)) for n, p in enumerate(patients, start=1)
    )
    mismatched: list[str] = []
    for patient, row in zip(patients, rederived if not issues else [], strict=False):
        for name, value in row.clean_values().items():
            stored = patient.clean[name]
            if stored != value or type(stored) is not type(value):
                mismatched.append(name)
    report.add(
        "silver.patients.clean_values",
        "passed" if not issues and not mismatched else "failed",
        "every clean value equals the field rule applied to its raw value"
        if not issues and not mismatched
        else f"{len(issues)} raw value(s) fail their rules and {len(mismatched)} clean value(s) "
        f"differ (fields {sorted(set(mismatched))[:10]}); rebuild silver",
    )
    if not issues:
        invariants = invariant_issues(rederived, settings.dataset_date)
        report.add(
            "silver.patients.invariants",
            "failed" if invariants else "passed",
            "; ".join(str(i) for i in invariants[:5])
            if invariants
            else "unique patient_id/mrn, date ordering, snapshot age and problem-list pairing hold",
        )
    return report


@contextmanager
def _silver_with_bronze(
    silver_path: Path, bronze_path: Path
) -> Iterator[tuple[duckdb.DuckDBPyConnection, str]]:
    if not bronze_path.is_file():
        raise PatientDataError(f"{bronze_path.name} not found at {bronze_path}; build bronze first")
    with _connect(silver_path, read_only=True) as con:
        con.execute(f"ATTACH {_literal(str(bronze_path))} AS bronze_stage (READ_ONLY)")
        try:
            yield con, _database_name(con)
        finally:
            con.execute("DETACH bronze_stage")


def _silver_fingerprint(path: Path) -> str:
    with _connect(path, read_only=True) as con:
        catalog = _database_name(con)
        if _catalog_columns(con, catalog, "patients") != list(SILVER_PATIENT_COLUMNS):
            raise PatientDataError("existing silver has a different layout")
        return _fingerprint(
            con, catalog, SILVER_TABLES, frozenset({"transformed_at", "completed_at"})
        )


def build_silver(settings: StageSettings) -> StageResult:
    """Transform validated bronze (opened read-only) into a promoted ``silver.duckdb``."""
    meta, bronze_rows = _read_bronze_for_silver(settings)
    transformed = _transform([(n, row) for _, n, row in bronze_rows], settings)
    temp = _temp_path(settings, "silver")
    try:
        try:
            _write_silver(temp, settings, meta, bronze_rows, transformed)
        except duckdb.Error as error:
            raise _database_error("silver", error) from error
        with _silver_with_bronze(temp, settings.bronze_path) as (con, catalog):
            report = check_silver(con, settings, catalog=catalog, bronze_catalog="bronze_stage")
            if not report.passed:
                raise PatientDataError("silver validation failed; not promoted", _failures(report))
            fingerprint = _fingerprint(
                con, catalog, SILVER_TABLES, frozenset({"transformed_at", "completed_at"})
            )
        status = _promote(temp, settings.silver_path, fingerprint, _silver_fingerprint)
    finally:
        _remove_database_file(temp)
    return StageResult(
        stage="silver",
        path=settings.silver_path,
        status=status,
        row_count=len(transformed),
        fingerprint=fingerprint,
    )


# --- Validation, inspection, and reading for export -------------------------------------


def validate_stages(settings: StageSettings) -> CheckReport:
    """Check both files independently, then silver against bronze and the current CSV."""
    report = CheckReport()
    source: SourceSnapshot | None = None
    try:
        source = read_source(settings)
    except PatientDataError as error:
        report.add("source.csv", "failed", error.summary)
    else:
        report.add(
            "source.csv", "passed", f"{len(source.rows)} records x {SOURCE_COLUMN_COUNT} fields"
        )
    for stage, path in (("bronze", settings.bronze_path), ("silver", settings.silver_path)):
        if not path.is_file():
            report.add(f"{stage}.file", "failed", f"{path.name} not found; build it first")
    if not settings.bronze_path.is_file():
        return report
    with _connect(settings.bronze_path, read_only=True) as con:
        check_bronze(con, settings, catalog=_database_name(con), source=source, report=report)
    if not settings.silver_path.is_file():
        return report
    with _silver_with_bronze(settings.silver_path, settings.bronze_path) as (con, catalog):
        check_silver(con, settings, catalog=catalog, bronze_catalog="bronze_stage", report=report)
    return report


def inspect_stages(settings: StageSettings) -> dict[str, object]:
    """Summarize both files (tables, counts, metadata, column pairing) without patient values."""
    summary: dict[str, object] = {}
    for stage, path, tables in (
        ("bronze", settings.bronze_path, BRONZE_TABLES),
        ("silver", settings.silver_path, SILVER_TABLES),
    ):
        if not path.is_file():
            summary[stage] = {"path": str(path), "exists": False}
            continue
        with _connect(path, read_only=True) as con:
            catalog = _database_name(con)
            counts = {
                table: con.execute(f"SELECT count(*) FROM {_q(table)}").fetchone()
                for table in tables
            }
            meta_table = "source_files" if stage == "bronze" else "build_metadata"
            names = [name for name, _, _ in tables[meta_table]]
            select = ", ".join(_col(name) for name in names)
            metadata = [
                dict(zip(names, map(_fingerprint_value, row), strict=True))
                for row in _fetch(con, f"SELECT {select} FROM {_q(meta_table)}")
            ]
            columns = _catalog_columns(con, catalog, "patients")
        details: dict[str, object] = {
            "path": str(path),
            "exists": True,
            "tables": {t: (c[0] if c else None) for t, c in counts.items()},
            "metadata": metadata,
            "patients_columns": len(columns),
        }
        if stage == "silver":
            details["raw_clean_pairs"] = sum(1 for n, _, _ in columns if n.endswith("_raw"))
        summary[stage] = details
    return summary


def read_silver(settings: StageSettings) -> tuple[SilverMetadata, list[SilverPatient]]:
    """Validate silver (with bronze) and return its metadata and patients by source ID."""
    with _silver_with_bronze(settings.silver_path, settings.bronze_path) as (con, catalog):
        report = check_silver(con, settings, catalog=catalog, bronze_catalog="bronze_stage")
        if not report.passed:
            raise PatientDataError("silver.duckdb is invalid; rebuild it", _failures(report))
        row = con.execute(
            "SELECT patient_source_file_id, source_path, source_sha256, dataset_date, "
            f"transformation_version FROM {_q(catalog)}.main.build_metadata"
        ).fetchone()
        assert row is not None
        patients = _read_silver_rows(con, catalog)
    return SilverMetadata(*row), patients
