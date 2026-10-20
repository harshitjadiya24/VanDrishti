"""Liveness, readiness and version. The only endpoints that will never need a login."""

from __future__ import annotations

import platform
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from vandrishti import __version__
from vandrishti.core.config import Settings, get_settings
from vandrishti.db.session import get_session

router = APIRouter(tags=["health"])


class VersionOut(BaseModel):
    name: str
    version: str
    env: str
    python: str


@router.get("/health")
def health() -> dict[str, str]:
    """The process is up (no dependencies checked)."""
    return {"status": "ok"}


@router.get("/health/ready")
def ready(response: Response, session: Annotated[Session, Depends(get_session)]) -> dict[str, str]:
    """The database answers; 503 otherwise, so a load balancer stops sending traffic."""
    try:
        session.execute(text("SELECT 1"))
    except Exception:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "unavailable", "database": "down"}
    return {"status": "ok", "database": "up"}


@router.get("/version")
def version(settings: Annotated[Settings, Depends(get_settings)]) -> VersionOut:
    return VersionOut(
        name="vandrishti", version=__version__, env=settings.env, python=platform.python_version()
    )
