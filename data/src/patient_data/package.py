"""Serialize, read, and fully validate a patient package (``patients.jsonl`` + manifest).

This module deliberately has no DuckDB dependency: the seed command imports it to
validate the shipped package at application startup without stage files.

Validation is end-to-end. Besides checksums, counts, versions, and identity, every record
is re-derived from its own ``source_record`` with the current field rules and export
mapping and must equal the exported record exactly; every line must already be in
canonical JSON form. Error messages name lines and field paths, never values.
"""

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from uuid import UUID

from pydantic import ValidationError

from patient_data.errors import PatientDataError
from patient_data.models import Manifest, PatientExportLine
from patient_data.patient_rules import (
    FIELD_NAMES,
    PATIENT_FIELDS,
    SOURCE_COLUMN_COUNT,
    build_patient_record,
    invariant_issues,
)
from patient_data.settings import (
    EXPECTED_ROW_COUNT,
    EXPORT_CONTRACT_VERSION,
    MANIFEST_FILE,
    MANIFEST_VERSION,
    PATIENTS_FILE,
    TRANSFORMATION_VERSION,
    UUID_NAMESPACE_VERSION,
)
from patient_data.utils.checks import CheckReport
from patient_data.utils.identifiers import (
    bronze_id,
    canonical_json,
    dataset_key,
    export_id,
    sha256_bytes,
    silver_id,
    source_file_id,
)
from patient_data.utils.transformations import RowTransformer, TransformedRow

SUPPORTED_MANIFEST_VERSIONS = frozenset({MANIFEST_VERSION})
SUPPORTED_CONTRACT_VERSIONS = frozenset({EXPORT_CONTRACT_VERSION})
SUPPORTED_TRANSFORMATION_VERSIONS = frozenset({TRANSFORMATION_VERSION})
SUPPORTED_UUID_NAMESPACE_VERSIONS = frozenset({UUID_NAMESPACE_VERSION})


def serialize_line(line: PatientExportLine) -> str:
    """Canonical compact JSON for one patient (sorted keys, UTF-8, no spaces)."""
    return canonical_json(line.model_dump(mode="json"))


def serialize_lines(lines: list[PatientExportLine]) -> bytes:
    return "".join(serialize_line(line) + "\n" for line in lines).encode("utf-8")


