"""Synthetic camera-trap images for tests.

Pixels are random: duplicate detection is global by SHA-256, so two tests writing the same
"blank" picture would collide (one would see the other's image as a duplicate).
"""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image
from PIL.TiffImagePlugin import IFDRational

from vandrishti.ingest.metadata import (
    BODY_SERIAL,
    DATETIME_ORIGINAL,
    EXIF_IFD,
    GPS_IFD,
    MAKE,
    MODEL,
)


def write_jpeg(
    path: Path,
    *,
    size: tuple[int, int] = (320, 240),
    taken: str | None = None,  # "YYYY:MM:DD HH:MM:SS", the camera's clock
    gps: tuple[float, float] | None = None,
    serial: str | None = None,
    orientation: int | None = None,
) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    im = Image.frombytes("RGB", size, os.urandom(size[0] * size[1] * 3))
    exif = Image.Exif()
    exif[MAKE], exif[MODEL] = "TestCam", "T1"
    if orientation:
        exif[0x0112] = orientation
    sub = exif.get_ifd(EXIF_IFD)
    if taken:
        sub[DATETIME_ORIGINAL] = taken
    if serial:
        sub[BODY_SERIAL] = serial
    if gps:
        g = exif.get_ifd(GPS_IFD)
        for ref, idx, value, pos, neg in ((1, 2, gps[0], "N", "S"), (3, 4, gps[1], "E", "W")):
            v = abs(value)
            d, rem = int(v), (v - int(v)) * 60
            m, s = int(rem), round((rem - int(rem)) * 60, 4)
            g[ref] = pos if value >= 0 else neg
            g[idx] = (IFDRational(d), IFDRational(m), IFDRational(s))
    im.save(path, "JPEG", exif=exif)
    return path
