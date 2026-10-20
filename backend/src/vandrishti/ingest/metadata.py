"""What an image says about itself: capture time, GPS and camera, from EXIF.

Camera clocks have no time zone: EXIF `DateTimeOriginal` is the local clock of wherever the
camera was set, so it is read in the reserve's time zone and stored as UTC. When EXIF has no
time, a manifest CSV (`file_name,datetime`) or, last, the file's modification time is used,
and `time_source` records which.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from PIL import Image, UnidentifiedImageError

# EXIF tag numbers (Pillow exposes them as plain ints).
MAKE, MODEL = 0x010F, 0x0110
EXIF_IFD, GPS_IFD = 0x8769, 0x8825
DATETIME_ORIGINAL, BODY_SERIAL = 0x9003, 0xA431
GPS_LAT_REF, GPS_LAT, GPS_LON_REF, GPS_LON = 1, 2, 3, 4


@dataclass
class ExifInfo:
    captured_local: datetime | None = None  # naive: the camera's own clock
    latitude: float | None = None
    longitude: float | None = None
    make: str | None = None
    model: str | None = None
    serial: str | None = None

    def subset(self) -> dict[str, Any]:
        """The privacy-safe fields kept on the image row (not every tag)."""
        out: dict[str, Any] = {
            "make": self.make,
            "model": self.model,
            "serial": self.serial,
            "datetime_original": self.captured_local.isoformat() if self.captured_local else None,
            "gps": [self.latitude, self.longitude] if self.latitude is not None else None,
        }
        return {k: v for k, v in out.items() if v is not None}


@dataclass
class Manifest:
    """Capture times from a CSV, keyed by path relative to the ingested folder."""

    times: dict[str, datetime] = field(default_factory=dict)

    def get(self, relative: str) -> datetime | None:
        return self.times.get(relative)


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = (value.decode(errors="ignore") if isinstance(value, bytes) else str(value)).strip(
        "\x00 "
    )
    return text or None


def _degrees(dms: Any, ref: Any) -> float | None:
    try:
        d, m, s = (float(x) for x in dms)
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    value = d + m / 60 + s / 3600
    if _text(ref) in ("S", "W"):
        value = -value
    return round(value, 7)


def read_exif(path: Path) -> ExifInfo:
    """Never raises for a readable image; missing or broken tags become None."""
    info = ExifInfo()
    try:
        with Image.open(path) as im:
            exif = im.getexif()
    except (OSError, UnidentifiedImageError):
        return info
    info.make, info.model = _text(exif.get(MAKE)), _text(exif.get(MODEL))
    sub = exif.get_ifd(EXIF_IFD)
    info.serial = _text(sub.get(BODY_SERIAL))
    raw_time = _text(sub.get(DATETIME_ORIGINAL))
    if raw_time:
        try:
            info.captured_local = datetime.strptime(raw_time, "%Y:%m:%d %H:%M:%S")
        except ValueError:
            info.captured_local = None
    gps = exif.get_ifd(GPS_IFD)
    if gps:
        lat = _degrees(gps.get(GPS_LAT), gps.get(GPS_LAT_REF))
        lon = _degrees(gps.get(GPS_LON), gps.get(GPS_LON_REF))
        # (0, 0) is what cameras write when they have no fix.
        if (
            lat is not None
            and lon is not None
            and -90 <= lat <= 90
            and -180 <= lon <= 180
            and (lat, lon) != (0.0, 0.0)
        ):
            info.latitude, info.longitude = lat, lon
    return info


def local_to_utc(local: datetime, timezone: str) -> datetime:
    """A camera's local clock reading → UTC, using the reserve's time zone."""
    return local.replace(tzinfo=ZoneInfo(timezone)).astimezone(UTC)


def load_manifest(path: Path, *, times_are_local: bool = True) -> Manifest:
    """Read `file_name,datetime` rows.

    `times_are_local=True` (default) ignores any offset in the text and treats the clock
    reading as local: datasets such as LILA label camera clock times "+00:00" although they
    are local times. Use False only when the manifest really holds UTC instants.
    """
    out: dict[str, datetime] = {}
    with path.open(newline="") as f:
        for row in csv.DictReader(f):
            name, value = row.get("file_name"), row.get("datetime")
            if not name or not value:
                continue
            stamp = datetime.fromisoformat(value.strip())
            if times_are_local:
                stamp = stamp.replace(tzinfo=None)
            elif stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=UTC)
            out[name.strip()] = stamp
    return Manifest(out)
