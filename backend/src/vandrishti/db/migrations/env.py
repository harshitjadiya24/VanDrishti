"""Alembic environment: settings provide the URL unless a caller set one."""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from vandrishti.core.config import get_settings
from vandrishti.db import models  # noqa: F401 (registers tables on the metadata)
from vandrishti.db.base import Base

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

url = config.get_main_option("sqlalchemy.url") or get_settings().database_url.render_as_string(
    hide_password=False
)


def run_offline() -> None:
    context.configure(url=url, target_metadata=Base.metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_online() -> None:
    engine = create_engine(url)
    with engine.connect() as conn:
        context.configure(connection=conn, target_metadata=Base.metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_offline()
else:
    run_online()
