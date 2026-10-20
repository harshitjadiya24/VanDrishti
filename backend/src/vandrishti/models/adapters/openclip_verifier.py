"""5.4 semantic verification: OpenCLIP ViT-B/16 (LAION-2B, MIT) image-text similarity.

Given an animal crop and candidate species names (SpeciesNet's species-level top-k) plus an
"empty scene" prompt, returns a probability per candidate. There is no "person" prompt:
people are MegaDetector's job, and CLIP preferred "a person" on many dim animal crops.
It is an independent second opinion: the decision engine compares its top candidate with
SpeciesNet's answer. Zero-shot CLIP is
known to be weak on night infrared crops, so it can lower confidence but never decide alone.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import open_clip
import torch

EXTRA_PROMPTS = {"__nothing__": "a camera trap photo of an empty scene with no animal"}


class OpenClipVerifier:
    name = "openclip-vit-b-16-laion2b"
    version = "laion2b_s34b_b88k@7288da5a"
    licence = "MIT (weights and code)"
    memory_estimate_mb = 900

    def __init__(self, weights_dir: Path) -> None:
        self.weights_dir = weights_dir
        self._model: Any = None
        self._preprocess: Any = None
        self._tokenizer: Any = None
        self.device = "cpu"

    @property
    def loaded(self) -> bool:
        return self._model is not None

    @property
    def config(self) -> dict[str, Any]:
        return {"template": "a camera trap photo of a {}.", "extra": sorted(EXTRA_PROMPTS)}

    def load(self, device: str) -> None:
        model, _, preprocess = open_clip.create_model_and_transforms(
            "ViT-B-16", pretrained=str(self.weights_dir / "open_clip_model.safetensors")
        )
        self._model = model.eval().to(device)
        self._preprocess = preprocess
        self._tokenizer = open_clip.get_tokenizer("ViT-B-16")
        self.device = device

    def unload(self) -> None:
        self._model = self._preprocess = self._tokenizer = None

    def predict(self, batch: list[Any]) -> list[Any]:
        """ClipRequest per crop → list of (candidate, probability), highest first."""
        if self._model is None:
            raise RuntimeError("OpenCLIP is not loaded")
        out = []
        for req in batch:
            names = [*req.candidates, *EXTRA_PROMPTS]
            prompts = [EXTRA_PROMPTS.get(n, f"a camera trap photo of a {n}.") for n in names]
            with torch.inference_mode():
                image = self._model.encode_image(self._preprocess(req.crop)[None].to(self.device))
                text = self._model.encode_text(self._tokenizer(prompts).to(self.device))
                image = image / image.norm(dim=-1, keepdim=True)
                text = text / text.norm(dim=-1, keepdim=True)
                scale = self._model.logit_scale.exp()
                probs = (scale * image @ text.T).softmax(dim=-1)[0].float().cpu().tolist()
            out.append(sorted(zip(names, probs, strict=True), key=lambda x: -x[1]))
        return out
