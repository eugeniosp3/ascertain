"""PostgreSQL application tables: patients, users, clinical notes, discussion, seed markers,
and stored patient summaries.

See ``docs/MODEL_CONTRACT.md`` for the exact names other modules rely on and
``docs/DATA_MODEL.md`` for the design rationale and the complete 76-field source mapping.
Constraint names are explicit so services can map integrity errors and migrations stay
reviewable.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    CHAR,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKeyConstraint,
    Index,
    PrimaryKeyConstraint,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, MappedColumn, mapped_column, relationship

from app.db import Base
from app.schemas.patient_details import (
    ALLERGY_STATUSES,
    BLOOD_TYPES,
    NOTE_SOURCE_TYPES,
    PATIENT_STATUSES,
)

DEFAULT_PATIENT_STATUS = "active"
DEFAULT_ALLERGY_STATUS = "unknown"
DEFAULT_NOTE_TITLE = "Clinical note"
NOTE_TITLE_MAX_LENGTH = 80
NOTE_CONTENT_MAX_LENGTH = 20_000
COMMENT_BODY_MAX_LENGTH = 10_000
DISPLAY_NAME_MAX_LENGTH = 120
DISPLAY_ROLE_MAX_LENGTH = 80
SOURCE_URL_MAX_LENGTH = 2048

# Seeded patients get a stable application UUID from the source key, independent of the data
# pipeline's file checksums and stage UUIDs. API-created patients get a random UUID.
PATIENT_ID_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "ascertain:backend:patient:v1")


def seeded_patient_id(source_patient_id: str) -> uuid.UUID:
    """Application UUID for an imported patient, e.g. ``seeded_patient_id("PT-0001")``."""
    return uuid.uuid5(PATIENT_ID_NAMESPACE, source_patient_id)


# Columns that are either all null (API-created patient) or all set (imported patient).
SOURCE_PROVENANCE_COLUMNS = (
    "source_patient_id",
    "seed_run_id",
    "source_lineage",
    "source_record",
    "profile_details",
    "source_created_at",
    "source_updated_at",
)


def _one_of(column: str, values: Iterable[str]) -> str:
    """SQL ``IN`` list built from module constants (never from user input)."""
    return f"{column} IN ({', '.join(repr(value) for value in values)})"


def _not_blank(column: str) -> str:
    return f"{column} ~ '[^[:space:]]'"


def _all_or_none(columns: Iterable[str]) -> str:
    names = tuple(columns)
    all_null = " AND ".join(f"{name} IS NULL" for name in names)
    all_set = " AND ".join(f"{name} IS NOT NULL" for name in names)
    return f"({all_null}) OR ({all_set})"


def _uuid_pk() -> MappedColumn[uuid.UUID]:
    return mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )


def _created_at() -> MappedColumn[datetime]:
    return mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


def _updated_at() -> MappedColumn[datetime]:
    return mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class SeedRun(Base):
    """A completed, versioned import, committed atomically with the rows it describes."""

    __tablename__ = "seed_runs"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="seed_runs_pkey"),
        UniqueConstraint("dataset_key", name="seed_runs_dataset_key_key"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    dataset_key: Mapped[str] = mapped_column(Text, nullable=False)
    dataset_date: Mapped[date] = mapped_column(Date, nullable=False)
    source_hashes: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    export_manifest: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    row_counts: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    patients: Mapped[list[Patient]] = relationship(viewonly=True)


class User(Base):
    """An application actor who authors notes and comments. Deactivate; never delete."""

    __tablename__ = "users"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="users_pkey"),
        CheckConstraint(_not_blank("display_name"), name="users_display_name"),
        CheckConstraint(
            f"display_role IS NULL OR {_not_blank('display_role')}", name="users_display_role"
        ),
        CheckConstraint("updated_at >= created_at", name="users_timestamps"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    display_name: Mapped[str] = mapped_column(String(DISPLAY_NAME_MAX_LENGTH), nullable=False)
    display_role: Mapped[str | None] = mapped_column(String(DISPLAY_ROLE_MAX_LENGTH))
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()


class Patient(Base):
    """An editable patient profile, optionally carrying read-only imported source context."""

    __tablename__ = "patients"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="patients_pkey"),
        UniqueConstraint("source_patient_id", name="patients_source_patient_id_key"),
        UniqueConstraint("mrn", name="patients_mrn_key"),
        ForeignKeyConstraint(
            ["seed_run_id"],
            ["seed_runs.id"],
            name="patients_seed_run_id_fkey",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["assigned_user_id"],
            ["users.id"],
            name="patients_assigned_user_id_fkey",
            ondelete="SET NULL",
        ),
        CheckConstraint(
            f"{_not_blank('first_name')} AND {_not_blank('last_name')}", name="patients_names"
        ),
        CheckConstraint(_one_of("status", PATIENT_STATUSES), name="patients_status"),
        CheckConstraint(
            f"blood_type IS NULL OR {_one_of('blood_type', BLOOD_TYPES)}",
            name="patients_blood_type",
        ),
        CheckConstraint(
            _one_of("allergy_status", ALLERGY_STATUSES), name="patients_allergy_status"
        ),
        CheckConstraint(
            "jsonb_typeof(conditions) = 'array' AND jsonb_typeof(allergies) = 'array'",
            name="patients_medical_arrays",
        ),
        CheckConstraint(
            "(allergy_status = 'reported') = (jsonb_array_length(allergies) > 0)",
            name="patients_allergy_consistency",
        ),
        CheckConstraint(
            f"({_all_or_none(SOURCE_PROVENANCE_COLUMNS)})"
            " AND (source_patient_id IS NULL OR (jsonb_typeof(source_lineage) = 'object'"
            " AND jsonb_typeof(source_record) = 'object'"
            " AND jsonb_typeof(profile_details) = 'object'))",
            name="patients_source_provenance",
        ),
        CheckConstraint("updated_at >= created_at", name="patients_timestamps"),
        Index("ix_patients_name", "last_name", "first_name", "id"),
        Index("ix_patients_status", "status", "id"),
        Index("ix_patients_last_visit", "last_visit", "id"),
        Index("ix_patients_date_of_birth", "date_of_birth", "id"),
        Index("ix_patients_assigned_user_id", "assigned_user_id", "id"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()

    # Workload membership only. The directory and CRUD access remain shared.
    assigned_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)

    # Editable profile.
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    middle_initial: Mapped[str | None] = mapped_column(String(1))
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    date_of_birth: Mapped[date] = mapped_column(Date, nullable=False)
    phone: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(254))
    address_line1: Mapped[str | None] = mapped_column(String(255))
    address_line2: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(100))
    state: Mapped[str | None] = mapped_column(String(2))
    postal_code: Mapped[str | None] = mapped_column(String(10))
    blood_type: Mapped[str | None] = mapped_column(String(3))
    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=DEFAULT_PATIENT_STATUS,
        server_default=DEFAULT_PATIENT_STATUS,
    )
    last_visit: Mapped[date | None] = mapped_column(Date)
    conditions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    allergies: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    allergy_status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=DEFAULT_ALLERGY_STATUS,
        server_default=DEFAULT_ALLERGY_STATUS,
    )

    # Server-owned identifiers and read-only imported context.
    mrn: Mapped[str | None] = mapped_column(Text)
    source_patient_id: Mapped[str | None] = mapped_column(Text)
    seed_run_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    source_lineage: Mapped[dict[str, Any] | None] = mapped_column(JSONB(none_as_null=True))
    source_record: Mapped[dict[str, str] | None] = mapped_column(
        JSONB(none_as_null=True), deferred=True
    )
    profile_details: Mapped[dict[str, Any] | None] = mapped_column(JSONB(none_as_null=True))
    source_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()

    seed_run: Mapped[SeedRun | None] = relationship()
    notes: Mapped[list[Note]] = relationship(
        back_populates="patient", cascade="all, delete-orphan", passive_deletes=True
    )
    comments: Mapped[list[Comment]] = relationship(
        back_populates="patient", cascade="all, delete-orphan", passive_deletes=True
    )

    def age_on(self, on: date) -> int:
        """Whole years from ``date_of_birth`` to ``on``; age is never stored."""
        birth = self.date_of_birth
        return on.year - birth.year - ((on.month, on.day) < (birth.month, birth.day))


class Note(Base):
    """A clinical note. Deletion leaves a contentless tombstone so comment links stay stable."""

    __tablename__ = "notes"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="notes_pkey"),
        UniqueConstraint("id", "patient_id", name="notes_id_patient_id_key"),
        ForeignKeyConstraint(
            ["patient_id"], ["patients.id"], name="notes_patient_id_fkey", ondelete="CASCADE"
        ),
        ForeignKeyConstraint(
            ["author_id"], ["users.id"], name="notes_author_id_fkey", ondelete="RESTRICT"
        ),
        ForeignKeyConstraint(
            ["deleted_by_id"], ["users.id"], name="notes_deleted_by_id_fkey", ondelete="RESTRICT"
        ),
        CheckConstraint(_one_of("source_type", NOTE_SOURCE_TYPES), name="notes_source_type"),
        CheckConstraint(
            "(deleted_at IS NULL"
            f" AND title IS NOT NULL AND {_not_blank('title')}"
            f" AND content IS NOT NULL AND {_not_blank('content')}"
            f" AND length(content) <= {NOTE_CONTENT_MAX_LENGTH})"
            " OR (deleted_at IS NOT NULL AND title IS NULL AND content IS NULL)",
            name="notes_content_or_tombstone",
        ),
        CheckConstraint(
            "(deleted_at IS NULL) = (deleted_by_id IS NULL)", name="notes_deletion_actor"
        ),
        CheckConstraint("updated_at >= created_at", name="notes_timestamps"),
        Index("ix_notes_patient_timestamp", "patient_id", "timestamp", "id"),
        Index("ix_notes_active_patient", "patient_id", postgresql_where=text("deleted_at IS NULL")),
        Index("ix_notes_author", "author_id"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    patient_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    author_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    title: Mapped[str | None] = mapped_column(
        String(NOTE_TITLE_MAX_LENGTH).evaluates_none(),
        default=DEFAULT_NOTE_TITLE,
        server_default=DEFAULT_NOTE_TITLE,
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    content: Mapped[str | None] = mapped_column(Text)
    source_type: Mapped[str] = mapped_column(
        String(12), nullable=False, default="manual", server_default="manual"
    )
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)

    patient: Mapped[Patient] = relationship(back_populates="notes")
    author: Mapped[User] = relationship(foreign_keys=[author_id])
    deleted_by: Mapped[User | None] = relationship(foreign_keys=[deleted_by_id])
    attachments: Mapped[list[NoteAttachment]] = relationship(
        back_populates="note",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by=lambda: NoteAttachment.created_at,
    )
    comment_links: Mapped[list[CommentNoteLink]] = relationship(
        primaryjoin=lambda: (
            (Note.id == CommentNoteLink.note_id) & (Note.patient_id == CommentNoteLink.patient_id)
        ),
        foreign_keys=lambda: [CommentNoteLink.note_id, CommentNoteLink.patient_id],
        viewonly=True,
    )

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None


class NoteAttachment(Base):
    """Metadata for an external HTTPS file linked to a note; nothing is uploaded or fetched."""

    __tablename__ = "note_attachments"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="note_attachments_pkey"),
        ForeignKeyConstraint(
            ["note_id"], ["notes.id"], name="note_attachments_note_id_fkey", ondelete="CASCADE"
        ),
        ForeignKeyConstraint(
            ["added_by_id"],
            ["users.id"],
            name="note_attachments_added_by_id_fkey",
            ondelete="RESTRICT",
        ),
        CheckConstraint(_not_blank("display_name"), name="note_attachments_display_name"),
        CheckConstraint(
            f"left(source_url, 8) = 'https://' AND length(source_url) <= {SOURCE_URL_MAX_LENGTH}",
            name="note_attachments_source_url",
        ),
        Index("ix_note_attachments_note", "note_id"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    note_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    added_by_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    media_type: Mapped[str | None] = mapped_column(String(100))
    source_description: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = _created_at()

    note: Mapped[Note] = relationship(back_populates="attachments")
    added_by: Mapped[User] = relationship()


class Comment(Base):
    """A team discussion message about a patient; never input to the clinical summary."""

    __tablename__ = "comments"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="comments_pkey"),
        UniqueConstraint("id", "patient_id", name="comments_id_patient_id_key"),
        ForeignKeyConstraint(
            ["patient_id"], ["patients.id"], name="comments_patient_id_fkey", ondelete="CASCADE"
        ),
        ForeignKeyConstraint(
            ["author_id"], ["users.id"], name="comments_author_id_fkey", ondelete="RESTRICT"
        ),
        CheckConstraint(
            f"{_not_blank('body')} AND length(body) <= {COMMENT_BODY_MAX_LENGTH}",
            name="comments_body",
        ),
        CheckConstraint("updated_at >= created_at", name="comments_timestamps"),
        Index("ix_comments_patient_created", "patient_id", "created_at", "id"),
        Index("ix_comments_author", "author_id"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    patient_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    author_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()

    patient: Mapped[Patient] = relationship(back_populates="comments")
    author: Mapped[User] = relationship()
    note_links: Mapped[list[CommentNoteLink]] = relationship(
        back_populates="comment", cascade="all, delete-orphan", passive_deletes=True
    )
    linked_notes: Mapped[list[Note]] = relationship(
        secondary=lambda: CommentNoteLink.__table__,
        primaryjoin=lambda: (
            (Comment.id == CommentNoteLink.comment_id)
            & (Comment.patient_id == CommentNoteLink.patient_id)
        ),
        secondaryjoin=lambda: (
            (Note.id == CommentNoteLink.note_id) & (Note.patient_id == CommentNoteLink.patient_id)
        ),
        order_by=lambda: Note.timestamp,
        viewonly=True,
    )


class CommentNoteLink(Base):
    """A comment's reference to a note of the same patient (enforced by composite FKs)."""

    __tablename__ = "comment_note_links"
    __table_args__ = (
        PrimaryKeyConstraint("comment_id", "note_id", name="comment_note_links_pkey"),
        ForeignKeyConstraint(
            ["comment_id", "patient_id"],
            ["comments.id", "comments.patient_id"],
            name="comment_note_links_comment_fkey",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["note_id", "patient_id"],
            ["notes.id", "notes.patient_id"],
            name="comment_note_links_note_fkey",
            ondelete="CASCADE",
        ),
        Index("ix_comment_note_links_note", "note_id", "patient_id"),
    )

    comment_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    note_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    patient_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)

    comment: Mapped[Comment] = relationship(
        back_populates="note_links", foreign_keys=[comment_id, patient_id]
    )
    note: Mapped[Note] = relationship(foreign_keys=[note_id, patient_id], viewonly=True)


