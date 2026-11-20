"""Read-only PostgreSQL readiness checks against an explicit import contract.

``TargetContract`` states what an importer needs (tables, columns, type families,
nullability, constraints, privileges, supported Alembic revisions). ``DatabaseInspector``
compares a live connection with it, using SQLAlchemy reflection for tables, columns, and
keys plus PostgreSQL privilege functions. It never creates, alters, or writes anything;
missing schema is reported with the migration step to take.

Failures name schemas, tables, columns, and constraints only, never row values or
credentials.
"""

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

from sqlalchemy import Connection, inspect, text
from sqlalchemy import types as sqltypes
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine.interfaces import ReflectedColumn
from sqlalchemy.exc import SQLAlchemyError

from patient_data.utils.checks import CheckReport

TypeFamily = Literal[
    "uuid",
    "text",
    "jsonb",
    "json",
    "date",
    "timestamptz",
    "timestamp",
    "boolean",
    "integer",
    "numeric",
    "other",
]
_IDENTIFIER = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,62}")


def is_safe_identifier(name: str) -> bool:
    return _IDENTIFIER.fullmatch(name) is not None


def type_family(column_type: Any) -> TypeFamily:
    """Classify a reflected SQLAlchemy type into a comparison family."""
    if isinstance(column_type, postgresql.JSONB):
        return "jsonb"
    if isinstance(column_type, sqltypes.JSON):
        return "json"
    if isinstance(column_type, sqltypes.Uuid):
        return "uuid"
    if isinstance(column_type, sqltypes.String):
        return "text"
    if isinstance(column_type, sqltypes.DateTime):
        return "timestamptz" if column_type.timezone else "timestamp"
    if isinstance(column_type, sqltypes.Date):
        return "date"
    if isinstance(column_type, sqltypes.Boolean):
        return "boolean"
    if isinstance(column_type, sqltypes.Integer):
        return "integer"
    if isinstance(column_type, sqltypes.Numeric):
        return "numeric"
    return "other"


@dataclass(frozen=True)
class TargetColumn:
    """A column the importer relies on.

    ``supplied`` columns receive a value from the importer; unsupplied ones must be
    nullable or have a default. ``may_write_null`` columns may receive NULL, so they must be
    nullable. ``min_length`` rejects text columns too short for the supplied values.
    """

    name: str
    families: frozenset[TypeFamily]
    supplied: bool = True
    may_write_null: bool = False
    min_length: int | None = None


@dataclass(frozen=True)
class TargetTable:
    name: str
    columns: tuple[TargetColumn, ...]
    privileges: frozenset[str] = frozenset({"SELECT", "INSERT"})


@dataclass(frozen=True)
class TargetConstraint:
    kind: Literal["primary_key", "unique", "foreign_key"]
    table: str
    columns: tuple[str, ...]
    referred_table: str | None = None
    referred_columns: tuple[str, ...] = ()

    def describe(self) -> str:
        cols = ", ".join(self.columns)
        if self.kind == "foreign_key":
            return (
                f"{self.table}({cols}) -> {self.referred_table}({', '.join(self.referred_columns)})"
            )
        return f"{self.kind.replace('_', ' ')} {self.table}({cols})"


@dataclass(frozen=True)
class TargetContract:
    tables: tuple[TargetTable, ...]
    constraints: tuple[TargetConstraint, ...] = ()
    supported_revisions: frozenset[str] = field(default_factory=frozenset)

    def merged(self, other: "TargetContract") -> "TargetContract":
        """Combine two contracts (e.g. data's marker needs + backend writer's columns)."""
        tables: dict[str, TargetTable] = {table.name: table for table in self.tables}
        for table in other.tables:
            if table.name not in tables:
                tables[table.name] = table
                continue
            current = tables[table.name]
            columns = {column.name: column for column in current.columns}
            for column in table.columns:
                if column.name in columns and columns[column.name] != column:
                    # Keep the stricter intersection of type families and requirements.
                    known = columns[column.name]
                    column = TargetColumn(
                        name=column.name,
                        families=known.families & column.families,
                        supplied=known.supplied or column.supplied,
                        may_write_null=known.may_write_null or column.may_write_null,
                        min_length=max(known.min_length or 0, column.min_length or 0) or None,
                    )
                columns[column.name] = column
            tables[table.name] = TargetTable(
                table.name, tuple(columns.values()), current.privileges | table.privileges
            )
        constraints = tuple(dict.fromkeys((*self.constraints, *other.constraints)))
        revisions = self.supported_revisions | other.supported_revisions
        return TargetContract(tuple(tables.values()), constraints, revisions)


