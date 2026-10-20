"""Section 11 reports: one dictionary per reserve and period, rendered as JSON, Excel or PDF.

Periods are local calendar days in the reserve's time zone: daily (one day), weekly (ISO
week, Monday to Sunday), monthly (calendar month) or a custom inclusive range. Only frames
with a reliable capture time (EXIF or manifest) can fall in a period; the count of frames
without one is stated. Numbers follow the dashboard rules: settled labels only, frames not
animals, people and vehicles as events. Reports carry no coordinates and no images.
"""

from __future__ import annotations

import calendar
from collections import Counter, defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from vandrishti.analytics.labels import TIGER, settled_labels
from vandrishti.db.models import (
    Alert,
    Camera,
    Image,
    Individual,
    PresenceEvent,
    ReidEmbedding,
    Reserve,
    RiskAssessment,
    ScreenOutcome,
    TimeSource,
)
from vandrishti.pipeline.risk import RiskConfig

Period = Literal["daily", "weekly", "monthly", "custom"]
TIMED = (TimeSource.EXIF, TimeSource.MANIFEST)
CAVEATS = [
    "Counts are frames, not individual animals; a burst of frames is several frames.",
    "Species use settled labels only: a person's review, or the model's label when it was"
    " confident enough to be auto-accepted. Frames still waiting for a person are counted"
    " separately and are not in any species row.",
    "Naive occupancy = cameras that recorded the species / cameras that recorded anything in"
    " the period. It ignores imperfect detection; it is not an occupancy estimate.",
    "Named tigers come only from identities a person confirmed.",
    "Poaching-risk levels are rule-based triage with reasons, not predictions.",
    "No coordinates are included.",
]


class ReportError(ValueError):
    pass


def period_range(
    kind: Period, day: date | None = None, start: date | None = None, end: date | None = None
) -> tuple[date, date]:
    """Inclusive local dates for a period."""
    if kind == "custom":
        if start is None or end is None or end < start:
            raise ReportError("a custom report needs start <= end")
        if (end - start).days > 366:
            raise ReportError("a custom report covers at most 367 days")
        return start, end
    if day is None:
        raise ReportError("choose a date")
    if kind == "daily":
        return day, day
    if kind == "weekly":
        monday = day - timedelta(days=day.weekday())
        return monday, monday + timedelta(days=6)
    last = calendar.monthrange(day.year, day.month)[1]
    return day.replace(day=1), day.replace(day=last)


