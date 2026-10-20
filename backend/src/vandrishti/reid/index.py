"""FAISS similarity search over unit vectors (inner product = cosine).

PyTorch and FAISS each link their own OpenMP runtime; in one process on macOS that crashes
(seen: segmentation fault), and the only workaround is documented as able to give wrong
results. So FAISS runs only in processes that have not loaded PyTorch: embedding is one
step, searching another. This module refuses to run in a process that already loaded torch.
"""

from __future__ import annotations

import sys
from typing import Any

import numpy as np


class TorchLoadedError(RuntimeError):
    pass


def _faiss() -> Any:
    if "torch" in sys.modules:
        raise TorchLoadedError(
            "FAISS must not share a process with PyTorch (two OpenMP runtimes): embed first, "
            "then search in a separate process"
        )
    import faiss

    return faiss


class VectorIndex:
    """Exact inner-product search; fine for tens of thousands of crops per reserve."""

    def __init__(self, dim: int) -> None:
        self._faiss = _faiss()
        self._index = self._faiss.IndexFlatIP(dim)
        self.dim = dim

    def add(self, vectors: np.ndarray[Any, Any]) -> None:
        self._index.add(np.ascontiguousarray(vectors, dtype=np.float32))

    def search(
        self, queries: np.ndarray[Any, Any], k: int
    ) -> tuple[np.ndarray[Any, Any], np.ndarray[Any, Any]]:
        k = min(k, self._index.ntotal)
        if k == 0:
            empty = np.zeros((len(queries), 0))
            return empty, empty.astype(np.int64)
        sims, idx = self._index.search(np.ascontiguousarray(queries, dtype=np.float32), k)
        return sims, idx

    def __len__(self) -> int:
        return int(self._index.ntotal)
