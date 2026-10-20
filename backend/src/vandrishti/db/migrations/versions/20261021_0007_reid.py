"""reid embeddings, individuals, proposals

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-20 23:03:48.320239

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "individual",
        sa.Column("reserve_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=True),
        sa.Column("created_by", sa.String(length=100), nullable=False),
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
            name=op.f("fk_individual_reserve_id_reserve"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_individual")),
        sa.UniqueConstraint("reserve_id", "code", name=op.f("uq_individual_reserve_id")),
    )
    op.create_index(op.f("ix_individual_reserve_id"), "individual", ["reserve_id"], unique=False)
    op.create_table(
        "reid_embedding",
        sa.Column("image_id", sa.Uuid(), nullable=False),
        sa.Column("detection_id", sa.Uuid(), nullable=False),
        sa.Column("model_name", sa.String(length=100), nullable=False),
        sa.Column("model_version", sa.String(length=100), nullable=False),
        sa.Column("dim", sa.Integer(), nullable=False),
        sa.Column("vector", sa.LargeBinary(), nullable=False),
        sa.Column("crop_box", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("individual_id", sa.Uuid(), nullable=True),
        sa.Column("assigned_by", sa.String(length=100), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
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
            name=op.f("fk_reid_embedding_detection_id_detection"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["image_id"],
            ["image.id"],
            name=op.f("fk_reid_embedding_image_id_image"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["individual_id"],
            ["individual.id"],
            name=op.f("fk_reid_embedding_individual_id_individual"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reid_embedding")),
        sa.UniqueConstraint(
            "detection_id",
            "model_name",
            "model_version",
            name=op.f("uq_reid_embedding_detection_id"),
        ),
    )
    op.create_index(
        op.f("ix_reid_embedding_detection_id"), "reid_embedding", ["detection_id"], unique=False
    )
    op.create_index(
        op.f("ix_reid_embedding_image_id"), "reid_embedding", ["image_id"], unique=False
    )
    op.create_index(
        op.f("ix_reid_embedding_individual_id"), "reid_embedding", ["individual_id"], unique=False
    )
    op.create_table(
        "reid_proposal",
        sa.Column("embedding_id", sa.Uuid(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum("possible_match", "possible_new", name="proposal_kind", native_enum=False),
            nullable=False,
        ),
        sa.Column(
            "state",
            sa.Enum("open", "done", name="proposal_state", native_enum=False),
            nullable=False,
        ),
        sa.Column("candidates", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("best_similarity", sa.Float(), nullable=True),
        sa.Column("threshold", sa.Float(), nullable=False),
        sa.Column("outcome", sa.String(length=32), nullable=True),
        sa.Column("decided_by", sa.String(length=100), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
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
            ["embedding_id"],
            ["reid_embedding.id"],
            name=op.f("fk_reid_proposal_embedding_id_reid_embedding"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reid_proposal")),
        sa.UniqueConstraint("embedding_id", name=op.f("uq_reid_proposal_embedding_id")),
    )
    op.create_index(op.f("ix_reid_proposal_state"), "reid_proposal", ["state"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_reid_proposal_state"), table_name="reid_proposal")
    op.drop_table("reid_proposal")
    op.drop_index(op.f("ix_reid_embedding_individual_id"), table_name="reid_embedding")
    op.drop_index(op.f("ix_reid_embedding_image_id"), table_name="reid_embedding")
    op.drop_index(op.f("ix_reid_embedding_detection_id"), table_name="reid_embedding")
    op.drop_table("reid_embedding")
    op.drop_index(op.f("ix_individual_reserve_id"), table_name="individual")
    op.drop_table("individual")
