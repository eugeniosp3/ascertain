"""Patient queries and transactional profile changes using synchronous SQLAlchemy.

Read operations never commit. Each mutation owns the existing request transaction,
commits before returning, and rolls back every failure, including constraint errors.
"""

from datetime import date, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import String, and_, cast, func, literal, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, defer, load_only
from sqlalchemy.sql.elements import ColumnElement

from app.errors import AppError
from app.models import Comment, DiscussionRead, Note, Patient, User
from app.schemas.patients import (
    PatientCreate,
    PatientDetail,
    PatientListItem,
    PatientListQuery,
    PatientPage,
    PatientReplace,
)
from app.utils import dates


def patient_name(patient: Patient) -> str:
    """Build a display name from current profile fields without altering the record."""
    return " ".join(
        part for part in (patient.first_name, patient.middle_initial, patient.last_name) if part
    )


def require_patient(session: Session, patient_id: UUID) -> Patient:
    """Read one profile or raise a safe 404; do not load its original source row."""
    patient = session.scalar(
        select(Patient).options(defer(Patient.source_record)).where(Patient.id == patient_id)
    )
    if patient is None:
        raise AppError(status_code=404, code="patient_not_found", message="Patient not found.")
    return patient


def _counts(
    actor_id: UUID | None,
) -> tuple[ColumnElement[int], ColumnElement[int], ColumnElement[int]]:
    """Correlated scalar counts avoid multiplying rows when a patient has many children."""
    notes = (
        select(func.count(Note.id))
        .where(Note.patient_id == Patient.id, Note.deleted_at.is_(None))
        .correlate(Patient)
        .scalar_subquery()
    )
    comments = (
        select(func.count(Comment.id))
        .where(Comment.patient_id == Patient.id)
        .correlate(Patient)
        .scalar_subquery()
    )
    unread: ColumnElement[int] = literal(0)
    if actor_id is not None:
        unread = (
            select(func.count(Comment.id))
            .outerjoin(
                DiscussionRead,
                and_(
                    DiscussionRead.patient_id == Comment.patient_id,
                    DiscussionRead.user_id == actor_id,
                ),
            )
            .where(
                Comment.patient_id == Patient.id,
                Comment.author_id != actor_id,
                or_(
                    DiscussionRead.last_read_at.is_(None),
                    Comment.created_at > DiscussionRead.last_read_at,
                ),
            )
            .correlate(Patient)
            .scalar_subquery()
        )
    return notes, comments, unread


def _list_item(
    patient: Patient,
    notes_count: int,
    comments_count: int,
    unread_comments_count: int,
    today: date,
) -> PatientListItem:
    return PatientListItem.model_validate(
        {
            "id": patient.id,
            "assigned_user_id": patient.assigned_user_id,
            "source_patient_id": patient.source_patient_id,
            "mrn": patient.mrn,
            "first_name": patient.first_name,
            "last_name": patient.last_name,
            "name": patient_name(patient),
            "date_of_birth": patient.date_of_birth,
            "age": dates.calculate_age(patient.date_of_birth, today),
            "last_visit": patient.last_visit,
            "status": patient.status,
            "conditions": patient.conditions,
            "notes_count": notes_count,
            "comments_count": comments_count,
            "unread_comments_count": unread_comments_count,
        }
    )


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")


def list_patients(
    session: Session, query: PatientListQuery, actor: User | None = None
) -> PatientPage:
    """Search and sort the selected cohort, count filtered rows, then select one page.

    Search treats LIKE metacharacters literally and includes first/last/full names,
    email, source ID, MRN, and application UUID. Unread means another author's
    comment created strictly after this actor's last read; edits do not make it new.
    Missing read state means all other-author comments are unread. Reads do not mark
    discussions read. Without an actor unread counts are zero; unread_only needs one.
    assigned_to=me needs one too and narrows the cohort before every other filter, the
    total, sorting, and pagination. Omitting it keeps the shared all-patient directory.
    """
    if query.unread_only and actor is None:
        raise AppError(
            status_code=401,
            code="demo_user_required",
            message="Select a demo user to view unread conversations.",
        )
    filters: list[ColumnElement[bool]] = []
    if query.assigned_to == "me":
        if actor is None:
            raise AppError(
                status_code=401,
                code="demo_user_required",
                message="Select an active demo user to view assigned patients.",
            )
        filters.append(Patient.assigned_user_id == actor.id)
    notes, comments, unread = _counts(actor.id if actor is not None else None)
    if query.q:
        pattern = f"%{_escape_like(query.q)}%"
        fields = (
            Patient.first_name,
            Patient.last_name,
            func.concat_ws(" ", Patient.first_name, Patient.last_name),
            func.concat_ws(" ", Patient.first_name, Patient.middle_initial, Patient.last_name),
            Patient.email,
            Patient.source_patient_id,
            Patient.mrn,
            cast(Patient.id, String),
        )
        filters.append(or_(*(field.ilike(pattern, escape="\\") for field in fields)))
    if query.status is not None:
        filters.append(Patient.status == query.status)
    if query.unread_only:
        filters.append(unread > 0)

    total = session.scalar(select(func.count()).select_from(Patient).where(*filters)) or 0
    if query.offset >= total:
        return PatientPage(items=[], total=total, page=query.page, page_size=query.page_size)
    ordering: tuple[ColumnElement[Any], ...]
    if query.sort_by == "name":
        last = func.lower(Patient.last_name)
        first = func.lower(Patient.first_name)
        ordering = (
            last.desc().nulls_last() if query.order == "desc" else last.asc().nulls_last(),
            first.desc().nulls_last() if query.order == "desc" else first.asc().nulls_last(),
        )
    else:
        # Only these expressions can become SQL ordering; caller text is never SQL.
        columns = {
            "dob": Patient.date_of_birth,
            "last_visit": Patient.last_visit,
            "status": Patient.status,
            "notes_count": notes,
            "notes": notes,
            "comments_count": comments,
            "comments": comments,
        }
        column = columns[query.sort_by]
        ordered = column.desc() if query.order == "desc" else column.asc()
        ordering = (ordered.nulls_last(),)
    rows = session.execute(
        select(Patient, notes, comments, unread)
        .options(
            load_only(
                Patient.id,
                Patient.assigned_user_id,
                Patient.source_patient_id,
                Patient.mrn,
                Patient.first_name,
                Patient.middle_initial,
                Patient.last_name,
                Patient.date_of_birth,
                Patient.last_visit,
                Patient.status,
                Patient.conditions,
            )
        )
        .where(*filters)
        .order_by(*ordering, Patient.id.asc())
        .offset(query.offset)
        .limit(query.page_size)
    )
    today = dates.utc_today()
    return PatientPage(
        items=[_list_item(patient, n, c, u, today) for patient, n, c, u in rows],
        total=total,
        page=query.page,
        page_size=query.page_size,
    )


