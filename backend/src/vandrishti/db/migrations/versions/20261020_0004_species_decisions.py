"""species, semantics, segmentation, decisions

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-20 16:55:16.877161

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "reserve_species",
        sa.Column("reserve_id", sa.Uuid(), nullable=False),
        sa.Column("taxon", sa.String(length=300), nullable=False),
        sa.Column("common_name", sa.String(length=200), nullable=False),
        sa.Column("source", sa.String(length=300), nullable=True),
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
            ["reserve_id"],
            ["reserve.id"],
            name=op.f("fk_reserve_species_reserve_id_reserve"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reserve_species")),
        sa.UniqueConstraint("reserve_id", "taxon", name=op.f("uq_reserve_species_reserve_id")),
    )
    op.create_index(
        op.f("ix_reserve_species_reserve_id"), "reserve_species", ["reserve_id"], unique=False
    )
    op.create_table(
        "decision",
        sa.Column("image_id", sa.Uuid(), nullable=False),
        sa.Column("engine_version", sa.String(length=32), nullable=False),
        sa.Column("config_hash", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=False),
        sa.Column("taxon", sa.String(length=300), nullable=True),
        sa.Column("taxon_level", sa.String(length=16), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("explanation", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("verified_by_human", sa.Boolean(), server_default="false", nullable=False),
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
            "confidence >= 0 AND confidence <= 1", name=op.f("ck_decision_confidence_range")
        ),
        sa.ForeignKeyConstraint(
            ["image_id"], ["image.id"], name=op.f("fk_decision_image_id_image"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_decision")),
        sa.UniqueConstraint("image_id", "config_hash", name=op.f("uq_decision_image_id")),
    )
    op.create_index(op.f("ix_decision_config_hash"), "decision", ["config_hash"], unique=False)
    op.create_index(op.f("ix_decision_image_id"), "decision", ["image_id"], unique=False)
    op.create_index(op.f("ix_decision_taxon"), "decision", ["taxon"], unique=False)
    op.create_table(
        "classification",
        sa.Column("image_id", sa.Uuid(), nullable=False),
        sa.Column("detection_id", sa.Uuid(), nullable=False),
        sa.Column("model_name", sa.String(length=100), nullable=False),
        sa.Column("model_version", sa.String(length=100), nullable=False),
        sa.Column("config_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "kind",
            sa.Enum("raw", "final", name="classification_kind", native_enum=False),
            nullable=False,
        ),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("taxon", sa.String(length=300), nullable=False),
        sa.Column("common_name", sa.String(length=200), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("source", sa.String(length=100), nullable=True),
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
            "score >= 0 AND score <= 1.0001", name=op.f("ck_classification_score_range")
        ),
        sa.ForeignKeyConstraint(
            ["detection_id"],
            ["detection.id"],
            name=op.f("fk_classification_detection_id_detection"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["image_id"],
            ["image.id"],
            name=op.f("fk_classification_image_id_image"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_classification")),
        sa.UniqueConstraint(
            "detection_id",
            "model_name",
            "model_version",
            "config_hash",
            "kind",
            "rank",
            name=op.f("uq_classification_detection_id"),
        ),
    )
    op.create_index(
        op.f("ix_classification_config_hash"), "classification", ["config_hash"], unique=False
    )
    op.create_index(
        op.f("ix_classification_detection_id"), "classification", ["detection_id"], unique=False
    )
    op.create_index(
        op.f("ix_classification_image_id"), "classification", ["image_id"], unique=False
    )
    op.create_index(op.f("ix_classification_taxon"), "classification", ["taxon"], unique=False)
    op.create_table(
        "segmentation",
        sa.Column("image_id", sa.Uuid(), nullable=False),
        sa.Column("detection_id", sa.Uuid(), nullable=False),
        sa.Column("model_name", sa.String(length=100), nullable=False),
        sa.Column("model_version", sa.String(length=100), nullable=False),
        sa.Column("config_hash", sa.String(length=64), nullable=False),
        sa.Column("mask_key", sa.String(length=300), nullable=False),
        sa.Column("box_fill", sa.Float(), nullable=False),
        sa.Column("predicted_iou", sa.Float(), nullable=False),
        sa.Column("mask_box", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
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
            ["detection_id"],
            ["detection.id"],
            name=op.f("fk_segmentation_detection_id_detection"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["image_id"],
            ["image.id"],
            name=op.f("fk_segmentation_image_id_image"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_segmentation")),
        sa.UniqueConstraint(
            "detection_id", "model_name", "config_hash", name=op.f("uq_segmentation_detection_id")
        ),
    )
    op.create_index(
        op.f("ix_segmentation_detection_id"), "segmentation", ["detection_id"], unique=False
    )
    op.create_index(op.f("ix_segmentation_image_id"), "segmentation", ["image_id"], unique=False)
    op.create_table(
        "semantic_check",
        sa.Column("image_id", sa.Uuid(), nullable=False),
        sa.Column("detection_id", sa.Uuid(), nullable=False),
        sa.Column("model_name", sa.String(length=100), nullable=False),
        sa.Column("model_version", sa.String(length=100), nullable=False),
        sa.Column("config_hash", sa.String(length=64), nullable=False),
        sa.Column("candidates", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("top_label", sa.String(length=200), nullable=False),
        sa.Column("top_probability", sa.Float(), nullable=False),
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
            ["detection_id"],
            ["detection.id"],
            name=op.f("fk_semantic_check_detection_id_detection"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["image_id"],
            ["image.id"],
            name=op.f("fk_semantic_check_image_id_image"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_semantic_check")),
        sa.UniqueConstraint(
            "detection_id", "model_name", "config_hash", name=op.f("uq_semantic_check_detection_id")
        ),
    )
    op.create_index(
        op.f("ix_semantic_check_detection_id"), "semantic_check", ["detection_id"], unique=False
    )
    op.create_index(
        op.f("ix_semantic_check_image_id"), "semantic_check", ["image_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_semantic_check_image_id"), table_name="semantic_check")
    op.drop_index(op.f("ix_semantic_check_detection_id"), table_name="semantic_check")
    op.drop_table("semantic_check")
    op.drop_index(op.f("ix_segmentation_image_id"), table_name="segmentation")
    op.drop_index(op.f("ix_segmentation_detection_id"), table_name="segmentation")
    op.drop_table("segmentation")
    op.drop_index(op.f("ix_classification_taxon"), table_name="classification")
    op.drop_index(op.f("ix_classification_image_id"), table_name="classification")
    op.drop_index(op.f("ix_classification_detection_id"), table_name="classification")
    op.drop_index(op.f("ix_classification_config_hash"), table_name="classification")
    op.drop_table("classification")
    op.drop_index(op.f("ix_decision_taxon"), table_name="decision")
    op.drop_index(op.f("ix_decision_image_id"), table_name="decision")
    op.drop_index(op.f("ix_decision_config_hash"), table_name="decision")
    op.drop_table("decision")
    op.drop_index(op.f("ix_reserve_species_reserve_id"), table_name="reserve_species")
    op.drop_table("reserve_species")
