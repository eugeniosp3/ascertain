"""Patient discussion with explicit author and read-acknowledgment boundaries."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.db import get_session
from app.dependencies import get_current_user, get_optional_user
from app.models import User
from app.schemas.comments import (
    CommentCursorToken,
    CommentPage,
    CommentResponse,
    CommentWrite,
    DiscussionReadResponse,
    DiscussionReadWrite,
)
from app.services import comments

router = APIRouter(prefix="/patients/{patient_id}/comments", tags=["Comments"])


@router.get("", response_model=CommentPage)
def list_comments(
    patient_id: UUID,
    session: Annotated[Session, Depends(get_session)],
    _viewer: Annotated[User | None, Depends(get_optional_user)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: Annotated[CommentCursorToken | None, Query()] = None,
) -> CommentPage:
    """Return oldest first; follow next_cursor for reliable read acknowledgments.

    Start at page 1, then pass each next_cursor as cursor until it is null.
    Display each page before acknowledging its read_through. A cursor preserves
    the initial snapshot and supplies the response page number (page is ignored).
    Legacy offset pages after page 1 return a nonadvancing minimum read_through
    and no next_cursor. They cannot prove that a contiguous prefix was displayed.
    """
    return comments.list_comments(
        session, patient_id, page=page, page_size=page_size, cursor=cursor
    )


@router.post("", response_model=CommentResponse, status_code=201)
def create_comment(
    patient_id: UUID,
    values: CommentWrite,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
    actor: Annotated[User, Depends(get_current_user)],
) -> CommentResponse:
    result = comments.create_comment(session, patient_id, actor, values)
    response.headers["Location"] = f"/patients/{patient_id}/comments/{result.id}"
    return result


@router.post("/read", response_model=DiscussionReadResponse)
def mark_discussion_read(
    patient_id: UUID,
    values: DiscussionReadWrite,
    session: Annotated[Session, Depends(get_session)],
    actor: Annotated[User, Depends(get_current_user)],
) -> DiscussionReadResponse:
    return comments.mark_discussion_read(session, patient_id, actor, values.through)


@router.put("/{comment_id}", response_model=CommentResponse)
def update_comment(
    patient_id: UUID,
    comment_id: UUID,
    values: CommentWrite,
    session: Annotated[Session, Depends(get_session)],
    actor: Annotated[User, Depends(get_current_user)],
) -> CommentResponse:
    return comments.update_comment(session, patient_id, comment_id, actor, values)


@router.delete("/{comment_id}", status_code=204)
def delete_comment(
    patient_id: UUID,
    comment_id: UUID,
    session: Annotated[Session, Depends(get_session)],
    actor: Annotated[User, Depends(get_current_user)],
) -> Response:
    comments.delete_comment(session, patient_id, comment_id, actor)
    return Response(status_code=204)
