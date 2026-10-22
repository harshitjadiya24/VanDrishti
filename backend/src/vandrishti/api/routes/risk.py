"""Section 6 over HTTP: presence events and their explained poaching-risk levels."""

from __future__ import annotations

import uuid
from collections import Counter, defaultdict
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from vandrishti.api.deps import DB, Config, Scoped, require
from vandrishti.auth.rbac import Permission
from vandrishti.db.models import Camera, PresenceEvent, Reserve, RiskAssessment, RiskLevel
from vandrishti.pipeline.risk import RiskConfig, assess, build_events

router = APIRouter(tags=["risk"])


class RiskEventOut(BaseModel):
    event_id: uuid.UUID
    camera: str
    camera_sensitivity: str
    start_at: datetime
    timezone: str
    people: int
    vehicles: int
    vehicle_type: str | None
    vehicle_type_score: float | None
    night: bool
    night_basis: str
    level: str
    score: int
    dismissed: bool
    factors: list[dict[str, Any]]
    image_ids: list[str]


def _rows(session: Any, reserve: str | None) -> list[Any]:
    q = (
        select(PresenceEvent, RiskAssessment, Camera, Reserve.timezone)
        .join(RiskAssessment, RiskAssessment.event_id == PresenceEvent.id)
        .join(Camera, Camera.id == PresenceEvent.camera_id)
        .join(Reserve, Reserve.id == Camera.reserve_id)
        .where(RiskAssessment.config_hash == RiskConfig().hash())
    )
    if reserve:
        q = q.where(Reserve.code == reserve)
    return list(session.execute(q).all())


@router.post("/risk/run", dependencies=[require(Permission.RUN)])
def risk_run(session: DB, reserve: Scoped, settings: Config) -> dict[str, Any]:
    """Group people/vehicle frames into events and (re)score them all."""
    created = build_events(session, settings, reserve=reserve)
    return {"new_events": created, "levels": assess(session, reserve=reserve)}


@router.get("/risk/events")
def risk_events(
    session: DB,
    reserve: Scoped,
    level: Literal["low", "medium", "high"] | None = None,
    include_dismissed: bool = False,
    limit: int = 200,
) -> list[RiskEventOut]:
    order = {RiskLevel.HIGH: 0, RiskLevel.MEDIUM: 1, RiskLevel.LOW: 2}
    rows = [
        r
        for r in _rows(session, reserve)
        if (include_dismissed or not r[1].dismissed)
        and (level is None or r[1].level.value == level)
    ]
    rows.sort(
        key=lambda r: (r[1].dismissed, order[r[1].level], -r[1].score, -r[0].start_at.timestamp())
    )
    return [
        RiskEventOut(
            event_id=e.id,
            camera=cam.code,
            camera_sensitivity=cam.sensitivity.value,
            start_at=e.start_at,
            timezone=tz,
            people=e.people_count,
            vehicles=e.vehicle_count,
            vehicle_type=e.vehicle_type,
            vehicle_type_score=e.vehicle_type_score,
            night=e.night,
            night_basis=e.night_basis,
            level=a.level.value,
            score=a.score,
            dismissed=a.dismissed,
            factors=a.factors,
            image_ids=e.image_ids,
        )
        for e, a, cam, tz in rows[: min(max(limit, 1), 1000)]
    ]


@router.get("/risk/summary")
def risk_summary(session: DB, reserve: Scoped) -> dict[str, Any]:
    rows = [r for r in _rows(session, reserve) if not r[1].dismissed]
    levels = Counter(a.level.value for _, a, _, _ in rows)
    cams: dict[str, Counter[str]] = defaultdict(Counter)
    for _, a, cam, _ in rows:
        cams[cam.code][a.level.value] += 1
    top = sorted(
        cams.items(), key=lambda kv: (-kv[1]["high"], -kv[1]["medium"], -sum(kv[1].values()))
    )
    return {
        "events": len(rows),
        "levels": {k: levels.get(k, 0) for k in ("high", "medium", "low")},
        "night_share": round(sum(e.night for e, _, _, _ in rows) / len(rows), 3) if rows else None,
        "dismissed": len(_rows(session, reserve)) - len(rows),
        "cameras": [
            {"camera": c, **{k: n.get(k, 0) for k in ("high", "medium", "low")}}
            for c, n in top[:10]
        ],
        # The points where a total becomes MEDIUM or HIGH (a floor, such as a reviewer's
        # poaching mark, can still raise the level).
        "thresholds": {"medium": RiskConfig().medium_from, "high": RiskConfig().high_from},
        "note": (
            "A way to decide what to look at first, not a prediction:"
            " the weights are not fitted to poaching outcomes."
        ),
    }
