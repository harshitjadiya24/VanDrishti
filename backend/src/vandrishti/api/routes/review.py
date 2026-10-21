"""Sections 7-8 over HTTP: routing, review queues, review actions, feedback, audit.

Every action is signed with the signed-in user's name and is in the audit trail. Species
queues need REVIEW_SPECIES, the people/vehicle queue REVIEW_PEOPLE.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from vandrishti import audit, species_names
from vandrishti.api.deps import (
    DB,
    Config,
    Scoped,
    User,
    guard_image,
    guard_review,
    require,
)
from vandrishti.auth.rbac import Permission, can
from vandrishti.db.models import (
    AuditEvent,
    Camera,
    Detection,
    Image,
    PresenceEvent,
    Reserve,
    ReserveSpecies,
    Review,
    ReviewAction,
    RiskAssessment,
    Route,
    RouteState,
    Routing,
    Severity,
)
from vandrishti.pipeline.risk import RiskConfig
from vandrishti.pipeline.routing import run_routing
from vandrishti.review import service

router = APIRouter(tags=["review"])
QueueKind = Literal["people_vehicles", "review", "uncertain", "blank", "quality"]


class BoxOut(BaseModel):
    category: str
    confidence: float
    box: list[float]


class QueueItem(BaseModel):
    image_id: uuid.UUID
    route: str
    spot_check: bool
    reason: str
    camera: str
    captured_at: datetime | None
    timezone: str  # the reserve's: times are shown in it, never the viewer's
    quality_flags: list[str]
    label: str | None
    taxon: str | None
    confidence: float | None
    explanation: dict[str, Any] | None
    boxes: list[BoxOut]
    has_mask: bool
    allowed_actions: list[str]
    risk: dict[str, Any] | None = None  # section 6, for people/vehicle frames


class RouteCount(BaseModel):
    route: str
    state: str
    count: int


@router.post("/routing/run", dependencies=[require(Permission.RUN)])
def routing_run(session: DB, reserve: Scoped) -> dict[str, int]:
    """(Re)route every screened image; reviewed routes are never reopened."""
    return run_routing(session, reserve=reserve)


@router.get("/routing/summary")
def routing_summary(session: DB, reserve: Scoped) -> list[RouteCount]:
    q = (
        select(Routing.route, Routing.state, func.count())
        .join(Image, Image.id == Routing.image_id)
        .join(Camera, Camera.id == Image.camera_id)
    )
    if reserve:
        q = q.join(Reserve, Reserve.id == Camera.reserve_id).where(Reserve.code == reserve)
    rows = session.execute(q.group_by(Routing.route, Routing.state)).all()
    return [RouteCount(route=r.value, state=s.value, count=n) for r, s, n in rows]


def _may_review(user: User, people: bool) -> None:
    perm = Permission.REVIEW_PEOPLE if people else Permission.REVIEW_SPECIES
    if not can(user.user, perm):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"your role cannot do this ({perm.value})")


@router.get("/review/queue")
def review_queue(
    session: DB, reserve: Scoped, user: User, kind: QueueKind = "review", limit: int = 50
) -> list[QueueItem]:
    _may_review(user, kind == "people_vehicles")
    out = []
    zones: dict[uuid.UUID, str] = {}
    for routing, img, decision, camera in service.queue(
        session, kind, reserve=reserve, limit=min(max(limit, 1), 200)
    ):
        if img.camera_id not in zones:
            zones[img.camera_id] = (
                session.scalar(
                    select(Reserve.timezone)
                    .join(Camera, Camera.reserve_id == Reserve.id)
                    .where(Camera.id == img.camera_id)
                )
                or "UTC"
            )
        boxes = session.scalars(
            select(Detection)
            .where(Detection.image_id == img.id, Detection.config_hash == img.screened_with)
            .order_by(Detection.det_index)
        )
        explanation = decision.explanation if decision else None
        out.append(
            QueueItem(
                image_id=img.id,
                route=routing.route.value,
                spot_check=routing.spot_check,
                reason=routing.reason,
                camera=camera,
                captured_at=img.captured_at,
                timezone=zones[img.camera_id],
                quality_flags=img.quality_flags,
                label=decision.label if decision else None,
                taxon=decision.taxon if decision else None,
                confidence=decision.confidence if decision else None,
                explanation=explanation,
                boxes=[
                    BoxOut(
                        category=d.category.value, confidence=d.confidence, box=[d.x, d.y, d.w, d.h]
                    )
                    for d in boxes
                    if d.confidence >= 0.1
                ],
                has_mask=bool(explanation and "mask" in explanation),
                risk=_risk_for(session, img.id),
                allowed_actions=sorted(a.value for a in service.ALLOWED[routing.route]),
            )
        )
    return out


def _risk_for(session: Any, image_id: uuid.UUID) -> dict[str, Any] | None:
    row = session.execute(
        select(PresenceEvent, RiskAssessment)
        .join(RiskAssessment, RiskAssessment.event_id == PresenceEvent.id)
        .where(
            PresenceEvent.image_ids.contains([str(image_id)]),
            RiskAssessment.config_hash == RiskConfig().hash(),
        )
    ).first()
    if row is None:
        return None
    event, a = row
    return {
        "level": a.level.value,
        "score": a.score,
        "dismissed": a.dismissed,
        "factors": a.factors,
        "people": event.people_count,
        "vehicles": event.vehicle_count,
        "vehicle_type": event.vehicle_type,
        "night": event.night,
    }


class ReviewIn(BaseModel):
    image_id: uuid.UUID
    action: ReviewAction
    human_label: str | None = Field(default=None, max_length=200)
    human_taxon: str | None = Field(default=None, max_length=300)
    poaching_activity: bool = False
    severity: Severity | None = None
    notes: str | None = Field(default=None, max_length=2000)


class ReviewOut(BaseModel):
    id: uuid.UUID
    image_id: uuid.UUID
    action: str
    model_label: str | None
    human_label: str | None
    undone: bool


def _out(r: Any) -> ReviewOut:
    return ReviewOut(
        id=r.id,
        image_id=r.image_id,
        action=r.action.value,
        model_label=r.model_label,
        human_label=r.human_label,
        undone=r.undone_at is not None,
    )


def _is_people(session: Any, image_id: uuid.UUID) -> bool:
    route = session.scalar(select(Routing.route).where(Routing.image_id == image_id))
    return route is Route.PEOPLE_VEHICLES


@router.post("/reviews", status_code=status.HTTP_201_CREATED)
def create_review(body: ReviewIn, session: DB, user: User) -> ReviewOut:
    guard_image(session, user, body.image_id)
    _may_review(user, _is_people(session, body.image_id))
    try:
        review = service.submit(
            session, service.ReviewInput(**body.model_dump(), reviewer=user.name)
        )
    except service.ReviewError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None
    return _out(review)


@router.post("/reviews/{review_id}/undo")
def undo_review(review_id: uuid.UUID, session: DB, user: User) -> ReviewOut:
    guard_review(session, user, review_id)
    image_id = session.scalar(select(Review.image_id).where(Review.id == review_id))
    _may_review(user, image_id is not None and _is_people(session, image_id))
    try:
        return _out(service.undo(session, review_id, user.name))
    except service.ReviewError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None


@router.get("/feedback/stats")
def feedback(session: DB, reserve: Scoped) -> dict[str, Any]:
    """Section 8 feedback: human agreement with the model per confidence band."""
    return service.feedback_stats(session, reserve=reserve)


class TaxonOut(BaseModel):
    common_name: str
    taxon: str
    level: str
    on_reserve_list: bool


@router.get("/taxa")
def taxa(q: str, session: DB, reserve: Scoped, settings: Config) -> list[TaxonOut]:
    """Names for corrections (SpeciesNet's label list); the reserve's own species first."""
    listed: frozenset[str] = frozenset()
    country = None
    if reserve:
        country = session.scalar(select(Reserve.country).where(Reserve.code == reserve))
        listed = frozenset(
            session.scalars(
                select(ReserveSpecies.taxon)
                .join(Reserve, Reserve.id == ReserveSpecies.reserve_id)
                .where(Reserve.code == reserve)
            )
        )
    return [
        TaxonOut(
            common_name=t.common_name,
            taxon=t.taxon,
            level=t.level,
            on_reserve_list=t.taxon in listed,
        )
        for t in species_names.search(settings.model_cache_dir, q, first=listed, country=country)
    ]


class AuditOut(BaseModel):
    seq: int
    at: datetime
    actor: str
    action: str
    entity: str
    entity_id: str | None
    payload: dict[str, Any]


@router.get("/audit/events", dependencies=[require(Permission.VIEW_AUDIT)])
def audit_events(session: DB, limit: int = 100) -> list[AuditOut]:
    rows = session.scalars(
        select(AuditEvent).order_by(AuditEvent.seq.desc()).limit(min(limit, 500))
    )
    return [
        AuditOut(
            seq=e.seq,
            at=e.at,
            actor=e.actor,
            action=e.action,
            entity=e.entity,
            entity_id=e.entity_id,
            payload=e.payload,
        )
        for e in rows
    ]


@router.get("/audit/verify")
def audit_verify(session: DB) -> dict[str, Any]:
    v = audit.verify(session)
    return {"ok": v.ok, "events_checked": v.events, "first_broken_seq": v.first_broken_seq}


@router.get("/review/counts")
def open_counts(session: DB, reserve: Scoped) -> dict[str, int]:
    """Open items per queue (for the navigation badges)."""
    counts = {}
    for kind, routes in service.QUEUES.items():
        q = (
            select(func.count())
            .select_from(Routing)
            .join(Image, Image.id == Routing.image_id)
            .join(Camera, Camera.id == Image.camera_id)
            .where(Routing.route.in_(routes), Routing.state == RouteState.OPEN)
        )
        if reserve:
            q = q.join(Reserve, Reserve.id == Camera.reserve_id).where(Reserve.code == reserve)
        counts[kind] = session.scalar(q) or 0
    return counts
