"""foundations: reserve, camera registry, model registry

Revision ID: 0001
Revises:
Create Date: 2026-10-20 15:30:00

"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _stamps() -> list[sa.Column[Any]]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "reserve",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("country", sa.String(3), nullable=False),
        *_stamps(),
        sa.PrimaryKeyConstraint("id", name="pk_reserve"),
        sa.UniqueConstraint("code", name="uq_reserve_code"),
    )
    op.create_table(
        "camera",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("reserve_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "active", "inactive", "faulty", "stolen", name="camera_status", native_enum=False
            ),
            nullable=False,
        ),
        *_stamps(),
        sa.PrimaryKeyConstraint("id", name="pk_camera"),
        sa.ForeignKeyConstraint(
            ["reserve_id"], ["reserve.id"], name="fk_camera_reserve_id_reserve", ondelete="CASCADE"
        ),
        sa.UniqueConstraint("reserve_id", "code", name="uq_camera_reserve_id"),
        sa.CheckConstraint("latitude BETWEEN -90 AND 90", name="ck_camera_latitude_range"),
        sa.CheckConstraint("longitude BETWEEN -180 AND 180", name="ck_camera_longitude_range"),
    )
    op.create_table(
        "model_registry",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("version", sa.String(100), nullable=False),
        sa.Column("licence", sa.String(100), nullable=False),
        sa.Column("source", sa.String(500), nullable=False),
        *_stamps(),
        sa.PrimaryKeyConstraint("id", name="pk_model_registry"),
        sa.UniqueConstraint("name", "version", name="uq_model_registry_name"),
    )


def downgrade() -> None:
    op.drop_table("model_registry")
    op.drop_table("camera")
    op.drop_table("reserve")
