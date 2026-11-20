"""The checked-in DuckDB inputs are only ever opened read-only.

Corruption tests write disposable copies under pytest's temporary directory, never
the supplied stage databases or the reference CSV.
"""

import hashlib
import shutil
from pathlib import Path

import duckdb
import pytest
from patient_data.patient_rules import FIELD_NAMES
from patient_data.settings import StageSettings
from patient_data.utils.identifiers import row_checksum

from app.schemas.patient_details import ProfileDetails, SourceLineage
from app.utils.duckdb_source import DuckDBSourceError, load_duckdb_source


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.fixture
def source_copies(tmp_path: Path) -> tuple[Path, Path]:
    settings = StageSettings()
    bronze = tmp_path / "bronze's copy.duckdb"
    silver = tmp_path / "silver copy.duckdb"
    shutil.copyfile(settings.bronze_path, bronze)
    shutil.copyfile(settings.silver_path, silver)
    return bronze, silver


def test_complete_source_preserves_all_fields_lineage_and_exact_types() -> None:
    settings = StageSettings()
    before = {
        path: (digest(path), path.stat().st_mtime_ns)
        for path in (
            settings.bronze_path,
            settings.silver_path,
        )
    }

    snapshot = load_duckdb_source()
    repeated = load_duckdb_source()

    assert len(snapshot.patients) == 100
    assert len({patient.source_patient_id for patient in snapshot.patients}) == 100
    assert all(check.status == "passed" for check in snapshot.checks)
    assert snapshot.manifest == repeated.manifest
    assert snapshot.source_hashes == repeated.source_hashes
    assert snapshot.manifest["input_format"] == "duckdb"
    assert snapshot.manifest["raw_clean_pair_count"] == 76
    assert snapshot.manifest["import_contract_version"] == "backend-duckdb-v1"
    assert {path: (digest(path), path.stat().st_mtime_ns) for path in before} == before

    with duckdb.connect(str(settings.silver_path), read_only=True) as connection:
        connection.execute("SET TimeZone = 'UTC'")
        rows = connection.execute(
            "SELECT patient_id_clean, first_name_clean, date_of_birth_clean, "
            "zip_clean, height_cm_clean, created_at_clean, updated_at_clean "
            "FROM main.patients ORDER BY patient_id_clean"
        ).fetchall()
    for patient, row in zip(snapshot.patients, rows, strict=True):
        assert tuple(patient.source_record) == FIELD_NAMES
        assert len(patient.source_record) == 76
        assert all(isinstance(value, str) for value in patient.source_record.values())
        assert (
            patient.source_patient_id,
            patient.first_name,
            patient.date_of_birth,
            patient.postal_code,
        ) == row[:4]
        assert patient.profile_details.clinical.height_cm == row[4]
        assert patient.source_created_at == row[5]
        assert patient.source_updated_at == row[6]
        assert patient.status == "active"
        assert patient.blood_type is None
        assert patient.address_line2 is None
        assert patient.phone == (
            patient.profile_details.contact.mobile_phone
            or patient.profile_details.contact.home_phone
        )
        lineage = SourceLineage.model_validate(patient.source_lineage.model_dump())
        assert lineage.bronze_id != lineage.silver_id
        assert lineage.source_file_id is not None
        assert lineage.transformation_version == "patient-rules-v1"
        ProfileDetails.model_validate_json(patient.profile_details.model_dump_json())


def test_custom_paths_work_without_csv_or_jsonl(
    source_copies: tuple[Path, Path],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def forbidden(*args: object, **kwargs: object) -> None:
        raise AssertionError("A direct DuckDB import must not read CSV or JSONL")

    monkeypatch.setattr("patient_data.stages.read_source", forbidden)
    monkeypatch.setattr("patient_data.package.load_package", forbidden)
    assert len(load_duckdb_source(*source_copies).patients) == 100


@pytest.mark.parametrize(
    ("stage", "sql"),
    [
        (
            "silver",
            "UPDATE patients SET first_name_raw = 'changed' WHERE patient_id_clean = 'PT-0001'",
        ),
        (
            "silver",
            "UPDATE patients SET height_cm_clean = height_cm_clean + 1 "
            "WHERE patient_id_clean = 'PT-0001'",
        ),
        (
            "silver",
            "UPDATE patients SET date_of_birth_clean = NULL WHERE patient_id_clean = 'PT-0001'",
        ),
        ("silver", "ALTER TABLE patients DROP COLUMN email_clean"),
        ("silver", "UPDATE build_metadata SET transformation_version = 'unsupported'"),
        ("silver", "DELETE FROM build_metadata"),
        ("silver", "DELETE FROM patients WHERE patient_id_clean = 'PT-0001'"),
        (
            "bronze",
            "UPDATE patients SET source_row_sha256 = repeat('0', 64) WHERE patient_id = 'PT-0001'",
        ),
        ("bronze", "UPDATE source_files SET row_count = 99"),
        ("bronze", "UPDATE source_files SET column_count = 75"),
        ("silver", "UPDATE build_metadata SET source_sha256 = repeat('0', 64)"),
    ],
)
def test_invalid_snapshots_are_rejected_without_modifying_inputs(
    source_copies: tuple[Path, Path],
    stage: str,
    sql: str,
) -> None:
    bronze, silver = source_copies
    damaged = bronze if stage == "bronze" else silver
    with duckdb.connect(str(damaged)) as connection:
        connection.execute(sql)
    before = (digest(bronze), digest(silver))

    with pytest.raises(DuckDBSourceError, match="validation failed"):
        load_duckdb_source(bronze, silver)

    assert (digest(bronze), digest(silver)) == before


def test_missing_file_is_never_created(tmp_path: Path) -> None:
    missing = tmp_path / "missing.duckdb"
    with pytest.raises(DuckDBSourceError, match="existing"):
        load_duckdb_source(missing, StageSettings().silver_path)
    assert not missing.exists()


def test_leading_zeroes_blanks_and_meaningful_categories_are_preserved(
    source_copies: tuple[Path, Path],
) -> None:
    bronze, silver = source_copies
    with duckdb.connect(str(bronze)) as connection:
        connection.execute(
            "UPDATE patients SET mrn = '00000001', zip = '00123' WHERE patient_id = 'PT-0001'"
        )
        columns = ", ".join(f'"{name}"' for name in FIELD_NAMES)
        row = connection.execute(
            f"SELECT {columns} FROM patients WHERE patient_id = 'PT-0001'"
        ).fetchone()
        assert row is not None
        connection.execute(
            "UPDATE patients SET source_row_sha256 = ? WHERE patient_id = 'PT-0001'",
            [row_checksum(row)],
        )
    with duckdb.connect(str(silver)) as connection:
        connection.execute(
            "UPDATE patients SET mrn_raw = '00000001', mrn_clean = '00000001', "
            "zip_raw = '00123', zip_clean = '00123' WHERE patient_id_clean = 'PT-0001'"
        )
    patients = load_duckdb_source(bronze, silver).patients
    assert any(patient.mrn.startswith("0") for patient in patients)
    assert any(patient.postal_code.startswith("0") for patient in patients)
    assert any(
        patient.source_record["middle_initial"] == "" and patient.middle_initial is None
        for patient in patients
    )
    assert any(patient.profile_details.clinical.has_diabetes == "None" for patient in patients)
    assert any(
        patient.source_record["drug_allergies"] == "NKDA"
        and patient.allergy_status == "no_known"
        and patient.allergies == []
        for patient in patients
    )
