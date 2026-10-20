"""Burst grouping: one camera trigger usually fires several frames a second apart."""

from __future__ import annotations

from collections.abc import Hashable, Iterable
from datetime import datetime, timedelta
from typing import TypeVar

K = TypeVar("K", bound=Hashable)


def group_bursts(frames: Iterable[tuple[K, datetime]], gap_seconds: float) -> list[list[K]]:
    """Frames (id, time) of ONE camera → bursts, splitting where the gap exceeds the limit.

    Frames without a time cannot be placed and are left out (they stay unsequenced).
    """
    ordered = sorted(frames, key=lambda f: f[1])
    gap = timedelta(seconds=gap_seconds)
    bursts: list[list[K]] = []
    last: datetime | None = None
    for key, at in ordered:
        if last is None or at - last > gap:
            bursts.append([])
        bursts[-1].append(key)
        last = at
    return bursts
