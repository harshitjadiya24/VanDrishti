"""Device choice and cache clearing. Torch is optional: without it everything runs on CPU.

Lives in adapters because it is the only place allowed to import model libraries.
"""

from __future__ import annotations

import gc


def resolve_device(preference: str) -> str:
    """'auto' → mps, cuda or cpu, whichever exists. Torch is optional at this layer."""
    if preference != "auto":
        return preference
    try:
        import torch
    except ImportError:
        return "cpu"
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def clear_accelerator_cache() -> None:
    gc.collect()
    try:
        import torch
    except ImportError:
        return
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
