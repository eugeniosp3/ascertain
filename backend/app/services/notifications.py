"""Read notification counts without changing any discussion watermark."""

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.models import Comment, DiscussionRead, User
from app.schemas.notifications import NotificationSummary


def get_notification_summary(session: Session, actor: User) -> NotificationSummary:
    """Count others' creations after this viewer's cutoff; edits never re-notify."""
    unread, patients = session.execute(
        select(func.count(Comment.id), func.count(func.distinct(Comment.patient_id)))
        .select_from(Comment)
        .outerjoin(
            DiscussionRead,
            and_(
                DiscussionRead.patient_id == Comment.patient_id,
                DiscussionRead.user_id == actor.id,
            ),
        )
        .where(
            Comment.author_id != actor.id,
            or_(
                DiscussionRead.last_read_at.is_(None),
                Comment.created_at > DiscussionRead.last_read_at,
            ),
        )
    ).one()
    return NotificationSummary(unread_comments=unread, patients_with_unread=patients)
