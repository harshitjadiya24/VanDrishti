"""Integration API v1 (section 11) for forest-department systems.

Read-only. Every call needs `X-API-Key: vd_...` (or `Authorization: Bearer vd_...`), is
limited to the key's reserve, and is written to the audit trail. Coordinates are rounded to
0.1 degree unless the key was granted precise locations. People and vehicles appear only as
counted events (no images, no observations).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy import select

from vandrishti import audit
from vandrishti.analytics import dashboard
from vandrishti.analytics.labels import settled_labels
from vandrishti.api.deps import DB, Config
from vandrishti.api.ratelimit import RateLimiter
from vandrishti.api.routes.outcomes import AlertOut, _alert_query, _alert_rows, report_response
from vandrishti.db.models import (
    Alert,
    AlertState,
    ApiKey,
    Camera,
    Image,
    Individual,
    ReidEmbedding,
    Reserve,
    TimeSource,
)
from vandrishti.exports import camtrap_dp
from vandrishti.integration import keys
from vandrishti.reports import data as reports

router = APIRouter(prefix="/v1", tags=["integration v1"])
TIMED = (TimeSource.EXIF, TimeSource.MANIFEST)


_LIMITS: dict[int, RateLimiter] = {}
REFUSED = RateLimiter(30)  # audit at most 30 refused attempts a minute per client


def _limiter(per_minute: int) -> RateLimiter:
    return _LIMITS.setdefault(per_minute, RateLimiter(per_minute))


def api_key(
    request: Request,
    session: DB,
    settings: Config,
    x_api_key: Annotated[str | None, Header()] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> tuple[ApiKey, Reserve]:
    given = x_api_key or (authorization or "").removeprefix("Bearer ").strip()
    row = keys.verify(session, given) if given else None
    if row is None:
        client = request.client.host if request.client else "unknown"
        if REFUSED.allow(client):  # recorded, but a flood cannot fill the audit trail
            parts = given.split("_") if given else []
            audit.append(
                session,
                actor=f"client:{client}",
                action="api_key_refused",
                entity="v1",
                entity_id=request.url.path[:64],
                payload={"prefix": parts[1][:16] if len(parts) > 2 else None},
            )
            session.commit()
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "missing, wrong or revoked API key",
            {"WWW-Authenticate": "Bearer"},
        )
    if not _limiter(settings.api_rate_per_minute).allow(row.prefix):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "rate limit: slow down", {"Retry-After": "60"}
        )
    res = session.get(Reserve, row.reserve_id)
    if res is None:  # pragma: no cover - foreign key
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "key has no reserve")
    audit.append(
        session,
        actor=f"apikey:{row.name}({row.prefix})",
        action="api_read",
        entity="v1",
        entity_id=request.url.path[:64],
        payload={"query": str(request.url.query)[:500]},
    )
    session.commit()
    return row, res


Key = Annotated[tuple[ApiKey, Reserve], Depends(api_key)]


def _round(v: float | None, precise: bool) -> float | None:
    return v if v is None or precise else round(v, 1)


@router.get("/summary")
def summary(session: DB, key: Key) -> dict[str, Any]:
    return dashboard.overview(session, reserve=key[1].code)


@router.get("/cameras")
def cameras(session: DB, key: Key) -> list[dict[str, Any]]:
    k, res = key
    return [
        {
            "code": c.code,
            "status": c.status.value,
            "latitude": _round(c.latitude, k.precise_locations),
            "longitude": _round(c.longitude, k.precise_locations),
            "coordinates": "exact" if k.precise_locations else "rounded to 0.1 degree",
            "last_seen_at": c.last_seen_at,
        }
        for c in session.scalars(
            select(Camera).where(Camera.reserve_id == res.id).order_by(Camera.code)
        )
    ]


@router.get("/observations")
def observations(
    session: DB,
    key: Key,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = 1000,
    offset: int = 0,
) -> dict[str, Any]:
    """Settled animal labels, oldest first. `captured_at` is null when unreliable."""
    res = key[1]
    labels = {i: lab for i, lab in settled_labels(session, reserve=res.code).items() if lab.taxon}
    q = (
        select(Image.id, Image.captured_at, Image.time_source, Camera.code)
        .join(Camera, Camera.id == Image.camera_id)
        .where(Image.id.in_(list(labels)))
        .order_by(Image.captured_at.nulls_last(), Image.id)
    )
    if since:
        q = q.where(Image.captured_at >= since, Image.time_source.in_(TIMED))
    if until:
        q = q.where(Image.captured_at < until, Image.time_source.in_(TIMED))
    limit = min(max(limit, 1), 5000)
    rows = session.execute(q.offset(max(offset, 0)).limit(limit + 1)).all() if labels else []
    named = (
        dict(
            session.execute(
                select(ReidEmbedding.image_id, Individual.code)
                .join(Individual, Individual.id == ReidEmbedding.individual_id)
                .where(ReidEmbedding.image_id.in_([r.id for r in rows]))
            ).all()
        )
        if rows
        else {}
    )
    items = []
    for r in rows[:limit]:
        lab = labels[r.id]
        sci = camtrap_dp.scientific_name(lab.taxon or "")
        items.append(
            {
                "image_id": str(r.id),
                "camera": r.code,
                "captured_at": r.captured_at if r.time_source in TIMED else None,
                "label": lab.label,
                "scientific_name": sci[0] if sci else None,
                "taxon_rank": sci[1] if sci else None,
                "labelled_by": "person" if lab.source == "person" else "model (auto-accepted)",
                "individual": named.get(r.id),
            }
        )
    return {"items": items, "next_offset": offset + limit if len(rows) > limit else None}


@router.get("/alerts")
def v1_alerts(
    session: DB,
    key: Key,
    state: Literal["open", "acknowledged", "resolved"] | None = None,
    since: datetime | None = None,
    limit: int = 500,
) -> list[AlertOut]:
    q = _alert_query(key[1].code)
    if state:
        q = q.where(Alert.state == AlertState(state))
    if since:
        q = q.where(Alert.created_at >= since)
    return _alert_rows(session, q.order_by(Alert.created_at.desc()).limit(min(max(limit, 1), 2000)))


@router.get("/reports")
def v1_report(
    session: DB,
    key: Key,
    period: reports.Period = "weekly",
    day: date | None = None,
    start: date | None = None,
    end: date | None = None,
    format: Literal["json", "xlsx", "pdf"] = "json",
) -> Any:
    return report_response(session, key[1].code, period, day, start, end, format)


@router.get("/camtrap-dp")
def v1_camtrap(session: DB, key: Key, sampling_design: camtrap_dp.SamplingDesign) -> Response:
    k, res = key
    try:
        body, _ = camtrap_dp.build(
            session, res.code, sampling_design=sampling_design, precise=k.precise_locations
        )
    except camtrap_dp.ExportError as e:
        raise HTTPException(409, str(e)) from e
    return Response(
        body,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="vandrishti-{res.code}-camtrap-dp.zip"'
        },
    )
