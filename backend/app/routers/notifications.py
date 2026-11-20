"""Global unread discussion counters."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_session
from app.dependencies import get_current_user
from app.errors import error_responses
from app.models import User
from app.schemas.notifications import NotificationSummary
from app.services import notifications

router = APIRouter(tags=["Notifications"], responses=error_responses(401, 422, 500, 503))


@router.get("/notifications/summary", response_model=NotificationSummary)
def get_notification_summary(
    session: Annotated[Session, Depends(get_session)],
    actor: Annotated[User, Depends(get_current_user)],
) -> NotificationSummary:
    return notifications.get_notification_summary(session, actor)
