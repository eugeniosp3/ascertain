"""Atomic discussion edits and explicit, monotonic per-viewer read watermarks."""

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, func, select, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import Comment, CommentNoteLink, DiscussionRead, Note, User
from app.schemas.comments import (
    CommentCursor,
    CommentPage,
    CommentResponse,
    CommentWrite,
    DiscussionReadResponse,
    NoteLinkResponse,
)
from app.schemas.users import UserResponse
from app.services.notes import require_patient


def comment_responses(
    session: Session, comments: Sequence[Comment], *, viewer: User | None = None
) -> list[CommentResponse]:
    """Batch-read authors, links, and viewer watermarks without changing read state."""
    if not comments:
        return []
    watermarks: dict[UUID, datetime] = {}
    if viewer is not None:
        watermarks = {
            patient_id: last_read_at
            for patient_id, last_read_at in session.execute(
                select(DiscussionRead.patient_id, DiscussionRead.last_read_at).where(
                    DiscussionRead.user_id == viewer.id,
                    DiscussionRead.patient_id.in_({comment.patient_id for comment in comments}),
                )
            )
        }
    authors = {
        user.id: UserResponse.model_validate(user)
        for user in session.scalars(
            select(User).where(User.id.in_({c.author_id for c in comments}))
        )
    }
    links: dict[UUID, list[NoteLinkResponse]] = {comment.id: [] for comment in comments}
    rows = session.execute(
        select(CommentNoteLink.comment_id, Note)
        .join(Note, Note.id == CommentNoteLink.note_id)
        .where(CommentNoteLink.comment_id.in_(links))
        .order_by(Note.timestamp.desc(), Note.id.desc())
    )
    for comment_id, note in rows:
        deleted = note.deleted_at is not None
        title = "Deleted note" if deleted else (note.title or "Clinical note")
        links[comment_id].append(
            NoteLinkResponse(
                id=note.id,
                title=title,
                label=title if deleted else f"{title} · {note.timestamp.astimezone(UTC):%Y-%m-%d}",
                timestamp=note.timestamp,
                url=f"/patients/{note.patient_id}/notes/{note.id}",
                is_deleted=deleted,
            )
        )
    return [
        CommentResponse(
            id=comment.id,
            patient_id=comment.patient_id,
            body=comment.body,
            author=authors[comment.author_id],
            created_at=comment.created_at,
            updated_at=comment.updated_at,
            is_unread=(
                viewer is not None
                and comment.author_id != viewer.id
                and (
                    comment.patient_id not in watermarks
                    or comment.created_at > watermarks[comment.patient_id]
                )
            ),
            note_links=links[comment.id],
        )
        for comment in comments
    ]


def list_comments(
    session: Session,
    patient_id: UUID,
    *,
    page: int,
    page_size: int,
    cursor: str | None = None,
    viewer: User | None = None,
) -> CommentPage:
    """Read a chronological prefix using a stable cursor; take no read-state action.

    The parent lock serializes comment creation with the cutoff. An in-flight
    insert cannot later commit a timestamp older than this snapshot. A cursor
    retains that cutoff and resumes strictly after (created_at, id), even if a
    previously loaded comment was deleted. It supplies the response page number;
    the page argument is ignored when a cursor is present. Page size may change.
    Only page 1 and its cursor chain can safely advance a read acknowledgment.
    """
    require_patient(session, patient_id, lock=True)
    now: datetime = session.execute(select(func.clock_timestamp())).scalar_one()
    continuation = CommentCursor.decode(cursor) if cursor is not None else None
    if continuation is not None and (
        continuation.patient_id != patient_id or continuation.snapshot_at > now
    ):
        raise AppError(
            status_code=422, code="invalid_discussion_cursor", message="Invalid discussion cursor."
        )
    cutoff = continuation.snapshot_at if continuation is not None else now
    predicate = (Comment.patient_id == patient_id, Comment.created_at <= cutoff)
    total = session.scalar(select(func.count()).select_from(Comment).where(*predicate)) or 0
    query = select(Comment).where(*predicate).order_by(Comment.created_at, Comment.id)
    reliable_prefix = continuation is not None or page == 1
    if continuation is not None:
        page = continuation.page
        query = query.where(
            tuple_(Comment.created_at, Comment.id)
            > tuple_(continuation.after_created_at, continuation.after_id)
        )
    else:
        offset = (page - 1) * page_size
        # Compare in Python before binding an arbitrarily large integer as SQL OFFSET.
        if offset >= total:
            return CommentPage(
                items=[],
                total=total,
                page=page,
                page_size=page_size,
                read_through=cutoff if page == 1 else datetime.min.replace(tzinfo=UTC),
            )
        query = query.offset(offset)
    rows = session.scalars(query.limit(page_size + 1)).all()
    comments = rows[:page_size]
    more = len(rows) > page_size
    # Timestamp watermarks cannot distinguish equal timestamps. Leave that group
    # unread until the page containing its final member has been fetched.
    through = cutoff
    next_cursor = None
    if not reliable_prefix:
        through = datetime.min.replace(tzinfo=UTC)
    elif more:
        boundary = comments[-1].created_at
        through = (
            boundary - timedelta(microseconds=1) if rows[-1].created_at == boundary else boundary
        )
        next_cursor = CommentCursor(
            patient_id=patient_id,
            snapshot_at=cutoff,
            after_created_at=boundary,
            after_id=comments[-1].id,
            page=page + 1,
        ).encode()
    return CommentPage(
        items=comment_responses(session, comments, viewer=viewer),
        total=total,
        page=page,
        page_size=page_size,
        read_through=through,
        next_cursor=next_cursor,
    )


