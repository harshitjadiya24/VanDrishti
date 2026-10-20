"""Section 4: corruption check, format standardisation, resize/normalise, noise reduction.

The original is never touched. Preprocessing writes one derivative (the "display" copy):
EXIF orientation applied, RGB, long side capped, JPEG. The parameters and a version go on
the image row so any copy can be traced and regenerated.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError

PREPROCESS_VERSION = "1"
JPEG_QUALITY = 88


@dataclass(frozen=True, slots=True)
class FileCheck:
    ok: bool
    reason: str | None = None
    width: int | None = None
    height: int | None = None
    format: str | None = None


def check_image(path: Path) -> FileCheck:
    """Structure check, then a full decode: truncated files pass `verify()` but fail to load."""
    if path.stat().st_size == 0:
        return FileCheck(False, "empty file")
    try:
        with Image.open(path) as im:
            fmt = im.format
            im.verify()
        with Image.open(path) as im:
            im.load()
            width, height = im.size
    except Image.DecompressionBombError:
        return FileCheck(False, "image too large (decompression bomb guard)")
    except UnidentifiedImageError:
        return FileCheck(False, "not an image")
    except (OSError, SyntaxError, ValueError) as exc:
        return FileCheck(False, f"unreadable: {str(exc)[:200]}")
    return FileCheck(True, width=width, height=height, format=fmt)


def make_display(path: Path, *, max_side: int, denoise: bool) -> tuple[bytes, dict[str, Any]]:
    """The normalised derivative and a record of exactly how it was made."""
    with Image.open(path) as im:
        oriented = ImageOps.exif_transpose(im)
        rgb = oriented.convert("RGB")
    rgb.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    if denoise:
        rgb = rgb.filter(ImageFilter.MedianFilter(3))
    buf = io.BytesIO()
    rgb.save(buf, "JPEG", quality=JPEG_QUALITY, optimize=True)
    params = {
        "version": PREPROCESS_VERSION,
        "max_side": max_side,
        "denoise": "median3" if denoise else None,
        "format": "jpeg",
        "quality": JPEG_QUALITY,
        "size": list(rgb.size),
    }
    return buf.getvalue(), params
