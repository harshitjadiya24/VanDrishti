"""10.5 re-identification embedders: one vector per tiger crop; similar stripes → close vectors.

- MegaDescriptor-T-224 (BVRA, Swin-T, trained for animal re-identification). Model card
  licence CC-BY-NC-4.0 (non-commercial; its config says "mit" — the stricter card applies).
  Most likely trained on ATRW, so ATRW scores for it are optimistic.
- DINOv2-small (Meta, Apache-2.0): a general vision model, not trained on individual animals.

Both take the crop resized to 224 x 224 with ImageNet normalisation (as wildlife-tools does
for MegaDescriptor) and return an L2-normalised vector; cosine similarity is a dot product.
Weights load only if they fill the network exactly.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import torch
from PIL import Image
from torchvision.transforms import functional as tf

MEAN, STD = [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]


def _tensor(crops: list[Image.Image]) -> torch.Tensor:
    return torch.stack(
        [
            tf.normalize(
                tf.to_tensor(c.convert("RGB").resize((224, 224), Image.Resampling.BICUBIC)),
                MEAN,
                STD,
            )
            for c in crops
        ]
    )


class _Embedder:
    name = ""
    version = ""
    licence = ""
    memory_estimate_mb = 600
    dim = 0

    def __init__(self, weights_dir: Path) -> None:
        self.weights_dir = weights_dir
        self._model: Any = None
        self.device = "cpu"

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def load(self, device: str) -> None:
        raise NotImplementedError

    def unload(self) -> None:
        self._model = None

    def _forward(self, x: torch.Tensor) -> torch.Tensor:
        raise NotImplementedError

    def predict(self, batch: list[Any]) -> list[Any]:
        """PIL crops → float32 unit vectors (numpy), one per crop."""
        if self._model is None:
            raise RuntimeError(f"{self.name} is not loaded")
        if not batch:
            return []
        with torch.inference_mode():
            v = self._forward(_tensor(batch).to(self.device)).float()
            unit = torch.nn.functional.normalize(v, dim=-1).cpu().numpy().astype(np.float32)
        return list(unit)


class MegaDescriptorT(_Embedder):
    name = "megadescriptor-t-224"
    version = "3ea58ff6"
    licence = "CC-BY-NC-4.0 (model card)"
    dim = 768

    def load(self, device: str) -> None:
        import timm

        model = timm.create_model("swin_tiny_patch4_window7_224", pretrained=False, num_classes=0)
        ckpt = torch.load(
            self.weights_dir / "pytorch_model.bin", map_location="cpu", weights_only=True
        )
        # A training checkpoint: the weights sit under "model" beside "objective" and "epoch".
        # It uses the older timm Swin layout (downsample at the end of each stage); timm's own
        # converter maps it to the current layout.
        from timm.models.swin_transformer import checkpoint_filter_fn

        state = checkpoint_filter_fn(ckpt.get("model", ckpt), model)
        missing, unexpected = model.load_state_dict(state, strict=False)
        if missing or unexpected:
            raise RuntimeError(
                f"weights do not fit: {len(missing)} missing, {len(unexpected)} unexpected"
            )
        self._model = model.eval().to(device)
        self.device = device

    def _forward(self, x: torch.Tensor) -> torch.Tensor:
        out: torch.Tensor = self._model(x)
        return out


class Dinov2Small(_Embedder):
    name = "dinov2-small"
    version = "ed25f3a3"
    licence = "Apache-2.0"
    dim = 384

    def load(self, device: str) -> None:
        from typing import cast

        from transformers import Dinov2Model

        model, info = cast(
            tuple[Any, dict[str, list[str]]],
            Dinov2Model.from_pretrained(self.weights_dir, output_loading_info=True),
        )
        if any(info.get(k) for k in ("missing_keys", "mismatched_keys")):
            raise RuntimeError(f"weights do not fit: { {k: len(v) for k, v in info.items() if v} }")
        self._model = model.eval().to(device)
        self.device = device

    def _forward(self, x: torch.Tensor) -> torch.Tensor:
        out: torch.Tensor = self._model(pixel_values=x).pooler_output  # the CLS token
        return out


EMBEDDERS = {"megadescriptor-t-224": MegaDescriptorT, "dinov2-small": Dinov2Small}
