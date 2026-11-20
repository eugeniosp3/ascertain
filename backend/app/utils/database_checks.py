"""Read-only checks against a caller-owned database connection.

These checks cover connectivity, migration revisions, and table/column presence.
They do not validate column types, constraints, permissions, or prepared seed data.
"""

from dataclasses import dataclass
from typing import Literal

from alembic.runtime.migration import MigrationContext
from sqlalchemy import Connection, MetaData, inspect, text
from sqlalchemy.exc import SQLAlchemyError


@dataclass(frozen=True, slots=True)
class CheckResult:
    """A safe check result that can be shared without mutating it."""

    name: str
    status: Literal["passed", "failed", "blocked"]
    message: str

    @property
    def passed(self) -> bool:
        return self.status == "passed"


class DatabaseChecks:
    """Inspect readiness without writing, committing, or closing the connection."""

    def __init__(self, connection: Connection) -> None:
        self._connection = connection

    def connectivity(self) -> CheckResult:
        """Run a small read-only probe; redact database failure details."""
        try:
            value: object = self._connection.execute(text("SELECT 1")).scalar_one()
        except SQLAlchemyError:
            return CheckResult("connectivity", "failed", "Database probe failed.")
        if value != 1:
            return CheckResult(
                "connectivity",
                "failed",
                "Database probe returned an unexpected result.",
            )
        return CheckResult("connectivity", "passed", "Database connection is available.")

    def schema(self, metadata: MetaData) -> CheckResult:
        """Check approved tables and columns; undefined metadata cannot pass."""
        if not metadata.tables:
            return CheckResult("schema", "blocked", "Application schema has not been defined yet.")

        missing: list[str] = []
        try:
            inspector = inspect(self._connection)
            tables_by_schema: dict[str | None, set[str]] = {}
            for table in metadata.tables.values():
                if table.schema not in tables_by_schema:
                    tables_by_schema[table.schema] = set(
                        inspector.get_table_names(schema=table.schema)
                    )
                if table.name not in tables_by_schema[table.schema]:
                    missing.append(f"Missing table: {table.fullname}.")
                    continue
                actual_columns = {
                    column["name"]
                    for column in inspector.get_columns(table.name, schema=table.schema)
                }
                absent = sorted(set(table.columns.keys()) - actual_columns)
                if absent:
                    missing.append(f"Missing columns in {table.fullname}: {', '.join(absent)}.")
        except SQLAlchemyError:
            return CheckResult("schema", "failed", "Database schema inspection failed.")

        if missing:
            return CheckResult("schema", "failed", " ".join(missing))
        return CheckResult("schema", "passed", "Required tables and columns exist.")

    def migrations(self, expected_heads: frozenset[str]) -> CheckResult:
        """Compare Alembic revisions without creating or updating its version table."""
        if not expected_heads:
            return CheckResult(
                "migrations",
                "blocked",
                "Application migrations have not been defined yet.",
            )
        try:
            context = MigrationContext.configure(self._connection)
            actual_heads = frozenset(context.get_current_heads())
        except SQLAlchemyError:
            return CheckResult("migrations", "failed", "Database migration inspection failed.")
        if actual_heads != expected_heads:
            return CheckResult(
                "migrations",
                "failed",
                "Database migrations do not match the expected revision.",
            )
        return CheckResult("migrations", "passed", "Database migrations are current.")
