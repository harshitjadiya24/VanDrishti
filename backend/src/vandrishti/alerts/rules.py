"""Section 11 alerts: rules that turn settled facts into things a person should know.

- tiger sighting (info): one alert per burst of settled tiger frames, with any tiger a person
  has already named in it;
- poaching risk: one per people/vehicle event at MEDIUM (warning) or HIGH (critical);
- unusual activity (warning): one per camera and local day whose people/vehicle events carry
  the "unusual spike" reason (the camera's own history, section 6);
- camera failure (warning): an active camera silent for `camera_silent_days`, or one whose
  recent frames mostly fail the quality gate (lens blocked, fogged, knocked over).

Rules are idempotent (`dedupe_key`) and only refresh alerts still OPEN. Once a person has
acknowledged or resolved an alert, no rule edits or reopens it. An alert is a prompt for a
person, never a confirmed finding, and it never carries coordinates.
"""

from __future__ import annotations

import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from vandrishti.analytics.labels import TIGER, settled_labels
from vandrishti.db.models import (
    Alert,
    AlertKind,
    AlertSeverity,
    AlertState,
    Camera,
    CameraStatus,
    Image,
    Individual,
    PresenceEvent,
    QualityStatus,
    ReidEmbedding,
    Reserve,
    RiskAssessment,
    RiskLevel,
    TimeSource,
)
from vandrishti.pipeline.risk import RiskConfig

RULE_VERSION = "1"
TIMED = (TimeSource.EXIF, TimeSource.MANIFEST)
SYSTEM = "system"
CLOSED_NOTE = {
    AlertKind.TIGER_SIGHTING: "frames no longer settled as tiger (relabelled by a person)",
    AlertKind.POACHING_RISK: "the event is no longer MEDIUM/HIGH, or a reviewer dismissed it",
    AlertKind.UNUSUAL_ACTIVITY: "the spike no longer holds (events dismissed or re-scored)",
    AlertKind.CAMERA_FAILURE: "camera sends usable frames again, or a person set its status",
}


@dataclass(frozen=True)
class AlertConfig:
    camera_silent_days: int = 7
    quality_window: int = 30  # most recent frames per camera
    quality_min_frames: int = 10
    quality_fail_share: float = 0.6


@dataclass
class Draft:
    reserve_id: uuid.UUID
    camera_id: uuid.UUID | None
    kind: AlertKind
    severity: AlertSeverity
    dedupe_key: str
    title: str
    detail: dict[str, Any]
    occurred_at: datetime | None


def _reserves(session: Session, reserve: str | None) -> list[Reserve]:
    q = select(Reserve)
    if reserve:
        q = q.where(Reserve.code == reserve)
    return list(session.scalars(q))


def tiger_drafts(session: Session, res: Reserve) -> list[Draft]:
    labels = settled_labels(session, reserve=res.code)
    ids = [i for i, lab in labels.items() if lab.taxon == TIGER]
    if not ids:
        return []
    rows = session.execute(
        select(
            Image.id,
            Image.sequence_id,
            Image.camera_id,
            Image.captured_at,
            Image.time_source,
            Camera.code,
        )
        .join(Camera, Camera.id == Image.camera_id)
        .where(Image.id.in_(ids))
    ).all()
    named: dict[uuid.UUID, str] = dict(
        session.execute(
            select(ReidEmbedding.image_id, Individual.code)
            .join(Individual, Individual.id == ReidEmbedding.individual_id)
            .where(ReidEmbedding.image_id.in_(ids))
        ).all()
    )
    bursts: dict[str, list[Any]] = defaultdict(list)
    for r in rows:
        bursts[str(r.sequence_id or r.id)].append(r)
    drafts = []
    for key, frames in bursts.items():
        frames.sort(key=lambda r: (r.captured_at is None, r.captured_at))
        first = frames[0]
        codes = sorted({named[f.id] for f in frames if f.id in named})
        timed = first.time_source in TIMED and first.captured_at is not None
        who = f"tiger {', '.join(codes)}" if codes else "tiger (not yet identified)"
        drafts.append(
            Draft(
                reserve_id=res.id,
                camera_id=first.camera_id,
                kind=AlertKind.TIGER_SIGHTING,
                severity=AlertSeverity.INFO,
                dedupe_key=f"tiger:{key}",
                title=f"{who.capitalize()} at camera {first.code}",
                detail={
                    "camera": first.code,
                    "frames": len(frames),
                    "image_ids": [str(f.id) for f in frames[:20]],
                    "individuals": codes,
                    "time_reliable": timed,
                    "reasons": [
                        f"{len(frames)} frame(s) settled as tiger (by a person or auto-accepted)",
                        *(["individual confirmed by a person"] if codes else []),
                    ],
                },
                occurred_at=first.captured_at if timed else None,
            )
        )
    return drafts


