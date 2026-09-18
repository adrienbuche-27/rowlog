"""training plans

Revision ID: 0004
Revises: 0003

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "plans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("pieces", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    # Batch mode with a named constraint: SQLite can't add a foreign key in place.
    with op.batch_alter_table("workouts") as batch_op:
        batch_op.add_column(sa.Column("plan_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("pieces", sa.JSON(), nullable=True))
        batch_op.create_foreign_key("fk_workouts_plan_id_plans", "plans", ["plan_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("workouts") as batch_op:
        batch_op.drop_constraint("fk_workouts_plan_id_plans", type_="foreignkey")
        batch_op.drop_column("pieces")
        batch_op.drop_column("plan_id")
    op.drop_table("plans")
