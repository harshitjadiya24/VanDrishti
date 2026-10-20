"""Integration API keys: `vd_<prefix>_<secret>`, one reserve each, shown once.

Only the SHA-256 of the whole key is stored (the key is 256 bits of randomness, so a plain
hash is enough; no password hashing is needed). The prefix finds the row; the hash is
compared in constant time. Creating and revoking keys is audited.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from vandrishti import audit
from vandrishti.db.models import ApiKey, Reserve


class ApiKeyError(ValueError):
    pass


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def create(
    session: Session, *, reserve: str, name: str, created_by: str, precise_locations: bool = False
) -> tuple[str, ApiKey]:
    res = session.scalar(select(Reserve).where(Reserve.code == reserve))
    if res is None:
        raise ApiKeyError(f"no reserve {reserve!r}")
    prefix = secrets.token_hex(4)
    key = f"vd_{prefix}_{secrets.token_urlsafe(32)}"
    row = ApiKey(
        reserve_id=res.id,
        name=name,
        prefix=prefix,
        key_hash=_hash(key),
        precise_locations=precise_locations,
        created_by=created_by,
    )
    session.add(row)
    session.flush()
    audit.append(
        session,
        actor=f"admin:{created_by}",
        action="apikey_create",
        entity="api_key",
        entity_id=str(row.id),
        payload={
            "reserve": reserve,
            "name": name,
            "prefix": prefix,
            "precise_locations": precise_locations,
        },
    )
    session.commit()
    return key, row


def revoke(session: Session, prefix: str, by: str) -> ApiKey:
    row = session.scalar(select(ApiKey).where(ApiKey.prefix == prefix))
    if row is None or row.revoked_at is not None:
        raise ApiKeyError("no active key with that prefix")
    row.revoked_at = datetime.now(UTC)
    audit.append(
        session,
        actor=f"admin:{by}",
        action="apikey_revoke",
        entity="api_key",
        entity_id=str(row.id),
        payload={"prefix": prefix, "name": row.name},
    )
    session.commit()
    return row


def verify(session: Session, key: str) -> ApiKey | None:
    parts = key.split("_")
    if len(parts) < 3 or parts[0] != "vd":
        return None
    row = session.scalar(select(ApiKey).where(ApiKey.prefix == parts[1]))
    if row is None or row.revoked_at is not None:
        return None
    if not secrets.compare_digest(row.key_hash, _hash(key)):
        return None
    row.last_used_at = datetime.now(UTC)
    return row
