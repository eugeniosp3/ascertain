"""Unit checks with mock connections; no application schema or database is created."""

from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import Column, Connection, Integer, MetaData, String, Table
from sqlalchemy.exc import SQLAlchemyError

from app.utils.database_checks import DatabaseChecks


@pytest.fixture
def connection() -> MagicMock:
    return MagicMock(spec=Connection)


@pytest.fixture
def metadata() -> MetaData:
    metadata = MetaData()
    Table(
        "widgets",
        metadata,
        Column("id", Integer),
        Column("name", String),
        schema="demo",
    )
    return metadata


def assert_transaction_untouched(connection: MagicMock) -> None:
    connection.commit.assert_not_called()
    connection.rollback.assert_not_called()
    connection.close.assert_not_called()


def test_connectivity_runs_only_a_read_probe(connection: MagicMock) -> None:
    connection.execute.return_value.scalar_one.return_value = 1

    result = DatabaseChecks(connection).connectivity()

    assert result.passed
    assert str(connection.execute.call_args.args[0]) == "SELECT 1"
    connection.execute.assert_called_once()
    assert_transaction_untouched(connection)


def test_connectivity_rejects_an_unexpected_result(connection: MagicMock) -> None:
    connection.execute.return_value.scalar_one.return_value = 0

    assert DatabaseChecks(connection).connectivity().status == "failed"
    assert_transaction_untouched(connection)


def test_undefined_schema_blocks_without_inspection(connection: MagicMock) -> None:
    with patch("app.utils.database_checks.inspect") as inspect:
        result = DatabaseChecks(connection).schema(MetaData())

    assert result.status == "blocked"
    inspect.assert_not_called()
    connection.execute.assert_not_called()
    assert_transaction_untouched(connection)


def test_schema_uses_declared_namespace_and_allows_extra_columns(
    connection: MagicMock, metadata: MetaData
) -> None:
    with patch("app.utils.database_checks.inspect") as inspect:
        inspector = inspect.return_value
        inspector.get_table_names.return_value = ["widgets"]
        inspector.get_columns.return_value = [
            {"name": "id"},
            {"name": "name"},
            {"name": "additional_field"},
        ]
        result = DatabaseChecks(connection).schema(metadata)

    assert result.passed
    inspector.get_table_names.assert_called_once_with(schema="demo")
    inspector.get_columns.assert_called_once_with("widgets", schema="demo")
    assert_transaction_untouched(connection)


@pytest.mark.parametrize(
    ("tables", "columns", "missing"),
    [([], [], "Missing table: demo.widgets."), (["widgets"], [{"name": "id"}], "name")],
)
def test_schema_identifies_missing_tables_and_columns(
    connection: MagicMock,
    metadata: MetaData,
    tables: list[str],
    columns: list[dict[str, str]],
    missing: str,
) -> None:
    with patch("app.utils.database_checks.inspect") as inspect:
        inspect.return_value.get_table_names.return_value = tables
        inspect.return_value.get_columns.return_value = columns
        result = DatabaseChecks(connection).schema(metadata)

    assert result.status == "failed"
    assert missing in result.message
    assert_transaction_untouched(connection)


def test_undefined_migrations_block_without_database_reads(
    connection: MagicMock,
) -> None:
    with patch("app.utils.database_checks.MigrationContext.configure") as configure:
        result = DatabaseChecks(connection).migrations(frozenset())

    assert result.status == "blocked"
    configure.assert_not_called()
    connection.execute.assert_not_called()
    assert_transaction_untouched(connection)


@pytest.mark.parametrize(
    ("heads", "expected_status"),
    [((), "failed"), (("old",), "failed"), (("head_a", "head_b"), "passed")],
)
def test_migration_revision_must_match_all_expected_heads(
    connection: MagicMock, heads: tuple[str, ...], expected_status: str
) -> None:
    with patch("app.utils.database_checks.MigrationContext.configure") as configure:
        configure.return_value.get_current_heads.return_value = heads
        result = DatabaseChecks(connection).migrations(frozenset({"head_a", "head_b"}))

    assert result.status == expected_status
    configure.assert_called_once_with(connection)
    assert_transaction_untouched(connection)


@pytest.mark.parametrize("check", ["connectivity", "schema", "migrations"])
def test_database_failures_do_not_expose_exception_details(
    connection: MagicMock, metadata: MetaData, check: str
) -> None:
    failure = SQLAlchemyError("password=private patient=private")
    checker = DatabaseChecks(connection)
    with (
        patch("app.utils.database_checks.inspect", side_effect=failure),
        patch("app.utils.database_checks.MigrationContext.configure", side_effect=failure),
    ):
        connection.execute.side_effect = failure
        if check == "connectivity":
            result = checker.connectivity()
        elif check == "schema":
            result = checker.schema(metadata)
        else:
            result = checker.migrations(frozenset({"head"}))

    assert result.status == "failed"
    assert "private" not in result.message
    assert "password" not in result.message
    assert_transaction_untouched(connection)
