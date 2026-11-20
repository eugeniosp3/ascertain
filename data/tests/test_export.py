"""Patient package export: determinism, mapping, provenance, and tamper detection."""

import json
import shutil
import subprocess
import sys
from pathlib import Path
from uuid import UUID, uuid4

import duckdb
import pytest

from patient_data.errors import PatientDataError
from patient_data.export import export_package
from patient_data.package import load_package
from patient_data.settings import MANIFEST_FILE, PATIENTS_FILE, StageSettings
from patient_data.stages import build_bronze, build_silver
from patient_data.utils.identifiers import canonical_json, sha256_bytes, silver_id

from .helpers import MakeRepo, Rows, column


def _exported(settings: StageSettings) -> Path:
    build_bronze(settings)
    build_silver(settings)
    return export_package(settings).path


@pytest.fixture
def full_export(make_repo: MakeRepo) -> tuple[StageSettings, Path]:
    settings = make_repo()
    return settings, _exported(settings)


def test_package_has_two_files_sorted_canonical_lines_and_manifest(
    full_export: tuple[StageSettings, Path],
) -> None:
    settings, directory = full_export
    assert sorted(p.name for p in directory.iterdir()) == [MANIFEST_FILE, PATIENTS_FILE]
    data = (directory / PATIENTS_FILE).read_bytes()
    assert data.endswith(b"\n") and not data.endswith(b"\n\n")
    lines = data.decode("utf-8").splitlines()
    assert len(lines) == 100
    documents = [json.loads(line) for line in lines]
    assert [canonical_json(d) for d in documents] == lines
    ids = [d["record"]["source_patient_id"] for d in documents]
    assert ids == sorted(ids) and len(set(ids)) == 100
    assert all(set(d) == {"lineage", "record"} for d in documents)
    assert all(
        set(d["lineage"]) == {"export_id", "silver_id", "bronze_id", "source_row_number"}
        for d in documents
    )

    manifest = json.loads((directory / MANIFEST_FILE).read_bytes())
    assert directory.name == manifest["dataset_key"]
    assert manifest["dataset_key"] == f"patients-2026-11-18-{manifest['export_id']}"
    assert manifest["patients"]["sha256"] == sha256_bytes(data)
    assert manifest["patients"]["count"] == 100
    assert manifest["source"]["row_count"] == 100 and manifest["source"]["column_count"] == 76
    assert manifest["source"]["sha256"] == sha256_bytes(settings.source_file.read_bytes())
    assert manifest["application_projection"] == "provisional"
    assert manifest["validation"] and all(v["status"] == "passed" for v in manifest["validation"])
    assert "ingested_at" not in json.dumps(manifest)  # no processing timestamps


def test_record_json_uses_contract_value_conventions(
    full_export: tuple[StageSettings, Path], real_rows: tuple[list[str], Rows]
) -> None:
    _, directory = full_export
    header, rows = real_rows
    first = json.loads((directory / PATIENTS_FILE).read_text("utf-8").splitlines()[0])
    record, raw = first["record"], dict(zip(header, rows[0], strict=True))
    assert record["source_record"] == raw  # every original string, blanks included
    assert record["source_created_at"] == raw["created_at"]  # ...Z UTC form
    assert record["source_created_at"].endswith("Z")
    clinical = record["profile_details"]["clinical"]
    assert clinical["weight_kg"] == raw["weight_kg"] and isinstance(clinical["weight_kg"], str)
    assert isinstance(clinical["has_ckd"], bool)
    assert record["profile_details"]["social"]["pa_request_count"] == int(raw["pa_request_count"])
    assert record["mrn"] == raw["mrn"] and record["postal_code"] == raw["zip"]
    assert record["blood_type"] is None and record["address_line2"] is None
    assert record["status"] == "active"
    assert record["allergy_status"] == "no_known" and record["allergies"] == []


def test_lineage_matches_silver(full_export: tuple[StageSettings, Path]) -> None:
    settings, directory = full_export
    lines = [json.loads(x) for x in (directory / PATIENTS_FILE).read_text("utf-8").splitlines()]
    with duckdb.connect(str(settings.silver_path), read_only=True) as con:
        silver = {
            (str(s), str(b), str(p))
            for s, b, p in con.execute(
                "SELECT silver_id, bronze_id, patient_id_raw FROM patients"
            ).fetchall()
        }
    exported = {
        (d["lineage"]["silver_id"], d["lineage"]["bronze_id"], d["record"]["source_patient_id"])
        for d in lines
    }
    assert exported == silver


def test_export_is_deterministic_and_repeat_safe(make_repo: MakeRepo) -> None:
    first = make_repo(name="one")
    first_dir = _exported(first)
    assert export_package(first).status == "unchanged"
    second_dir = _exported(make_repo(name="two"))
    assert first_dir.name == second_dir.name
    for name in (MANIFEST_FILE, PATIENTS_FILE):
        assert (first_dir / name).read_bytes() == (second_dir / name).read_bytes()


