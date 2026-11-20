"""Schema-contract helpers shared with the backend's direct-DuckDB seeder."""

from typing import cast
from unittest.mock import MagicMock

import pytest
from sqlalchemy import Connection
from sqlalchemy import types as sqltypes
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine.default import DefaultDialect

from patient_data.utils import database
from patient_data.utils.checks import CheckReport
from patient_data.utils.database import (
    DatabaseInspector,
    TargetColumn,
    TargetConstraint,
    TargetContract,
    TargetTable,
    type_family,
)


def test_contract_merge_keeps_both_sides_and_the_stricter_column() -> None:
    base = TargetContract(
        tables=(
            TargetTable(
                "patients",
                (
                    TargetColumn("source_patient_id", frozenset({"text"}), min_length=7),
                    TargetColumn("seed_run_id", frozenset({"uuid"})),
                    TargetColumn("source_lineage", frozenset({"jsonb"})),
                ),
            ),
        ),
        constraints=(TargetConstraint("unique", "patients", ("source_patient_id",)),),
    )
    other = TargetContract(
        tables=(
            TargetTable(
                "patients",
                (
                    TargetColumn("source_patient_id", frozenset({"text"}), min_length=10),
                    TargetColumn("first_name", frozenset({"text"})),
                ),
            ),
        ),
        supported_revisions=frozenset({"abc"}),
    )
    merged = base.merged(other)
    patients = next(table for table in merged.tables if table.name == "patients")
    columns = {column.name: column for column in patients.columns}
    assert {"seed_run_id", "source_lineage", "first_name"} <= set(columns)
    assert columns["source_patient_id"].min_length == 10
    assert merged.supported_revisions == frozenset({"abc"})
    assert merged.constraints == base.constraints


@pytest.mark.parametrize(
    "column_type, family",
    [
        (postgresql.UUID(), "uuid"),
        (sqltypes.VARCHAR(40), "text"),
        (sqltypes.TEXT(), "text"),
        (postgresql.JSONB(), "jsonb"),
        (sqltypes.JSON(), "json"),
        (sqltypes.DATE(), "date"),
        (postgresql.TIMESTAMP(timezone=True), "timestamptz"),
        (postgresql.TIMESTAMP(timezone=False), "timestamp"),
        (sqltypes.BOOLEAN(), "boolean"),
        (sqltypes.BIGINT(), "integer"),
        (sqltypes.NUMERIC(18, 6), "numeric"),
    ],
)
def test_type_families(column_type: object, family: str) -> None:
    assert type_family(column_type) == family