def get_patient(session: Session, patient_id: UUID, actor: User | None = None) -> PatientDetail:
    """Read a current profile with typed source context, omitting the full source row."""
    patient = require_patient(session, patient_id)
    notes, comments, unread = _counts(actor.id if actor is not None else None)
    n, c, u = session.execute(select(notes, comments, unread).where(Patient.id == patient_id)).one()
    item = _list_item(patient, n, c, u, dates.utc_today())
    return PatientDetail.model_validate(
        {
            **item.model_dump(),
            **{
                field: getattr(patient, field)
                for field in (
                    "middle_initial",
                    "phone",
                    "email",
                    "address_line1",
                    "address_line2",
                    "city",
                    "state",
                    "postal_code",
                    "blood_type",
                    "allergies",
                    "allergy_status",
                    "profile_details",
                    "source_lineage",
                    "source_created_at",
                    "source_updated_at",
                    "created_at",
                    "updated_at",
                )
            },
        }
    )


def _constraint_error(error: IntegrityError) -> AppError:
    """Map known PostgreSQL constraints without exposing SQL or submitted values."""
    constraint = getattr(getattr(error.orig, "diag", None), "constraint_name", None)
    sqlstate = getattr(error.orig, "sqlstate", None)
    if constraint in {"patients_pkey", "patients_mrn_key", "patients_source_patient_id_key"}:
        return AppError(
            status_code=409,
            code="patient_conflict",
            message="The patient change conflicts with an existing record.",
        )
    if constraint == "patients_assigned_user_id_fkey":
        # Only a create assigns; its actor row disappeared after identity resolution.
        return AppError(
            status_code=401,
            code="invalid_demo_user",
            message="Select an active demo user.",
        )
    if sqlstate == "23502" or constraint in {
        "patients_names",
        "patients_status",
        "patients_blood_type",
        "patients_allergy_status",
        "patients_medical_arrays",
        "patients_allergy_consistency",
    }:
        return AppError(
            status_code=422,
            code="invalid_patient",
            message="The patient profile does not satisfy the required constraints.",
        )
    return AppError(
        status_code=500,
        code="internal_server_error",
        message="An unexpected error occurred.",
    )


def create_patient(
    session: Session, payload: PatientCreate, actor: User | None = None
) -> PatientDetail:
    """Commit a profile with server-owned assignment to the selected actor, if any.

    The payload cannot carry assignment: its schema forbids unknown fields, so the
    selected actor (or null without one) is the only source of the initial owner.
    """
    try:
        patient = Patient(
            id=uuid4(),
            assigned_user_id=actor.id if actor is not None else None,
            **payload.model_dump(mode="python"),
        )
        session.add(patient)
        session.flush()
        response = get_patient(session, patient.id, actor)
        session.commit()
        return response
    except IntegrityError as error:
        session.rollback()
        raise _constraint_error(error) from None
    except Exception:
        session.rollback()
        raise


def replace_patient(
    session: Session, patient_id: UUID, payload: PatientReplace, actor: User | None = None
) -> PatientDetail:
    """Replace editable values and commit, preserving assignment and import provenance.

    Only the 17 editable fields are written, so neither the editor nor an anonymous
    caller changes who the patient is assigned to.
    """
    try:
        patient = require_patient(session, patient_id)
        edited_at: datetime = session.execute(select(func.clock_timestamp())).scalar_one()
        for field, value in payload.model_dump(mode="python").items():
            setattr(patient, field, value)
        patient.updated_at = edited_at
        session.flush()
        response = get_patient(session, patient_id, actor)
        session.commit()
        return response
    except IntegrityError as error:
        session.rollback()
        raise _constraint_error(error) from None
    except Exception:
        session.rollback()
        raise


def delete_patient(session: Session, patient_id: UUID) -> None:
    """Delete and commit one profile; database cascades remove every dependent row."""
    try:
        patient = require_patient(session, patient_id)
        session.delete(patient)
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise _constraint_error(error) from None
    except Exception:
        session.rollback()
        raise
