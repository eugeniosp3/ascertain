"""Global unread discussion counts for the selected viewer."""

from pydantic import BaseModel


class NotificationSummary(BaseModel):
    unread_comments: int
    patients_with_unread: int