@pytest.fixture
def inspected_database(
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[DatabaseInspector, MagicMock, MagicMock]:
    """Controlled catalog/permission results; no live database or writer is involved."""
    connection = MagicMock(spec=Connection)
    connection.dialect = DefaultDialect()
    catalog = MagicMock()
    catalog.get_schema_names.return_value = ["app"]
    catalog.get_table_names.return_value = ["patients"]
    catalog.get_view_names.return_value = []
    catalog.get_materialized_view_names.return_value = []
    catalog.get_pk_constraint.return_value = {"constrained_columns": []}
    catalog.get_unique_constraints.return_value = []
    catalog.get_indexes.return_value = []
    catalog.get_foreign_keys.return_value = []
    monkeypatch.setattr(database, "inspect", lambda _: catalog)
    return DatabaseInspector(cast(Connection, connection), "app"), connection, catalog


def patient_contract() -> TargetContract:
    return TargetContract(
        tables=(
            TargetTable(
                "patients",
                (TargetColumn("source_patient_id", frozenset({"text"}), min_length=7),),
            ),
        ),
    )


def test_missing_schema_blocks_dependent_checks(
    inspected_database: tuple[DatabaseInspector, MagicMock, MagicMock],
) -> None:
    inspector, connection, catalog = inspected_database
    catalog.get_schema_names.return_value = []
    report = CheckReport()
    assert not inspector.check_contract(patient_contract(), report)
    states = {result.name: result.status for result in report.results}
    assert states["database.query"] == "passed"
    assert states["database.schema"] == "failed"
    assert states["database.contract"] == "blocked"
    catalog.get_columns.assert_not_called()
    assert [str(call.args[0]) for call in connection.execute.call_args_list] == ["SELECT 1"]


@pytest.mark.parametrize("object_kind", ["missing", "view", "materialized_view"])
def test_table_check_rejects_missing_or_non_table_objects(
    inspected_database: tuple[DatabaseInspector, MagicMock, MagicMock], object_kind: str
) -> None:
    inspector, _, catalog = inspected_database
    catalog.get_table_names.return_value = []
    if object_kind == "view":
        catalog.get_view_names.return_value = ["patients"]
    elif object_kind == "materialized_view":
        catalog.get_materialized_view_names.return_value = ["patients"]
    report = CheckReport()
    assert inspector.check_tables(report, patient_contract()) == set()
    assert report.results[0].name == "table.patients"
    assert report.results[0].status == "failed"


@pytest.mark.parametrize(
    "defect",
    ["missing", "type", "length", "nullability", "generated", "extra_required"],
)
def test_column_defects_fail_readiness(
    inspected_database: tuple[DatabaseInspector, MagicMock, MagicMock], defect: str
) -> None:
    inspector, _, catalog = inspected_database
    column: dict[str, object] = {
        "name": "source_patient_id",
        "type": sqltypes.VARCHAR(40),
        "nullable": True,
        "default": None,
    }
    columns = [column]
    if defect == "missing":
        columns = []
    elif defect == "type":
        column["type"] = postgresql.UUID()
    elif defect == "length":
        column["type"] = sqltypes.VARCHAR(3)
    elif defect == "nullability":
        column["nullable"] = False
    elif defect == "generated":
        column["computed"] = {"sqltext": "'generated'", "persisted": True}
    else:
        columns.append({"name": "new_required", "nullable": False, "default": None})
    catalog.get_columns.return_value = columns
    table = TargetTable(
        "patients",
        (
            TargetColumn(
                "source_patient_id", frozenset({"text"}), may_write_null=True, min_length=7
            ),
        ),
    )
    report = CheckReport()
    inspector.check_columns(report, table)
    assert not report.passed
    failure = next(result for result in report.results if result.status == "failed")
    assert failure.name == (
        "columns.patients.extra_required"
        if defect == "extra_required"
        else "column.patients.source_patient_id"
    )


@pytest.mark.parametrize("defaulted", [False, True])
def test_compatible_extra_columns_do_not_block(
    inspected_database: tuple[DatabaseInspector, MagicMock, MagicMock], defaulted: bool
) -> None:
    inspector, _, catalog = inspected_database
    catalog.get_columns.return_value = [
        {"name": "source_patient_id", "type": sqltypes.TEXT(), "nullable": True, "default": None},
        {"name": "extra", "nullable": not defaulted, "default": "0" if defaulted else None},
    ]
    report = CheckReport()
    inspector.check_columns(report, patient_contract().tables[0])
    assert report.passed


@pytest.mark.parametrize("present", [False, True])
def test_missing_unique_constraint_is_blocked_or_failed(
    inspected_database: tuple[DatabaseInspector, MagicMock, MagicMock], present: bool
) -> None:
    inspector, _, _ = inspected_database
    report = CheckReport()
    inspector.check_constraints(
        report,
        (TargetConstraint("unique", "patients", ("source_patient_id",)),),
        {"patients"} if present else set(),
    )
    assert not report.passed
    assert report.results[0].status == ("failed" if present else "blocked")


@pytest.mark.parametrize("partial", [False, True])
def test_only_a_full_unique_index_satisfies_uniqueness(
    inspected_database: tuple[DatabaseInspector, MagicMock, MagicMock], partial: bool
) -> None:
    inspector, _, catalog = inspected_database
    catalog.get_indexes.return_value = [
        {
            "unique": True,
            "column_names": ["source_patient_id"],
            "dialect_options": {"postgresql_where": "source_patient_id IS NOT NULL"}
            if partial
            else {},
        }
    ]
    report = CheckReport()
    inspector.check_constraints(
        report, (TargetConstraint("unique", "patients", ("source_patient_id",)),), {"patients"}
    )
    assert report.passed is not partial


@pytest.mark.parametrize("denied", [None, "schema", "SELECT", "INSERT", "sequence"])
def test_privilege_failures_block_readiness_without_writes(
    inspected_database: tuple[DatabaseInspector, MagicMock, MagicMock], denied: str | None
) -> None:
    inspector, connection, _ = inspected_database

    def execute(statement: object, params: dict[str, object]) -> MagicMock:
        query = str(statement)
        assert query.startswith("SELECT ")
        result = MagicMock()
        if "has_schema_privilege" in query:
            result.scalar_one.return_value = denied != "schema"
        elif "has_table_privilege" in query:
            result.scalar_one.return_value = params["privilege"] != denied
        elif "pg_get_serial_sequence" in query:
            result.scalar_one_or_none.return_value = "app.patients_sequence_id_seq"
        elif "has_sequence_privilege" in query:
            result.scalar_one.return_value = denied != "sequence"
        else:
            raise AssertionError(f"Unexpected inspection query: {query}")
        return result

    connection.execute.side_effect = execute
    contract = TargetContract(
        tables=(
            TargetTable(
                "patients", (TargetColumn("sequence_id", frozenset({"integer"}), supplied=False),)
            ),
        ),
    )
    report = CheckReport()
    inspector.check_privileges(report, contract, {"patients"})
    assert report.passed is (denied is None)
    if denied is not None:
        name = "privilege.schema_usage" if denied == "schema" else "privilege.patients"
        assert next(result.status for result in report.results if result.name == name) == "failed"


def test_privilege_check_blocks_missing_table(
    inspected_database: tuple[DatabaseInspector, MagicMock, MagicMock],
) -> None:
    inspector, connection, _ = inspected_database
    connection.execute.return_value.scalar_one.return_value = True
    report = CheckReport()
    inspector.check_privileges(report, patient_contract(), set())
    assert report.results[-1].status == "blocked"
    assert connection.execute.call_count == 1  # Schema permission only; no missing-table query.
