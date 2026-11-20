"""Plain discussion text, explicit clinical note references, and read cursors."""

from base64 import b64decode, urlsafe_b64encode
from datetime import UTC, datetime
from typing import Annotated, Self
from uuid import UUID

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.models import COMMENT_BODY_MAX_LENGTH
from app.schemas.users import UserResponse
from app.validation import reject


class CommentCursor(BaseModel):
    """Internal payload of an opaque, patient-bound chronological continuation."""

    model_config = ConfigDict(extra="forbid")

    patient_id: UUID
    snapshot_at: AwareDatetime
    after_created_at: AwareDatetime
    after_id: UUID
    page: int = Field(ge=2)

    @model_validator(mode="after")
    def position_within_snapshot(self) -> Self:
        if self.after_created_at > self.snapshot_at:
            raise ValueError("Cursor position must be within its snapshot.")
        return self

    def encode(self) -> str:
        return urlsafe_b64encode(self.model_dump_json().encode()).decode().rstrip("=")

    @classmethod
    def decode(cls, value: str) -> Self:
        try:
            payload = b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)
            return cls.model_validate_json(payload)
        except ValueError:
            raise ValueError("Invalid discussion cursor.") from None


def _validate_cursor(value: str) -> str:
    try:
        CommentCursor.decode(value)
    except ValueError:
        reject("invalid_discussion_cursor")
    return value


CommentCursorToken = Annotated[
    str,
    StringConstraints(min_length=1, max_length=1024),
    AfterValidator(_validate_cursor),
]


class CommentWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=COMMENT_BODY_MAX_LENGTH),
    ]
    note_ids: list[UUID] = Field(default_factory=list, max_length=100)

    @field_validator("note_ids")
    @classmethod
    def distinct_note_ids(cls, values: list[UUID]) -> list[UUID]:
        if len(set(values)) != len(values):
            reject("duplicate_note_reference")
        return values


class NoteLinkResponse(BaseModel):
    id: UUID
    title: str
    label: str
    timestamp: datetime
    url: str
    is_deleted: bool


class CommentResponse(BaseModel):
    id: UUID
    patient_id: UUID
    body: str
    author: UserResponse
    created_at: datetime
    updated_at: datetime
    is_unread: bool
    note_links: list[NoteLinkResponse]


class CommentPage(BaseModel):
    """Oldest first; follow next_cursor for reliable read acknowledgments.

    Cursor continuations retain the first page's snapshot and survive deletions.
    Legacy offset pages after page 1 have a nonadvancing minimum read_through
    and no continuation. Total counts surviving comments within the snapshot.
    """

    items: list[CommentResponse]
    total: int
    page: int
    page_size: int
    read_through: datetime
    next_cursor: str | None = None


class DiscussionReadWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    through: AwareDatetime

    @field_validator("through")
    @classmethod
    def utc_cutoff(cls, value: datetime) -> datetime:
        """Require a timezone; the service clamps against the database clock."""
        return value.astimezone(UTC)


class DiscussionReadResponse(BaseModel):
    patient_id: UUID
    last_read_at: datetime
