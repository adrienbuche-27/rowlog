"""user routes table

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-17 10:17:20.448431

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "routes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("location", sa.String(length=200), nullable=False),
        sa.Column("length_m", sa.Float(), nullable=False),
        sa.Column("waypoints", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    # The old built-in routes (string ids like "rotsee") no longer exist; any workout
    # that had one selected loses that selection rather than casting a non-numeric
    # string into the new integer column.
    op.execute("UPDATE workouts SET route_id = NULL")
    with op.batch_alter_table("workouts") as batch_op:
        batch_op.alter_column(
            "route_id", existing_type=sa.VARCHAR(length=40), type_=sa.Integer(), existing_nullable=True
        )
        batch_op.create_foreign_key("fk_workouts_route_id_routes", "routes", ["route_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("workouts") as batch_op:
        batch_op.drop_constraint("fk_workouts_route_id_routes", type_="foreignkey")
        batch_op.alter_column(
            "route_id", existing_type=sa.Integer(), type_=sa.VARCHAR(length=40), existing_nullable=True
        )
    op.drop_table("routes")
