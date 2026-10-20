"""People's actions on alerts, and delivery to the signed webhook.

Acknowledge, resolve and reopen are a person's actions: each is audited, and reopen undoes a
resolve. The webhook gets a JSON body signed with HMAC-SHA256 over "<timestamp>.<body>":

    X-VanDrishti-Timestamp: 1730000000
    X-VanDrishti-Signature: sha256=<hex>

The receiver recomputes the signature with the shared secret and rejects old timestamps.
Payloads carry camera codes and reasons, never coordinates or images.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from vandrishti import audit
from vandrishti.core.config import Settings
from vandrishti.db.models import (
    Alert,
    AlertDelivery,
    AlertSeverity,
    AlertState,
    DeliveryStatus,
    Reserve,
)

CHANNEL = "webhook"
RANK = {AlertSeverity.INFO: 0, AlertSeverity.WARNING: 1, AlertSeverity.CRITICAL: 2}
ACTIONS = {
    "acknowledge": (AlertState.OPEN,),
    "resolve": (AlertState.OPEN, AlertState.ACKNOWLEDGED),
    "reopen": (AlertState.ACKNOWLEDGED, AlertState.RESOLVED),
}
TARGET = {
    "acknowledge": AlertState.ACKNOWLEDGED,
    "resolve": AlertState.RESOLVED,
    "reopen": AlertState.OPEN,
}


class AlertError(ValueError):
    pass


def act(
    session: Session, alert_id: Any, action: str, person: str, note: str | None = None
) -> Alert:
    alert = session.get(Alert, alert_id)
    if alert is None:
        raise AlertError("no such alert")
    if action not in ACTIONS:
        raise AlertError("action must be acknowledge, resolve or reopen")
    if alert.state not in ACTIONS[action]:
        raise AlertError(f"cannot {action} an alert that is {alert.state.value}")
    before = alert.state
    alert.state = TARGET[action]
    alert.acted_by, alert.acted_at = person, datetime.now(UTC)
    if note:
        alert.note = note[:2000]
    audit.append(
        session,
        actor=f"reviewer:{person}",
        action=f"alert_{action}",
        entity="alert",
        entity_id=str(alert.id),
        payload={
            "kind": alert.kind.value,
            "from": before.value,
            "to": alert.state.value,
            "note": alert.note,
        },
    )
    session.commit()
    return alert


def payload(alert: Alert, reserve_code: str) -> dict[str, Any]:
    keep = (
        "camera",
        "frames",
        "individuals",
        "level",
        "score",
        "people",
        "vehicles",
        "night",
        "local_day",
        "check",
        "days",
        "failed",
        "checked",
        "time_reliable",
    )
    return {
        "id": str(alert.id),
        "kind": alert.kind.value,
        "severity": alert.severity.value,
        "state": alert.state.value,
        "title": alert.title,
        "reserve": reserve_code,
        "occurred_at": alert.occurred_at.isoformat() if alert.occurred_at else None,
        "created_at": alert.created_at.isoformat(),
        "reasons": alert.detail.get("reasons", []),
        "facts": {k: alert.detail[k] for k in keep if k in alert.detail},
        "rule_version": alert.rule_version,
    }


def sign(secret: str, timestamp: int, body: bytes) -> str:
    mac = hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256)
    return f"sha256={mac.hexdigest()}"


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: Any, **kwargs: Any) -> None:
        return None  # a webhook must answer itself; never follow a redirect elsewhere


def _post(url: str, body: bytes, headers: dict[str, str], timeout: float) -> int:
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")  # noqa: S310
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(req, timeout=timeout) as resp:
            return int(resp.status)
    except urllib.error.HTTPError as e:
        return int(e.code)


def deliver(session: Session, settings: Settings, *, now: float | None = None) -> dict[str, int]:
    """Send open alerts at or above the minimum severity that have not been sent yet.
    Failures are retried on later runs up to `alert_webhook_max_attempts`."""
    url, secret = settings.alert_webhook_url, settings.alert_webhook_secret
    if not url or secret is None:
        return {"skipped_no_webhook": 1}
    if settings.env != "dev" and not url.startswith("https://"):
        raise AlertError("the alert webhook must use https outside dev")
    minimum = RANK[AlertSeverity(settings.alert_webhook_min_severity)]
    rows = session.execute(
        select(Alert, Reserve.code)
        .join(Reserve, Reserve.id == Alert.reserve_id)
        .where(Alert.state == AlertState.OPEN)
        .order_by(Alert.created_at)
    ).all()
    stats = {"sent": 0, "failed": 0, "gave_up": 0}
    for alert, code in rows:
        if RANK[alert.severity] < minimum:
            continue
        d = session.scalar(
            select(AlertDelivery).where(
                AlertDelivery.alert_id == alert.id, AlertDelivery.channel == CHANNEL
            )
        )
        if d is None:
            d = AlertDelivery(alert_id=alert.id, channel=CHANNEL, attempts=0)
            session.add(d)
        if d.status in (DeliveryStatus.SENT, DeliveryStatus.GAVE_UP):
            continue
        body = json.dumps(payload(alert, code), separators=(",", ":"), sort_keys=True).encode()
        ts = int(now if now is not None else time.time())
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "VanDrishti-alerts/1",
            "X-VanDrishti-Timestamp": str(ts),
            "X-VanDrishti-Signature": sign(secret.get_secret_value(), ts, body),
        }
        d.attempts += 1
        try:
            code_ = _post(url, body, headers, settings.alert_webhook_timeout_seconds)
            d.response_code, d.last_error = code_, None if 200 <= code_ < 300 else f"HTTP {code_}"
        except (OSError, ValueError) as e:  # connection refused, timeout, bad URL
            d.response_code, d.last_error = None, str(e)[:500]
        if d.last_error is None:
            d.status, d.sent_at = DeliveryStatus.SENT, datetime.now(UTC)
            stats["sent"] += 1
        elif d.attempts >= settings.alert_webhook_max_attempts:
            d.status = DeliveryStatus.GAVE_UP
            stats["gave_up"] += 1
        else:
            d.status = DeliveryStatus.FAILED
            stats["failed"] += 1
        session.commit()
    return stats