class DatabaseInspector:
    """Compare one PostgreSQL schema, through an existing connection, with a contract."""

    def __init__(self, connection: Connection, schema: str) -> None:
        if not is_safe_identifier(schema):
            raise ValueError("schema must be a plain SQL identifier")
        self.connection = connection
        self.schema = schema
        self._inspector = inspect(connection)

    def _qualified(self, table: str) -> str:
        quote = self.connection.dialect.identifier_preparer.quote
        return f"{quote(self.schema)}.{quote(table)}"

    def check_connection(self, report: CheckReport) -> bool:
        """Execute a trivial query (authentication already happened when connecting)."""
        try:
            self.connection.execute(text("SELECT 1")).scalar_one()
        except SQLAlchemyError as error:
            report.add("database.query", "failed", f"query failed ({type(error).__name__})")
            return False
        report.add("database.query", "passed", "authenticated and executed a query")
        return True

    def check_schema(self, report: CheckReport) -> bool:
        exists = self.schema in self._inspector.get_schema_names()
        report.add(
            "database.schema",
            "passed" if exists else "failed",
            f"schema {self.schema} exists"
            if exists
            else f"schema {self.schema} is missing; apply the backend Alembic migrations",
        )
        return exists

    def check_revision(self, report: CheckReport, supported: frozenset[str]) -> bool:
        if not supported:
            report.add(
                "database.migration_revision",
                "blocked",
                "no supported Alembic revision is known; the backend persistence operation "
                "must declare the revisions it supports",
            )
            return False
        if not self._inspector.has_table("alembic_version", schema=self.schema):
            report.add(
                "database.migration_revision",
                "failed",
                f"{self.schema}.alembic_version is missing; run `alembic upgrade head`",
            )
            return False
        rows: Sequence[object] = (
            self.connection.execute(
                text(f"SELECT version_num FROM {self._qualified('alembic_version')}")
            )
            .scalars()
            .all()
        )
        revisions = {str(row) for row in rows}
        ok = bool(revisions) and revisions <= supported
        report.add(
            "database.migration_revision",
            "passed" if ok else "failed",
            f"Alembic revision {sorted(revisions)} is supported"
            if ok
            else f"Alembic revision {sorted(revisions) or 'none'} is not one of "
            f"{sorted(supported)}; run `alembic upgrade head` or update the seed package",
        )
        return ok

    def check_tables(self, report: CheckReport, contract: TargetContract) -> set[str]:
        """Require real base tables; a view or other same-name object does not qualify."""
        tables = set(self._inspector.get_table_names(schema=self.schema))
        views = set(self._inspector.get_view_names(schema=self.schema)) | set(
            self._inspector.get_materialized_view_names(schema=self.schema)
        )
        present: set[str] = set()
        for table in contract.tables:
            if table.name in tables:
                present.add(table.name)
                report.add(f"table.{table.name}", "passed", f"{self.schema}.{table.name} exists")
            elif table.name in views:
                report.add(
                    f"table.{table.name}",
                    "failed",
                    f"{self.schema}.{table.name} is a view, not a table; apply migrations",
                )
            else:
                report.add(
                    f"table.{table.name}",
                    "failed",
                    f"{self.schema}.{table.name} is missing; apply the Alembic migrations",
                )
        return present

    def check_columns(self, report: CheckReport, table: TargetTable) -> None:
        reflected = {
            c["name"]: c for c in self._inspector.get_columns(table.name, schema=self.schema)
        }
        expected = {column.name for column in table.columns}
        for column in table.columns:
            name = f"column.{table.name}.{column.name}"
            actual = reflected.get(column.name)
            if actual is None:
                report.add(
                    name,
                    "failed",
                    f"{table.name}.{column.name} is missing; apply the Alembic migrations",
                )
                continue
            problem = _column_problem(column, actual)
            report.add(
                name,
                "failed" if problem else "passed",
                f"{table.name}.{column.name} {problem}"
                if problem
                else f"{table.name}.{column.name} is compatible",
            )
        extra_required = [
            name
            for name, info in reflected.items()
            if name not in expected and not info["nullable"] and not _has_default(info)
        ]
        report.add(
            f"columns.{table.name}.extra_required",
            "failed" if extra_required else "passed",
            f"{table.name} has required column(s) {extra_required} that the importer does not "
            "supply and that have no default"
            if extra_required
            else f"no unsupplied required columns in {table.name}",
        )

    def check_constraints(
        self, report: CheckReport, constraints: Iterable[TargetConstraint], present: set[str]
    ) -> None:
        for constraint in constraints:
            name = f"constraint.{constraint.describe()}"
            if constraint.table not in present:
                report.add(name, "blocked", f"table {constraint.table} is not available")
                continue
            found = self._has_constraint(constraint)
            report.add(
                name,
                "passed" if found else "failed",
                f"{constraint.describe()} exists"
                if found
                else f"{constraint.describe()} is missing; apply the Alembic migrations",
            )

    def _has_constraint(self, constraint: TargetConstraint) -> bool:
        columns = list(constraint.columns)
        pk = self._inspector.get_pk_constraint(constraint.table, schema=self.schema)
        if constraint.kind == "primary_key":
            return list(pk.get("constrained_columns") or []) == columns
        if constraint.kind == "unique":
            if list(pk.get("constrained_columns") or []) == columns:
                return True
            uniques = self._inspector.get_unique_constraints(constraint.table, schema=self.schema)
            if any(list(u["column_names"]) == columns for u in uniques):
                return True
            # A full (non-partial, non-expression) unique index also enforces uniqueness.
            for index in self._inspector.get_indexes(constraint.table, schema=self.schema):
                options = index.get("dialect_options") or {}
                if (
                    index.get("unique")
                    and list(index["column_names"]) == columns
                    and not options.get("postgresql_where")
                ):
                    return True
            return False
        for fk in self._inspector.get_foreign_keys(constraint.table, schema=self.schema):
            if (
                list(fk["constrained_columns"]) == columns
                and fk["referred_table"] == constraint.referred_table
                and list(fk["referred_columns"]) == list(constraint.referred_columns)
                and fk.get("referred_schema") in (None, self.schema)
            ):
                return True
        return False

    def check_privileges(
        self, report: CheckReport, contract: TargetContract, present: set[str]
    ) -> None:
        usage: bool = self.connection.execute(
            text("SELECT has_schema_privilege(:schema, 'USAGE')"), {"schema": self.schema}
        ).scalar_one()
        report.add(
            "privilege.schema_usage",
            "passed" if usage else "failed",
            f"current role has USAGE on schema {self.schema}"
            if usage
            else f"current role lacks USAGE on schema {self.schema}; grant it",
        )
        for table in contract.tables:
            name = f"privilege.{table.name}"
            if table.name not in present:
                report.add(name, "blocked", f"table {table.name} is not available")
                continue
            missing = [
                privilege
                for privilege in sorted(table.privileges)
                if not self.connection.execute(
                    text("SELECT has_table_privilege(:table, :privilege)"),
                    {"table": self._qualified(table.name), "privilege": privilege},
                ).scalar_one()
            ]
            missing += self._missing_sequence_usage(table)
            report.add(
                name,
                "failed" if missing else "passed",
                f"current role lacks {missing} on {table.name}; grant them"
                if missing
                else f"current role has {sorted(table.privileges)} on {table.name}",
            )

    def _missing_sequence_usage(self, table: TargetTable) -> list[str]:
        missing: list[str] = []
        for column in table.columns:
            if column.supplied:
                continue
            sequence = self.connection.execute(
                text("SELECT pg_get_serial_sequence(:table, :column)"),
                {"table": self._qualified(table.name), "column": column.name},
            ).scalar_one_or_none()
            if (
                sequence is not None
                and not self.connection.execute(
                    text("SELECT has_sequence_privilege(:sequence, 'USAGE')"),
                    {"sequence": sequence},
                ).scalar_one()
            ):
                missing.append(f"USAGE on sequence for {column.name}")
        return missing

    def check_contract(self, contract: TargetContract, report: CheckReport) -> bool:
        """Run every check in dependency order; dependent checks are blocked, not passed."""
        if not self.check_connection(report) or not self.check_schema(report):
            report.add("database.contract", "blocked", "schema checks need a reachable schema")
            return False
        self.check_revision(report, contract.supported_revisions)
        present = self.check_tables(report, contract)
        for table in contract.tables:
            if table.name in present:
                self.check_columns(report, table)
            else:
                report.add(
                    f"columns.{table.name}", "blocked", f"table {table.name} is not available"
                )
        self.check_constraints(report, contract.constraints, present)
        self.check_privileges(report, contract, present)
        return report.passed


def _has_default(info: ReflectedColumn) -> bool:
    return bool(info.get("default") is not None or info.get("identity") or info.get("computed"))


def _column_problem(column: TargetColumn, info: ReflectedColumn) -> str:
    family = type_family(info["type"])
    if family not in column.families:
        return f"has type family {family}; expected one of {sorted(column.families)}"
    if column.supplied and info.get("computed"):
        return "is a generated column and cannot be written"
    if column.supplied and column.may_write_null and not info["nullable"]:
        return "is NOT NULL but the importer may supply null"
    if not column.supplied and not info["nullable"] and not _has_default(info):
        return "is NOT NULL without a default, but the importer does not supply it"
    length = getattr(info["type"], "length", None)
    if column.min_length is not None and length is not None and length < column.min_length:
        return f"is limited to {length} characters; at least {column.min_length} are needed"
    return ""
