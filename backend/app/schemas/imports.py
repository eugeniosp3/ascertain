"""Validated, backend-owned values for the direct DuckDB import.

The data package's JSONL projection is provisional. This schema instead follows
``docs/MODEL_CONTRACT.md`` and the shared application detail types.
"""

from dataclasses import dataclass
from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from patient_data.utils.checks import CheckResult
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from app.schemas.patient_details import (
    AllergyStatus,
    Condition,
    ProfileDetails,
    SourceLineage,
)


class ImportedPatient(BaseModel):
    """Only approved patient columns; application identity and audit times are separate."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    source_patient_id: Annotated[str, Field(pattern=r"^PT-[0-9]{4}$")]
    mrn: str
    first_name: Annotated[str, Field(min_length=1, max_length=100)]
    middle_initial: Annotated[str, Field(max_length=1)] | None
    last_name: Annotated[str, Field(min_length=1, max_length=100)]
    date_of_birth: date
    phone: Annotated[str, Field(max_length=40)] | None
    email: Annotated[str, Field(max_length=254)]
    address_line1: Annotated[str, Field(max_length=255)]
    address_line2: None = None
    city: Annotated[str, Field(max_length=100)]
    state: Annotated[str, Field(max_length=2)]
    postal_code: Annotated[str, Field(max_length=10)]
    blood_type: None = None
    status: Literal["active"] = "active"  # Synthetic initial dashboard status.
    last_visit: date
    conditions: list[Condition]
    allergies: list[str]
    allergy_status: AllergyStatus
    profile_details: ProfileDetails
    source_created_at: AwareDatetime
    source_updated_at: AwareDatetime
    source_record: dict[str, str]
    source_lineage: SourceLineage


SeedStatus = Literal["ready", "blocked", "not_ready", "seeded", "already_complete", "failed"]


@dataclass(frozen=True, slots=True)
class SeedReport:
    """Safe to log: checks contain no connection URL or patient values."""

    status: SeedStatus
    checks: tuple[CheckResult, ...]
    dataset_key: str | None = None
    seed_run_id: UUID | None = None
    row_counts: dict[str, int] | None = None

    @property
    def exit_code(self) -> int:
        return 0 if self.status in {"ready", "seeded", "already_complete"} else 1

    @property
    def passed(self) -> bool:
        return self.exit_code == 0
