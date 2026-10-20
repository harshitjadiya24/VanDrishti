"""routing, reviews, audit

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-20 17:16:56.804237

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "audit_event",
        sa.Column("seq", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor", sa.String(length=100), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("entity", sa.String(length=64), nullable=False),
        sa.Column("entity_id", sa.String(length=64), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("prev_hash", sa.String(length=64), nullable=False),
        sa.Column("hash", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("seq", name=op.f("pk_audit_event")),
        sa.UniqueConstraint("hash", name=op.f("uq_audit_event_hash")),
    )
    op.create_index(op.f("ix_audit_event_action"), "audit_event", ["action"], unique=False)
    op.create_index(op.f("ix_audit_event_entity_id"), "audit_event", ["entity_id"], unique=False)
    op.create_table(
        "routing",
        sa.Column("image_id", sa.Uuid(), nullable=False),
        sa.Column("decision_id", sa.Uuid(), nullable=True),
        sa.Column(
            "route",
            sa.Enum(
                "auto_accept",
                "review",
                "uncertain",
                "likely_blank",
                "people_vehicles",
                "quality",
                name="route",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "state",
            sa.Enum("open", "done", "not_sampled", name="route_state", native_enum=False),
            nullable=False,
        ),
        sa.Column("spot_check", sa.Boolean(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("config_hash", sa.String(length=64), nullable=False),
        sa.Column("reason", sa.String(length=300), nullable=False),
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
            ["decision_id"],
            ["decision.id"],
            name=op.f("fk_routing_decision_id_decision"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["image_id"], ["image.id"], name=op.f("fk_routing_image_id_image"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_routing")),
        sa.UniqueConstraint("image_id", name=op.f("uq_routing_image_id")),
    )
    op.create_index(op.f("ix_routing_route"), "routing", ["route"], unique=False)
    op.create_index(op.f("ix_routing_state"), "routing", ["state"], unique=False)
    op.create_table(
        "review",
        sa.Column("image_id", sa.Uuid(), nullable=False),
        sa.Column("routing_id", sa.Uuid(), nullable=True),
        sa.Column("decision_id", sa.Uuid(), nullable=True),
        sa.Column("reviewer", sa.String(length=100), nullable=False),
        sa.Column(
            "action",
            sa.Enum(
                "confirm",
                "correct",
                "not_animal",
                "skip",
                "confirm_people",
                "false_alarm",
                "quality_ok",
                "quality_bad",
                name="review_action",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("model_label", sa.String(length=200), nullable=True),
        sa.Column("model_taxon", sa.String(length=300), nullable=True),
        sa.Column("model_confidence", sa.Float(), nullable=True),
        sa.Column("human_label", sa.String(length=200), nullable=True),
        sa.Column("human_taxon", sa.String(length=300), nullable=True),
        sa.Column("poaching_activity", sa.Boolean(), nullable=False),
        sa.Column(
            "severity",
            sa.Enum("low", "medium", "high", name="severity", native_enum=False),
            nullable=True,
        ),
        sa.Column("notes", sa.String(length=2000), nullable=True),
        sa.Column("undone_at", sa.DateTime(timezone=True), nullable=True),
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
            ["decision_id"],
            ["decision.id"],
            name=op.f("fk_review_decision_id_decision"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["image_id"], ["image.id"], name=op.f("fk_review_image_id_image"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["routing_id"],
            ["routing.id"],
            name=op.f("fk_review_routing_id_routing"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_review")),
    )
    op.create_index(op.f("ix_review_image_id"), "review", ["image_id"], unique=False)

    # Append-only: the database itself refuses to change or delete audit rows.
    op.execute(
        """
        CREATE FUNCTION audit_event_append_only() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'audit_event is append-only';
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER audit_event_no_change BEFORE UPDATE OR DELETE ON audit_event
            FOR EACH ROW EXECUTE FUNCTION audit_event_append_only();
        CREATE TRIGGER audit_event_no_truncate BEFORE TRUNCATE ON audit_event
            FOR EACH STATEMENT EXECUTE FUNCTION audit_event_append_only();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS audit_event_no_truncate ON audit_event")
    op.execute("DROP TRIGGER IF EXISTS audit_event_no_change ON audit_event")
    op.execute("DROP FUNCTION IF EXISTS audit_event_append_only()")
    op.drop_index(op.f("ix_review_image_id"), table_name="review")
    op.drop_table("review")
    op.drop_index(op.f("ix_routing_state"), table_name="routing")
    op.drop_index(op.f("ix_routing_route"), table_name="routing")
    op.drop_table("routing")
    op.drop_index(op.f("ix_audit_event_entity_id"), table_name="audit_event")
    op.drop_index(op.f("ix_audit_event_action"), table_name="audit_event")
    op.drop_table("audit_event")
