"""Initial application schema: patients, users, notes, discussion, and seed markers.

Revision ID: 20261120_0001
Revises:

Mirrors app/models.py (see backend/MODEL_CONTRACT.md). Constraint names are explicit; CHECK
expressions are frozen literals here even though the models derive them from constants.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261120_0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "seed_runs",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("dataset_key", sa.Text(), nullable=False),
        sa.Column("dataset_date", sa.Date(), nullable=False),
        sa.Column("source_hashes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("export_manifest", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("row_counts", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "completed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="seed_runs_pkey"),
        sa.UniqueConstraint("dataset_key", name="seed_runs_dataset_key_key"),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("display_role", sa.String(length=80), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("display_name ~ '[^[:space:]]'", name="users_display_name"),
        sa.CheckConstraint(
            "display_role IS NULL OR display_role ~ '[^[:space:]]'", name="users_display_role"
        ),
        sa.CheckConstraint("updated_at >= created_at", name="users_timestamps"),
        sa.PrimaryKeyConstraint("id", name="users_pkey"),
    )
    op.create_table(
        "patients",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("middle_initial", sa.String(length=1), nullable=True),
        sa.Column("last_name", sa.String(length=100), nullable=False),
        sa.Column("date_of_birth", sa.Date(), nullable=False),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("email", sa.String(length=254), nullable=True),
        sa.Column("address_line1", sa.String(length=255), nullable=True),
        sa.Column("address_line2", sa.String(length=255), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("state", sa.String(length=2), nullable=True),
        sa.Column("postal_code", sa.String(length=10), nullable=True),
        sa.Column("blood_type", sa.String(length=3), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column("last_visit", sa.Date(), nullable=True),
        sa.Column(
            "conditions",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "allergies",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("allergy_status", sa.String(length=16), server_default="unknown", nullable=False),
        sa.Column("mrn", sa.Text(), nullable=True),
        sa.Column("source_patient_id", sa.Text(), nullable=True),
        sa.Column("seed_run_id", sa.Uuid(), nullable=True),
        sa.Column("source_lineage", postgresql.JSONB(none_as_null=True), nullable=True),
        sa.Column("source_record", postgresql.JSONB(none_as_null=True), nullable=True),
        sa.Column("profile_details", postgresql.JSONB(none_as_null=True), nullable=True),
        sa.Column("source_created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(allergy_status = 'reported') = (jsonb_array_length(allergies) > 0)",
            name="patients_allergy_consistency",
        ),
        sa.CheckConstraint(
            "allergy_status IN ('unknown', 'no_known', 'reported')", name="patients_allergy_status"
        ),
        sa.CheckConstraint(
            "blood_type IS NULL OR "
            "blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')",
            name="patients_blood_type",
        ),
        sa.CheckConstraint(
            "first_name ~ '[^[:space:]]' AND last_name ~ '[^[:space:]]'", name="patients_names"
        ),
        sa.CheckConstraint(
            "jsonb_typeof(conditions) = 'array' AND jsonb_typeof(allergies) = 'array'",
            name="patients_medical_arrays",
        ),
        sa.CheckConstraint("status IN ('active', 'inactive')", name="patients_status"),
        sa.CheckConstraint(
            "((source_patient_id IS NULL AND seed_run_id IS NULL AND source_lineage IS NULL"
            " AND source_record IS NULL AND profile_details IS NULL"
            " AND source_created_at IS NULL AND source_updated_at IS NULL)"
            " OR (source_patient_id IS NOT NULL AND seed_run_id IS NOT NULL"
            " AND source_lineage IS NOT NULL AND source_record IS NOT NULL"
            " AND profile_details IS NOT NULL AND source_created_at IS NOT NULL"
            " AND source_updated_at IS NOT NULL))"
            " AND (source_patient_id IS NULL OR (jsonb_typeof(source_lineage) = 'object'"
            " AND jsonb_typeof(source_record) = 'object'"
            " AND jsonb_typeof(profile_details) = 'object'))",
            name="patients_source_provenance",
        ),
        sa.CheckConstraint("updated_at >= created_at", name="patients_timestamps"),
        sa.ForeignKeyConstraint(
            ["seed_run_id"], ["seed_runs.id"], name="patients_seed_run_id_fkey", ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name="patients_pkey"),
        sa.UniqueConstraint("mrn", name="patients_mrn_key"),
        sa.UniqueConstraint("source_patient_id", name="patients_source_patient_id_key"),
    )
    op.create_index("ix_patients_date_of_birth", "patients", ["date_of_birth", "id"], unique=False)
    op.create_index("ix_patients_last_visit", "patients", ["last_visit", "id"], unique=False)
    op.create_index("ix_patients_name", "patients", ["last_name", "first_name", "id"], unique=False)
    op.create_index("ix_patients_status", "patients", ["status", "id"], unique=False)
    op.create_table(
        "comments",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("patient_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("body ~ '[^[:space:]]' AND length(body) <= 10000", name="comments_body"),
        sa.CheckConstraint("updated_at >= created_at", name="comments_timestamps"),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"], name="comments_author_id_fkey", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"], ["patients.id"], name="comments_patient_id_fkey", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="comments_pkey"),
        sa.UniqueConstraint("id", "patient_id", name="comments_id_patient_id_key"),
    )
    op.create_index("ix_comments_author", "comments", ["author_id"], unique=False)
    op.create_index(
        "ix_comments_patient_created", "comments", ["patient_id", "created_at", "id"], unique=False
    )
    op.create_table(
        "discussion_reads",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("patient_id", sa.Uuid(), nullable=False),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.id"],
            name="discussion_reads_patient_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="discussion_reads_user_id_fkey", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", "patient_id", name="discussion_reads_pkey"),
    )
    op.create_index("ix_discussion_reads_patient", "discussion_reads", ["patient_id"], unique=False)
    op.create_table(
        "notes",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("patient_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=80), server_default="Clinical note", nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("source_type", sa.String(length=12), server_default="manual", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by_id", sa.Uuid(), nullable=True),
        sa.CheckConstraint(
            "(deleted_at IS NULL AND title IS NOT NULL AND title ~ '[^[:space:]]'"
            " AND content IS NOT NULL AND content ~ '[^[:space:]]'"
            " AND length(content) <= 20000)"
            " OR (deleted_at IS NOT NULL AND title IS NULL AND content IS NULL)",
            name="notes_content_or_tombstone",
        ),
        sa.CheckConstraint("source_type IN ('manual', 'seed')", name="notes_source_type"),
        sa.CheckConstraint(
            "(deleted_at IS NULL) = (deleted_by_id IS NULL)", name="notes_deletion_actor"
        ),
        sa.CheckConstraint("updated_at >= created_at", name="notes_timestamps"),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"], name="notes_author_id_fkey", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by_id"], ["users.id"], name="notes_deleted_by_id_fkey", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"], ["patients.id"], name="notes_patient_id_fkey", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="notes_pkey"),
        sa.UniqueConstraint("id", "patient_id", name="notes_id_patient_id_key"),
    )
    op.create_index(
        "ix_notes_active_patient",
        "notes",
        ["patient_id"],
        unique=False,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index("ix_notes_author", "notes", ["author_id"], unique=False)
    op.create_index(
        "ix_notes_patient_timestamp", "notes", ["patient_id", "timestamp", "id"], unique=False
    )
    op.create_table(
        "comment_note_links",
        sa.Column("comment_id", sa.Uuid(), nullable=False),
        sa.Column("note_id", sa.Uuid(), nullable=False),
        sa.Column("patient_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["comment_id", "patient_id"],
            ["comments.id", "comments.patient_id"],
            name="comment_note_links_comment_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["note_id", "patient_id"],
            ["notes.id", "notes.patient_id"],
            name="comment_note_links_note_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("comment_id", "note_id", name="comment_note_links_pkey"),
    )
    op.create_index(
        "ix_comment_note_links_note", "comment_note_links", ["note_id", "patient_id"], unique=False
    )
    op.create_table(
        "note_attachments",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("note_id", sa.Uuid(), nullable=False),
        sa.Column("added_by_id", sa.Uuid(), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("media_type", sa.String(length=100), nullable=True),
        sa.Column("source_description", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("display_name ~ '[^[:space:]]'", name="note_attachments_display_name"),
        sa.CheckConstraint(
            "left(source_url, 8) = 'https://' AND length(source_url) <= 2048",
            name="note_attachments_source_url",
        ),
        sa.ForeignKeyConstraint(
            ["added_by_id"],
            ["users.id"],
            name="note_attachments_added_by_id_fkey",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["note_id"], ["notes.id"], name="note_attachments_note_id_fkey", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="note_attachments_pkey"),
    )
    op.create_index("ix_note_attachments_note", "note_attachments", ["note_id"], unique=False)


def downgrade() -> None:
    # Dropping a table drops its indexes and constraints; children go before parents.
    for table in (
        "note_attachments",
        "comment_note_links",
        "notes",
        "discussion_reads",
        "comments",
        "patients",
        "users",
        "seed_runs",
    ):
        op.drop_table(table)