def require_comment(session: Session, patient_id: UUID, comment_id: UUID) -> Comment:
    comment = session.scalar(
        select(Comment).where(Comment.id == comment_id, Comment.patient_id == patient_id)
    )
    if comment is None:
        raise AppError(status_code=404, code="comment_not_found", message="Comment not found.")
    return comment


def require_comment_author(comment: Comment, actor: User) -> None:
    if comment.author_id != actor.id:
        raise AppError(
            status_code=403,
            code="comment_author_required",
            message="Only the comment author may change it.",
        )


def validate_note_ids(
    session: Session, patient_id: UUID, note_ids: list[UUID], *, existing: set[UUID]
) -> None:
    """Validate the entire replacement before writing; retained tombstones are allowed."""
    notes = session.scalars(
        select(Note).where(Note.id.in_(note_ids), Note.patient_id == patient_id)
    ).all()
    if len(notes) != len(note_ids) or any(
        note.deleted_at is not None and note.id not in existing for note in notes
    ):
        raise AppError(
            status_code=422,
            code="invalid_note_reference",
            message="Linked notes must be active notes belonging to this patient.",
        )


def create_comment(
    session: Session, patient_id: UUID, actor: User, values: CommentWrite
) -> CommentResponse:
    """Commit the comment and all references together, deriving its author from actor."""
    try:
        require_patient(session, patient_id, lock=True)
        validate_note_ids(session, patient_id, values.note_ids, existing=set())
        now: datetime = session.execute(select(func.clock_timestamp())).scalar_one()
        comment = Comment(
            patient_id=patient_id,
            author_id=actor.id,
            body=values.body,
            created_at=now,
            updated_at=now,
        )
        session.add(comment)
        session.flush()
        session.add_all(
            CommentNoteLink(patient_id=patient_id, comment_id=comment.id, note_id=note_id)
            for note_id in values.note_ids
        )
        session.flush()
        result = comment_responses(session, [comment], viewer=actor)[0]
        session.commit()
        return result
    except Exception:
        session.rollback()
        raise


def update_comment(
    session: Session, patient_id: UUID, comment_id: UUID, actor: User, values: CommentWrite
) -> CommentResponse:
    """Replace body/links atomically while preserving original authorship and creation."""
    try:
        require_patient(session, patient_id, lock=True)
        comment = require_comment(session, patient_id, comment_id)
        require_comment_author(comment, actor)
        existing = set(
            session.scalars(
                select(CommentNoteLink.note_id).where(CommentNoteLink.comment_id == comment_id)
            )
        )
        validate_note_ids(session, patient_id, values.note_ids, existing=existing)
        now: datetime = session.execute(select(func.clock_timestamp())).scalar_one()
        comment.body = values.body
        comment.updated_at = now
        session.execute(delete(CommentNoteLink).where(CommentNoteLink.comment_id == comment_id))
        session.add_all(
            CommentNoteLink(patient_id=patient_id, comment_id=comment_id, note_id=note_id)
            for note_id in values.note_ids
        )
        session.flush()
        result = comment_responses(session, [comment], viewer=actor)[0]
        session.commit()
        return result
    except Exception:
        session.rollback()
        raise


def delete_comment(session: Session, patient_id: UUID, comment_id: UUID, actor: User) -> None:
    """Commit physical discussion/link removal after parent and author checks."""
    try:
        require_patient(session, patient_id, lock=True)
        comment = require_comment(session, patient_id, comment_id)
        require_comment_author(comment, actor)
        session.execute(delete(CommentNoteLink).where(CommentNoteLink.comment_id == comment_id))
        session.delete(comment)
        session.commit()
    except Exception:
        session.rollback()
        raise


def mark_discussion_read(
    session: Session, patient_id: UUID, actor: User, through: datetime
) -> DiscussionReadResponse:
    """Commit a bounded monotonic watermark using an atomic PostgreSQL upsert."""
    try:
        require_patient(session, patient_id, lock=True)
        now: datetime = session.execute(select(func.clock_timestamp())).scalar_one()
        through = min(through, now)
        statement = insert(DiscussionRead).values(
            user_id=actor.id, patient_id=patient_id, last_read_at=through
        )
        last_read = session.execute(
            statement.on_conflict_do_update(
                index_elements=[DiscussionRead.user_id, DiscussionRead.patient_id],
                set_={
                    "last_read_at": func.greatest(
                        DiscussionRead.last_read_at, statement.excluded.last_read_at
                    ),
                    "updated_at": now,
                },
            ).returning(DiscussionRead.last_read_at)
        ).scalar_one()
        result = DiscussionReadResponse(patient_id=patient_id, last_read_at=last_read)
        session.commit()
        return result
    except Exception:
        session.rollback()
        raise
