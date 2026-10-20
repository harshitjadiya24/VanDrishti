"""Review queue, review actions with undo, and feedback statistics (section 8).

Every action is a new `review` row plus an audit event; nothing is edited in place. Undo
marks the review undone (with time and person) and reopens the route. Confirming or
correcting a species marks the decision human-verified: that is what the time-of-day prior
learns from, and what analytics trust.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from vandrishti import audit
from vandrishti.db.models import (
    Camera,
    Decision,
    Image,
    Reserve,
    Review,
    ReviewAction,
    Route,
    RouteState,
    Routing,
    Severity,
)

# Which actions make sense on which route (others are refused).
ALLOWED: dict[Route, set[ReviewAction]] = {
    Route.AUTO_ACCEPT: {
        ReviewAction.CONFIRM,
        ReviewAction.CORRECT,
        ReviewAction.NOT_ANIMAL,
        ReviewAction.SKIP,
    },
    Route.REVIEW: {
        ReviewAction.CONFIRM,
        ReviewAction.CORRECT,
        ReviewAction.NOT_ANIMAL,
        ReviewAction.SKIP,
    },
    Route.UNCERTAIN: {
        ReviewAction.CONFIRM,
        ReviewAction.CORRECT,
        ReviewAction.NOT_ANIMAL,
        ReviewAction.SKIP,
    },
    Route.LIKELY_BLANK: {ReviewAction.NOT_ANIMAL, ReviewAction.CORRECT, ReviewAction.SKIP},
    Route.PEOPLE_VEHICLES: {
        ReviewAction.CONFIRM_PEOPLE,
        ReviewAction.FALSE_ALARM,
        ReviewAction.SKIP,
    },
    Route.QUALITY: {ReviewAction.QUALITY_OK, ReviewAction.QUALITY_BAD, ReviewAction.SKIP},
}
QUEUES: dict[str, list[Route]] = {
    "people_vehicles": [Route.PEOPLE_VEHICLES],
    "review": [Route.REVIEW, Route.AUTO_ACCEPT],  # medium band + spot checks
    "uncertain": [Route.UNCERTAIN],
    "blank": [Route.LIKELY_BLANK],
    "quality": [Route.QUALITY],
}


class ReviewError(ValueError):
    pass


def queue(
    session: Session, kind: str, *, reserve: str | None = None, limit: int = 50
) -> list[tuple[Routing, Image, Decision | None, str]]:
    """Open items of one queue, oldest capture first (people/vehicles always first)."""
    if kind not in QUEUES:
        raise ReviewError(f"unknown queue {kind!r}; choose from {', '.join(QUEUES)}")
    q = (
        select(Routing, Image, Decision, Camera.code)
        .join(Image, Image.id == Routing.image_id)
        .join(Camera, Camera.id == Image.camera_id)
        .outerjoin(Decision, Decision.id == Routing.decision_id)
        .where(Routing.route.in_(QUEUES[kind]), Routing.state == RouteState.OPEN)
    )
    if reserve:
        q = q.join(Reserve, Reserve.id == Camera.reserve_id).where(Reserve.code == reserve)
    rows = session.execute(q.order_by(Image.captured_at, Image.id).limit(limit)).all()
    return [(r, i, d, cam) for r, i, d, cam in rows]


@dataclass(frozen=True)
class ReviewInput:
    image_id: Any
    action: ReviewAction
    reviewer: str
    human_label: str | None = None
    human_taxon: str | None = None
    poaching_activity: bool = False
    severity: Severity | None = None
    notes: str | None = None


def submit(session: Session, data: ReviewInput) -> Review:
    routing = session.scalar(select(Routing).where(Routing.image_id == data.image_id))
    if routing is None:
        raise ReviewError("this image has not been routed yet")
    if routing.state is not RouteState.OPEN:
        raise ReviewError(f"nothing to review: route is {routing.state.value}")
    if data.action not in ALLOWED[routing.route]:
        raise ReviewError(f"'{data.action.value}' does not apply to a {routing.route.value} item")
    if data.action is ReviewAction.CORRECT and not data.human_label:
        raise ReviewError("a correction needs the right label")
    decision = session.get(Decision, routing.decision_id) if routing.decision_id else None
    review = Review(
        image_id=data.image_id,
        routing_id=routing.id,
        decision_id=decision.id if decision else None,
        reviewer=data.reviewer,
        action=data.action,
        model_label=decision.label if decision else None,
        model_taxon=decision.taxon if decision else None,
        model_confidence=decision.confidence if decision else None,
        human_label=_human_label(data, decision),
        human_taxon=data.human_taxon
        if data.action is ReviewAction.CORRECT
        else (decision.taxon if data.action is ReviewAction.CONFIRM and decision else None),
        poaching_activity=data.poaching_activity,
        severity=data.severity,
        notes=(data.notes or None) and data.notes[:2000],
    )
    session.add(review)
    if data.action is not ReviewAction.SKIP:
        routing.state = RouteState.DONE
    if decision and data.action is ReviewAction.CONFIRM:
        decision.verified_by_human = True
    session.flush()
    audit.append(
        session,
        actor=f"reviewer:{data.reviewer}",
        action=f"review_{data.action.value}",
        entity="image",
        entity_id=str(data.image_id),
        payload={
            "review": str(review.id),
            "route": routing.route.value,
            "model_label": review.model_label,
            "human_label": review.human_label,
            "poaching": data.poaching_activity,
            "severity": data.severity.value if data.severity else None,
        },
    )
    session.commit()
    return review


def _human_label(data: ReviewInput, decision: Decision | None) -> str | None:
    if data.action is ReviewAction.CONFIRM:
        return decision.label if decision else None
    if data.action is ReviewAction.CORRECT:
        return data.human_label
    if data.action is ReviewAction.NOT_ANIMAL:
        return "blank"
    return None


def undo(session: Session, review_id: Any, reviewer: str) -> Review:
    review = session.get(Review, review_id)
    if review is None:
        raise ReviewError("no such review")
    if review.undone_at is not None:
        raise ReviewError("already undone")
    review.undone_at = datetime.now(UTC)
    routing = session.get(Routing, review.routing_id) if review.routing_id else None
    if routing is not None:
        routing.state = RouteState.OPEN
    if review.decision_id and review.action is ReviewAction.CONFIRM:
        still = session.scalar(
            select(Review.id).where(
                Review.decision_id == review.decision_id,
                Review.action == ReviewAction.CONFIRM,
                Review.undone_at.is_(None),
                Review.id != review.id,
            )
        )
        decision = session.get(Decision, review.decision_id)
        if decision is not None and still is None:
            decision.verified_by_human = False
    audit.append(
        session,
        actor=f"reviewer:{reviewer}",
        action="review_undo",
        entity="review",
        entity_id=str(review.id),
        payload={"image": str(review.image_id), "action": review.action.value},
    )
    session.commit()
    return review


def feedback_stats(session: Session, *, reserve: str | None = None) -> dict[str, Any]:
    """How often people agreed with the model, per confidence band, and what they changed."""
    q = (
        select(Review)
        .join(Image, Image.id == Review.image_id)
        .join(Camera, Camera.id == Image.camera_id)
        .where(Review.undone_at.is_(None), Review.action != ReviewAction.SKIP)
    )
    if reserve:
        q = q.join(Reserve, Reserve.id == Camera.reserve_id).where(Reserve.code == reserve)
    bands: dict[str, Counter[str]] = {}
    confusions: Counter[tuple[str, str]] = Counter()
    actions: Counter[str] = Counter()
    poaching = 0
    for r in session.scalars(q):
        actions[r.action.value] += 1
        poaching += r.poaching_activity
        if r.model_confidence is None or r.action not in (
            ReviewAction.CONFIRM,
            ReviewAction.CORRECT,
            ReviewAction.NOT_ANIMAL,
        ):
            continue
        band = (
            "high"
            if r.model_confidence >= 0.9
            else "medium"
            if r.model_confidence >= 0.6
            else "low"
        )
        agreed = r.action is ReviewAction.CONFIRM
        bands.setdefault(band, Counter())["agreed" if agreed else "changed"] += 1
        if not agreed:
            confusions[(r.model_label or "?", r.human_label or "?")] += 1
    return {
        "actions": dict(actions),
        "poaching_marked": poaching,
        "by_band": {
            b: {**c, "agreement": round(c["agreed"] / (c["agreed"] + c["changed"]), 3)}
            for b, c in bands.items()
        },
        "top_corrections": [
            {"model": m, "human": h, "count": n} for (m, h), n in confusions.most_common(20)
        ],
    }
