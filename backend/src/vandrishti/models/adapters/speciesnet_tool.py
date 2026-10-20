"""SpeciesNet (Google, Apache-2.0), crop classifier v4.0.3a, run in its own environment.

SpeciesNet depends on yolov5 (GPL) and pins setuptools, so it never shares VanDrishti's
environment (ADR 0004). This adapter writes a JSON request with our MegaDetector V6 boxes,
runs `tools/speciesnet/run_vandrishti.py` in that environment, and reads the result: per
box, the classifier's top-k and the ensemble's final class (after geofencing by country and
label roll-up). SpeciesNet's own detector is never loaded.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from vandrishti.models.detection import Box
from vandrishti.taxonomy import Taxon, parse_label

MD_CATEGORY = {"animal": ("1", "animal"), "person": ("2", "human"), "vehicle": ("3", "vehicle")}


@dataclass(frozen=True)
class SpeciesRequest:
    filepath: Path
    boxes: list[Box]


@dataclass
class BoxSpecies:
    box_index: int  # position in the request's `boxes`
    raw: list[tuple[Taxon, float]] = field(default_factory=list)
    final: tuple[Taxon, float, str] | None = None  # taxon, score, ensemble source


class SpeciesNetTool:
    name = "speciesnet"
    version = "4.0.3a"
    licence = "Apache-2.0 (code and weights)"
    memory_estimate_mb = 1500  # the subprocess, not this process

    def __init__(
        self,
        tool_dir: Path,
        model_cache: Path,
        *,
        country: str | None,
        top_k: int = 5,
        timeout_s: int = 3600,
    ) -> None:
        self.tool_dir, self.model_cache = tool_dir, model_cache
        self.country, self.top_k, self.timeout_s = country, top_k, timeout_s
        self._ready = False

    @property
    def loaded(self) -> bool:
        return self._ready

    @property
    def config(self) -> dict[str, Any]:
        return {"country": self.country, "top_k": self.top_k, "model": self.version}

    def load(self, device: str) -> None:
        # The weights live in the subprocess; here we only check they are present.
        weights = self.model_cache / "kagglehub/models/google/speciesnet/pyTorch/v4.0.3a/1"
        if not any(weights.glob("*.pt")):
            raise FileNotFoundError(f"SpeciesNet weights missing in {weights}")
        if not (self.tool_dir / ".venv").exists():
            raise FileNotFoundError(f"SpeciesNet environment missing: uv sync in {self.tool_dir}")
        self._ready = True

    def unload(self) -> None:
        self._ready = False

    def predict(self, batch: list[Any]) -> list[Any]:
        """SpeciesRequest per image → list[BoxSpecies] per image (one per box sent)."""
        if not self._ready:
            raise RuntimeError("SpeciesNet tool not loaded")
        requests: list[SpeciesRequest] = batch
        items: list[dict[str, Any]] = []
        for r in requests:
            dets = []
            for b in r.boxes:
                cat, label = MD_CATEGORY[b.category]
                dets.append(
                    {
                        "category": cat,
                        "label": label,
                        "conf": b.confidence,
                        "bbox": [b.x, b.y, b.w, b.h],
                    }
                )
            items.append({"filepath": str(r.filepath.resolve()), "detections": dets})
        with tempfile.TemporaryDirectory(prefix="speciesnet-") as tmp:
            req, resp = Path(tmp) / "request.json", Path(tmp) / "response.json"
            req.write_text(
                json.dumps(
                    {
                        "model": "kaggle:google/speciesnet/pyTorch/v4.0.3a/1",
                        "country": self.country,
                        "max_classifications": self.top_k,
                        "items": items,
                    }
                )
            )
            env = {**os.environ, "KAGGLEHUB_CACHE": str(self.model_cache / "kagglehub")}
            env.pop("VIRTUAL_ENV", None)  # let uv use the tool's own environment
            uv = shutil.which("uv")
            if uv is None:
                raise FileNotFoundError("uv is needed to run the SpeciesNet environment")
            argv = [
                uv,
                "run",
                "--project",
                str(self.tool_dir),
                "python",
                str(self.tool_dir / "run_vandrishti.py"),
                str(req),
                str(resp),
            ]
            subprocess.run(  # noqa: S603 (fixed argv built here, no shell)
                argv, env=env, check=True, timeout=self.timeout_s, capture_output=True
            )
            predictions = json.loads(resp.read_text()).get("predictions", [])
        by_path = {p["filepath"]: p for p in predictions}
        return [self._parse(by_path.get(i["filepath"], {}), i["detections"]) for i in items]

    @staticmethod
    def _parse(prediction: dict[str, Any], sent: list[dict[str, Any]]) -> list[BoxSpecies]:
        out = []
        for det in prediction.get("detections", []):
            # Match SpeciesNet's (re-sorted) detections back to ours by box and confidence.
            index = next(
                (
                    i
                    for i, s in enumerate(sent)
                    if s["bbox"] == det.get("bbox") and abs(s["conf"] - det.get("conf", -1)) < 1e-6
                ),
                None,
            )
            raw = det.get("raw_classifications")
            if index is None or raw is None:
                continue
            result = BoxSpecies(
                box_index=index,
                raw=[
                    (parse_label(c), min(1.0, float(s)))
                    for c, s in zip(raw["classes"], raw["scores"], strict=False)
                ],
            )
            final = det.get("processed_classification")
            if final:
                result.final = (
                    parse_label(final["class"]),
                    min(1.0, float(final["score"])),
                    str(final.get("source", "")),
                )
            out.append(result)
        return out
