"""The one interface every model adapter implements.

Only `vandrishti.models.adapters.*` may import model libraries (torch, open_clip, ...);
everything else talks to this protocol, so models can be swapped, mocked and unloaded.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class Model(Protocol):
    name: str
    version: str
    licence: str
    memory_estimate_mb: int

    @property
    def loaded(self) -> bool: ...

    def load(self, device: str) -> None: ...

    def unload(self) -> None: ...

    def predict(self, batch: list[Any]) -> list[Any]: ...
