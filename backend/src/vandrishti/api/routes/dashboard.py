"""Section 10.1-10.4 over HTTP: overview, camera map, camera analytics, trends."""

from __future__ import annotations

import uuid
from typing import Any, Literal

from fastapi import APIRouter, HTTPException

from vandrishti.analytics import dashboard
from vandrishti.api.deps import DB, Scoped, User, guard_camera
from vandrishti.auth.rbac import round_coord

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/overview")
def overview(session: DB, reserve: Scoped) -> dict[str, Any]:
    return dashboard.overview(session, reserve=reserve)


@router.get("/map")
def camera_map(session: DB, reserve: Scoped, user: User) -> dict[str, Any]:
    """Exact positions only for roles granted precise locations; others get 0.1 degree."""
    m = dashboard.camera_map(session, reserve=reserve)
    for c in m["cameras"]:
        c["latitude"] = round_coord(c["latitude"], user.user)
        c["longitude"] = round_coord(c["longitude"], user.user)
    return m


@router.get("/cameras/{camera_id}")
def camera_detail(camera_id: uuid.UUID, session: DB, user: User) -> dict[str, Any]:
    guard_camera(session, user, camera_id)
    detail = dashboard.camera_detail(session, camera_id)
    if detail is None:
        raise HTTPException(404, "no such camera")
    return detail


@router.get("/trends")
def trends(session: DB, reserve: Scoped, period: Literal["day", "week"] = "day") -> dict[str, Any]:
    return dashboard.trends(session, reserve=reserve, period=period)
