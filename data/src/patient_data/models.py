"""Typed patient export package: one JSONL line per patient plus a manifest.

The optional ``record`` projection preserves the earlier export format. The runtime
backend defines its own approved model and maps stored DuckDB values directly, so this
export is not its application contract (``Manifest.application_projection``). The
lineage UUIDs and the complete ``source_record`` follow the data contract.

JSON conventions: ISO dates, UTC timestamps ending in ``Z``, exact decimal strings (never
binary floats), JSON booleans and nulls. All models are strict and reject extra keys so a
package written by another tool cannot be silently coerced.
"""

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, ConfigDict, Field, PlainSerializer

from patient_data.utils.checks import CheckResult
from patient_data.utils.models import DataModel


def _require_utc(value: datetime) -> datetime:
    if value.utcoffset() is None or value.utcoffset() != UTC.utcoffset(None):
        raise ValueError("timestamp must be UTC")
    return value.astimezone(UTC)


def _format_utc(value: datetime) -> str:
    if value.microsecond:
        return value.astimezone(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _format_decimal(value: Decimal) -> str:
    return format(value, "f")


def _require_finite(value: Decimal) -> Decimal:
    if not value.is_finite():
        raise ValueError("decimal must be finite")
    return value


UtcDatetime = Annotated[
    datetime,
    AfterValidator(_require_utc),
    PlainSerializer(_format_utc, return_type=str, when_used="json"),
]
ExactDecimal = Annotated[
    Decimal,
    AfterValidator(_require_finite),
    PlainSerializer(_format_decimal, return_type=str, when_used="json"),
]
NonEmptyText = Annotated[str, Field(min_length=1)]
Sha256 = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


class ExportModel(DataModel):
    model_config = ConfigDict(strict=True, frozen=True)


class Condition(ExportModel):
    """One problem-list entry: an ICD-10-CM code and its source description, in order."""

    code: NonEmptyText
    label: NonEmptyText


class IdentityProfile(ExportModel):
    age_years: int = Field(description="Age on the source snapshot date; not a live age.")
    sex_at_birth: str
    gender_identity: str
    race: str
    ethnicity: str
    preferred_language: str
    interpreter_needed: bool
    marital_status: str
    employment_status: str


class ContactProfile(ExportModel):
    home_phone: str | None
    mobile_phone: str | None
    emergency_contact_name: str
    emergency_contact_relationship: str
    emergency_contact_phone: str


class CareTeamProfile(ExportModel):
    pcp_name: str
    pcp_npi: str
    home_facility_key: str
    first_registered_date: date


class CoverageProfile(ExportModel):
    primary_payer_name: str
    primary_line_of_business: str
    primary_plan_name: str
    primary_plan_type: str
    primary_member_id: str
    primary_group_number: str | None
    primary_coverage_effective_date: date
    secondary_payer_name: str | None
    secondary_member_id: str | None


class ClinicalProfile(ExportModel):
    primary_clinical_story: str
    height_cm: ExactDecimal
    weight_kg: ExactDecimal
    bmi: ExactDecimal
    smoking_status: str
    alcohol_use: str
    has_hypertension: bool
    has_diabetes: str = Field(description="Category; 'None' is a meaningful value.")
    has_ckd: bool
    has_copd: bool
    has_heart_failure: bool
    has_cad: bool
    has_afib: bool
    has_osa: bool
    has_depression: bool
    has_obesity: bool
    has_cancer_history: bool
    charlson_comorbidity_index: int
    active_medications: str | None


class LabsProfile(ExportModel):
    last_labs_date: date
    last_hba1c_pct: ExactDecimal
    last_egfr: int
    last_creatinine_mg_dl: ExactDecimal
    last_ldl_mg_dl: int
    last_hemoglobin_g_dl: ExactDecimal
    hospitalizations_12mo: int
    ed_visits_12mo: int


class SocialProfile(ExportModel):
    housing_status: str
    transportation_barrier: bool
    advance_directive_on_file: bool
    code_status: str
    pa_request_count: int = Field(
        description="Supplied historical context only; no request records are imported."
    )


class ProfileDetails(ExportModel):
    """Read-only imported context, grouped by the source dictionary's sections."""

    identity: IdentityProfile
    contact: ContactProfile
    care_team: CareTeamProfile
    coverage: CoverageProfile
    clinical: ClinicalProfile
    labs: LabsProfile
    social: SocialProfile


class PatientRecord(ExportModel):
    """Normalized patient values for the application (provisional projection)."""

    source_patient_id: NonEmptyText
    mrn: NonEmptyText
    first_name: NonEmptyText
    middle_initial: str | None
    last_name: NonEmptyText
    date_of_birth: date
    phone: str | None
    email: str
    address_line1: str
    address_line2: None = None
    city: str
    state: str
    postal_code: str
    blood_type: None = None
    status: Literal["active"] = "active"
    last_visit: date = Field(description="Last PCP visit (pcp_last_visit_date).")
    conditions: list[Condition]
    allergies: list[NonEmptyText]
    allergy_status: Literal["no_known", "unknown", "reported"]
    profile_details: ProfileDetails
    source_created_at: UtcDatetime
    source_updated_at: UtcDatetime
    source_record: dict[str, str] = Field(
        description="Every original CSV field as its exact string, including blanks."
    )


class ExportLineage(ExportModel):
    export_id: UUID
    silver_id: UUID
    bronze_id: UUID
    source_row_number: int = Field(ge=1, description="One-based original CSV data record.")


class PatientExportLine(ExportModel):
    lineage: ExportLineage
    record: PatientRecord


class SourceSummary(ExportModel):
    path: NonEmptyText
    sha256: Sha256
    source_file_id: UUID
    row_count: int
    column_count: int
    columns: list[str]


class PatientsFileSummary(ExportModel):
    file: Literal["patients.jsonl"]
    sha256: Sha256
    count: int
    byte_count: int


class Manifest(ExportModel):
    """Deterministic description of one patient package (no processing timestamps)."""

    manifest_version: str
    dataset_key: NonEmptyText
    export_id: UUID
    dataset_date: date
    transformation_version: NonEmptyText
    contract_version: NonEmptyText
    uuid_namespace_version: NonEmptyText
    application_projection: Literal["provisional"] = Field(
        default="provisional",
        description="Optional export projection; runtime backend maps DuckDB values directly.",
    )
    source: SourceSummary
    patients: PatientsFileSummary
    validation: list[CheckResult]
