"""Whole-dataset overview totals and two bounded patient previews for the mock UI."""

from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.patient_details import PatientStatus


class DashboardTotals(BaseModel):
    patients: int = Field(ge=0)
    active: int = Field(ge=0)
    inactive: int = Field(ge=0)
    clinical_notes: int = Field(ge=0, description="Active clinical notes; excludes tombstones.")
    no_visit: int = Field(ge=0, description="Patients whose last_visit is null.")


class DashboardPatient(BaseModel):
    id: UUID
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
    """Totals span all rows. Previews contain at most six distinct patients each.

    Recent visits exclude missing dates and sort newest first, then UUID. Patients
    without a visit sort by last name, first name, then UUID. Status is never inferred
    from visit dates. The active/inactive totals can supply global status chips.
    """

    totals: DashboardTotals
    recent_visits: list[DashboardPatient] = Field(max_length=6)
    no_visit_patients: list[DashboardPatient] = Field(max_length=6)
