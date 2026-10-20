"""5.5 segmentation: SAM 2.1 hiera-tiny (Meta, Apache-2.0) via Hugging Face transformers.

Prompted with the detector's box, returns the animal's mask. Runs on CPU by default: on an
M3, SAM 2 on MPS makes the Metal driver reserve ~2.4 GB that does not show in RSS.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, cast

import torch
from PIL import Image
from transformers import Sam2Model, Sam2Processor

from vandrishti.models.detection import Box, MaskResult


class Sam2Segmenter:
    name = "sam2.1-hiera-tiny"
    version = "de431c40"
    licence = "Apache-2.0 (weights and code)"
    memory_estimate_mb = 700

    def __init__(self, weights_dir: Path) -> None:
        self.weights_dir = weights_dir
        self._model: Any = None
        self._processor: Any = None
        self.device = "cpu"

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def load(self, device: str) -> None:
        # With output_loading_info=True transformers returns (model, info); its stubs do not say so.
        model, info = cast(
            tuple[Any, dict[str, list[str]]],
            Sam2Model.from_pretrained(self.weights_dir, output_loading_info=True),
        )
        problems = {k: v for k, v in info.items() if v}
        if problems:  # never run with weights only partly loaded
            raise RuntimeError(
                f"SAM 2 weights do not fit: { {k: len(v) for k, v in problems.items()} }"
            )
        self._model = model.eval().to(device)
        self._processor = Sam2Processor.from_pretrained(self.weights_dir)
        self.device = device

    def unload(self) -> None:
        self._model = self._processor = None

    def predict(self, batch: list[Any]) -> list[Any]:
        """(image, Box) pairs → MaskResult each."""
        if self._model is None:
            raise RuntimeError("SAM 2 is not loaded")
        out = []
        for image, box in batch:
            img: Image.Image = image
            b: Box = box
            w, h = img.size
            xyxy = [b.x * w, b.y * h, (b.x + b.w) * w, (b.y + b.h) * h]
            inputs = self._processor(images=img, input_boxes=[[xyxy]], return_tensors="pt")
            inputs = {k: v.to(self.device) if hasattr(v, "to") else v for k, v in inputs.items()}
            with torch.inference_mode():
                pred = self._model(**inputs, multimask_output=False)
            masks = self._processor.post_process_masks(
                pred.pred_masks.cpu(), inputs["original_sizes"].cpu()
            )[0]
            out.append(
                MaskResult(
                    mask=masks[0, 0].numpy().astype(bool),
                    predicted_iou=float(pred.iou_scores.flatten()[0]),
                )
            )
        return out
