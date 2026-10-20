"""Section 7: confidence-based routing.

- decision confidence >= high (0.90) → AUTO ACCEPT (stored, counts in analytics); a fixed
  share is drawn as spot checks so a person keeps testing the high band;
- medium (0.60-0.90) → REVIEW (a person checks);
- below 0.60, or an animal nobody could name → UNCERTAIN (a person decides);
- people or vehicles → always a person, whatever any score says;
- no object → LIKELY BLANK; a random share is reviewed, the rest is not sampled;
- quality FAIL → QUALITY review.

Sampling is deterministic from the image's SHA-256, so re-running routing draws the same
images and nobody can re-roll a spot check away. A route a person has finished (DONE after
a review) is never reopened by re-routing.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from dataclasses import asdict, dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from vandrishti.db.models import (
    Camera,
    Decision,
    Image,
    QualityStatus,
    Reserve,
    Review,
    Route,
    RouteState,
    Routing,
    ScreenOutcome,
)


@dataclass(frozen=True)
class RoutingConfig:
    high: float = 0.90
    medium: float = 0.60
    spot_check_rate: float = 0.05
    blank_sample_rate: float = 0.10

    def hash(self) -> str:
        return hashlib.sha256(json.dumps(asdict(self), sort_keys=True).encode()).hexdigest()


def drawn(sha256: str, rate: float, salt: str) -> bool:
    """A stable pseudo-random draw: the same image and salt always give the same answer."""
    value = int(hashlib.sha256(f"{salt}:{sha256}".encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    return value < rate


def route_for(
    img: Image, decision: Decision | None, cfg: RoutingConfig
) -> tuple[Route, RouteState, bool, str]:
    if img.quality_status is QualityStatus.FAIL:
        return Route.QUALITY, RouteState.OPEN, False, "failed the quality gate"
    if img.screen is ScreenOutcome.HUMAN_VEHICLE:
        return Route.PEOPLE_VEHICLES, RouteState.OPEN, False, "people or vehicles: always a person"
    if img.screen is ScreenOutcome.NO_OBJECT:
        if drawn(img.sha256, cfg.blank_sample_rate, "blank"):
            return Route.LIKELY_BLANK, RouteState.OPEN, False, "no object; drawn for a blank check"
        return Route.LIKELY_BLANK, RouteState.NOT_SAMPLED, False, "no object; not sampled"
    if decision is None:
        return Route.UNCERTAIN, RouteState.OPEN, False, "animal without a decision yet"
    c = decision.confidence
    if decision.taxon is None:
        return Route.UNCERTAIN, RouteState.OPEN, False, "animal not identified"
    if c >= cfg.high:
        spot = drawn(img.sha256, cfg.spot_check_rate, "spot")
        state = RouteState.OPEN if spot else RouteState.DONE
        why = f"confidence {c:.2f} ≥ {cfg.high}" + ("; drawn for a spot check" if spot else "")
        return Route.AUTO_ACCEPT, state, spot, why
    if c >= cfg.medium:
        return (
            Route.REVIEW,
            RouteState.OPEN,
            False,
            f"confidence {c:.2f} in {cfg.medium}–{cfg.high}",
        )
    return Route.UNCERTAIN, RouteState.OPEN, False, f"confidence {c:.2f} < {cfg.medium}"


def run_routing(
    session: Session, *, reserve: str | None = None, cfg: RoutingConfig | None = None
) -> dict[str, Any]:
    cfg = cfg or RoutingConfig()
    chash = cfg.hash()
    q = (
        select(Image)
        .join(Camera, Camera.id == Image.camera_id)
        .where((Image.screen.is_not(None)) | (Image.quality_status == QualityStatus.FAIL))
    )
    if reserve:
        q = q.join(Reserve, Reserve.id == Camera.reserve_id).where(Reserve.code == reserve)
    counts: Counter[str] = Counter()
    for img in session.scalars(q):
        decision = session.scalar(
            select(Decision).where(Decision.image_id == img.id).order_by(Decision.created_at.desc())
        )
        current = session.scalar(select(Routing).where(Routing.image_id == img.id))
        reviewed = current is not None and session.scalar(
            select(Review.id).where(Review.routing_id == current.id, Review.undone_at.is_(None))
        )
        if reviewed:
            counts["kept (reviewed)"] += 1
            continue
        route, state, spot, why = route_for(img, decision, cfg)
        if current is None:
            current = Routing(image_id=img.id)
            session.add(current)
        current.decision_id = decision.id if decision else None
        current.route, current.state, current.spot_check = route, state, spot
        current.confidence = decision.confidence if decision else None
        current.config_hash, current.reason = chash, why
        counts[f"{route.value}:{state.value}"] += 1
    session.commit()
    return dict(counts)
