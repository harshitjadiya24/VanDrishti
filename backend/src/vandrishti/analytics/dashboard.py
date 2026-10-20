"""10.1-10.4: overview, camera map, per-camera analytics and temporal trends.

Rules every number here follows:
- species counts use settled labels only (`labels.settled_labels`); items still waiting for a
  person are reported as "unsettled", never guessed;
- counts are images (frames), not individual animals: a burst of 10 frames is 10 images;
- hours and calendar days are in the reserve's own time zone, and frames whose time came only
  from the file's modification date are left out of time charts (and counted as such);
- people and vehicles are counted as presence events a reviewer has not dismissed.
"""

from __future__ import annotations

import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from vandrishti.analytics.labels import TIGER, settled_labels
from vandrishti.db.models import (
    Camera,
    Image,
    Individual,
    PresenceEvent,
    ProposalState,
    ReidEmbedding,
    ReidProposal,
    Reserve,
    RiskAssessment,
    ScreenOutcome,
    TimeSource,
)
from vandrishti.pipeline.risk import RiskConfig

TIMED = (TimeSource.EXIF, TimeSource.MANIFEST)
LEVEL_ORDER = {"high": 0, "medium": 1, "low": 2}


@dataclass(frozen=True)
class Frame:
    id: uuid.UUID
    camera_id: uuid.UUID
    captured_at: datetime | None
    time_source: TimeSource
    screen: ScreenOutcome | None
    timezone: str

    def local(self) -> datetime | None:
        if self.captured_at is None or self.time_source not in TIMED:
            return None
        return self.captured_at.astimezone(ZoneInfo(self.timezone))


def _cameras(session: Session, reserve: str | None) -> list[tuple[Camera, Reserve]]:
    q = select(Camera, Reserve).join(Reserve, Reserve.id == Camera.reserve_id)
    if reserve:
        q = q.where(Reserve.code == reserve)
    return [(c, r) for c, r in session.execute(q.order_by(Reserve.code, Camera.code))]


def _frames(session: Session, reserve: str | None) -> list[Frame]:
    q = (
        select(
            Image.id,
            Image.camera_id,
            Image.captured_at,
            Image.time_source,
            Image.screen,
            Reserve.timezone,
        )
        .join(Camera, Camera.id == Image.camera_id)
        .join(Reserve, Reserve.id == Camera.reserve_id)
        .where(Image.is_corrupt.is_(False))
    )
    if reserve:
        q = q.where(Reserve.code == reserve)
    return [Frame(*row) for row in session.execute(q)]


def _events(session: Session, reserve: str | None) -> list[tuple[PresenceEvent, RiskAssessment]]:
    q = (
        select(PresenceEvent, RiskAssessment)
        .join(RiskAssessment, RiskAssessment.event_id == PresenceEvent.id)
        .join(Camera, Camera.id == PresenceEvent.camera_id)
        .join(Reserve, Reserve.id == Camera.reserve_id)
        .where(
            RiskAssessment.config_hash == RiskConfig().hash(), RiskAssessment.dismissed.is_(False)
        )
    )
    if reserve:
        q = q.where(Reserve.code == reserve)
    return [(e, a) for e, a in session.execute(q)]


def overview(session: Session, *, reserve: str | None = None) -> dict[str, Any]:
    """10.1: the reserve at a glance."""
    frames = _frames(session, reserve)
    labels = settled_labels(session, reserve=reserve)
    cams = _cameras(session, reserve)
    animal_ids = {f.id for f in frames if f.screen is ScreenOutcome.ANIMAL}
    species: Counter[str] = Counter()
    for lab in labels.values():
        if lab.taxon:
            species[lab.label] += 1
    events = _events(session, reserve)
    levels = Counter(a.level.value for _, a in events)
    times = [f.captured_at for f in frames if f.captured_at and f.time_source in TIMED]
    ind_q = select(func.count()).select_from(Individual).join(Reserve)
    prop_q = (
        select(func.count())
        .select_from(ReidProposal)
        .join(ReidEmbedding, ReidEmbedding.id == ReidProposal.embedding_id)
        .join(Image, Image.id == ReidEmbedding.image_id)
        .join(Camera, Camera.id == Image.camera_id)
        .join(Reserve, Reserve.id == Camera.reserve_id)
        .where(ReidProposal.state == ProposalState.OPEN)
    )
    if reserve:
        ind_q, prop_q = ind_q.where(Reserve.code == reserve), prop_q.where(Reserve.code == reserve)
    return {
        "images": len(frames),
        "cameras": len(cams),
        "cameras_active": sum(c.status.value == "active" for c, _ in cams),
        "first_capture": min(times) if times else None,
        "last_capture": max(times) if times else None,
        "screen": {
            "animal": len(animal_ids),
            "people_vehicles": sum(f.screen is ScreenOutcome.HUMAN_VEHICLE for f in frames),
            "blank": sum(f.screen is ScreenOutcome.NO_OBJECT for f in frames),
            "not_screened": sum(f.screen is None for f in frames),
        },
        "animal_images_settled": sum(1 for i in animal_ids if i in labels and labels[i].taxon),
        "animal_images_unsettled": sum(1 for i in animal_ids if i not in labels),
        "species_count": len(species),
        "top_species": [{"label": k, "images": n} for k, n in species.most_common(10)],
        "tiger_images": sum(1 for lab in labels.values() if lab.taxon == TIGER),
        "named_tigers": session.scalar(ind_q) or 0,
        "open_identity_proposals": session.scalar(prop_q) or 0,
        "people_vehicle_events": len(events),
        "risk_levels": {k: levels.get(k, 0) for k in ("high", "medium", "low")},
    }


