"""Detector output shared by adapters, pipeline stages and tests (no ML imports)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Box:
    category: str  # animal | person | vehicle
    confidence: float
    # Normalised to the original image: top-left x, y, width, height in 0-1.
    x: float
    y: float
    w: float
    h: float
