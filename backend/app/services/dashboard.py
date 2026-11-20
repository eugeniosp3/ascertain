"""Read-only, whole-dataset dashboard aggregates and bounded patient previews."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session, load_only

from app.models import Note, Patient
from app.schemas.dashboard import DashboardOverview, DashboardPatient, DashboardTotals
from app.services.patients import patient_name
from app.utils import dates


def get_overview(session: Session) -> DashboardOverview:
    """Read global totals and at most six patients in each preview, without writes.

    Active/inactive are explicit profile statuses. Clinical-note totals exclude soft
    deletions. Recent visits exclude null dates, sort newest first, and use ascending
    UUID ties. No-visit patients sort by case-insensitive last/first name then UUID.
    Preview limits never constrain totals. No records are synthesized for empty data.
    """
    total, active, inactive, no_visit = session.execute(
        select(
            func.count(Patient.id),
            func.count(Patient.id).filter(Patient.status == "active"),
            func.count(Patient.id).filter(Patient.status == "inactive"),
            func.count(Patient.id).filter(Patient.last_visit.is_(None)),
        )
    ).one()
    clinical_notes = (
        session.scalar(select(func.count(Note.id)).where(Note.deleted_at.is_(None))) or 0
    )
    preview = select(Patient).options(
        load_only(
            Patient.id,
            Patient.source_patient_id,
            Patient.mrn,
            Patient.first_name,
            Patient.middle_initial,
            Patient.last_name,
            Patient.date_of_birth,
            Patient.last_visit,
            Patient.status,
        )
    )
    recent = session.scalars(
        preview.where(Patient.last_visit.is_not(None))
        .order_by(Patient.last_visit.desc(), Patient.id.asc())
        .limit(6)
    )
    without_visit = session.scalars(
        preview.where(Patient.last_visit.is_(None))
        .order_by(func.lower(Patient.last_name), func.lower(Patient.first_name), Patient.id.asc())
        .limit(6)
    )
    today = dates.utc_today()

    def patient_preview(patient: Patient) -> DashboardPatient:
        return DashboardPatient.model_validate(
            {
                "id": patient.id,
                "source_patient_id": patient.source_patient_id,
                "mrn": patient.mrn,
                "first_name": patient.first_name,
                "last_name": patient.last_name,
                "name": patient_name(patient),
                "date_of_birth": patient.date_of_birth,
                "age": dates.calculate_age(patient.date_of_birth, today),
                "last_visit": patient.last_visit,
                "status": patient.status,
            }
        )

    return DashboardOverview(
        totals=DashboardTotals(
            patients=total,
            active=active,
            inactive=inactive,
            clinical_notes=clinical_notes,
            no_visit=no_visit,
        ),
        recent_visits=[patient_preview(patient) for patient in recent],
        no_visit_patients=[patient_preview(patient) for patient in without_visit],
    )
