"""5.1 image quality gate: blur, darkness, over/under-exposure, corruption, duplicates.

Metrics are computed on a grey copy at most 512 px on the long side (fast, and stable
across camera resolutions). Only frames with nothing left to see FAIL the gate (→ quality
review by a person, never deleted): an unreadable file, a frame where even the brightest
0.1% of pixels is near black, or one at least 95% white. A 75%-white frame in the test
sample still showed a vehicle, so heavy over-exposure is only a warning. Blur, dimness, low
contrast and near-duplicates are warnings too: in camera traps a blurred frame is often a
fast animal, so dropping it would hide exactly the frames that matter.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
from PIL import Image

QUALITY_VERSION = "1"
ANALYSIS_SIDE = 512


@dataclass(frozen=True)
class QualityConfig:
    # Calibrated on the LILA test sample (docs/EVALUATION.md, quality gate).
    too_dark_p999: float = 25.0  # brightest 0.1% near black: nothing visible → FAIL
    white_out_share: float = 0.95  # nearly all pixels clipped white → FAIL
    overexposed_share: float = 0.5  # warning
    dim_mean: float = 40.0  # warning
    low_contrast_std: float = 12.0  # warning
    # Sharp sample frames scored ≥ 226; a 4 px Gaussian blur gives a median of 61. Warning:
    # in camera traps a blurred frame is often a fast animal.
    blur_laplacian_var: float = 100.0
    near_duplicate_bits: int = 2  # dHash distance to the previous frame (same camera)

    def as_dict(self) -> dict[str, Any]:
        return dict(self.__dict__)


BLOCKING = {"unreadable", "too_dark", "white_out"}


@dataclass
class QualityResult:
    flags: list[str] = field(default_factory=list)
    metrics: dict[str, float] = field(default_factory=dict)
    dhash: str | None = None

    @property
    def passed(self) -> bool:
        return not BLOCKING.intersection(self.flags)


def grey_small(image: Image.Image) -> np.ndarray[Any, np.dtype[np.float32]]:
    im = image.convert("L")
    im.thumbnail((ANALYSIS_SIDE, ANALYSIS_SIDE), Image.Resampling.BILINEAR)
    return np.asarray(im, dtype=np.float32)


def laplacian_variance(g: np.ndarray[Any, np.dtype[np.float32]]) -> float:
    """Variance of the 4-neighbour Laplacian: low = few sharp edges = blurred."""
    lap = -4 * g[1:-1, 1:-1] + g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:]
    return float(lap.var())


def difference_hash(image: Image.Image, size: int = 8) -> str:
    """64-bit dHash: is each pixel brighter than its right neighbour (on a 9x8 thumbnail)."""
    small = np.asarray(
        image.convert("L").resize((size + 1, size), Image.Resampling.BILINEAR), dtype=np.int16
    )
    bits = (small[:, 1:] > small[:, :-1]).flatten()
    return f"{int(''.join('1' if b else '0' for b in bits), 2):016x}"


def hamming(a: str, b: str) -> int:
    return (int(a, 16) ^ int(b, 16)).bit_count()


def is_infrared(image: Image.Image) -> bool:
    """Night IR frames are effectively grey: the colour channels barely differ."""
    rgb = np.asarray(image.convert("RGB").resize((64, 48)), dtype=np.int16)
    spread = np.abs(rgb[..., 0] - rgb[..., 1]) + np.abs(rgb[..., 1] - rgb[..., 2])
    return float(spread.mean()) < 6.0


def assess(
    image: Image.Image, cfg: QualityConfig, previous_dhash: str | None = None
) -> QualityResult:
    g = grey_small(image)
    metrics = {
        "mean": round(float(g.mean()), 2),
        "p99": round(float(np.percentile(g, 99)), 2),
        "p999": round(float(np.percentile(g, 99.9)), 2),
        "std": round(float(g.std()), 2),
        "white_share": round(float((g >= 250).mean()), 4),
        "black_share": round(float((g <= 5).mean()), 4),
        "laplacian_var": round(laplacian_variance(g), 2),
        "infrared": float(is_infrared(image)),
    }
    flags = []
    if metrics["p999"] < cfg.too_dark_p999:
        flags.append("too_dark")
    if metrics["white_share"] >= cfg.white_out_share:
        flags.append("white_out")
    elif metrics["white_share"] > cfg.overexposed_share:
        flags.append("overexposed")
    if metrics["mean"] < cfg.dim_mean and "too_dark" not in flags:
        flags.append("dim")
    if metrics["std"] < cfg.low_contrast_std:
        flags.append("low_contrast")
    if metrics["laplacian_var"] < cfg.blur_laplacian_var:
        flags.append("blurry")
    dhash = difference_hash(image)
    if previous_dhash and hamming(dhash, previous_dhash) <= cfg.near_duplicate_bits:
        flags.append("near_duplicate")
    if metrics["infrared"]:
        flags.append("night_ir")  # information, not a problem
    return QualityResult(flags=flags, metrics=metrics, dhash=dhash)
