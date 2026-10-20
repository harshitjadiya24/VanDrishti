"""Model outputs shared by adapters, pipeline stages and tests (no ML imports)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
from PIL import Image


@dataclass(frozen=True, slots=True)
class Box:
    category: str  # animal | person | vehicle
    confidence: float
    # Normalised to the original image: top-left x, y, width, height in 0-1.
    x: float
    y: float
    w: float
    h: float


@dataclass(frozen=True)
class MaskResult:
    """A segmentation mask (H x W, original resolution) and the model's predicted IoU."""

    mask: np.ndarray[Any, np.dtype[np.bool_]]
    predicted_iou: float


@dataclass(frozen=True)
class ClipRequest:
    """A crop and the candidate common names to compare it with (5.4)."""

    crop: Image.Image
    candidates: list[str]
