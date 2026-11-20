"""Bronze/silver builds on isolated fixtures: preservation, lineage, validation, atomicity."""

from datetime import datetime, timedelta
from pathlib import Path

import duckdb
import pytest
from conftest import MakeRepo, Rows, column

from patient_data.errors import PatientDataError
from patient_data.patient_rules import FIELD_NAMES
from patient_data.settings import StageSettings
from patient_data.stages import (
    build_bronze,
    build_silver,
    inspect_stages,
    validate_stages,
)
from patient_data.utils.identifiers import bronze_id, sha256_file, silver_id


def _build(settings: StageSettings) -> None:
    build_bronze(settings)
    build_silver(settings)


def _query(path: Path, sql: str) -> list[tuple[object, ...]]:
    with duckdb.connect(str(path), read_only=True) as con:
        con.execute("SET TimeZone = 'UTC'")
        return con.execute(sql).fetchall()


def test_full_source_builds_both_files_and_validates(make_repo: MakeRepo) -> None:
    settings = make_repo()
    source_hash = sha256_file(settings.source_file)
    bronze = build_bronze(settings)
    silver = build_silver(settings)
    assert (bronze.status, silver.status) == ("built", "built")
    assert bronze.row_count == silver.row_count == 100
    report = validate_stages(settings)
    assert report.passed, [r for r in report.results if r.status != "passed"]
    assert sha256_file(settings.source_file) == source_hash  # source bytes untouched
    assert not any(settings.work_dir.iterdir())  # temporary builds cleaned up


def test_each_file_opens_independently_with_expected_tables(make_repo: MakeRepo) -> None:
    settings = make_repo()
    _build(settings)
    bronze_tables = _query(
        settings.bronze_path, "SELECT table_name FROM duckdb_tables() ORDER BY 1"
    )
    silver_tables = _query(
        settings.silver_path, "SELECT table_name FROM duckdb_tables() ORDER BY 1"
    )
    assert bronze_tables == [("patients",), ("source_files",)]
    assert silver_tables == [("build_metadata",), ("patients",)]
    assert _query(settings.bronze_path, "SELECT count(*) FROM patients") == [(100,)]
    assert _query(settings.silver_path, "SELECT count(*) FROM build_metadata") == [(1,)]


def test_bronze_is_all_text_and_preserves_blanks_and_leading_zeros(
    make_repo: MakeRepo, real_rows: tuple[list[str], Rows]
) -> None:
    header, rows = real_rows
    edited = [list(r) for r in rows[:4]]
    edited[0][column(header, "mrn")] = "01234567"
    edited[0][column(header, "middle_initial")] = ""
    settings = make_repo(edited)
    _build(settings)
    types = _query(
        settings.bronze_path,
        "SELECT DISTINCT data_type FROM information_schema.columns "
        "WHERE table_name = 'patients' AND column_name NOT IN "
        "('bronze_id', 'source_file_id', 'source_row_number', 'ingested_at')",
    )
    assert types == [("VARCHAR",)]
    assert _query(
        settings.bronze_path, "SELECT mrn, middle_initial FROM patients WHERE source_row_number = 1"
    ) == [("01234567", "")]
    assert _query(
        settings.silver_path,
        "SELECT mrn_raw, mrn_clean, middle_initial_raw, middle_initial_clean FROM patients "
        "WHERE patient_id_raw = (SELECT min(patient_id_raw) FROM patients)",
    ) == [("01234567", "01234567", "", None)]


def test_timestamp_columns_can_be_queried_directly(make_repo: MakeRepo) -> None:
    settings = make_repo()
    _build(settings)
    rows = _query(
        settings.silver_path,
        "SELECT created_at_raw, created_at_clean FROM patients ORDER BY patient_id_raw",
    )
    assert len(rows) == 100
    for original, cleaned in rows:
        assert isinstance(original, str)
        assert isinstance(cleaned, datetime)
        assert cleaned.utcoffset() == timedelta(0)
        assert cleaned == datetime.fromisoformat(original.replace("Z", "+00:00"))


