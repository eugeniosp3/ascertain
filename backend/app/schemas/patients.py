"""Editable patient contracts and typed read-only context from the patient dataset.

POST supplies optional-field defaults; PUT requires every editable field, including
explicit nulls. Source identifiers, imported context, audit fields, and workload
assignment are read-only; write bodies reject them as unexpected fields.
The complete original source_record is deliberately absent from every API schema.
"""

import re
from datetime import date, datetime
from typing import Annotated, Any, Literal, Self
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    ValidationError,
    ValidatorFunctionWrapHandler,
    field_validator,
    model_validator,
)

from app.schemas.patient_details import (
    AllergyStatus,
    BloodType,
    PatientStatus,
    ProfileDetails,
    SourceLineage,
)
from app.utils import dates
from app.utils.pagination import Page, PageParams
from app.validation import reject

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
AddressLine = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
Allergy = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class Condition(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    code: Annotated[str, Field(min_length=1, max_length=16)] | None = None
    label: Annotated[str, Field(min_length=1, max_length=500)]


class PatientEditable(BaseModel):
    """Complete writable profile, also the PUT body; nullable does not mean optional."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    first_name: Name
    middle_initial: Annotated[str, Field(min_length=1, max_length=1)] | None
    last_name: Name
    date_of_birth: date
    phone: Annotated[str, Field(min_length=7, max_length=40)] | None
    email: Annotated[EmailStr, Field(max_length=254)] | None
    address_line1: AddressLine | None
    address_line2: AddressLine | None
    city: ShortText | None
    state: Annotated[str, Field(min_length=2, max_length=2)] | None
    postal_code: Annotated[str, Field(min_length=1, max_length=10)] | None
    blood_type: BloodType | None
    status: PatientStatus
    last_visit: date | None
    conditions: list[Condition] = Field(max_length=100)
    allergies: list[Allergy] = Field(max_length=100)
    allergy_status: AllergyStatus

    @field_validator("date_of_birth", "last_visit")
    @classmethod
    def reject_future_date(cls, value: date | None) -> date | None:
        if value is not None and value > dates.utc_today():
            reject("date_in_future")
        return value

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        if value is not None and (
            not re.fullmatch(r"\+?[\d\s().-]+(?:\s*(?:x|ext\.?|#)\s*\d{1,6})?", value, re.I)
            or not 7 <= sum(character.isdecimal() for character in value) <= 20
        ):
            reject("invalid_phone")
        return value

    @field_validator("email", mode="wrap")
    @classmethod
    def validate_email_message(
        cls, value: Any, handler: ValidatorFunctionWrapHandler
    ) -> EmailStr | None:
        """Keep EmailStr validation while never reflecting its exception context."""
        try:
            validated: EmailStr | None = handler(value)
        except ValidationError:
            reject("invalid_email")
        return validated

    @model_validator(mode="after")
    def validate_allergies(self) -> Self:
        if self.allergy_status == "reported" and not self.allergies:
            reject("allergies_required")
        if self.allergy_status != "reported" and self.allergies:
            reject("allergies_not_reported")
        return self


class PatientCreate(PatientEditable):
    """Names and DOB are required; omitted medical lists are empty and status is active."""

    middle_initial: Annotated[str, Field(min_length=1, max_length=1)] | None = None
    phone: Annotated[str, Field(min_length=7, max_length=40)] | None = None
    email: Annotated[EmailStr, Field(max_length=254)] | None = None
    address_line1: AddressLine | None = None
    address_line2: AddressLine | None = None
    city: ShortText | None = None
    state: Annotated[str, Field(min_length=2, max_length=2)] | None = None
    postal_code: Annotated[str, Field(min_length=1, max_length=10)] | None = None
    blood_type: BloodType | None = None
    status: PatientStatus = "active"
    last_visit: date | None = None
    conditions: list[Condition] = Field(default_factory=list, max_length=100)
    allergies: list[Allergy] = Field(default_factory=list, max_length=100)
    allergy_status: AllergyStatus = "unknown"


class PatientReplace(PatientEditable):
    """Replace all editable fields while retaining all original import provenance."""


class PatientListQuery(PageParams):
    q: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None
    status: PatientStatus | None = None
    assigned_to: Literal["me"] | None = Field(
        default=None,
        description=(
            "Only `me`: restrict the cohort to the selected X-Demo-User-ID before totals "
            "and pagination. Omit it for the shared all-patient directory."
        ),
    )
    sort_by: Literal[
        "name", "dob", "last_visit", "status", "notes_count", "comments_count", "notes", "comments"
    ] = "name"
    order: Literal["asc", "desc"] = "asc"
    unread_only: bool = False


class PatientListItem(BaseModel):
    id: UUID
    assigned_user_id: UUID | None = Field(
        description="Read-only, server-owned workload assignment; null when unassigned."
    )
    source_patient_id: str | None
    mrn: str | None
    first_name: str
    last_name: str
    name: str
    date_of_birth: date
    age: int
    last_visit: date | None
    status: PatientStatus
    conditions: list[Condition]
    notes_count: int = Field(ge=0)
    comments_count: int = Field(ge=0)
    unread_comments_count: int = Field(ge=0)


class PatientDetail(PatientListItem):
    middle_initial: str | None
    phone: str | None
    email: str | None
    address_line1: str | None
    address_line2: str | None
    city: str | None
    state: str | None
    postal_code: str | None
    blood_type: BloodType | None
    allergies: list[str]
    allergy_status: AllergyStatus
    profile_details: ProfileDetails | None
    source_lineage: SourceLineage | None
    source_created_at: datetime | None
    source_updated_at: datetime | None
    created_at: datetime
    updated_at: datetime


PatientPage = Page[PatientListItem]
