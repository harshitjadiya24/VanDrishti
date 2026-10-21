"""Section 11 over HTTP for the console: alerts, reports, Camtrap DP export."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from vandrishti.alerts import rules
from vandrishti.alerts import service as alerts
from vandrishti.api.deps import DB, Config, Scoped, User, check_reserve, guard_alert, require
from vandrishti.auth.rbac import Permission
from vandrishti.db.models import Alert, AlertDelivery, AlertKind, AlertState, Camera, Reserve
from vandrishti.exports import camtrap_dp
from vandrishti.reports import data as reports
from vandrishti.reports import render

router = APIRouter(tags=["outcomes"])
MEDIA = {
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pdf": "application/pdf",
}


class AlertOut(BaseModel):
    id: uuid.UUID
    reserve: str
    timezone: str
    camera: str | None
    kind: str
    severity: str
    state: str
    title: str
    detail: dict[str, Any]
    occurred_at: datetime | None
    created_at: datetime
    acted_by: str | None
    acted_at: datetime | None
    note: str | None
    webhook: str | None


class ActIn(BaseModel):
    action: Literal["acknowledge", "resolve", "reopen"]
    note: str | None = Field(default=None, max_length=2000)


def _alert_rows(session: Any, q: Any) -> list[AlertOut]:
    out = []
    for a, code, tz, cam in session.execute(q):
        d = session.scalar(select(AlertDelivery.status).where(AlertDelivery.alert_id == a.id))
        out.append(
            AlertOut(
                id=a.id,
                reserve=code,
                timezone=tz,
                camera=cam,
                kind=a.kind.value,
                severity=a.severity.value,
                state=a.state.value,
                title=a.title,
                detail=a.detail,
                occurred_at=a.occurred_at,
                created_at=a.created_at,
                acted_by=a.acted_by,
                acted_at=a.acted_at,
                note=a.note,
                webhook=d.value if d else None,
            )
        )
    return out


def _alert_query(reserve: str | None) -> Any:
    q = (
        select(Alert, Reserve.code, Reserve.timezone, Camera.code)
        .join(Reserve, Reserve.id == Alert.reserve_id)
        .join(Camera, Camera.id == Alert.camera_id, isouter=True)
    )
    return q.where(Reserve.code == reserve) if reserve else q


@router.get("/alerts")
def list_alerts(
    session: DB,
    reserve: Scoped,
    state: Literal["open", "acknowledged", "resolved"] | None = None,
    kind: Literal["tiger_sighting", "poaching_risk", "unusual_activity", "camera_failure"]
    | None = None,
    limit: int = 200,
) -> list[AlertOut]:
    q = _alert_query(reserve)
    if state:
        q = q.where(Alert.state == AlertState(state))
    if kind:
        q = q.where(Alert.kind == AlertKind(kind))
    sev = {"critical": 0, "warning": 1, "info": 2}
    rows = _alert_rows(session, q.order_by(Alert.created_at.desc()).limit(min(max(limit, 1), 1000)))
    rows.sort(key=lambda a: (sev[a.severity], -(a.occurred_at or a.created_at).timestamp()))
    return rows


@router.get("/alerts/counts")
def alert_counts(session: DB, reserve: Scoped) -> dict[str, int]:
    q = (
        select(Alert.severity, func.count())
        .join(Reserve, Reserve.id == Alert.reserve_id)
        .where(Alert.state == AlertState.OPEN)
    )
    if reserve:
        q = q.where(Reserve.code == reserve)
    counts = {s.value: n for s, n in session.execute(q.group_by(Alert.severity))}
    return {k: counts.get(k, 0) for k in ("critical", "warning", "info")}


@router.post("/alerts/run", dependencies=[require(Permission.RUN)])
def run_alerts(session: DB, reserve: Scoped, settings: Config) -> dict[str, Any]:
    cfg = rules.AlertConfig(camera_silent_days=settings.camera_silent_days)
    made = rules.evaluate(session, reserve=reserve, cfg=cfg)
    try:
        sent: dict[str, Any] = dict(alerts.deliver(session, settings))
    except alerts.AlertError as e:
        sent = {"error": str(e)}
    return {"rules": made, "webhook": sent}


@router.post("/alerts/{alert_id}/act", dependencies=[require(Permission.ACT_ALERTS)])
def act(alert_id: uuid.UUID, body: ActIn, session: DB, user: User) -> AlertOut:
    guard_alert(session, user, alert_id)
    try:
        alerts.act(session, alert_id, body.action, user.name, body.note)
    except alerts.AlertError as e:
        raise HTTPException(409, str(e)) from e
    return _alert_rows(session, _alert_query(None).where(Alert.id == alert_id))[0]


def report_response(
    session: Any,
    reserve: str,
    period: reports.Period,
    day: date | None,
    start: date | None,
    end: date | None,
    fmt: str,
) -> Any:
    try:
        lo, hi = reports.period_range(period, day, start, end)
        r = reports.build(session, reserve, lo, hi, period)
    except reports.ReportError as e:
        raise HTTPException(400, str(e)) from e
    if fmt == "json":
        return r
    body = render.to_xlsx(r) if fmt == "xlsx" else render.to_pdf(r)
    name = f"vandrishti-{reserve}-{period}-{lo.isoformat()}.{fmt}"
    return Response(
        body,
        media_type=MEDIA[fmt],
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/reports/{reserve}")
def report(
    reserve: str,
    session: DB,
    user: User,
    period: reports.Period = "weekly",
    day: date | None = None,
    start: date | None = None,
    end: date | None = None,
    format: Literal["json", "xlsx", "pdf"] = "json",
) -> Any:
    check_reserve(user, reserve)
    return report_response(session, reserve, period, day, start, end, format)


@router.get("/exports/{reserve}/camtrap-dp", dependencies=[require(Permission.EXPORT)])
def camtrap(
    reserve: str, session: DB, user: User, sampling_design: camtrap_dp.SamplingDesign
) -> Response:
    """Rounded coordinates only here; exact ones need an API key granted precise locations
    or the command line."""
    check_reserve(user, reserve)
    try:
        body, _ = camtrap_dp.build(session, reserve, sampling_design=sampling_design)
    except camtrap_dp.ExportError as e:
        raise HTTPException(409, str(e)) from e
    return Response(
        body,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="vandrishti-{reserve}-camtrap-dp.zip"'
        },
    )
