"""Append-only, hash-chained audit trail (section 8: "create audit trail").

Each event's hash covers its content and the previous event's hash, so editing or removing
any past event breaks every hash after it; `verify` finds the first broken one. The table
also has database triggers that refuse UPDATE, DELETE and TRUNCATE.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from vandrishti.db.models import AuditEvent

GENESIS = "0" * 64
LOCK_KEY = 7_105_310  # advisory lock: one writer extends the chain at a time


def _digest(
    prev: str,
    at: datetime,
    actor: str,
    action: str,
    entity: str,
    entity_id: str | None,
    payload: dict[str, Any],
) -> str:
    body = json.dumps(
        [prev, at.astimezone(UTC).isoformat(), actor, action, entity, entity_id, payload],
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(body.encode()).hexdigest()


def append(
    session: Session,
    *,
    actor: str,
    action: str,
    entity: str,
    entity_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> AuditEvent:
    """Add an event in the caller's transaction (committed with the action it records)."""
    session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": LOCK_KEY})
    prev = session.scalar(select(AuditEvent.hash).order_by(AuditEvent.seq.desc()).limit(1))
    prev_hash = prev or GENESIS
    at = datetime.now(UTC)  # Postgres keeps microseconds, so the hash re-computes exactly
    body = payload or {}
    event = AuditEvent(
        at=at,
        actor=actor[:100],
        action=action,
        entity=entity,
        entity_id=entity_id,
        payload=body,
        prev_hash=prev_hash,
        hash=_digest(prev_hash, at, actor[:100], action, entity, entity_id, body),
    )
    session.add(event)
    session.flush()
    return event


@dataclass(frozen=True)
class Verification:
    ok: bool
    events: int
    first_broken_seq: int | None


def verify(session: Session, batch: int = 5000) -> Verification:
    """Recompute every hash in order from the raw columns."""
    prev, checked, last_seq = GENESIS, 0, 0
    total = session.scalar(select(func.count()).select_from(AuditEvent)) or 0
    while checked < total:
        rows = session.execute(
            select(
                AuditEvent.seq,
                AuditEvent.at,
                AuditEvent.actor,
                AuditEvent.action,
                AuditEvent.entity,
                AuditEvent.entity_id,
                AuditEvent.payload,
                AuditEvent.prev_hash,
                AuditEvent.hash,
            )
            .where(AuditEvent.seq > last_seq)
            .order_by(AuditEvent.seq)
            .limit(batch)
        ).all()
        if not rows:
            break
        for seq, at, actor, action, entity, entity_id, payload, prev_hash, h in rows:
            if (
                prev_hash != prev
                or _digest(prev, at, actor, action, entity, entity_id, payload) != h
            ):
                return Verification(False, checked, seq)
            prev, last_seq, checked = h, seq, checked + 1
    return Verification(True, checked, None)