class DiscussionRead(Base):
    """How far one user has read one patient's discussion (creation-time cutoff)."""

    __tablename__ = "discussion_reads"
    __table_args__ = (
        PrimaryKeyConstraint("user_id", "patient_id", name="discussion_reads_pkey"),
        ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="discussion_reads_user_id_fkey", ondelete="CASCADE"
        ),
        ForeignKeyConstraint(
            ["patient_id"],
            ["patients.id"],
            name="discussion_reads_patient_id_fkey",
            ondelete="CASCADE",
        ),
        Index("ix_discussion_reads_patient", "patient_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    patient_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    last_read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = _updated_at()

    user: Mapped[User] = relationship()
    patient: Mapped[Patient] = relationship()


class PatientSummary(Base):
    """The latest LLM-written summary for one patient, reused while ``facts_hash`` matches.

    ``facts_hash`` is sha256(model + FACTS); template fallbacks are never stored.
    """

    __tablename__ = "patient_summaries"
    __table_args__ = (
        PrimaryKeyConstraint("patient_id", name="patient_summaries_pkey"),
        ForeignKeyConstraint(
            ["patient_id"],
            ["patients.id"],
            name="patient_summaries_patient_id_fkey",
            ondelete="CASCADE",
        ),
        CheckConstraint(_one_of("method", ("llm",)), name="patient_summaries_method"),
    )

    patient_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    method: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str | None] = mapped_column(Text, nullable=True)
    facts_hash: Mapped[str] = mapped_column(CHAR(64), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
