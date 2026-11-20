"""Global or assigned overview totals and two bounded patient previews for the mock UI."""

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.patient_details import PatientStatus
from app.schemas.users import UserResponse

DashboardScope = Literal["global", "assigned"]


class DashboardTotals(BaseModel):
    patients: int = Field(ge=0)
    active: int = Field(ge=0)
    inactive: int = Field(ge=0)
    clinical_notes: int = Field(ge=0, description="Active clinical notes; excludes tombstones.")
    no_visit: int = Field(ge=0, description="Patients whose last_visit is null.")


class DashboardPatient(BaseModel):
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


class DashboardOverview(BaseModel):
    """Totals span the selected cohort; previews contain at most six patients each.

    Recent visits exclude missing dates and sort newest first, then UUID. Patients
    without a visit sort by last name, first name, then UUID. Status is never inferred
    from visit dates. Global scope includes assigned and unassigned patients.
    """

    scope: DashboardScope = Field(description="The cohort every total and preview describes.")
    assigned_user: UserResponse | None = Field(
        description="The selected actor whose assignments form the cohort; null for global."
    )
    totals: DashboardTotals
    recent_visits: list[DashboardPatient] = Field(max_length=6)
    no_visit_patients: list[DashboardPatient] = Field(max_length=6)