def camera_map(session: Session, *, reserve: str | None = None) -> dict[str, Any]:
    """10.2: one point per camera with what it saw. Cameras without coordinates are listed
    separately, never placed at a made-up spot."""
    frames = _frames(session, reserve)
    labels = settled_labels(session, reserve=reserve)
    per_cam: dict[uuid.UUID, Counter[str]] = defaultdict(Counter)
    for f in frames:
        c = per_cam[f.camera_id]
        c["images"] += 1
        lab = labels.get(f.id)
        if lab and lab.taxon:
            c["animal_images"] += 1
            c["tiger_images"] += lab.taxon == TIGER
    worst: dict[uuid.UUID, str] = {}
    for e, a in _events(session, reserve):
        per_cam[e.camera_id]["people_vehicle_events"] += 1
        lvl = a.level.value
        if e.camera_id not in worst or LEVEL_ORDER[lvl] < LEVEL_ORDER[worst[e.camera_id]]:
            worst[e.camera_id] = lvl
    placed: list[dict[str, Any]] = []
    unplaced: list[dict[str, Any]] = []
    for cam, res in _cameras(session, reserve):
        n = per_cam.get(cam.id, Counter())
        row = {
            "id": str(cam.id),
            "code": cam.code,
            "reserve": res.code,
            "status": cam.status.value,
            "sensitivity": cam.sensitivity.value,
            "latitude": cam.latitude,
            "longitude": cam.longitude,
            "last_seen_at": cam.last_seen_at,
            "images": n["images"],
            "animal_images": n["animal_images"],
            "tiger_images": n["tiger_images"],
            "people_vehicle_events": n["people_vehicle_events"],
            "worst_risk": worst.get(cam.id),
        }
        (placed if cam.latitude is not None and cam.longitude is not None else unplaced).append(row)
    return {"cameras": placed, "without_location": unplaced}


def camera_detail(session: Session, camera_id: uuid.UUID) -> dict[str, Any] | None:
    """10.3: what one camera recorded, with its activity by local hour."""
    row = session.execute(
        select(Camera, Reserve)
        .join(Reserve, Reserve.id == Camera.reserve_id)
        .where(Camera.id == camera_id)
    ).first()
    if row is None:
        return None
    cam, res = row
    frames = [f for f in _frames(session, res.code) if f.camera_id == cam.id]
    labels = settled_labels(session, reserve=res.code)
    species: Counter[str] = Counter()
    hours_all, hours_tiger = [0] * 24, [0] * 24
    untimed = 0
    for f in frames:
        lab = labels.get(f.id)
        if not (lab and lab.taxon):
            continue
        species[lab.label] += 1
        local = f.local()
        if local is None:
            untimed += 1
            continue
        hours_all[local.hour] += 1
        if lab.taxon == TIGER:
            hours_tiger[local.hour] += 1
    events = [e for e, _ in _events(session, res.code) if e.camera_id == cam.id]
    times = [f.captured_at for f in frames if f.captured_at and f.time_source in TIMED]
    return {
        "id": str(cam.id),
        "code": cam.code,
        "reserve": res.code,
        "timezone": res.timezone,
        "status": cam.status.value,
        "sensitivity": cam.sensitivity.value,
        "images": len(frames),
        "first_capture": min(times) if times else None,
        "last_capture": max(times) if times else None,
        "species": [{"label": k, "images": n} for k, n in species.most_common()],
        "tiger_images": sum(1 for f in frames if (lab := labels.get(f.id)) and lab.taxon == TIGER),
        "hourly_animal_images": hours_all,
        "hourly_tiger_images": hours_tiger,
        "untimed_animal_images": untimed,
        "people_vehicle_events": len(events),
        "night_events": sum(e.night for e in events),
    }


def _bucket(d: date, period: str) -> date:
    return d - timedelta(days=d.weekday()) if period == "week" else d


def trends(
    session: Session, *, reserve: str | None = None, period: str = "day", top: int = 5
) -> dict[str, Any]:
    """10.4: settled animal images (top species, tigers) and people/vehicle events per day or
    ISO week (Monday start), in each reserve's local calendar."""
    frames = _frames(session, reserve)
    labels = settled_labels(session, reserve=reserve)
    tz_of = {cam.id: res.timezone for cam, res in _cameras(session, reserve)}
    per: dict[date, Counter[str]] = defaultdict(Counter)
    totals: Counter[str] = Counter()
    untimed = 0
    for f in frames:
        lab = labels.get(f.id)
        if not (lab and lab.taxon):
            continue
        local = f.local()
        if local is None:
            untimed += 1
            continue
        b = _bucket(local.date(), period)
        per[b][lab.label] += 1
        per[b]["__animals"] += 1
        per[b]["__tigers"] += lab.taxon == TIGER
        totals[lab.label] += 1
    events = _events(session, reserve)
    timed = (
        set(
            session.scalars(
                select(Image.id).where(
                    Image.id.in_([e.first_image_id for e, _ in events]),
                    Image.time_source.in_(TIMED),
                )
            )
        )
        if events
        else set()
    )
    untimed_events = 0
    for e, _ in events:
        if e.first_image_id not in timed:
            untimed_events += 1
            continue
        b = _bucket(e.start_at.astimezone(ZoneInfo(tz_of[e.camera_id])).date(), period)
        per[b]["__events"] += 1
    shown = [k for k, _ in totals.most_common(top)]
    return {
        "period": period,
        "species": shown,
        "buckets": [
            {
                "start": b.isoformat(),
                "animal_images": c["__animals"],
                "tiger_images": c["__tigers"],
                "people_vehicle_events": c["__events"],
                "by_species": {s: c[s] for s in shown},
            }
            for b, c in sorted(per.items())
        ],
        "untimed_animal_images": untimed,
        "untimed_people_vehicle_events": untimed_events,
    }
