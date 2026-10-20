"""Shared API dependencies.

Until login and roles arrive (Phase 8), writes need `Authorization: Bearer <ingest token>`.
Without a configured token, writes are allowed only in env=dev (where the API listens on
127.0.0.1); in any other environment they are refused.
"""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from vandrishti.core.config import Settings, get_settings
from vandrishti.core.storage import LocalStorage
from vandrishti.db.session import get_session

DB = Annotated[Session, Depends(get_session)]
Config = Annotated[Settings, Depends(get_settings)]


def get_storage(settings: Config) -> LocalStorage:
    return LocalStorage(settings.storage_root)


Storage = Annotated[LocalStorage, Depends(get_storage)]


def require_write(settings: Config, authorization: Annotated[str | None, Header()] = None) -> None:
    token = settings.ingest_token
    if token is None:
        if settings.env == "dev":
            return
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "writes are disabled: set VANDRISHTI_INGEST_TOKEN"
        )
    given = (authorization or "").removeprefix("Bearer ").strip()
    # Constant-time comparison: no timing hints about the token.
    if not secrets.compare_digest(given.encode(), token.get_secret_value().encode()):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "missing or wrong token", {"WWW-Authenticate": "Bearer"}
        )


Writer = Depends(require_write)
