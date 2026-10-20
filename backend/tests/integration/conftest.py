"""Throwaway, fully migrated Postgres databases for integration tests."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, text

from vandrishti.core.config import get_settings

BACKEND = Path(__file__).resolve().parents[2]


def alembic_config(url: str) -> Config:
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return cfg


@pytest.fixture(scope="module")
def db_url() -> Iterator[str]:
    settings = get_settings()
    name = f"vandrishti_test_{uuid.uuid4().hex[:8]}"
    admin = create_engine(settings.database_url, isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as conn:
            conn.execute(text(f'CREATE DATABASE "{name}"'))
    except Exception as exc:  # pragma: no cover - environment dependent
        pytest.skip(f"Postgres not reachable: {exc}")
    url = settings.database_url.set(database=name).render_as_string(hide_password=False)
    try:
        yield url
    finally:
        with admin.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()


@pytest.fixture(scope="module")
def engine(db_url: str) -> Iterator[Engine]:
    command.upgrade(alembic_config(db_url), "head")
    eng = create_engine(db_url)
    yield eng
    eng.dispose()
