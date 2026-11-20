"""Deterministic clinical prose from the current profile and active notes only."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Note
from app.schemas.summaries import SummaryResponse
from app.services.notes import require_patient


def get_summary(session: Session, patient_id: UUID) -> SummaryResponse:
    """Read fresh clinical data without caching, discussion input, external calls or writes."""
    patient = require_patient(session, patient_id)
    now = datetime.now(UTC)
    age = patient.age_on(now.date())
    name = " ".join(
        part for part in (patient.first_name, patient.middle_initial, patient.last_name) if part
    )
    blood = (
        f"Blood type is {patient.blood_type}."
        if patient.blood_type
        else "Blood type is unknown (not recorded)."
    )
    identifier = f"Patient ID: {patient.id}."
    if patient.mrn:
        identifier += f" MRN: {patient.mrn}."
    conditions = ", ".join(condition["label"] for condition in patient.conditions)
    condition_text = (
        f"Recorded conditions: {conditions}." if conditions else "No ongoing conditions are listed."
    )
    if patient.allergy_status == "reported":
        allergy_text = f"Reported allergies: {', '.join(patient.allergies)}."
    elif patient.allergy_status == "no_known":
        allergy_text = "No known allergies are recorded."
    else:
        allergy_text = "Allergy status is unknown (not recorded)."
    last_visit = (
        f"The last recorded visit was on {patient.last_visit:%Y-%m-%d}."
        if patient.last_visit
        else "No visit has been recorded."
    )
    notes = session.scalars(
        select(Note)
        .where(Note.patient_id == patient_id, Note.deleted_at.is_(None))
        .order_by(Note.timestamp.desc(), Note.id.desc())
    ).all()
    profile = (
        f"{name} is a {age}-year-old {patient.status} patient. {identifier} "
        f"{blood} {condition_text} {allergy_text} {last_visit}"
    )
    if notes:
        count = (
            "is 1 active clinical note"
            if len(notes) == 1
            else f"are {len(notes)} active clinical notes"
        )
        narrative = f"There {count}. From most recent to earliest:\n\n"
        narrative += "\n\n".join(
            f"On {note.timestamp:%Y-%m-%d at %H:%M %Z}, {note.title} records: {note.content}"
            for note in notes
        )
    else:
        narrative = "There are no clinical notes yet, so this summary uses the profile only."
    return SummaryResponse(
        patient_id=patient_id, summary=f"{profile}\n\n{narrative}", generated_at=now
    )
