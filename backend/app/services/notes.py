"""Clinical notes and URL metadata; each public mutation owns its commit/rollback."""

from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import Note, NoteAttachment, Patient, User
from app.schemas.notes import AttachmentCreate, AttachmentResponse, NoteResponse, NoteWrite
from app.schemas.users import UserResponse


def require_patient(session: Session, patient_id: UUID, *, lock: bool = False) -> Patient:
    """Check the parent first; lock it when serializing a patient-scoped mutation."""
    query = select(Patient).where(Patient.id == patient_id)
    if lock:
        query = query.with_for_update()
    patient = session.scalar(query)
    if patient is None:
        raise AppError(status_code=404, code="patient_not_found", message="Patient not found.")
    return patient


def require_note(session: Session, patient_id: UUID, note_id: UUID) -> Note:
    note = session.scalar(select(Note).where(Note.id == note_id, Note.patient_id == patient_id))
    if note is None:
        raise AppError(status_code=404, code="note_not_found", message="Note not found.")
    return note


def require_note_author(note: Note, actor: User) -> None:
    if note.author_id != actor.id:
        raise AppError(
            status_code=403,
            code="note_author_required",
            message="Only the note author may change it.",
        )


def require_active_note(note: Note) -> None:
    if note.deleted_at is not None:
        raise AppError(status_code=410, code="note_deleted", message="This note was deleted.")


def note_responses(session: Session, notes: Sequence[Note]) -> list[NoteResponse]:
    """Load authors and attachments in batches without relying on ORM lazy loading."""
    if not notes:
        return []
    authors = {
        user.id: UserResponse.model_validate(user)
        for user in session.scalars(select(User).where(User.id.in_({n.author_id for n in notes})))
    }
    attachments: dict[UUID, list[AttachmentResponse]] = {note.id: [] for note in notes}
    rows = session.scalars(
        select(NoteAttachment)
        .where(NoteAttachment.note_id.in_(attachments))
        .order_by(NoteAttachment.created_at, NoteAttachment.id)
    )
    for row in rows:
        attachments[row.note_id].append(AttachmentResponse.model_validate(row))
    return [
        NoteResponse(
            id=note.id,
            patient_id=note.patient_id,
            title=note.title or "Clinical note",
            timestamp=note.timestamp,
            content=note.content or "",
            author=authors[note.author_id],
            created_at=note.created_at,
            updated_at=note.updated_at,
            attachments=attachments[note.id],
        )
        for note in notes
    ]


def list_notes(session: Session, patient_id: UUID) -> list[NoteResponse]:
    """Read every active note, newest clinical timestamp first, without mutations."""
    require_patient(session, patient_id)
    notes = session.scalars(
        select(Note)
        .where(Note.patient_id == patient_id, Note.deleted_at.is_(None))
        .order_by(Note.timestamp.desc(), Note.id.desc())
    ).all()
    return note_responses(session, notes)


def get_note(session: Session, patient_id: UUID, note_id: UUID) -> NoteResponse:
    require_patient(session, patient_id)
    note = require_note(session, patient_id, note_id)
    require_active_note(note)
    return note_responses(session, [note])[0]


def create_note(session: Session, patient_id: UUID, actor: User, values: NoteWrite) -> NoteResponse:
    """Commit a clinical note authored by the selected actor, rolling back any failure."""
    try:
        require_patient(session, patient_id, lock=True)
        now: datetime = session.execute(select(func.clock_timestamp())).scalar_one()
        note = Note(
            patient_id=patient_id,
            author_id=actor.id,
            title=values.title,
            timestamp=values.timestamp,
            content=values.content,
            created_at=now,
            updated_at=now,
        )
        session.add(note)
        session.flush()
        result = note_responses(session, [note])[0]
        session.commit()
        return result
    except Exception:
        session.rollback()
        raise


def update_note(
    session: Session, patient_id: UUID, note_id: UUID, actor: User, values: NoteWrite
) -> NoteResponse:
    """Replace editable fields only; author and creation time retain their identity."""
    try:
        require_patient(session, patient_id, lock=True)
        note = require_note(session, patient_id, note_id)
        require_active_note(note)
        require_note_author(note, actor)
        now: datetime = session.execute(select(func.clock_timestamp())).scalar_one()
        note.title = values.title
        note.timestamp = values.timestamp
        note.content = values.content
        note.updated_at = now
        session.flush()
        result = note_responses(session, [note])[0]
        session.commit()
        return result
    except Exception:
        session.rollback()
        raise


def delete_note(session: Session, patient_id: UUID, note_id: UUID, actor: User) -> None:
    """Commit a tombstone and remove attachment metadata, retaining linked note IDs."""
    try:
        require_patient(session, patient_id, lock=True)
        note = require_note(session, patient_id, note_id)
        if note.deleted_at is not None:
            raise AppError(status_code=404, code="note_not_found", message="Note not found.")
        require_note_author(note, actor)
        now: datetime = session.execute(select(func.clock_timestamp())).scalar_one()
        note.title = None
        note.content = None
        note.deleted_at = now
        note.deleted_by_id = actor.id
        note.updated_at = now
        session.execute(delete(NoteAttachment).where(NoteAttachment.note_id == note.id))
        session.commit()
    except Exception:
        session.rollback()
        raise


def create_attachment(
    session: Session,
    patient_id: UUID,
    note_id: UUID,
    actor: User,
    values: AttachmentCreate,
) -> AttachmentResponse:
    """Commit an external HTTPS reference; do not fetch or upload the external file."""
    try:
        require_patient(session, patient_id, lock=True)
        note = require_note(session, patient_id, note_id)
        require_active_note(note)
        require_note_author(note, actor)
        attachment = NoteAttachment(
            note_id=note_id,
            added_by_id=actor.id,
            display_name=values.display_name,
            source_url=str(values.source_url),
            media_type=values.media_type,
            source_description=values.source_description,
        )
        session.add(attachment)
        session.flush()
        result = AttachmentResponse.model_validate(attachment)
        session.commit()
        return result
    except Exception:
        session.rollback()
        raise


def delete_attachment(
    session: Session, patient_id: UUID, note_id: UUID, attachment_id: UUID, actor: User
) -> None:
    """Remove only metadata after checking the complete parent chain and ownership."""
    try:
        require_patient(session, patient_id, lock=True)
        note = require_note(session, patient_id, note_id)
        require_active_note(note)
        attachment = session.scalar(
            select(NoteAttachment).where(
                NoteAttachment.id == attachment_id, NoteAttachment.note_id == note_id
            )
        )
        if attachment is None:
            raise AppError(
                status_code=404, code="attachment_not_found", message="Attachment not found."
            )
        require_note_author(note, actor)
        session.delete(attachment)
        session.commit()
    except Exception:
        session.rollback()
        raise
