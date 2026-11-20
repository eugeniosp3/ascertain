"""Shared patient value types used by ORM checks, API schemas, and the seed writer.

The ``*Details`` sections type the read-only imported context stored in
``patients.profile_details``; field names are the original source field names. Decimals are
exact (stored in JSON as strings) and dates are ISO strings. These models perform no I/O.
"""

from datetime import date
from decimal import Decimal
from typing import Annotated, Literal, get_args
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer

PatientStatus = Literal["active", "inactive"]
BloodType = Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
AllergyStatus = Literal["unknown", "no_known", "reported"]
NoteSourceType = Literal["manual", "seed"]

PATIENT_STATUSES: tuple[str, ...] = get_args(PatientStatus)
BLOOD_TYPES: tuple[str, ...] = get_args(BloodType)
ALLERGY_STATUSES: tuple[str, ...] = get_args(AllergyStatus)
NOTE_SOURCE_TYPES: tuple[str, ...] = get_args(NoteSourceType)

ExactDecimal = Annotated[
    Decimal,
    Field(allow_inf_nan=False),
    PlainSerializer(lambda value: format(value, "f"), return_type=str, when_used="json"),
]


class DetailModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class Condition(DetailModel):
    """One problem-list entry. Imported entries carry an ICD-10-CM code; form entries may not."""

    code: Annotated[str, Field(min_length=1, max_length=16)] | None = None
    label: Annotated[str, Field(min_length=1, max_length=500)]


class SourceLineage(DetailModel):
    """Data-pipeline identity of an imported patient; never an application key."""

    bronze_id: UUID
    silver_id: UUID
    source_row_number: int = Field(ge=1, description="One-based original CSV data record.")
    export_id: UUID | None = None
    source_file_id: UUID | None = None
    transformation_version: str | None = None


class IdentityDetails(DetailModel):
    age_years: int = Field(description="Age on the source snapshot date, not current age.")
    sex_at_birth: str
    gender_identity: str
    race: str
    ethnicity: str
    preferred_language: str
    interpreter_needed: bool
    marital_status: str
    employment_status: str


class ContactDetails(DetailModel):
    home_phone: str | None
    mobile_phone: str | None
    emergency_contact_name: str
    emergency_contact_relationship: str
    emergency_contact_phone: str


class CareTeamDetails(DetailModel):
    pcp_name: str
    pcp_npi: str
    home_facility_key: str
    first_registered_date: date


class CoverageDetails(DetailModel):
    primary_payer_name: str
    primary_line_of_business: str
    primary_plan_name: str
    primary_plan_type: str
    primary_member_id: str
    primary_group_number: str | None
    primary_coverage_effective_date: date
    secondary_payer_name: str | None
    secondary_member_id: str | None


class ClinicalDetails(DetailModel):
    primary_clinical_story: str
    height_cm: ExactDecimal
    weight_kg: ExactDecimal
    bmi: ExactDecimal
    smoking_status: str
    alcohol_use: str
    has_hypertension: bool
    has_diabetes: str = Field(description="Category; 'None' is a meaningful value, not null.")
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
    active_medications: str | None = Field(
        description="Source semicolon list kept as written; null means none documented."
    )

    @property
    def medication_items(self) -> list[str]:
        """Display list derived from ``active_medications``; nothing is stored separately."""
        if self.active_medications is None:
            return []
        return [item.strip() for item in self.active_medications.split(";") if item.strip()]


class LabsDetails(DetailModel):
    last_labs_date: date
    last_hba1c_pct: ExactDecimal
    last_egfr: int
    last_creatinine_mg_dl: ExactDecimal
    last_ldl_mg_dl: int
    last_hemoglobin_g_dl: ExactDecimal
    hospitalizations_12mo: int
    ed_visits_12mo: int


class SocialDetails(DetailModel):
    housing_status: str
    transportation_barrier: bool
    advance_directive_on_file: bool
    code_status: str
    pa_request_count: int = Field(
        description="Supplied historical context only; no request records exist."
    )


class ProfileDetails(DetailModel):
    """Read-only imported context grouped by the source dictionary sections."""

    identity: IdentityDetails
    contact: ContactDetails
    care_team: CareTeamDetails
    coverage: CoverageDetails
    clinical: ClinicalDetails
    labs: LabsDetails
    social: SocialDetails