def test_silver_has_adjacent_raw_clean_pairs_with_exact_types(make_repo: MakeRepo) -> None:
    settings = make_repo()
    _build(settings)
    columns = _query(
        settings.silver_path,
        "SELECT column_name, data_type FROM information_schema.columns "
        "WHERE table_name = 'patients' ORDER BY ordinal_position",
    )
    names = [str(name) for name, _ in columns]
    assert names[:4] == ["silver_id", "bronze_id", "transformation_version", "transformed_at"]
    pairs = names[4:]
    assert pairs == [f"{field}_{part}" for field in FIELD_NAMES for part in ("raw", "clean")]
    types = {str(name): str(kind) for name, kind in columns}
    assert types["height_cm_clean"] == "DECIMAL(18,6)"
    assert types["date_of_birth_clean"] == "DATE"
    assert types["created_at_clean"] == "TIMESTAMP WITH TIME ZONE"
    assert types["has_ckd_clean"] == "BOOLEAN"
    assert types["pa_request_count_clean"] == "BIGINT"
    assert types["has_diabetes_clean"] == "VARCHAR"
    assert _query(
        settings.silver_path,
        "SELECT count(*) FROM patients "
        "WHERE pa_request_count_clean::VARCHAR <> pa_request_count_raw",
    ) == [(0,)]
    assert _query(
        settings.silver_path, "SELECT DISTINCT has_diabetes_clean FROM patients ORDER BY 1"
    ) == [("None",), ("Type 1",), ("Type 2",)]


def test_silver_links_to_bronze_and_ids_rederive(make_repo: MakeRepo) -> None:
    settings = make_repo()
    _build(settings)
    file_id = _query(settings.bronze_path, "SELECT source_file_id FROM source_files")[0][0]
    bronze_rows = _query(settings.bronze_path, "SELECT bronze_id, source_row_number FROM patients")
    assert all(b == bronze_id(file_id, n) for b, n in bronze_rows)  # type: ignore[arg-type]
    silver_rows = _query(settings.silver_path, "SELECT silver_id, bronze_id FROM patients")
    assert {b for _, b in silver_rows} == {b for b, _ in bronze_rows}
    assert all(
        s == silver_id(b, settings.transformation_version)  # type: ignore[arg-type]
        and s != b
        for s, b in silver_rows
    )
    with duckdb.connect(str(settings.silver_path), read_only=True) as con:
        con.execute(f"ATTACH '{settings.bronze_path}' AS bronze (READ_ONLY)")
        joined = con.execute(
            "SELECT count(*) FROM patients s JOIN bronze.main.patients b USING (bronze_id) "
            "WHERE s.patient_id_raw = b.patient_id"
        ).fetchall()
    assert joined == [(100,)]


def test_unchanged_input_preserves_identity_and_files(
    make_repo: MakeRepo, real_rows: tuple[list[str], Rows]
) -> None:
    first = make_repo(name="first")
    _build(first)
    before = (sha256_file(first.bronze_path), sha256_file(first.silver_path))
    assert build_bronze(first).status == "unchanged"
    assert build_silver(first).status == "unchanged"
    assert (sha256_file(first.bronze_path), sha256_file(first.silver_path)) == before
    second = make_repo(name="second")  # same bytes in another location
    _build(second)
    ids_sql = "SELECT silver_id, bronze_id FROM patients ORDER BY 1"
    assert _query(first.silver_path, ids_sql) == _query(second.silver_path, ids_sql)


def test_identical_rows_at_different_positions_get_distinct_bronze_ids(
    make_repo: MakeRepo, real_rows: tuple[list[str], Rows]
) -> None:
    row = real_rows[1][0]
    settings = make_repo([row, row])
    build_bronze(settings)  # bronze keeps duplicates inspectable
    ids = _query(settings.bronze_path, "SELECT DISTINCT bronze_id FROM patients")
    assert len(ids) == 2
    with pytest.raises(PatientDataError) as caught:
        build_silver(settings)  # ...but silver refuses duplicate patient keys
    assert any("patient_id" in issue and "repeated" in issue for issue in caught.value.issues)


