"""Resolve synthetic demo identities; these headers are not production authentication."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from app.db import get_session
from app.errors import AppError
from app.models import User

DEMO_USER_HEADER_HELP = (
    "Demo identity, not authentication: an active user id from GET /users. "
    "An unknown or inactive id returns 401 invalid_demo_user. Required "
    "(401 demo_user_required when missing) for note, attachment and comment writes, "
    "marking discussion read, the notification summary, unread_only=true, "
    "assigned_to=me and scope=assigned. Optional elsewhere: it personalizes unread "
    "counts, and POST /patients assigns the new patient to this user."
)


def require_demo_mode(request: Request) -> None:
    """Fail closed until a configured authentication mechanism is available."""
    settings = getattr(request.app.state, "settings", None)
    if settings is None or getattr(settings, "demo_mode", False) is not True:
        raise AppError(
            status_code=503,
            code="demo_mode_disabled",
            message="Demo identity is disabled; authentication is not configured.",
        )


def get_optional_user(
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    demo_user_id: Annotated[
        str | None, Header(alias="X-Demo-User-ID", description=DEMO_USER_HEADER_HELP)
    ] = None,
) -> User | None:
    """Return an active known actor, or None only when the header is absent."""
    require_demo_mode(request)
    if demo_user_id is None:
        return None
    try:
        actor_id = UUID(demo_user_id)
    except ValueError:
        actor_id = None
    user = session.get(User, actor_id) if actor_id is not None else None
    if user is None or not user.is_active:
        raise AppError(
            status_code=401,
            code="invalid_demo_user",
            message="Select an active demo user.",
        )
    return user


def get_current_user(user: Annotated[User | None, Depends(get_optional_user)]) -> User:
    """Require the caller to select an active demo identity for this operation."""
    if user is None:
        raise AppError(
            status_code=401,
            code="demo_user_required",
            message="Select an active demo user.",
        )
    return user