def build(
    session: Session, reserve_code: str, start: date, end: date, kind: Period = "custom"
) -> dict[str, Any]:
    res = session.scalar(select(Reserve).where(Reserve.code == reserve_code))
    if res is None:
        raise ReportError(f"no reserve {reserve_code!r}")
    tz = ZoneInfo(res.timezone)

    def local_day(t: datetime) -> date:
        return t.astimezone(tz).date()

    def in_period(t: datetime | None) -> bool:
        return t is not None and start <= local_day(t) <= end

    cams = {c.id: c for c in session.scalars(select(Camera).where(Camera.reserve_id == res.id))}
    rows = (
        session.execute(
            select(
                Image.id, Image.camera_id, Image.captured_at, Image.time_source, Image.screen
            ).where(Image.camera_id.in_(list(cams)), Image.is_corrupt.is_(False))
        ).all()
        if cams
        else []
    )
    untimed = sum(1 for r in rows if r.time_source not in TIMED or r.captured_at is None)
    frames = [r for r in rows if r.time_source in TIMED and in_period(r.captured_at)]
    labels = settled_labels(session, reserve=res.code)

    per_cam: dict[Any, Counter[str]] = defaultdict(Counter)
    species: dict[str, dict[str, Any]] = {}
    daily: dict[date, Counter[str]] = defaultdict(Counter)
    tiger_ids = []
    for f in frames:
        c, d = per_cam[f.camera_id], daily[local_day(f.captured_at)]
        c["frames"] += 1
        d["frames"] += 1
        lab = labels.get(f.id)
        if f.screen is ScreenOutcome.ANIMAL and lab is None:
            c["unsettled"] += 1
        if lab is None or lab.taxon is None:
            continue
        c["animal_frames"] += 1
        d["animal_frames"] += 1
        sp = species.setdefault(
            lab.label,
            {"label": lab.label, "taxon": lab.taxon, "frames": 0, "cameras": set(), "by_person": 0},
        )
        sp["frames"] += 1
        sp["cameras"].add(f.camera_id)
        sp["by_person"] += lab.source == "person"
        if lab.taxon == TIGER:
            c["tiger_frames"] += 1
            d["tiger_frames"] += 1
            tiger_ids.append(f.id)
    operating = sum(1 for c in per_cam.values() if c["frames"])

    named: dict[str, dict[str, Any]] = {}
    if tiger_ids:
        for code, cam_id, at in session.execute(
            select(Individual.code, Image.camera_id, Image.captured_at)
            .join(ReidEmbedding, ReidEmbedding.individual_id == Individual.id)
            .join(Image, Image.id == ReidEmbedding.image_id)
            .where(Image.id.in_(tiger_ids))
        ):
            n = named.setdefault(
                code, {"code": code, "sightings": 0, "cameras": set(), "first": at, "last": at}
            )
            n["sightings"] += 1
            n["cameras"].add(cams[cam_id].code)
            n["first"], n["last"] = min(n["first"], at), max(n["last"], at)

    events = []
    for e, a, ts in session.execute(
        select(PresenceEvent, RiskAssessment, Image.time_source)
        .join(RiskAssessment, RiskAssessment.event_id == PresenceEvent.id)
        .join(Image, Image.id == PresenceEvent.first_image_id)
        .where(
            PresenceEvent.camera_id.in_(list(cams)),
            RiskAssessment.config_hash == RiskConfig().hash(),
        )
    ):
        if ts in TIMED and in_period(e.start_at) and not a.dismissed:
            events.append((e, a))
            per_cam[e.camera_id]["events"] += 1
            daily[local_day(e.start_at)]["events"] += 1
    events.sort(
        key=lambda ea: ({"high": 0, "medium": 1, "low": 2}[ea[1].level.value], ea[0].start_at)
    )

    alerts = [
        a
        for a in session.scalars(select(Alert).where(Alert.reserve_id == res.id))
        if in_period(a.created_at)
    ]

    def iso_local(t: datetime | None) -> str | None:
        return t.astimezone(tz).isoformat(timespec="minutes") if t else None

    return {
        "reserve": {"code": res.code, "name": res.name, "timezone": res.timezone},
        "period": {"kind": kind, "start": start.isoformat(), "end": end.isoformat()},
        "generated_at": datetime.now(UTC).astimezone(tz).isoformat(timespec="seconds"),
        "caveats": CAVEATS,
        "summary": {
            "frames": len(frames),
            "animal_frames_settled": sum(c["animal_frames"] for c in per_cam.values()),
            "animal_frames_unsettled": sum(c["unsettled"] for c in per_cam.values()),
            "blank_frames": sum(1 for f in frames if f.screen is ScreenOutcome.NO_OBJECT),
            "people_vehicle_frames": sum(
                1 for f in frames if f.screen is ScreenOutcome.HUMAN_VEHICLE
            ),
            "species": len(species),
            "tiger_frames": len(tiger_ids),
            "named_tigers_seen": len(named),
            "people_vehicle_events": len(events),
            "risk_levels": dict(Counter(a.level.value for _, a in events)),
            "cameras_operating": operating,
            "cameras_registered": len(cams),
            "frames_without_reliable_time_all_periods": untimed,
        },
        "species": sorted(
            (
                {
                    "label": s["label"],
                    "taxon": s["taxon"],
                    "frames": s["frames"],
                    "cameras": len(s["cameras"]),
                    "by_person": s["by_person"],
                    "naive_occupancy": round(len(s["cameras"]) / operating, 3)
                    if operating
                    else None,
                }
                for s in species.values()
            ),
            key=lambda s: -s["frames"],
        ),
        "tigers": [
            {
                "code": n["code"],
                "sightings": n["sightings"],
                "cameras": sorted(n["cameras"]),
                "first": iso_local(n["first"]),
                "last": iso_local(n["last"]),
            }
            for n in sorted(named.values(), key=lambda n: n["code"])
        ],
        "events": [
            {
                "start": iso_local(e.start_at),
                "camera": cams[e.camera_id].code,
                "level": a.level.value,
                "score": a.score,
                "people": e.people_count,
                "vehicles": e.vehicle_count,
                "night": e.night,
                "reasons": [f["reason"] for f in a.factors if f.get("points")],
            }
            for e, a in events
        ],
        "alerts": {
            "total": len(alerts),
            "by_kind": dict(Counter(a.kind.value for a in alerts)),
            "by_state": dict(Counter(a.state.value for a in alerts)),
        },
        "cameras": [
            {
                "code": c.code,
                "status": c.status.value,
                "frames": per_cam[c.id]["frames"],
                "animal_frames": per_cam[c.id]["animal_frames"],
                "tiger_frames": per_cam[c.id]["tiger_frames"],
                "people_vehicle_events": per_cam[c.id]["events"],
            }
            for c in sorted(cams.values(), key=lambda c: c.code)
        ],
        "daily": [
            {
                "date": d.isoformat(),
                "frames": daily[d]["frames"],
                "animal_frames": daily[d]["animal_frames"],
                "tiger_frames": daily[d]["tiger_frames"],
                "people_vehicle_events": daily[d]["events"],
            }
            for d in (start + timedelta(days=i) for i in range((end - start).days + 1))
        ],
    }
