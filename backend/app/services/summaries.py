"""Patient summaries from the current profile and active notes only.

The deterministic template below is the FACTS block sent to the LLM and the fallback whenever
the LLM is disabled, unreachable, slow or returns something unusable. The latest LLM summary
is stored per patient and reused while sha256(model + FACTS) is unchanged.
"""

import hashlib
import json
import logging
import urllib.request
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Note, PatientSummary
from app.schemas.summaries import SummaryResponse
from app.services.notes import require_patient

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a clinical documentation assistant. Write a concise, coherent 4-7 sentence "
    "summary of this patient using ONLY the facts provided. Start with name, age, status and "
    "blood type; then conditions and allergies; then synthesize the clinical notes "
    "chronologically (most recent first) into narrative. Do not invent facts, diagnoses or "
    "advice. If there are no notes, say so."
)


def summarize(session: Session, patient_id: UUID, settings: Settings) -> SummaryResponse:
    """Return the stored LLM summary for unchanged FACTS, a new one, or the template."""
    facts = get_summary(session, patient_id)
    if settings.summary_provider == "template":
        return facts  # Never reads or writes patient_summaries.
    model = settings.llm_model
    facts_hash = hashlib.sha256(f"{model}\n{facts.summary}".encode()).hexdigest()
    stored = session.execute(
        select(PatientSummary.summary, PatientSummary.model, PatientSummary.generated_at).where(
            PatientSummary.patient_id == patient_id, PatientSummary.facts_hash == facts_hash
        )
    ).one_or_none()
    # Reads are done: end the read transaction so no connection waits on the network.
    session.rollback()
    if stored is not None:
        return SummaryResponse(
            patient_id=patient_id,
            summary=stored.summary,
            generated_at=stored.generated_at.astimezone(UTC),
            method="llm",
            model=stored.model,
        )
    try:
        text = _complete(settings, facts.summary)
    except Exception as error:  # Any failure falls back unstored; never log patient data.
        logger.warning("LLM summary unavailable (%s); using template.", type(error).__name__)
        return facts
    generated_at = datetime.now(UTC)
    row = {
        "patient_id": patient_id,
        "summary": text,
        "method": "llm",
        "model": model,
        "facts_hash": facts_hash,
        "generated_at": generated_at,
    }
    upsert = insert(PatientSummary).values(row)
    upsert = upsert.on_conflict_do_update(
        index_elements=[PatientSummary.patient_id],
        set_={name: upsert.excluded[name] for name in row if name != "patient_id"},
    )
    try:
        session.execute(upsert)
        session.commit()
    except IntegrityError:
        session.rollback()
        require_patient(session, patient_id)  # Deleted during the LLM call: answer 404.
        raise
    return SummaryResponse(
        patient_id=patient_id,
        summary=text,
        generated_at=generated_at,
        method="llm",
        model=model,
    )


def _complete(settings: Settings, facts: str) -> str:
    """One OpenAI-compatible chat completion; raise on anything but non-empty text."""
    body = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": facts},
        ],
        "max_tokens": 350,
        "temperature": 0.2,
    }
    request = urllib.request.Request(
        f"{settings.llm_base_url}/chat/completions",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": "Bearer unused",
            "Content-Type": "application/json",
            "User-Agent": "ascertain-summary/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=settings.llm_timeout_seconds) as response:
        if response.status != 200:
            raise ValueError("unexpected status")
        payload = json.load(response)
    content = payload["choices"][0]["message"]["content"]
    if not isinstance(content, str) or not content.strip():
        raise ValueError("empty content")
    return content.strip()


def age_article(age: int) -> str:
    """English article before a spoken age: "an 8-", "an 11-", "an 18-", "an 80-89-year-old"."""
    return "an" if age in (8, 11, 18) or 80 <= age <= 89 else "a"


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
        f"{name} is {age_article(age)} {age}-year-old {patient.status} patient. {identifier} "
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
            f"On {note.timestamp.astimezone(UTC):%Y-%m-%d at %H:%M %Z}, "
            f"{note.title} records: {note.content}"
            for note in notes
        )
    else:
        narrative = "There are no clinical notes yet, so this summary uses the profile only."
    return SummaryResponse(
        patient_id=patient_id, summary=f"{profile}\n\n{narrative}", generated_at=now
    )
