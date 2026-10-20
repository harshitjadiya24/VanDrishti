"""A tiny stand-in model for tests and wiring checks (no ML libraries)."""

from __future__ import annotations

from typing import Any


class DummyModel:
    licence = "Apache-2.0"

    def __init__(self, name: str = "dummy", version: str = "1", memory_estimate_mb: int = 10):
        self.name = name
        self.version = version
        self.memory_estimate_mb = memory_estimate_mb
        self.device: str | None = None
        self.load_count = 0

    @property
    def loaded(self) -> bool:
        return self.device is not None

    def load(self, device: str) -> None:
        self.device = device
        self.load_count += 1

    def unload(self) -> None:
        self.device = None

    def predict(self, batch: list[Any]) -> list[Any]:
        if not self.loaded:
            raise RuntimeError(f"{self.name} is not loaded")
        return [{"input": x, "model": self.name} for x in batch]
