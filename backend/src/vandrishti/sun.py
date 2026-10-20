"""Sunrise and sunset from the standard sunrise equation (accurate to a few minutes).

Used to call a camera-trap frame "night" from the real sun at the camera, not a fixed clock:
sunset in central India moves by over an hour between December and June. Without a location
the caller falls back to 19:00-06:00 local time and says so.
"""

from __future__ import annotations

import math
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

J2000 = 2451545.0
UNIX_EPOCH_JD = 2440587.5


def _julian(dt: datetime) -> float:
    return dt.timestamp() / 86400.0 + UNIX_EPOCH_JD


def _from_julian(jd: float) -> datetime:
    return datetime.fromtimestamp((jd - UNIX_EPOCH_JD) * 86400.0, UTC)


def sun_times(day: date, latitude: float, longitude: float) -> tuple[datetime, datetime] | None:
    """(sunrise, sunset) in UTC for that calendar day at that place; None in polar day/night."""
    noon = datetime(day.year, day.month, day.day, 12, tzinfo=UTC)
    n = math.ceil(_julian(noon) - J2000 + 0.0008)
    j_star = n - longitude / 360.0
    m = math.radians((357.5291 + 0.98560028 * j_star) % 360)
    c = 1.9148 * math.sin(m) + 0.02 * math.sin(2 * m) + 0.0003 * math.sin(3 * m)
    lam = math.radians((math.degrees(m) + c + 180 + 102.9372) % 360)
    transit = J2000 + j_star + 0.0053 * math.sin(m) - 0.0069 * math.sin(2 * lam)
    decl = math.asin(math.sin(lam) * math.sin(math.radians(23.4397)))
    phi = math.radians(latitude)
    cos_w = (math.sin(math.radians(-0.833)) - math.sin(phi) * math.sin(decl)) / (
        math.cos(phi) * math.cos(decl)
    )
    if abs(cos_w) > 1:
        return None
    w = math.degrees(math.acos(cos_w)) / 360.0
    return _from_julian(transit - w), _from_julian(transit + w)


def is_night(
    at: datetime, timezone: str, latitude: float | None, longitude: float | None
) -> tuple[bool, str]:
    """(night?, basis): basis "sun" when the camera's location is known, else "clock"."""
    local = at.astimezone(ZoneInfo(timezone))
    if latitude is not None and longitude is not None:
        times = sun_times(local.date(), latitude, longitude)
        # The equation's "day" can be offset by one from the local date (far east/west of
        # Greenwich), so test the daylight spans of the neighbouring days too.
        spans = [
            sun_times(local.date() + timedelta(days=d), latitude, longitude) for d in (-1, 0, 1)
        ]
        if times is not None:
            return not any(s and s[0] <= at <= s[1] for s in spans), "sun"
    return (local.hour >= 19 or local.hour < 6), "clock"
