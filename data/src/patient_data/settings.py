"""Typed versions and paths for the patient pipeline.

Version constants are part of the data contract: changing a field rule or the export
mapping must advance ``TRANSFORMATION_VERSION`` or ``EXPORT_CONTRACT_VERSION`` so new
lineage UUIDs and a new dataset key are produced.
"""

from datetime import date
from pathlib import Path

from pydantic import ConfigDict, Field

from patient_data.utils.models import DataModel

TRANSFORMATION_VERSION = "patient-rules-v1"
EXPORT_CONTRACT_VERSION = "patient-export-v2"
UUID_NAMESPACE_VERSION = "v1"
MANIFEST_VERSION = "1"

SOURCE_PATH = "prior-auth-pack/data/patients_100.csv"
DATASET_DATE = date(2026, 11, 18)
EXPECTED_ROW_COUNT = 100

PATIENTS_FILE = "patients.jsonl"
MANIFEST_FILE = "manifest.json"


def default_repo_root() -> Path:
    """Return the repository root for a source checkout (``data/src/patient_data``)."""
    return Path(__file__).resolve().parents[3]


class StageSettings(DataModel):
    """Where the source, stage files, temporary builds, and exports live.

    ``source_path`` is the original package-relative label used for stable identity.
    Source files live under the repository's ``reference/`` folder; moving that folder
    does not change the label, source checksum, or existing lineage UUIDs.
    """

    model_config = ConfigDict(frozen=True)

    repo_root: Path = Field(default_factory=default_repo_root)
    source_path: str = SOURCE_PATH
    data_dir_name: str = "data"
    dataset_date: date = DATASET_DATE
    expected_row_count: int = Field(default=EXPECTED_ROW_COUNT, ge=1)
    transformation_version: str = TRANSFORMATION_VERSION
    contract_version: str = EXPORT_CONTRACT_VERSION

    @property
    def source_file(self) -> Path:
        return self.repo_root / "reference" / self.source_path

    @property
    def data_dir(self) -> Path:
        return self.repo_root / self.data_dir_name

    @property
    def assets_dir(self) -> Path:
        return self.data_dir / "assets"

    @property
    def bronze_path(self) -> Path:
        return self.assets_dir / "bronze" / "bronze.duckdb"

    @property
    def silver_path(self) -> Path:
        return self.assets_dir / "silver" / "silver.duckdb"

    @property
    def work_dir(self) -> Path:
        return self.data_dir / ".cache" / "work"

    @property
    def exports_dir(self) -> Path:
        return self.assets_dir / "exports"
