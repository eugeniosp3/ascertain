"""Clinical note validation and external attachment metadata."""

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    StringConstraints,
    field_validator,
)

from app.models import DEFAULT_NOTE_TITLE, NOTE_CONTENT_MAX_LENGTH, NOTE_TITLE_MAX_LENGTH
from app.schemas.users import UserResponse
from app.validation import reject

NoteTitle = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=NOTE_TITLE_MAX_LENGTH)
]
NoteContent = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=NOTE_CONTENT_MAX_LENGTH)
]


def clinical_time(value: datetime) -> datetime:
    value = value.astimezone(UTC)
    if value > datetime.now(UTC):
        reject("clinical_time_in_future")
    return value


class NoteWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timestamp: Annotated[AwareDatetime, AfterValidator(clinical_time)]
    content: NoteContent
    title: NoteTitle = DEFAULT_NOTE_TITLE


class AttachmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)
    ]
    source_url: HttpUrl = Field(max_length=2048)
    media_type: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
        | None
    ) = None
    source_description: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
        | None
    ) = None

    @field_validator("source_url")
    @classmethod
    def require_https(cls, value: HttpUrl) -> HttpUrl:
        if value.scheme != "https" or value.username is not None or value.password is not None:
            reject("invalid_source_url")
        return value


class AttachmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    note_id: UUID
    added_by_id: UUID
    display_name: str
    source_url: str
    media_type: str | None
    source_description: str | None
    created_at: datetime


class NoteResponse(BaseModel):
    id: UUID
    patient_id: UUID
    title: str
    timestamp: datetime
    content: str
    author: UserResponse
    created_at: datetime
    updated_at: datetime
    attachments: list[AttachmentResponse]
