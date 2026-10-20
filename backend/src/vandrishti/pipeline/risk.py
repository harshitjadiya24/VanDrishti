"""Section 6: people/vehicle presence, activity patterns and an explained poaching-risk level.

The score adds points for observable signals, each with a plain reason: who was seen, at
night (real sunset at the camera), an unusual spike against the camera's own history,
repeated visits, how sensitive the place is, a tiger confirmed there recently, and what a
reviewer said. LOW < 4 <= MEDIUM < 8 <= HIGH.

It is a way to decide what to look at first, not a prediction: the weights are reasoned
defaults, not fitted, because no labelled poaching outcomes exist here. A reviewer's
"false alarm" dismisses an event; their severity sets a minimum level; their "poaching
activity" mark adds the most weight of all.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from vandrishti.core.config import Settings
from vandrishti.db.models import (
    Camera,
    Decision,
    Detection,
    DetectionCategory,
    Image,
    PresenceEvent,
    Reserve,
    Review,
    ReviewAction,
    RiskAssessment,
    RiskLevel,
    ScreenOutcome,
    Sensitivity,
    Severity,
    TimeSource,
)
from vandrishti.sun import is_night

TIGER = "mammalia;carnivora;felidae;panthera;tigris"


@dataclass(frozen=True)
class RiskConfig:
    person: int = 2
    group: int = 1  # 3 or more people
    vehicle: int = 2
    night: int = 3
    spike: int = 2
    repeat: int = 2
    sensitive: int = 2
    core: int = 3
    tiger_recent: int = 2
    confirmed: int = 1
    poaching_marked: int = 5
    medium_from: int = 4
    high_from: int = 8
    baseline_days: int = 28
    spike_p: float = 0.05
    prior_per_day: float = 0.05  # keeps a camera with no history from flagging every visit
    repeat_days: int = 7
    repeat_min: int = 3
    tiger_days: int = 30

    def hash(self) -> str:
        return hashlib.sha256(json.dumps(asdict(self), sort_keys=True).encode()).hexdigest()


@dataclass
class Context:
    people: int
    vehicles: int
    vehicle_type: str | None = None
    night: bool = False
    night_basis: str = "clock"
    # False when the capture time is only a file date: every time-based signal is skipped.
    time_known: bool = True
    sensitivity: Sensitivity = Sensitivity.NORMAL
    events_today: int = 1
    baseline_per_day: float = 0.0
    events_recent: int = 1
    tiger_seen: datetime | None = None
    review_action: ReviewAction | None = None
    poaching_marked: bool = False
    severity: Severity | None = None
    reviewer: str | None = None


@dataclass
class Outcome:
    score: int
    level: RiskLevel
    dismissed: bool
    factors: list[dict[str, Any]] = field(default_factory=list)


def poisson_tail(n: int, lam: float) -> float:
    """P(X >= n) for X ~ Poisson(lam)."""
    if n <= 0:
        return 1.0
    term, cdf = math.exp(-lam), 0.0
    for k in range(n):
        if k:
            term *= lam / k
        cdf += term
    return max(0.0, 1.0 - cdf)


def score(ctx: Context, cfg: RiskConfig) -> Outcome:
    if ctx.review_action is ReviewAction.FALSE_ALARM:
        return Outcome(
            0,
            RiskLevel.LOW,
            True,
            [
                {
                    "name": "reviewer",
                    "points": 0,
                    "reason": f"marked a false alarm by {ctx.reviewer}",
                }
            ],
        )
    f: list[dict[str, Any]] = []

    def add(name: str, points: int, reason: str) -> None:
        f.append({"name": name, "points": points, "reason": reason})

    if ctx.people:
        add(
            "people",
            cfg.person,
            f"{ctx.people} {'person' if ctx.people == 1 else 'people'} (estimated count)",
        )
        if ctx.people >= 3:
            add("group", cfg.group, "a group of three or more")
    if ctx.vehicles:
        kind = (
            f", possibly a {ctx.vehicle_type} (OpenCLIP guess)"
            if ctx.vehicle_type and ctx.vehicle_type != "unknown"
            else ""
        )
        add(
            "vehicle", cfg.vehicle, f"{ctx.vehicles} vehicle{'s' if ctx.vehicles > 1 else ''}{kind}"
        )
    if not ctx.time_known:
        add(
            "time",
            0,
            "capture time unknown (file date only): night, spike, repeat-visit and"
            " tiger-nearby checks skipped",
        )
    if ctx.night and ctx.time_known:
        basis = (
            "after sunset at this camera"
            if ctx.night_basis == "sun"
            else "between 19:00 and 06:00 (camera location unknown)"
        )
        add("night", cfg.night, f"at night, {basis}")
    lam = max(ctx.baseline_per_day, cfg.prior_per_day)
    p = poisson_tail(ctx.events_today, lam)
    if ctx.time_known and ctx.events_today >= 2 and p < cfg.spike_p:
        add(
            "unusual spike",
            cfg.spike,
            f"{ctx.events_today} people/vehicle events here today;"
            f" normally about {ctx.baseline_per_day:.2f} a day",
        )
    if ctx.time_known and ctx.events_recent >= cfg.repeat_min:
        add(
            "repeated visits",
            cfg.repeat,
            f"{ctx.events_recent} events here in {cfg.repeat_days} days",
        )
    if ctx.sensitivity is Sensitivity.SENSITIVE:
        add("location", cfg.sensitive, "the reserve marks this camera's place as sensitive")
    elif ctx.sensitivity is Sensitivity.CORE:
        add("location", cfg.core, "this camera is in the core zone")
    if ctx.time_known and ctx.tiger_seen:
        add(
            "tiger nearby",
            cfg.tiger_recent,
            f"a tiger was recorded at this camera on {ctx.tiger_seen:%d %b %Y}",
        )
    if ctx.review_action is ReviewAction.CONFIRM_PEOPLE:
        add("reviewer", cfg.confirmed, f"presence confirmed by {ctx.reviewer}")
    if ctx.poaching_marked:
        add("reviewer", cfg.poaching_marked, f"{ctx.reviewer} marked poaching activity")

    total = sum(x["points"] for x in f)
    level = (
        RiskLevel.HIGH
        if total >= cfg.high_from
        else RiskLevel.MEDIUM
        if total >= cfg.medium_from
        else RiskLevel.LOW
    )
    floor = (
        {Severity.HIGH: RiskLevel.HIGH, Severity.MEDIUM: RiskLevel.MEDIUM}.get(ctx.severity)
        if ctx.severity
        else None
    )
    # A person on the ground saying "poaching activity" is the strongest signal there is.
    if ctx.poaching_marked:
        floor = RiskLevel.HIGH
    order = [RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH]
    if floor and order.index(floor) > order.index(level):
        level = floor
        why = (
            "a poaching-activity mark always means high"
            if ctx.poaching_marked
            else f"{ctx.reviewer} set severity {ctx.severity.value if ctx.severity else ''}"
        )
        add("reviewer", 0, f"level raised to {floor.value}: {why}")
    return Outcome(total, level, False, f)


# --- events --------------------------------------------------------------------------------


def build_events(session: Session, settings: Settings, *, reserve: str | None = None) -> int:
    """Group people/vehicle frames into one event per burst and camera (idempotent)."""
    q = (
        select(Image, Camera, Reserve.timezone)
        .join(Camera, Camera.id == Image.camera_id)
        .join(Reserve, Reserve.id == Camera.reserve_id)
        .where(Image.screen == ScreenOutcome.HUMAN_VEHICLE, Image.captured_at.is_not(None))
    )
    if reserve:
        q = q.where(Reserve.code == reserve)
    groups: dict[tuple[Any, Any], list[tuple[Image, Camera, str]]] = defaultdict(list)
    for img, cam, tz in session.execute(q.order_by(Image.captured_at)).all():
        groups[(cam.id, img.sequence_id or img.id)].append((img, cam, tz))
    created = 0
    for frames in groups.values():
        first, cam, tz = frames[0]
        people = vehicles = 0
        for img, _, _ in frames:
            counts = dict(
                session.execute(
                    select(Detection.category, func.count())
                    .where(
                        Detection.image_id == img.id,
                        Detection.config_hash == img.screened_with,
                        Detection.confidence >= settings.privacy_threshold,
                        Detection.category.in_(
                            [DetectionCategory.PERSON, DetectionCategory.VEHICLE]
                        ),
                    )
                    .group_by(Detection.category)
                ).all()
            )
            people = max(people, counts.get(DetectionCategory.PERSON, 0))
            vehicles = max(vehicles, counts.get(DetectionCategory.VEHICLE, 0))
        start = first.captured_at
        if start is None:  # excluded by the query; for the type checker
            continue
        lat = cam.latitude if cam.latitude is not None else first.latitude
        lon = cam.longitude if cam.longitude is not None else first.longitude
        night, basis = is_night(start, tz, lat, lon)
        event = session.scalar(
            select(PresenceEvent).where(
                PresenceEvent.camera_id == cam.id,
                PresenceEvent.start_at == start,
                PresenceEvent.first_image_id == first.id,
            )
        )
        if event is None:
            event = PresenceEvent(camera_id=cam.id, first_image_id=first.id, start_at=start)
            session.add(event)
            created += 1
        event.sequence_id = first.sequence_id
        event.image_ids = [str(i.id) for i, _, _ in frames]
        event.end_at = frames[-1][0].captured_at or start
        event.people_count, event.vehicle_count = people, vehicles
        event.night, event.night_basis = night, basis
    session.commit()
    return created


VEHICLE_TYPES = ["car", "pickup truck", "truck", "motorcycle", "bicycle", "tractor", "bus", "jeep"]
# Unvalidated guesswork: on the LILA sample's 32 Caltech "car" events CLIP said car 10 times and
# bus, tractor or motorcycle 12 times. Below this probability the type is reported as unknown;
# it never adds risk points.
VEHICLE_TYPE_MIN = 0.6


def classify_vehicles(
    session: Session, storage: Any, clip: Any, *, reserve: str | None = None, force: bool = False
) -> int:
    """OpenCLIP's guess at the vehicle type on each event's largest vehicle (an estimate)."""
    from PIL import Image as PILImage

    from vandrishti.models.detection import ClipRequest

    q = select(PresenceEvent).where(PresenceEvent.vehicle_count > 0)
    if not force:
        q = q.where(PresenceEvent.vehicle_type.is_(None))
    if reserve:
        q = (
            q.join(Camera, Camera.id == PresenceEvent.camera_id)
            .join(Reserve, Reserve.id == Camera.reserve_id)
            .where(Reserve.code == reserve)
        )
    done = 0
    for event in session.scalars(q).all():
        best: tuple[float, Image, Detection] | None = None
        for image_id in event.image_ids:
            img = session.get(Image, image_id)
            if img is None:
                continue
            for d in session.scalars(
                select(Detection).where(
                    Detection.image_id == img.id,
                    Detection.config_hash == img.screened_with,
                    Detection.category == DetectionCategory.VEHICLE,
                )
            ):
                if best is None or d.w * d.h > best[0]:
                    best = (d.w * d.h, img, d)
        if best is None:
            continue
        _, img, d = best
        # The original (unblurred) is read inside the server only to classify the vehicle;
        # nothing unblurred is stored or shown.
        with storage.open(img.storage_key) as f, PILImage.open(f) as im:
            im.draft("RGB", (1024, 1024))
            picture = im.convert("RGB")
        w, h = picture.size
        crop = picture.crop(
            (int(d.x * w), int(d.y * h), int((d.x + d.w) * w), int((d.y + d.h) * h))
        )
        ranked = [
            (n, p)
            for n, p in clip.predict([ClipRequest(crop, VEHICLE_TYPES)])[0]
            if n in VEHICLE_TYPES
        ]
        if ranked:
            name, prob = ranked[0]
            event.vehicle_type = name if prob >= VEHICLE_TYPE_MIN else "unknown"
            event.vehicle_type_score = round(prob, 4)
            done += 1
    session.commit()
    return done


def _review_of(session: Session, event: PresenceEvent) -> Review | None:
    return session.scalar(
        select(Review)
        .where(
            Review.image_id.in_(event.image_ids),
            Review.undone_at.is_(None),
            Review.action.in_([ReviewAction.CONFIRM_PEOPLE, ReviewAction.FALSE_ALARM]),
        )
        .order_by(Review.created_at.desc())
    )


def _tiger_seen(session: Session, camera_id: Any, before: datetime, days: int) -> datetime | None:
    since = before - timedelta(days=days)
    by_model = (
        select(func.max(Image.captured_at))
        .join(Decision, Decision.image_id == Image.id)
        .where(
            Image.camera_id == camera_id,
            Image.captured_at.between(since, before),
            Decision.taxon == TIGER,
            or_(Decision.verified_by_human.is_(True), Decision.confidence >= 0.9),
        )
    )
    by_person = (
        select(func.max(Image.captured_at))
        .join(Review, Review.image_id == Image.id)
        .where(
            Image.camera_id == camera_id,
            Image.captured_at.between(since, before),
            Review.human_taxon == TIGER,
            Review.undone_at.is_(None),
        )
    )
    seen = [t for t in (session.scalar(by_model), session.scalar(by_person)) if t is not None]
    return max(seen) if seen else None


def assess(
    session: Session, *, reserve: str | None = None, cfg: RiskConfig | None = None
) -> dict[str, int]:
    """Score every presence event (recomputed each run: reviews and history change)."""
    cfg = cfg or RiskConfig()
    chash = cfg.hash()
    q = (
        select(PresenceEvent, Camera, Reserve.timezone)
        .join(Camera, Camera.id == PresenceEvent.camera_id)
        .join(Reserve, Reserve.id == Camera.reserve_id)
    )
    if reserve:
        q = q.where(Reserve.code == reserve)
    rows = session.execute(q).all()
    dismissed = {
        e.id
        for e, _, _ in rows
        if (r := _review_of(session, e)) and r.action is ReviewAction.FALSE_ALARM
    }
    reliable = {
        e.id
        for e, _, _ in rows
        if session.scalar(select(Image.time_source).where(Image.id == e.first_image_id))
        in (TimeSource.EXIF, TimeSource.MANIFEST)
    }
    by_camera: dict[Any, list[PresenceEvent]] = defaultdict(list)
    for e, _, _ in rows:
        # History counts only events with a real capture time and no false-alarm verdict.
        if e.id not in dismissed and e.id in reliable:
            by_camera[e.camera_id].append(e)
    levels: dict[str, int] = defaultdict(int)
    for event, cam, tz in rows:
        zone = ZoneInfo(tz)
        day = event.start_at.astimezone(zone).date()
        history = by_camera[cam.id]
        today = sum(1 for e in history if e.start_at.astimezone(zone).date() == day)
        window = [
            e
            for e in history
            if timedelta(0) < event.start_at - e.start_at <= timedelta(days=cfg.baseline_days)
        ]
        prior_days = [e for e in window if e.start_at.astimezone(zone).date() != day]
        recent = sum(
            1
            for e in history
            if timedelta(0) <= event.start_at - e.start_at <= timedelta(days=cfg.repeat_days)
        )
        review = _review_of(session, event)
        marked = session.scalar(
            select(Review).where(
                Review.image_id.in_(event.image_ids),
                Review.undone_at.is_(None),
                Review.poaching_activity.is_(True),
            )
        )
        severity = session.scalar(
            select(Review.severity)
            .where(
                Review.image_id.in_(event.image_ids),
                Review.undone_at.is_(None),
                Review.severity.is_not(None),
            )
            .order_by(Review.created_at.desc())
        )
        ctx = Context(
            people=event.people_count,
            vehicles=event.vehicle_count,
            vehicle_type=event.vehicle_type,
            night=event.night,
            night_basis=event.night_basis,
            time_known=event.id in reliable,
            sensitivity=cam.sensitivity,
            events_today=max(today, 1),
            baseline_per_day=len(prior_days) / cfg.baseline_days,
            events_recent=max(recent, 1),
            tiger_seen=_tiger_seen(session, cam.id, event.start_at, cfg.tiger_days),
            review_action=review.action if review else None,
            poaching_marked=marked is not None,
            severity=severity,
            reviewer=who.reviewer if (who := review or marked) is not None else None,
        )
        out = score(ctx, cfg)
        row = session.scalar(
            select(RiskAssessment).where(
                RiskAssessment.event_id == event.id, RiskAssessment.config_hash == chash
            )
        )
        if row is None:
            row = RiskAssessment(event_id=event.id, config_hash=chash)
            session.add(row)
        row.score, row.level, row.factors, row.dismissed = (
            out.score,
            out.level,
            out.factors,
            out.dismissed,
        )
        levels["dismissed" if out.dismissed else out.level.value] += 1
    session.commit()
    return dict(levels)
