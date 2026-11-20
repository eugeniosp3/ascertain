"""Add nullable patient workload assignment without changing existing profiles.

Revision ID: 20261120_0002
Revises: 20261120_0001

The versioned seed extension assigns imported demo patients separately. Migration
alone leaves existing patients unassigned and never changes clinical/source data.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261120_0002"
down_revision: str | Sequence[str] | None = "20261120_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("patients", sa.Column("assigned_user_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "patients_assigned_user_id_fkey",
        "patients",
        "users",
        ["assigned_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_patients_assigned_user_id", "patients", ["assigned_user_id", "id"])


def downgrade() -> None:
    op.drop_index("ix_patients_assigned_user_id", table_name="patients")
    op.drop_constraint("patients_assigned_user_id_fkey", "patients", type_="foreignkey")
    op.drop_column("patients", "assigned_user_id")
