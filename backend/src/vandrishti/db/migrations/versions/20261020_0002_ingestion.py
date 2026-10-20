"""ingestion: batches, images, sequences

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-20 15:44:52.967326

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ingest_batch",
        sa.Column(
            "source",
            sa.Enum("folder", "upload", "watch", name="ingest_source", native_enum=False),
            nullable=False,
        ),
        sa.Column("path", sa.String(length=1000), nullable=True),
        sa.Column("camera_id", sa.Uuid(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("running", "done", "failed", name="batch_status", native_enum=False),
            nullable=False,
        ),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("stored", sa.Integer(), nullable=False),
        sa.Column("duplicate", sa.Integer(), nullable=False),
        sa.Column("corrupt", sa.Integer(), nullable=False),
        sa.Column("failed", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
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
            name=op.f("fk_ingest_batch_camera_id_camera"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ingest_batch")),
    )
    op.create_index(op.f("ix_ingest_batch_camera_id"), "ingest_batch", ["camera_id"], unique=False)
    op.create_table(
        "sequence",
        sa.Column("camera_id", sa.Uuid(), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("image_count", sa.Integer(), nullable=False),
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
            name=op.f("fk_sequence_camera_id_camera"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sequence")),
    )
    op.create_index(op.f("ix_sequence_camera_id"), "sequence", ["camera_id"], unique=False)
    op.create_table(
        "image",
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("storage_key", sa.String(length=300), nullable=False),
        sa.Column("original_filename", sa.String(length=500), nullable=False),
        sa.Column("camera_id", sa.Uuid(), nullable=False),
        sa.Column("batch_id", sa.Uuid(), nullable=True),
        sa.Column("sequence_id", sa.Uuid(), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "time_source",
            sa.Enum(
                "exif", "manifest", "file_mtime", "none", name="time_source", native_enum=False
            ),
            nullable=False,
        ),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column(
            "gps_source",
            sa.Enum("exif", "camera", "none", name="gps_source", native_enum=False),
            nullable=False,
        ),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("format", sa.String(length=16), nullable=True),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("exif", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_corrupt", sa.Boolean(), nullable=False),
        sa.Column("corrupt_reason", sa.String(length=300), nullable=True),
        sa.Column("display_key", sa.String(length=300), nullable=True),
        sa.Column("preprocess", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
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
        sa.CheckConstraint("latitude BETWEEN -90 AND 90", name=op.f("ck_image_latitude_range")),
        sa.CheckConstraint("longitude BETWEEN -180 AND 180", name=op.f("ck_image_longitude_range")),
        sa.ForeignKeyConstraint(
            ["batch_id"],
            ["ingest_batch.id"],
            name=op.f("fk_image_batch_id_ingest_batch"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["camera_id"],
            ["camera.id"],
            name=op.f("fk_image_camera_id_camera"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["sequence_id"],
            ["sequence.id"],
            name=op.f("fk_image_sequence_id_sequence"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_image")),
        sa.UniqueConstraint("sha256", name=op.f("uq_image_sha256")),
    )
    op.create_index(op.f("ix_image_batch_id"), "image", ["batch_id"], unique=False)
    op.create_index(op.f("ix_image_camera_id"), "image", ["camera_id"], unique=False)
    op.create_index(op.f("ix_image_captured_at"), "image", ["captured_at"], unique=False)
    op.create_index(op.f("ix_image_sequence_id"), "image", ["sequence_id"], unique=False)
    op.add_column("camera", sa.Column("serial", sa.String(length=100), nullable=True))
    op.add_column("camera", sa.Column("installed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("camera", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("camera", "last_seen_at")
    op.drop_column("camera", "installed_at")
    op.drop_column("camera", "serial")
    op.drop_index(op.f("ix_image_sequence_id"), table_name="image")
    op.drop_index(op.f("ix_image_captured_at"), table_name="image")
    op.drop_index(op.f("ix_image_camera_id"), table_name="image")
    op.drop_index(op.f("ix_image_batch_id"), table_name="image")
    op.drop_table("image")
    op.drop_index(op.f("ix_sequence_camera_id"), table_name="sequence")
    op.drop_table("sequence")
    op.drop_index(op.f("ix_ingest_batch_camera_id"), table_name="ingest_batch")
    op.drop_table("ingest_batch")
