"""A small in-process sliding-window rate limiter.

One API process (the deployment runs a single worker), so in-process counts are exact. With
several processes each would count separately: then move this to Redis.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, limit: int, window_seconds: float = 60.0) -> None:
        self.limit, self.window = limit, window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, now: float | None = None) -> bool:
        t = time.monotonic() if now is None else now
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= t - self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(t)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


LOGIN = RateLimiter(10)  # attempts per minute per client address
