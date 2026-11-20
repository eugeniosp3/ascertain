"""Read the selected bronze/silver snapshot without opening either file for writes.

No CSV, JSONL, export package, stage builder, or source cleanup is used. The data
package validates its own 76 field rules; the backend maps those *stored clean*
values into the approved application schema independently of its JSONL prototype.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from typing import cast
from uuid import UUID

import duckdb
from patient_data.errors import PatientDataError
from patient_data.patient_rules import (
    FIELD_NAMES,
    SOURCE_COLUMN_COUNT,
    allergy_projection,
    parse_conditions,
    section_fields,
)
from patient_data.settings import EXPECTED_ROW_COUNT, StageSettings
from patient_data.stages import check_bronze, check_silver
from patient_data.utils.checks import CheckReport, CheckResult
from patient_data.utils.identifiers import (
    canonical_json,
    dataset_key,
    export_id,
    sha256_bytes,
)
from patient_data.utils.transformations import CleanValue, restore_source_scale
from pydantic import ValidationError

from app.schemas.imports import ImportedPatient
from app.schemas.patient_details import Condition, ProfileDetails, SourceLineage

IMPORT_CONTRACT_VERSION = "backend-duckdb-v1"
DEFAULT_BRONZE_PATH = StageSettings().bronze_path
DEFAULT_SILVER_PATH = StageSettings().silver_path


class DuckDBSourceError(ValueError):
    """A source failure with a message safe for the seed CLI."""


@dataclass(frozen=True, slots=True)
class DuckDBSnapshot:
    dataset_key: str
    dataset_date: date
    patients: tuple[ImportedPatient, ...]
    manifest: dict[str, object]
    source_hashes: dict[str, str]
    checks: tuple[CheckResult, ...]


def _value[T](clean: dict[str, CleanValue], name: str, kind: type[T]) -> T:
    value = clean[name]
    if not isinstance(value, kind):
        raise DuckDBSourceError(f"silver clean field {name} has an incompatible value type")
    return value


def _json_value(value: object) -> object:
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal | UUID):
        return str(value)
    return value


def _project(
    clean: dict[str, CleanValue], raw: dict[str, str], lineage: SourceLineage
) -> ImportedPatient:
    """Map the approved model, reading clean columns even for unchanged strings."""
    details = {
        section: {
            name: (
                restore_source_scale(value, raw[name])
                if isinstance(value := clean[name], Decimal)
                else value
            )
            for name in section_fields(section)
        }
        for section in ProfileDetails.model_fields
    }
    allergy_status, allergies = allergy_projection(cast(str | None, clean["drug_allergies"]))
    conditions = parse_conditions(
        _value(clean, "problem_list_icd10", str), _value(clean, "problem_list_text", str)
    )
    return ImportedPatient(
        source_patient_id=_value(clean, "patient_id", str),
        mrn=_value(clean, "mrn", str),
        first_name=_value(clean, "first_name", str),
        middle_initial=cast(str | None, clean["middle_initial"]),
        last_name=_value(clean, "last_name", str),
        date_of_birth=_value(clean, "date_of_birth", date),
        phone=cast(str | None, clean["mobile_phone"] or clean["home_phone"]),
        email=_value(clean, "email", str),
        address_line1=_value(clean, "address_line1", str),
        city=_value(clean, "city", str),
        state=_value(clean, "state", str),
        postal_code=_value(clean, "zip", str),
        last_visit=_value(clean, "pcp_last_visit_date", date),
        conditions=[Condition(code=item.code, label=item.label) for item in conditions],
        allergies=allergies,
        allergy_status=allergy_status,
        profile_details=ProfileDetails.model_validate(details),
        source_created_at=_value(clean, "created_at", datetime),
        source_updated_at=_value(clean, "updated_at", datetime),
        source_record=raw,
        source_lineage=lineage,
    )


def _validated_snapshot(
    connection: duckdb.DuckDBPyConnection, settings: StageSettings
) -> DuckDBSnapshot:
    report = CheckReport()
    check_bronze(connection, settings, catalog="bronze_source", report=report)
    if report.passed:
        check_silver(
            connection,
            settings,
            catalog="silver_source",
            bronze_catalog="bronze_source",
            report=report,
        )
    if not report.passed:
        failures = "; ".join(result.name for result in report.results if result.status != "passed")
        raise DuckDBSourceError(f"DuckDB source validation failed: {failures}")

    meta = connection.execute(
        "SELECT source_file_id, source_path, source_sha256, dataset_date, row_count, "
        "column_count FROM bronze_source.main.source_files"
    ).fetchone()
    assert meta is not None
    file_id, path, checksum, snapshot_date, row_count, column_count = meta
    import_id = export_id(file_id, settings.transformation_version, IMPORT_CONTRACT_VERSION)
    key = dataset_key(snapshot_date, import_id)
    columns = ", ".join(f'sv."{name}_{part}"' for name in FIELD_NAMES for part in ("raw", "clean"))
    rows = connection.execute(
        "SELECT sv.silver_id, sv.bronze_id, bz.source_row_number, bz.source_row_sha256, "
        f"{columns} FROM silver_source.main.patients sv JOIN bronze_source.main.patients bz "
        "ON sv.bronze_id = bz.bronze_id ORDER BY sv.patient_id_clean"
    ).fetchall()
    patients = []
    fingerprint_rows = []
    for row in rows:
        raw = {name: cast(str, row[4 + 2 * i]) for i, name in enumerate(FIELD_NAMES)}
        clean = {name: cast(CleanValue, row[5 + 2 * i]) for i, name in enumerate(FIELD_NAMES)}
        lineage = SourceLineage(
            silver_id=row[0],
            bronze_id=row[1],
            source_row_number=row[2],
            source_file_id=file_id,
            export_id=import_id,
            transformation_version=settings.transformation_version,
        )
        patients.append(_project(clean, raw, lineage))
        # Include all 76 raw/clean pairs, row checksums and stage identities, but not
        # ingestion/processing times. Rebuilding identical input keeps the same identity.
        fingerprint_rows.append([_json_value(value) for value in row])
    source: dict[str, object] = {
        "source_file_id": str(file_id),
        "path": path,
        "sha256": checksum,
        "row_count": row_count,
        "column_count": column_count,
        "columns": list(FIELD_NAMES),
    }
    content: dict[str, object] = {
        "source": source,
        "dataset_date": snapshot_date.isoformat(),
        "transformation_version": settings.transformation_version,
        "import_contract_version": IMPORT_CONTRACT_VERSION,
        "patients": fingerprint_rows,
    }
    fingerprint = sha256_bytes(canonical_json(content).encode("utf-8"))
    manifest: dict[str, object] = {
        "input_format": "duckdb",
        "dataset_key": key,
        "export_id": str(import_id),
        "dataset_date": snapshot_date.isoformat(),
        "source": source,
        "transformation_version": settings.transformation_version,
        "import_contract_version": IMPORT_CONTRACT_VERSION,
        "content_sha256": fingerprint,
        "patient_count": len(patients),
        "raw_clean_pair_count": SOURCE_COLUMN_COUNT,
    }
    return DuckDBSnapshot(
        dataset_key=key,
        dataset_date=snapshot_date,
        patients=tuple(patients),
        manifest=manifest,
        source_hashes={str(path): str(checksum), "content_sha256": fingerprint},
        checks=tuple(report.results),
    )


def load_duckdb_source(
    bronze: Path | str = DEFAULT_BRONZE_PATH,
    silver: Path | str = DEFAULT_SILVER_PATH,
    *,
    expected_row_count: int = EXPECTED_ROW_COUNT,
) -> DuckDBSnapshot:
    """Validate both complete files and return typed application imports; never repair them."""
    bronze_path, silver_path = Path(bronze).resolve(), Path(silver).resolve()
    if not bronze_path.is_file() or not silver_path.is_file():
        raise DuckDBSourceError("Both existing bronze.duckdb and silver.duckdb files are required")
    if bronze_path == silver_path:
        raise DuckDBSourceError("Bronze and silver must be distinct DuckDB files")
    settings = StageSettings(expected_row_count=expected_row_count)
    try:
        # Fixed aliases support filenames containing spaces, quotes, or punctuation;
        # the shared validators deliberately accept only plain catalog identifiers.
        with duckdb.connect(":memory:") as connection:
            connection.execute("SET TimeZone = 'UTC'")
            # ATTACH paths are SQL literals in DuckDB. Escape quotes; never interpolate
            # unescaped paths or permit the default writable attachment mode.
            for alias, path in (("bronze_source", bronze_path), ("silver_source", silver_path)):
                literal = str(path).replace("'", "''")
                connection.execute(f"ATTACH '{literal}' AS {alias} (READ_ONLY)")
            return _validated_snapshot(connection, settings)
    except DuckDBSourceError:
        raise
    except (duckdb.Error, PatientDataError, ValidationError, ValueError, TypeError) as error:
        raise DuckDBSourceError(
            f"DuckDB source could not be validated ({type(error).__name__}); no source was changed"
        ) from error