def risk_drafts(session: Session, res: Reserve) -> list[Draft]:
    rows = session.execute(
        select(PresenceEvent, RiskAssessment, Camera)
        .join(RiskAssessment, RiskAssessment.event_id == PresenceEvent.id)
        .join(Camera, Camera.id == PresenceEvent.camera_id)
        .join(Image, Image.id == PresenceEvent.first_image_id)
        .where(Camera.reserve_id == res.id, RiskAssessment.config_hash == RiskConfig().hash())
        .add_columns(Image.time_source)
    ).all()
    tz = ZoneInfo(res.timezone)
    drafts: list[Draft] = []
    spikes: dict[tuple[uuid.UUID, str], list[Any]] = defaultdict(list)
    for e, a, cam, ts in rows:
        timed = ts in TIMED
        reasons = [f["reason"] for f in a.factors]
        if a.level in (RiskLevel.MEDIUM, RiskLevel.HIGH) and not a.dismissed:
            drafts.append(
                Draft(
                    reserve_id=res.id,
                    camera_id=cam.id,
                    kind=AlertKind.POACHING_RISK,
                    severity=AlertSeverity.CRITICAL
                    if a.level is RiskLevel.HIGH
                    else AlertSeverity.WARNING,
                    dedupe_key=f"risk:{e.id}",
                    title=f"{a.level.value.upper()} poaching risk at camera {cam.code}",
                    detail={
                        "camera": cam.code,
                        "event_id": str(e.id),
                        "level": a.level.value,
                        "score": a.score,
                        "people": e.people_count,
                        "vehicles": e.vehicle_count,
                        "night": e.night,
                        "reasons": reasons,
                        "time_reliable": timed,
                    },
                    occurred_at=e.start_at if timed else None,
                )
            )
        if timed and not a.dismissed and any(f["name"] == "unusual spike" for f in a.factors):
            day = e.start_at.astimezone(tz).date().isoformat()
            spikes[(cam.id, day)].append((e, cam))
    for (cam_id, day), events in spikes.items():
        cam = events[0][1]
        drafts.append(
            Draft(
                reserve_id=res.id,
                camera_id=cam_id,
                kind=AlertKind.UNUSUAL_ACTIVITY,
                severity=AlertSeverity.WARNING,
                dedupe_key=f"unusual:{cam_id}:{day}",
                title=f"Unusual people/vehicle activity at camera {cam.code} on {day}",
                detail={
                    "camera": cam.code,
                    "local_day": day,
                    "event_ids": [str(e.id) for e, _ in events],
                    "reasons": [
                        "more people/vehicle events than this camera's own recent history"
                        " makes likely (section 6 spike test)"
                    ],
                },
                occurred_at=min(e.start_at for e, _ in events),
            )
        )
    return drafts


