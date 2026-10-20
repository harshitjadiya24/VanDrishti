"""presence events, sensitivity, risk

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-20 22:15:35.812453

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "presence_event",
        sa.Column("camera_id", sa.Uuid(), nullable=False),
        sa.Column("sequence_id", sa.Uuid(), nullable=True),
        sa.Column("first_image_id", sa.Uuid(), nullable=False),
        sa.Column("image_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("people_count", sa.Integer(), nullable=False),
        sa.Column("vehicle_count", sa.Integer(), nullable=False),
        sa.Column("vehicle_type", sa.String(length=50), nullable=True),
        sa.Column("vehicle_type_score", sa.Float(), nullable=True),
        sa.Column("night", sa.Boolean(), nullable=False),
        sa.Column("night_basis", sa.String(length=20), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["camera_id"],
            ["camera.id"],
            name=op.f("fk_presence_event_camera_id_camera"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["first_image_id"],
            ["image.id"],
            name=op.f("fk_presence_event_first_image_id_image"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["sequence_id"],
            ["sequence.id"],
            name=op.f("fk_presence_event_sequence_id_sequence"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_presence_event")),
        sa.UniqueConstraint(
            "camera_id", "start_at", "first_image_id", name=op.f("uq_presence_event_camera_id")
        ),
    )
    op.create_index(
        op.f("ix_presence_event_camera_id"), "presence_event", ["camera_id"], unique=False
    )
    op.create_index(
        op.f("ix_presence_event_start_at"), "presence_event", ["start_at"], unique=False
    )
    op.create_table(
        "risk_assessment",
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("config_hash", sa.String(length=64), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column(
            "level",
            sa.Enum("low", "medium", "high", name="risk_level", native_enum=False),
            nullable=False,
        ),
        sa.Column("factors", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("dismissed", sa.Boolean(), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["presence_event.id"],
            name=op.f("fk_risk_assessment_event_id_presence_event"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_risk_assessment")),
        sa.UniqueConstraint("event_id", "config_hash", name=op.f("uq_risk_assessment_event_id")),
    )
    op.create_index(
        op.f("ix_risk_assessment_event_id"), "risk_assessment", ["event_id"], unique=False
    )
    op.create_index(op.f("ix_risk_assessment_level"), "risk_assessment", ["level"], unique=False)
    op.add_column(
        "camera",
        sa.Column(
            "sensitivity",
            sa.Enum("normal", "sensitive", "core", name="sensitivity", native_enum=False),
            server_default="normal",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("camera", "sensitivity")
    op.drop_index(op.f("ix_risk_assessment_level"), table_name="risk_assessment")
    op.drop_index(op.f("ix_risk_assessment_event_id"), table_name="risk_assessment")
    op.drop_table("risk_assessment")
    op.drop_index(op.f("ix_presence_event_start_at"), table_name="presence_event")
    op.drop_index(op.f("ix_presence_event_camera_id"), table_name="presence_event")
    op.drop_table("presence_event")
