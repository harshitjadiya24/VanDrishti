import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Engine, inspect

from tests.integration.conftest import alembic_config
from vandrishti.db.base import Base

pytestmark = pytest.mark.integration


def test_migrations_match_the_models(engine: Engine) -> None:
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    assert diff == []
    assert {"reserve", "camera", "model_registry"} <= set(inspect(engine).get_table_names())


def test_downgrade_and_upgrade_again(db_url: str, engine: Engine) -> None:
    cfg = alembic_config(db_url)
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