def test_conversion_failure_reports_row_and_field_and_keeps_previous_silver(
    make_repo: MakeRepo, real_rows: tuple[list[str], Rows]
) -> None:
    header, rows = real_rows
    settings = make_repo(rows[:5])
    _build(settings)
    silver_before = sha256_file(settings.silver_path)
    broken = [list(r) for r in rows[:5]]
    broken[2][column(header, "last_labs_date")] = "XSECRETX"
    broken[3][column(header, "has_copd")] = "maybe"
    make_repo(broken)  # overwrite the fixture CSV in the same repo
    build_bronze(settings)
    with pytest.raises(PatientDataError) as caught:
        build_silver(settings)
    issues = caught.value.issues
    assert "row 3, field last_labs_date: expected a YYYY-MM-DD date" in issues
    assert "row 4, field has_copd: expected Y or N" in issues
    assert "XSECRETX" not in str(caught.value) and "maybe" not in str(caught.value)
    assert sha256_file(settings.silver_path) == silver_before
    assert not any(settings.work_dir.iterdir())


@pytest.mark.parametrize(
    "mutate, message",
    [
        (lambda h, r: (h, [*r, r[0][:-1]]), "has 75 field(s)"),
        (lambda h, r: (h[:-1], [x[:-1] for x in r]), "missing column(s): ['updated_at']"),
        (lambda h, r: ([*h[:-1], "Updated_At"], r), "unexpected column(s): ['Updated_At']"),
    ],
)
def test_structural_problems_fail_bronze_and_keep_previous_file(
    make_repo: MakeRepo,
    real_rows: tuple[list[str], Rows],
    mutate: object,
    message: str,
) -> None:
    header, rows = real_rows
    settings = make_repo(rows[:3])
    build_bronze(settings)
    before = sha256_file(settings.bronze_path)
    new_header, new_rows = mutate(list(header), [list(r) for r in rows[:3]])  # type: ignore[operator]
    make_repo(new_rows, header=new_header, expected_row_count=3)
    with pytest.raises(PatientDataError) as caught:
        build_bronze(settings)
    assert any(message in issue for issue in caught.value.issues)
    assert sha256_file(settings.bronze_path) == before


def test_row_count_must_match_the_contract(
    make_repo: MakeRepo, real_rows: tuple[list[str], Rows]
) -> None:
    settings = make_repo(real_rows[1][:3], expected_row_count=100)
    with pytest.raises(PatientDataError) as caught:
        build_bronze(settings)
    assert "found 3 data record(s); expected 100" in caught.value.issues
    assert not settings.bronze_path.exists()


def test_validation_detects_changed_source_and_tampered_silver(
    make_repo: MakeRepo, real_rows: tuple[list[str], Rows]
) -> None:
    header, rows = real_rows
    settings = make_repo(rows[:3])
    _build(settings)
    with duckdb.connect(str(settings.silver_path)) as con:
        con.execute("UPDATE patients SET bmi_clean = bmi_clean + 1")
    edited = [list(r) for r in rows[:3]]
    edited[0][column(header, "city")] = "Elsewhere"
    make_repo(edited)
    report = validate_stages(settings)
    failed = {r.name for r in report.results if r.status == "failed"}
    assert {"bronze.source_checksum", "bronze.patients.reconcile_source"} <= failed
    assert "silver.patients.clean_values" in failed
    assert not report.passed


def test_read_commands_never_create_missing_files(make_repo: MakeRepo) -> None:
    settings = make_repo()
    report = validate_stages(settings)
    assert not report.passed
    with pytest.raises(PatientDataError, match="build"):
        build_silver(settings)
    summary = inspect_stages(settings)
    assert summary["bronze"] == {"path": str(settings.bronze_path), "exists": False}
    assert not settings.bronze_path.exists() and not settings.silver_path.exists()


def test_inspect_reports_structure_without_patient_values(
    make_repo: MakeRepo, real_rows: tuple[list[str], Rows]
) -> None:
    settings = make_repo()
    _build(settings)
    summary = inspect_stages(settings)
    text = repr(summary)
    assert "'raw_clean_pairs': 76" in text and "'patients': 100" in text
    first_patient = real_rows[1][0]
    for value in (
        first_patient[column(real_rows[0], "mrn")],
        first_patient[column(real_rows[0], "email")],
    ):
        assert value not in text


def test_build_does_not_need_any_other_source_file(make_repo: MakeRepo) -> None:
    settings = make_repo()
    data_files = sorted(p.name for p in settings.source_file.parent.iterdir())
    assert data_files == ["patients_100.csv"]  # no request file is present or read
    _build(settings)
    assert validate_stages(settings).passed
