"""Store the latest LLM-written summary per patient, keyed by a hash of its facts.

Revision ID: 20261120_0003
Revises: 20261120_0002

One row per patient. The API reuses a row only while its facts_hash equals the current
sha256(model + FACTS) and never stores template fallbacks. Deleting a patient cascades
its row; migration alone writes no data.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261120_0003"
down_revision: str | Sequence[str] | None = "20261120_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "patient_summaries",
        sa.Column("patient_id", sa.Uuid(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("method", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=True),
        sa.Column("facts_hash", sa.CHAR(length=64), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("method IN ('llm')", name="patient_summaries_method"),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.id"],
            name="patient_summaries_patient_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("patient_id", name="patient_summaries_pkey"),
    )


def downgrade() -> None:
    op.drop_table("patient_summaries")