def test_conflicting_content_under_the_same_identity_is_rejected(
    full_export: tuple[StageSettings, Path],
) -> None:
    settings, directory = full_export
    with (directory / PATIENTS_FILE).open("ab") as stream:
        stream.write(b"\n")
    with pytest.raises(PatientDataError, match="different content for the same identity"):
        export_package(settings)


def test_loader_rejects_modified_packages(
    full_export: tuple[StageSettings, Path], tmp_path: Path
) -> None:
    _, directory = full_export
    assert len(load_package(directory).lines) == 100

    copy = tmp_path / "copies" / directory.name
    shutil.copytree(directory, copy)
    patients = copy / PATIENTS_FILE
    patients.write_bytes(patients.read_bytes().replace(b'"first_name":"', b'"first_name":"X', 1))
    with pytest.raises(PatientDataError) as caught:
        load_package(copy)
    assert any("checksum" in issue for issue in caught.value.issues)

    # Re-sign the edited file: the mapping re-derivation still catches it.
    manifest = json.loads((copy / MANIFEST_FILE).read_bytes())
    data = patients.read_bytes()
    manifest["patients"].update(sha256=sha256_bytes(data), byte_count=len(data))
    (copy / MANIFEST_FILE).write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    with pytest.raises(PatientDataError) as caught:
        load_package(copy)
    assert any("record differs from mapping in ['first_name']" in i for i in caught.value.issues)
    assert not any("Ann" in issue for issue in caught.value.issues)

    renamed = tmp_path / "copies" / "patients-other"
    shutil.copytree(directory, renamed)
    with pytest.raises(PatientDataError) as caught:
        load_package(renamed)
    assert any("package.directory" in issue for issue in caught.value.issues)


def test_export_requires_valid_stages(
    make_repo: MakeRepo, real_rows: tuple[list[str], Rows]
) -> None:
    header, rows = real_rows
    settings = make_repo(rows[:3])
    build_bronze(settings)
    build_silver(settings)
    edited = [list(r) for r in rows[:3]]
    edited[0][column(header, "city")] = "Elsewhere"
    make_repo(edited)  # source changed after the stages were built
    with pytest.raises(PatientDataError, match="stage validation failed"):
        export_package(settings)
    assert not settings.exports_dir.exists()


@pytest.mark.parametrize("mutation", ["foreign", "swapped", "duplicate_row", "out_of_range"])
def test_loader_rejects_inconsistent_source_lineage(
    make_repo: MakeRepo, real_rows: tuple[list[str], Rows], mutation: str
) -> None:
    settings = make_repo(real_rows[1][:3])
    directory = _exported(settings)
    patients_file = directory / PATIENTS_FILE
    documents = [json.loads(line) for line in patients_file.read_text().splitlines()]
    manifest = json.loads((directory / MANIFEST_FILE).read_text())
    if mutation == "foreign":
        documents[0]["lineage"]["bronze_id"] = str(uuid4())
    elif mutation == "swapped":
        first, second = documents[0]["lineage"], documents[1]["lineage"]
        first["bronze_id"], second["bronze_id"] = second["bronze_id"], first["bronze_id"]
    elif mutation == "duplicate_row":
        documents[1]["lineage"]["source_row_number"] = documents[0]["lineage"]["source_row_number"]
    else:
        documents[0]["lineage"]["source_row_number"] = 4
    for document in documents:
        lineage = document["lineage"]
        lineage["silver_id"] = str(
            silver_id(UUID(lineage["bronze_id"]), manifest["transformation_version"])
        )
    data = ("\n".join(canonical_json(document) for document in documents) + "\n").encode()
    patients_file.write_bytes(data)
    manifest["patients"].update(sha256=sha256_bytes(data), byte_count=len(data))
    (directory / MANIFEST_FILE).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )
    with pytest.raises(PatientDataError) as caught:
        load_package(directory, expected_row_count=3)
    assert any("package.patients.lineage" in issue for issue in caught.value.issues)


def test_export_preserves_original_row_numbers_after_sorting(
    make_repo: MakeRepo, real_rows: tuple[list[str], Rows]
) -> None:
    settings = make_repo(list(reversed(real_rows[1][:5])))
    package = load_package(_exported(settings), expected_row_count=5)
    assert [line.lineage.source_row_number for line in package.lines] == [5, 4, 3, 2, 1]
    assert [line.record.source_patient_id for line in package.lines] == sorted(
        line.record.source_patient_id for line in package.lines
    )


def test_invalid_manifest_source_path_reports_package_failure(
    full_export: tuple[StageSettings, Path],
) -> None:
    _, directory = full_export
    manifest_path = directory / MANIFEST_FILE
    manifest = json.loads(manifest_path.read_text())
    manifest["source"]["path"] = "../patients.csv"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    with pytest.raises(PatientDataError) as caught:
        load_package(directory)
    assert any("source path" in issue for issue in caught.value.issues)


def test_package_validation_import_does_not_load_duckdb() -> None:
    code = "import sys, patient_data.package; print('duckdb' in sys.modules)"
    result = subprocess.run(
        [sys.executable, "-c", code], capture_output=True, text=True, check=True
    )
    assert result.stdout.strip() == "False"
