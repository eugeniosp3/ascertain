"""Patient clinical notes and author-owned HTTPS attachment metadata."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db import get_session
from app.dependencies import get_current_user, get_optional_user
from app.errors import error_responses
from app.models import User
from app.schemas.notes import AttachmentCreate, AttachmentResponse, NoteResponse, NoteWrite
from app.services import notes

router = APIRouter(
    prefix="/patients/{patient_id}/notes",
    tags=["Notes"],
    responses=error_responses(401, 404, 422, 500, 503),
)


@router.get("", response_model=list[NoteResponse])
def list_notes(
    patient_id: UUID,
    session: Annotated[Session, Depends(get_session)],
    _viewer: Annotated[User | None, Depends(get_optional_user)],
) -> list[NoteResponse]:
    return notes.list_notes(session, patient_id)


@router.post("", response_model=NoteResponse, status_code=201)
def create_note(
    patient_id: UUID,
    values: NoteWrite,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
    actor: Annotated[User, Depends(get_current_user)],
) -> NoteResponse:
    result = notes.create_note(session, patient_id, actor, values)
    response.headers["Location"] = f"/patients/{patient_id}/notes/{result.id}"
    return result


@router.get("/{note_id}", response_model=NoteResponse, responses=error_responses(410))
def get_note(
    patient_id: UUID,
    note_id: UUID,
    session: Annotated[Session, Depends(get_session)],
    _viewer: Annotated[User | None, Depends(get_optional_user)],
) -> NoteResponse:
    return notes.get_note(session, patient_id, note_id)


@router.put("/{note_id}", response_model=NoteResponse, responses=error_responses(403, 410))
def update_note(
    patient_id: UUID,
    note_id: UUID,
    values: NoteWrite,
    session: Annotated[Session, Depends(get_session)],
    actor: Annotated[User, Depends(get_current_user)],
) -> NoteResponse:
    return notes.update_note(session, patient_id, note_id, actor, values)


@router.delete("/{note_id}", status_code=204, responses=error_responses(403))
def delete_note(
    patient_id: UUID,
    note_id: UUID,
    session: Annotated[Session, Depends(get_session)],
    actor: Annotated[User, Depends(get_current_user)],
) -> Response:
    notes.delete_note(session, patient_id, note_id, actor)
    return Response(status_code=204)


@router.post(
    "/{note_id}/attachments",
    response_model=AttachmentResponse,
    status_code=201,
    responses=error_responses(403, 410),
)
def create_attachment(
    patient_id: UUID,
    note_id: UUID,
    values: AttachmentCreate,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
    actor: Annotated[User, Depends(get_current_user)],
) -> AttachmentResponse:
    result = notes.create_attachment(session, patient_id, note_id, actor, values)
    response.headers["Location"] = f"/patients/{patient_id}/notes/{note_id}/attachments/{result.id}"
    return result


@router.delete(
    "/{note_id}/attachments/{attachment_id}",
    status_code=204,
    responses=error_responses(403, 410),
)
def delete_attachment(
    patient_id: UUID,
    note_id: UUID,
    attachment_id: UUID,
    session: Annotated[Session, Depends(get_session)],
    actor: Annotated[User, Depends(get_current_user)],
) -> Response:
    notes.delete_attachment(session, patient_id, note_id, attachment_id, actor)
    return Response(status_code=204)
