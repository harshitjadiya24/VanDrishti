"""Keeps at most N models resident (8 GB laptop: N = 1) within a memory budget.

Models load lazily on first use; the least recently used one is unloaded to make room.
After an unload the accelerator cache is cleared, because PyTorch keeps freed MPS/CUDA
memory reserved otherwise.
"""

from __future__ import annotations

import logging
import threading
from collections import OrderedDict
from collections.abc import Callable

from vandrishti.models.adapters.torch_runtime import clear_accelerator_cache, resolve_device
from vandrishti.models.base import Model

logger = logging.getLogger(__name__)


class ModelBudgetError(RuntimeError):
    """A single model is larger than the whole memory budget."""


class ModelManager:
    def __init__(
        self,
        *,
        max_loaded: int = 1,
        budget_mb: int = 3000,
        device: str = "auto",
        clear_cache: Callable[[], None] = clear_accelerator_cache,
    ) -> None:
        self.max_loaded = max_loaded
        self.budget_mb = budget_mb
        self.device = device
        self._clear_cache = clear_cache
        self._loaded: OrderedDict[str, Model] = OrderedDict()
        self._lock = threading.Lock()

    @property
    def resident(self) -> list[str]:
        return list(self._loaded)

    def get(self, model: Model) -> Model:
        """Return the model loaded, unloading others first if needed."""
        if model.memory_estimate_mb > self.budget_mb:
            raise ModelBudgetError(
                f"{model.name} needs ~{model.memory_estimate_mb} MB; budget is {self.budget_mb} MB"
            )
        key = f"{model.name}@{model.version}"
        with self._lock:
            if key in self._loaded:
                self._loaded.move_to_end(key)
                return self._loaded[key]
            while self._loaded and (
                len(self._loaded) >= self.max_loaded
                or self._used_mb() + model.memory_estimate_mb > self.budget_mb
            ):
                self._evict_oldest()
            device = resolve_device(self.device)
            logger.info("loading model", extra={"model": key, "device": device})
            model.load(device)
            self._loaded[key] = model
            return model

    def unload_all(self) -> None:
        with self._lock:
            while self._loaded:
                self._evict_oldest()

    def _used_mb(self) -> int:
        return sum(m.memory_estimate_mb for m in self._loaded.values())

    def _evict_oldest(self) -> None:
        key, model = self._loaded.popitem(last=False)
        logger.info("unloading model", extra={"model": key})
        model.unload()
        self._clear_cache()
