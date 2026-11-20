"""Patient HTTP contract; services own persistence and commits."""

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.dependencies import get_current_user, get_optional_user
from app.errors import error_responses
from app.models import User
from app.schemas.common import ErrorResponse
from app.schemas.patients import (
    PatientCreate,
    PatientDetail,
    PatientListQuery,
    PatientPage,
    PatientReplace,
)
from app.services import patients

router = APIRouter(
    prefix="/patients",
    tags=["Patients"],
    responses=error_responses(401, 422, 500, 503),
)
Database = Annotated[Session, Depends(get_session)]
OptionalActor = Annotated[User | None, Depends(get_optional_user)]
_not_found: dict[int | str, dict[str, Any]] = {
    404: {"model": ErrorResponse, "description": "Patient not found"}
}
_write_errors: dict[int | str, dict[str, Any]] = {
    **_not_found,
    409: {"model": ErrorResponse, "description": "Patient data conflict"},
}


@router.get(
    "",
    response_model=PatientPage,
    responses={
        401: {
            "model": ErrorResponse,
            "description": "Demo user required for assigned or unread filters",
        }
    },
)
def list_patients(
    query: Annotated[PatientListQuery, Query()], session: Database, actor: OptionalActor
) -> PatientPage:
    """Search names, source ID, MRN, UUID, or email; filter/sort before pagination.

    Notes/comments aliases sort the total active-note/comment counts. Null values
    always sort last and UUID breaks ties. An optional X-Demo-User-ID enables unread
    counts; unread_only=true and assigned_to=me require it. assigned_to accepts only
    `me`; omitting it keeps the shared global directory. Reading this list never
    marks comments read.
    """
    if query.unread_only or query.assigned_to == "me":
        actor = get_current_user(actor)
    return patients.list_patients(session, query, actor)


@router.get("/{patient_id}", response_model=PatientDetail, responses=_not_found)
def get_patient(patient_id: UUID, session: Database, actor: OptionalActor) -> PatientDetail:
    """Return the editable profile and typed source context, without source_record."""
    return patients.get_patient(session, patient_id, actor)


@router.post(
    "",
    response_model=PatientDetail,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"model": ErrorResponse, "description": "Patient data conflict"}},
)
def create_patient(
    payload: PatientCreate, response: Response, session: Database, actor: OptionalActor
) -> PatientDetail:
    """Create a profile assigned to the selected actor, or unassigned without an actor."""
    patient = patients.create_patient(session, payload, actor)
    response.headers["Location"] = f"/patients/{patient.id}"
    return patient


@router.put("/{patient_id}", response_model=PatientDetail, responses=_write_errors)
def replace_patient(
    patient_id: UUID, payload: PatientReplace, session: Database, actor: OptionalActor
) -> PatientDetail:
    """Replace all editable fields; every field is required, with explicit nulls allowed.

    Assignment is not writable and is preserved, whoever edits the profile.
    """
    return patients.replace_patient(session, patient_id, payload, actor)


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT, responses=_write_errors)
def delete_patient(patient_id: UUID, session: Database, _actor: OptionalActor) -> Response:
    """Permanently remove the patient and all dependent notes, comments, and read state."""
    patients.delete_patient(session, patient_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
