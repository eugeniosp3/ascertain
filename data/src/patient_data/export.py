"""Produce the patient package (``patients.jsonl`` + ``manifest.json``) from silver only.

The package is assembled in ``data/.cache/work/``, validated with the same loader the seed
command uses, and only then renamed into ``data/assets/exports/<dataset-key>/``. An existing
package with identical bytes is reused; different bytes under the same identity are an
error, because a rule or mapping change must advance its version.
"""

import os
import shutil
from pathlib import Path
from typing import Literal
from uuid import UUID, uuid4

from patient_data.errors import PatientDataError
from patient_data.models import (
    ExportLineage,
    Manifest,
    PatientExportLine,
    PatientsFileSummary,
    SourceSummary,
)
from patient_data.package import (
    check_patient_lines,
    load_package,
    serialize_lines,
    serialize_manifest,
)
from patient_data.patient_rules import FIELD_NAMES, SOURCE_COLUMN_COUNT, build_patient_record
from patient_data.settings import (
    MANIFEST_FILE,
    MANIFEST_VERSION,
    PATIENTS_FILE,
    UUID_NAMESPACE_VERSION,
    StageSettings,
)
from patient_data.stages import read_silver, validate_stages
from patient_data.utils.checks import CheckReport
from patient_data.utils.identifiers import bronze_id, dataset_key, export_id, sha256_bytes
from patient_data.utils.models import DataModel


class ExportResult(DataModel):
    dataset_key: str
    export_id: UUID
    path: Path
    status: Literal["published", "unchanged"]
    patient_count: int
    patients_sha256: str


def build_package_bytes(settings: StageSettings) -> tuple[Manifest, bytes, bytes]:
    """Validate the stages, project silver patients, and return manifest + file bytes."""
    report = validate_stages(settings)
    if not report.passed:
        failures = [f"{r.name}: {r.message}" for r in report.results if r.status != "passed"]
        raise PatientDataError("stage validation failed; export not produced", failures)

    metadata, patients = read_silver(settings)
    package_export_id = export_id(
        metadata.source_file_id, metadata.transformation_version, settings.contract_version
    )
    key = dataset_key(metadata.dataset_date, package_export_id)
    # Bronze IDs encode source-file identity and row number. Resolve those known
    # ordinals once; the exported order remains sorted by the patient source key.
    source_rows = {
        bronze_id(metadata.source_file_id, number): number for number in range(1, len(patients) + 1)
    }
    lines = [
        PatientExportLine(
            lineage=ExportLineage(
                export_id=package_export_id,
                silver_id=patient.silver_id,
                bronze_id=patient.bronze_id,
                source_row_number=source_rows[patient.bronze_id],
            ),
            record=build_patient_record(patient.clean, patient.raw),
        )
        for patient in patients
    ]
    lines.sort(key=lambda line: line.record.source_patient_id)
    patients_bytes = serialize_lines(lines)

    # Round-trip the bytes exactly as a consumer would before describing them.
    check_patient_lines(
        patients_bytes,
        expected_export_id=package_export_id,
        expected_source_file_id=metadata.source_file_id,
        transformation_version=metadata.transformation_version,
        expected_count=settings.expected_row_count,
        dataset_date_value=metadata.dataset_date,
        report=report,
    )
    if not report.passed:
        failures = [f"{r.name}: {r.message}" for r in report.results if r.status != "passed"]
        raise PatientDataError("export validation failed; nothing was published", failures)

    manifest = Manifest(
        manifest_version=MANIFEST_VERSION,
        dataset_key=key,
        export_id=package_export_id,
        dataset_date=metadata.dataset_date,
        transformation_version=metadata.transformation_version,
        contract_version=settings.contract_version,
        uuid_namespace_version=UUID_NAMESPACE_VERSION,
        source=SourceSummary(
            path=metadata.source_path,
            sha256=metadata.source_sha256,
            source_file_id=metadata.source_file_id,
            row_count=len(patients),
            column_count=SOURCE_COLUMN_COUNT,
            columns=list(FIELD_NAMES),
        ),
        patients=PatientsFileSummary(
            file="patients.jsonl",
            sha256=sha256_bytes(patients_bytes),
            count=len(lines),
            byte_count=len(patients_bytes),
        ),
        validation=list(report.results),
    )
    return manifest, serialize_manifest(manifest), patients_bytes


def _same_package(directory: Path, manifest_bytes: bytes, patients_bytes: bytes) -> bool:
    try:
        return (
            sorted(p.name for p in directory.iterdir()) == sorted([MANIFEST_FILE, PATIENTS_FILE])
            and (directory / MANIFEST_FILE).read_bytes() == manifest_bytes
            and (directory / PATIENTS_FILE).read_bytes() == patients_bytes
        )
    except OSError:
        return False


def export_package(settings: StageSettings) -> ExportResult:
    """Publish ``data/assets/exports/<dataset-key>/`` atomically, or reuse an identical package."""
    manifest, manifest_bytes, patients_bytes = build_package_bytes(settings)
    destination = settings.exports_dir / manifest.dataset_key

    def result(status: Literal["published", "unchanged"]) -> ExportResult:
        return ExportResult(
            dataset_key=manifest.dataset_key,
            export_id=manifest.export_id,
            path=destination,
            status=status,
            patient_count=manifest.patients.count,
            patients_sha256=manifest.patients.sha256,
        )

    if destination.exists():
        if _same_package(destination, manifest_bytes, patients_bytes):
            return result("unchanged")
        raise PatientDataError(
            f"{destination} already exists with different content for the same identity; "
            "advance TRANSFORMATION_VERSION or EXPORT_CONTRACT_VERSION instead of overwriting"
        )

    settings.work_dir.mkdir(parents=True, exist_ok=True)
    temp = settings.work_dir / f"export_{uuid4().hex}"
    temp.mkdir()
    try:
        (temp / MANIFEST_FILE).write_bytes(manifest_bytes)
        (temp / PATIENTS_FILE).write_bytes(patients_bytes)
        load_package(
            temp, expected_row_count=settings.expected_row_count, require_directory_name=False
        )
        settings.exports_dir.mkdir(parents=True, exist_ok=True)
        try:
            os.rename(temp, destination)  # Atomic; fails rather than merging if it now exists.
        except OSError as error:
            if _same_package(destination, manifest_bytes, patients_bytes):
                return result("unchanged")
            raise PatientDataError(f"could not publish {destination.name}: {error}") from error
    finally:
        shutil.rmtree(temp, ignore_errors=True)
    return result("published")


def validate_export(settings: StageSettings, directory: Path) -> CheckReport:
    """Validate a published package directory and report (without raising)."""
    report = CheckReport()
    try:
        package = load_package(directory, expected_row_count=settings.expected_row_count)
    except PatientDataError as error:
        report.add("package", "failed", str(error))
    else:
        report.add(
            "package",
            "passed",
            f"{package.dataset_key}: {len(package.lines)} patients, checksum verified",
        )
    return report
