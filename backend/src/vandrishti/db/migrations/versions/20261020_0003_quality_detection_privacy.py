"""quality gate, detections, privacy

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-20 16:20:29.478519

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "detection",
        sa.Column("image_id", sa.Uuid(), nullable=False),
        sa.Column("model_name", sa.String(length=100), nullable=False),
        sa.Column("model_version", sa.String(length=100), nullable=False),
        sa.Column("config_hash", sa.String(length=64), nullable=False),
        sa.Column("det_index", sa.Integer(), nullable=False),
        sa.Column(
            "category",
            sa.Enum("animal", "person", "vehicle", name="detection_category", native_enum=False),
            nullable=False,
        ),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("x", sa.Float(), nullable=False),
        sa.Column("y", sa.Float(), nullable=False),
        sa.Column("w", sa.Float(), nullable=False),
        sa.Column("h", sa.Float(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
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
            "confidence BETWEEN 0 AND 1", name=op.f("ck_detection_confidence_range")
        ),
        sa.CheckConstraint(
            "x >= 0 AND y >= 0 AND w > 0 AND h > 0 AND x + w <= 1.0001 AND y + h <= 1.0001",
            name=op.f("ck_detection_box_normalised"),
        ),
        sa.ForeignKeyConstraint(
            ["image_id"], ["image.id"], name=op.f("fk_detection_image_id_image"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_detection")),
        sa.UniqueConstraint(
            "image_id",
            "model_name",
            "model_version",
            "config_hash",
            "det_index",
            name=op.f("uq_detection_image_id"),
        ),
    )
    op.create_index(op.f("ix_detection_category"), "detection", ["category"], unique=False)
    op.create_index(op.f("ix_detection_config_hash"), "detection", ["config_hash"], unique=False)
    op.create_index(op.f("ix_detection_image_id"), "detection", ["image_id"], unique=False)
    op.add_column(
        "image",
        sa.Column(
            "quality_status",
            sa.Enum("pending", "pass", "fail", name="quality_status", native_enum=False),
            server_default="pending",
            nullable=False,
        ),
    )
    op.add_column(
        "image",
        sa.Column(
            "quality_flags",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
    )
    op.add_column(
        "image",
        sa.Column(
            "quality_metrics",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
    )
    op.add_column("image", sa.Column("dhash", sa.String(length=16), nullable=True))
    op.add_column(
        "image",
        sa.Column(
            "screen",
            sa.Enum(
                "no_object", "animal", "human_vehicle", name="screen_outcome", native_enum=False
            ),
            nullable=True,
        ),
    )
    op.add_column("image", sa.Column("screened_with", sa.String(length=64), nullable=True))
    op.add_column(
        "image",
        sa.Column("is_original_locked", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column("image", sa.Column("blurred_key", sa.String(length=300), nullable=True))
    op.create_index(op.f("ix_image_quality_status"), "image", ["quality_status"], unique=False)
    op.create_index(op.f("ix_image_screen"), "image", ["screen"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_image_screen"), table_name="image")
    op.drop_index(op.f("ix_image_quality_status"), table_name="image")
    op.drop_column("image", "blurred_key")
    op.drop_column("image", "is_original_locked")
    op.drop_column("image", "screened_with")
    op.drop_column("image", "screen")
    op.drop_column("image", "dhash")
    op.drop_column("image", "quality_metrics")
    op.drop_column("image", "quality_flags")
    op.drop_column("image", "quality_status")
    op.drop_index(op.f("ix_detection_image_id"), table_name="detection")
    op.drop_index(op.f("ix_detection_config_hash"), table_name="detection")
    op.drop_index(op.f("ix_detection_category"), table_name="detection")
    op.drop_table("detection")