def serialize_manifest(manifest: Manifest) -> bytes:
    """Readable, deterministic manifest JSON with a final newline."""
    document = manifest.model_dump(mode="json")
    return (json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode()


def _validation_problem(prefix: str, error: ValidationError) -> str:
    # include_input=False keeps patient values out of the message.
    locations = sorted(
        {
            ".".join(str(part) for part in item["loc"]) or "<root>"
            for item in error.errors(include_input=False, include_url=False)
        }
    )
    return f"{prefix}: invalid or missing field(s) {locations[:8]}"


@dataclass(frozen=True)
class ValidatedPackage:
    """A package that passed every check; hand this object (not the files) to writers."""

    directory: Path
    manifest: Manifest
    manifest_bytes: bytes
    patients_bytes: bytes
    lines: tuple[PatientExportLine, ...]

    @property
    def dataset_key(self) -> str:
        return self.manifest.dataset_key

    @property
    def export_id(self) -> UUID:
        return self.manifest.export_id

    def manifest_document(self) -> dict[str, object]:
        """The manifest as JSON-compatible data, e.g. for ``seed_runs.export_manifest``."""
        document: dict[str, object] = json.loads(self.manifest_bytes)
        return document

    def source_hashes(self) -> dict[str, str]:
        return {self.manifest.source.path: self.manifest.source.sha256}


def check_patient_lines(
    patients_bytes: bytes,
    *,
    expected_export_id: UUID,
    expected_source_file_id: UUID,
    transformation_version: str,
    expected_count: int,
    dataset_date_value: date,
    report: CheckReport,
) -> list[PatientExportLine]:
    """Validate JSONL content line by line and as a whole; record results in ``report``."""
    try:
        text = patients_bytes.decode("utf-8")
    except UnicodeDecodeError:
        report.add("package.patients.encoding", "failed", f"{PATIENTS_FILE} is not valid UTF-8")
        return []
    if not text.endswith("\n") or "\r" in text:
        report.add(
            "package.patients.encoding", "failed", "lines must end with LF, including the last"
        )
        return []
    report.add("package.patients.encoding", "passed", "UTF-8 with a final newline")

    lines: list[PatientExportLine] = []
    problems: list[str] = []
    for number, raw_line in enumerate(text[:-1].split("\n"), start=1):
        try:
            line = PatientExportLine.model_validate_json(raw_line)
        except ValidationError as error:
            problems.append(_validation_problem(f"line {number}", error))
            continue
        if serialize_line(line) != raw_line:
            problems.append(f"line {number}: not in canonical JSON form")
        lines.append(line)
    report.add(
        "package.patients.schema",
        "failed" if problems else "passed",
        "; ".join(problems[:10]) if problems else "every line is a canonical PatientExportLine",
    )
    if problems:
        return []

    ids = [line.record.source_patient_id for line in lines]
    ordered = ids == sorted(set(ids))
    report.add(
        "package.patients.count",
        "passed" if len(lines) == expected_count else "failed",
        f"{len(lines)} patients; expected {expected_count}",
    )
    report.add(
        "package.patients.order",
        "passed" if ordered else "failed",
        "sorted by unique source_patient_id"
        if ordered
        else "source_patient_id values are duplicated or unsorted",
    )

    lineage_problems: list[str] = []
    silver_ids = {line.lineage.silver_id for line in lines}
    bronze_ids = {line.lineage.bronze_id for line in lines}
    if len(silver_ids) != len(lines) or len(bronze_ids) != len(lines):
        lineage_problems.append("silver_id/bronze_id values are not unique")
    source_rows = {line.lineage.source_row_number for line in lines}
    if source_rows != set(range(1, expected_count + 1)):
        lineage_problems.append("source_row_number values must cover 1..N exactly once")
    for number, line in enumerate(lines, start=1):
        lineage = line.lineage
        if lineage.export_id != expected_export_id:
            lineage_problems.append(f"line {number}: export_id differs from the manifest")
        if lineage.bronze_id != bronze_id(expected_source_file_id, lineage.source_row_number):
            lineage_problems.append(
                f"line {number}: bronze_id does not derive from source_file_id and row number"
            )
        if lineage.silver_id != silver_id(lineage.bronze_id, transformation_version):
            lineage_problems.append(f"line {number}: silver_id does not derive from bronze_id")
    report.add(
        "package.patients.lineage",
        "failed" if lineage_problems else "passed",
        "; ".join(lineage_problems[:10])
        if lineage_problems
        else "export/silver/bronze UUIDs and original source row numbers re-derive",
    )

    transformer = RowTransformer(PATIENT_FIELDS)
    mapping_problems: list[str] = []
    rows: list[TransformedRow] = []
    for number, line in enumerate(lines, start=1):
        source = line.record.source_record
        if set(source) != set(FIELD_NAMES) or len(source) != SOURCE_COLUMN_COUNT:
            mapping_problems.append(
                f"line {number}: source_record does not hold the {SOURCE_COLUMN_COUNT} fields"
            )
            continue
        raw = {name: source[name] for name in FIELD_NAMES}
        row, issues = transformer.transform(number, tuple(raw.values()))
        if row is None:
            mapping_problems.extend(f"line {i.row_number}: {i.field}: {i.message}" for i in issues)
            continue
        rows.append(row)
        try:
            expected = build_patient_record(row.clean_values(), raw)
        except (PatientDataError, ValueError):
            mapping_problems.append(f"line {number}: source_record cannot be mapped")
            continue
        if expected != line.record:
            differing = sorted(
                name
                for name in type(expected).model_fields
                if getattr(expected, name) != getattr(line.record, name)
            )
            mapping_problems.append(f"line {number}: record differs from mapping in {differing}")
    if not mapping_problems:
        mapping_problems.extend(
            f"line {issue.row_number}: {issue.field}: {issue.message}"
            for issue in invariant_issues(rows, dataset_date_value)
        )
    report.add(
        "package.patients.mapping",
        "failed" if mapping_problems else "passed",
        "; ".join(mapping_problems[:10])
        if mapping_problems
        else "every record equals the field rules + export mapping applied to its source_record",
    )
    return lines


def check_manifest(manifest: Manifest, report: CheckReport, *, expected_row_count: int) -> None:
    """Versions, identity derivation, and source summary."""
    versions_ok = (
        manifest.manifest_version in SUPPORTED_MANIFEST_VERSIONS
        and manifest.contract_version in SUPPORTED_CONTRACT_VERSIONS
        and manifest.transformation_version in SUPPORTED_TRANSFORMATION_VERSIONS
        and manifest.uuid_namespace_version in SUPPORTED_UUID_NAMESPACE_VERSIONS
    )
    report.add(
        "package.manifest.versions",
        "passed" if versions_ok else "failed",
        "manifest/contract/transformation/UUID versions are supported"
        if versions_ok
        else "unsupported package version; rebuild the export with this tool version",
    )
    source = manifest.source
    problems = []
    try:
        expected_source = source_file_id(source.path, source.sha256)
    except ValueError:
        problems.append("source path is not a valid repository-relative path")
    else:
        if source.source_file_id != expected_source:
            problems.append("source_file_id does not derive from the source path and checksum")
    expected_export = export_id(
        source.source_file_id, manifest.transformation_version, manifest.contract_version
    )
    if manifest.export_id != expected_export:
        problems.append("export_id does not derive from source and versions")
    if manifest.dataset_key != dataset_key(manifest.dataset_date, manifest.export_id):
        problems.append("dataset_key does not derive from dataset date and export_id")
    report.add(
        "package.manifest.identity",
        "failed" if problems else "passed",
        "; ".join(problems) or "source_file_id, export_id and dataset_key re-derive",
    )
    source_ok = (
        source.columns == list(FIELD_NAMES)
        and source.column_count == SOURCE_COLUMN_COUNT
        and source.row_count == expected_row_count
    )
    report.add(
        "package.manifest.source",
        "passed" if source_ok else "failed",
        f"{expected_row_count} source rows and the {SOURCE_COLUMN_COUNT} contract columns"
        if source_ok
        else "source columns or counts differ from the patient contract",
    )
    unpassed = [result.name for result in manifest.validation if result.status != "passed"]
    report.add(
        "package.manifest.validation",
        "failed" if unpassed or not manifest.validation else "passed",
        f"build checks not passed: {unpassed}"
        if unpassed
        else f"{len(manifest.validation)} recorded build checks passed",
    )


def load_package(
    directory: Path,
    *,
    expected_row_count: int = EXPECTED_ROW_COUNT,
    require_directory_name: bool = True,
) -> ValidatedPackage:
    """Read both files once and validate everything; raise ``PatientDataError`` otherwise."""
    report = CheckReport()
    if not directory.is_dir():
        raise PatientDataError(f"patient package directory not found: {directory}")
    names = sorted(path.name for path in directory.iterdir())
    if names != sorted([MANIFEST_FILE, PATIENTS_FILE]):
        raise PatientDataError(
            f"{directory.name} must contain exactly {MANIFEST_FILE} and {PATIENTS_FILE}; "
            f"found {names}"
        )
    manifest_bytes = (directory / MANIFEST_FILE).read_bytes()
    patients_bytes = (directory / PATIENTS_FILE).read_bytes()
    try:
        manifest = Manifest.model_validate_json(manifest_bytes)
    except ValidationError as error:
        raise PatientDataError(
            "manifest.json does not match the manifest model",
            [_validation_problem(MANIFEST_FILE, error)],
        ) from error
    report.add(
        "package.manifest.canonical",
        "passed" if serialize_manifest(manifest) == manifest_bytes else "failed",
        "manifest is in canonical form",
    )
    check_manifest(manifest, report, expected_row_count=expected_row_count)
    if require_directory_name:
        report.add(
            "package.directory",
            "passed" if directory.name == manifest.dataset_key else "failed",
            f"directory name must equal the dataset key {manifest.dataset_key}",
        )
    summary = manifest.patients
    checksum_ok = (
        sha256_bytes(patients_bytes) == summary.sha256 and len(patients_bytes) == summary.byte_count
    )
    report.add(
        "package.patients.checksum",
        "passed" if checksum_ok else "failed",
        f"{PATIENTS_FILE} matches the manifest checksum"
        if checksum_ok
        else f"{PATIENTS_FILE} does not match the manifest checksum; the package was modified",
    )
    lines = check_patient_lines(
        patients_bytes,
        expected_export_id=manifest.export_id,
        expected_source_file_id=manifest.source.source_file_id,
        transformation_version=manifest.transformation_version,
        expected_count=summary.count,
        dataset_date_value=manifest.dataset_date,
        report=report,
    )
    if summary.count != expected_row_count:
        report.add(
            "package.patients.expected_count",
            "failed",
            f"manifest counts {summary.count} patients; expected {expected_row_count}",
        )
    if not report.passed:
        failures = [f"{r.name}: {r.message}" for r in report.results if r.status != "passed"]
        raise PatientDataError(f"patient package {directory.name} is invalid", failures)
    return ValidatedPackage(directory, manifest, manifest_bytes, patients_bytes, tuple(lines))