def camera_drafts(session: Session, res: Reserve, cfg: AlertConfig, now: datetime) -> list[Draft]:
    drafts: list[Draft] = []
    cams = list(session.scalars(select(Camera).where(Camera.reserve_id == res.id)))
    last = (
        dict(
            session.execute(
                select(Image.camera_id, func.max(Image.captured_at))
                .where(Image.camera_id.in_([c.id for c in cams]), Image.time_source.in_(TIMED))
                .group_by(Image.camera_id)
            ).all()
        )
        if cams
        else {}
    )
    for cam in cams:
        if cam.status is not CameraStatus.ACTIVE:
            continue  # a person already marked it faulty/stolen/inactive
        seen = last.get(cam.id)
        since = seen or cam.installed_at
        if since is not None and now - since > timedelta(days=cfg.camera_silent_days):
            days = (now - since).days
            drafts.append(
                Draft(
                    reserve_id=res.id,
                    camera_id=cam.id,
                    kind=AlertKind.CAMERA_FAILURE,
                    severity=AlertSeverity.WARNING,
                    dedupe_key=f"silent:{cam.id}:{since.date().isoformat()}",
                    title=f"Camera {cam.code} silent for {days} days",
                    detail={
                        "camera": cam.code,
                        "check": "silent",
                        "days": days,
                        "last_capture": since.isoformat() if seen else None,
                        "reasons": [
                            f"no frame with a reliable time since {since.date().isoformat()}"
                            if seen
                            else f"no frames since installation on {since.date().isoformat()}",
                            "may also mean the card has not been collected yet",
                        ],
                    },
                    occurred_at=since,
                )
            )
        recent = list(
            session.scalars(
                select(Image.quality_status)
                .where(Image.camera_id == cam.id, Image.quality_status != QualityStatus.PENDING)
                .order_by(Image.captured_at.desc().nulls_last(), Image.created_at.desc())
                .limit(cfg.quality_window)
            )
        )
        fails = Counter(recent)[QualityStatus.FAIL]
        if len(recent) >= cfg.quality_min_frames and fails / len(recent) >= cfg.quality_fail_share:
            week = now.astimezone(ZoneInfo(res.timezone)).strftime("%G-W%V")
            drafts.append(
                Draft(
                    reserve_id=res.id,
                    camera_id=cam.id,
                    kind=AlertKind.CAMERA_FAILURE,
                    severity=AlertSeverity.WARNING,
                    dedupe_key=f"quality:{cam.id}:{week}",
                    title=f"Camera {cam.code}: {fails} of its last {len(recent)} frames unusable",
                    detail={
                        "camera": cam.code,
                        "check": "quality",
                        "failed": fails,
                        "checked": len(recent),
                        "reasons": [
                            "most recent frames failed the quality gate (blank, blurred,"
                            " too dark or washed out): lens blocked, fogged or moved?"
                        ],
                    },
                    occurred_at=None,
                )
            )
    return drafts


def evaluate(
    session: Session,
    *,
    reserve: str | None = None,
    cfg: AlertConfig | None = None,
    now: datetime | None = None,
) -> dict[str, int]:
    """Create new alerts and refresh open ones. Returns counts of created/updated/closed."""
    cfg = cfg or AlertConfig()
    now = now or datetime.now(UTC)
    stats: Counter[str] = Counter()
    for res in _reserves(session, reserve):
        drafts = (
            tiger_drafts(session, res)
            + risk_drafts(session, res)
            + camera_drafts(session, res, cfg, now)
        )
        keys = {d.dedupe_key for d in drafts}
        existing = {
            a.dedupe_key: a
            for a in session.scalars(select(Alert).where(Alert.reserve_id == res.id))
        }
        for d in drafts:
            a = existing.get(d.dedupe_key)
            if a is None:
                session.add(
                    Alert(
                        reserve_id=d.reserve_id,
                        camera_id=d.camera_id,
                        kind=d.kind,
                        severity=d.severity,
                        dedupe_key=d.dedupe_key,
                        rule_version=RULE_VERSION,
                        title=d.title,
                        detail=d.detail,
                        occurred_at=d.occurred_at,
                    )
                )
                stats[f"new_{d.kind.value}"] += 1
            elif a.state is AlertState.OPEN and (a.title, a.detail, a.severity) != (
                d.title,
                d.detail,
                d.severity,
            ):
                a.title, a.detail, a.severity, a.rule_version = (
                    d.title,
                    d.detail,
                    d.severity,
                    RULE_VERSION,
                )
                stats["updated"] += 1
        # An open alert whose condition no longer holds is closed by the system, with a note
        # (a reviewer dismissed the event, relabelled the frames, or the camera is back).
        for key, a in existing.items():
            if key in keys or a.state is not AlertState.OPEN:
                continue
            a.state, a.acted_by, a.acted_at = AlertState.RESOLVED, SYSTEM, now
            a.note = CLOSED_NOTE[a.kind]
            stats["closed_by_system"] += 1
    session.commit()
    return dict(stats)
