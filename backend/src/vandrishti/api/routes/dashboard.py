"""Section 10.1-10.4 over HTTP: overview, camera map, camera analytics, trends."""

from __future__ import annotations

import uuid
from typing import Any, Literal

from fastapi import APIRouter, HTTPException

from vandrishti.analytics import dashboard
from vandrishti.api.deps import DB

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/overview")
def overview(session: DB, reserve: str | None = None) -> dict[str, Any]:
    return dashboard.overview(session, reserve=reserve)


@router.get("/map")
def camera_map(session: DB, reserve: str | None = None) -> dict[str, Any]:
    return dashboard.camera_map(session, reserve=reserve)


@router.get("/cameras/{camera_id}")
def camera_detail(camera_id: uuid.UUID, session: DB) -> dict[str, Any]:
    detail = dashboard.camera_detail(session, camera_id)
    if detail is None:
        raise HTTPException(404, "no such camera")
    return detail


@router.get("/trends")
def trends(
    session: DB, reserve: str | None = None, period: Literal["day", "week"] = "day"
) -> dict[str, Any]:
    return dashboard.trends(session, reserve=reserve, period=period)
