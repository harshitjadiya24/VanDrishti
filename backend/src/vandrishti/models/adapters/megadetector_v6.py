"""MegaDetector V6, MIT variant (MDV6-mit-yolov9-c): animal / person / vehicle boxes.

Weights: Zenodo record 15398270 (Pytorch-Wildlife model weights, CC-BY-4.0), fetched and
checksum-verified by `scripts/download_models.py megadetector-v6-mit-c`. Code: the bundled
MIT YOLOv9 subset in `vendor/yolo_mit`. Preprocessing matches Pytorch-Wildlife's
`YOLOMITBase` exactly (letterbox to 640 x 640 with LANCZOS resize and grey 114 padding,
pixels scaled to 0-1); boxes are mapped back to the original image and normalised.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, cast

import torch
from omegaconf import OmegaConf
from PIL import Image
from torchvision.transforms import functional as tf

from vandrishti.models.adapters.vendor.yolo_mit import bbox_nms, create_converter, create_model
from vandrishti.models.adapters.vendor.yolo_mit.config import NMSConfig
from vandrishti.models.detection import Box

CATEGORIES = ("animal", "person", "vehicle")  # class ids 0, 1, 2
IMAGE_SIZE = 640
PAD_GREY = (114, 114, 114)


def letterbox(image: Image.Image) -> tuple[torch.Tensor, torch.Tensor]:
    """Resize to fit 640 x 640, pad the rest grey; return the tensor and how to undo it."""
    w, h = image.size
    scale = min(IMAGE_SIZE / w, IMAGE_SIZE / h)
    nw, nh = int(w * scale), int(h * scale)
    resized = image.convert("RGB").resize((nw, nh), Image.Resampling.LANCZOS)
    left, top = (IMAGE_SIZE - nw) // 2, (IMAGE_SIZE - nh) // 2
    canvas = Image.new("RGB", (IMAGE_SIZE, IMAGE_SIZE), PAD_GREY)
    canvas.paste(resized, (left, top))
    undo = torch.tensor([scale, left, top, left, top], dtype=torch.float32)
    return tf.to_tensor(canvas), undo


def to_boxes(rows: torch.Tensor, width: int, height: int) -> list[Box]:
    """NMS output rows [class, x1, y1, x2, y2, conf] in original pixels → normalised boxes."""
    out = []
    for cls, x1, y1, x2, y2, conf in rows.tolist():
        x1, x2 = max(0.0, min(x1, width)), max(0.0, min(x2, width))
        y1, y2 = max(0.0, min(y1, height)), max(0.0, min(y2, height))
        if x2 - x1 < 1 or y2 - y1 < 1:
            continue
        out.append(
            Box(
                category=CATEGORIES[int(cls)],
                confidence=round(float(conf), 4),
                x=round(x1 / width, 5),
                y=round(y1 / height, 5),
                w=round((x2 - x1) / width, 5),
                h=round((y2 - y1) / height, 5),
            )
        )
    return sorted(out, key=lambda b: -b.confidence)


class MegaDetectorV6MIT:
    name = "megadetector-v6-mit"
    version = "MDV6-mit-yolov9-c"
    licence = "weights CC-BY-4.0 (Microsoft Pytorch-Wildlife); code MIT"
    memory_estimate_mb = 500

    def __init__(
        self, weights_dir: Path, *, min_confidence: float = 0.05, iou: float = 0.5
    ) -> None:
        self.weights_dir = weights_dir
        self.min_confidence = min_confidence
        self.iou = iou
        self._model: Any = None
        self._converter: Any = None
        self.device = "cpu"

    @property
    def loaded(self) -> bool:
        return self._model is not None

    @property
    def config(self) -> dict[str, Any]:
        """What changes the outputs: part of every stored row's config hash."""
        return {"min_confidence": self.min_confidence, "iou": self.iou, "image_size": IMAGE_SIZE}

    def load(self, device: str) -> None:
        cfg = OmegaConf.load(self.weights_dir / "config_v9s.yaml")
        model = create_model(cfg.model, weight_path=False, class_num=len(CATEGORIES))
        ckpt = torch.load(
            self.weights_dir / "MDV6-mit-yolov9-c.ckpt", map_location="cpu", weights_only=True
        )
        state = {k.removeprefix("model.model."): v for k, v in ckpt["state_dict"].items()}
        # The bundled code annotates this ModuleList as a plain list.
        layers = cast(torch.nn.Module, model.model)
        expected = layers.state_dict()
        missing = [k for k in expected if k not in state]
        wrong = [k for k in expected if k in state and state[k].shape != expected[k].shape]
        # The bundled loader ignores these silently; a half-loaded detector must never run.
        if missing or wrong:
            raise RuntimeError(f"weights do not fit: {len(missing)} missing, {len(wrong)} wrong")
        layers.load_state_dict({k: state[k] for k in expected})
        model.eval().to(device)
        self.device = device
        self._model = model
        # Box decoding and NMS run on the CPU: small, and NMS support varies by backend.
        self._converter = create_converter(
            cfg.model.name, model, cfg.model.anchor, [IMAGE_SIZE, IMAGE_SIZE], device
        )

    def unload(self) -> None:
        self._model = None
        self._converter = None

    def predict(self, batch: list[Any]) -> list[Any]:
        """PIL images → one list of `Box` per image (confidence ≥ min_confidence)."""
        if self._model is None:
            raise RuntimeError("MegaDetector is not loaded")
        if not batch:
            return []
        tensors, undo = zip(*(letterbox(im) for im in batch), strict=True)
        x = torch.stack(tensors).to(self.device)
        rev = torch.stack(undo).to(self.device)
        with torch.inference_mode():
            raw = self._model(x)
            pred_cls, _, pred_box = self._converter(raw["Main"])[:3]
            pred_box = (pred_box - rev[:, None, 1:]) / rev[:, 0:1, None]
            nms = NMSConfig(min_confidence=self.min_confidence, min_iou=self.iou, max_bbox=300)
            rows = bbox_nms(pred_cls.float().cpu(), pred_box.float().cpu(), nms)
        return [to_boxes(r, im.width, im.height) for r, im in zip(rows, batch, strict=True)]
