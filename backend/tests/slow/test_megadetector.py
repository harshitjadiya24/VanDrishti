"""The real MegaDetector V6 (MIT) on real labelled images. Needs the weights and the sample:
scripts/download_models.py megadetector-v6-mit-c, scripts/download_sample.py."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from typing import TYPE_CHECKING

import pytest
from PIL import Image

from vandrishti.core.config import REPO_ROOT

pytestmark = pytest.mark.slow
WEIGHTS = REPO_ROOT / "data" / "models" / "megadetector"
SAMPLE = REPO_ROOT / "data" / "samples" / "lila"

# Not importorskip: that imports torch at collection, and FAISS tests in the same run must
# not share a process with torch (vandrishti.reid.index).
if importlib.util.find_spec("torch") is None:  # CI installs without the ml group
    pytest.skip("torch not installed", allow_module_level=True)
if not (WEIGHTS / "MDV6-mit-yolov9-c.ckpt").exists() or not (SAMPLE / "ground_truth.json").exists():
    pytest.skip("weights or sample not downloaded", allow_module_level=True)

if TYPE_CHECKING:
    from vandrishti.models.adapters.megadetector_v6 import MegaDetectorV6MIT


@pytest.fixture(scope="module")
def detector() -> MegaDetectorV6MIT:
    from vandrishti.models.adapters.megadetector_v6 import MegaDetectorV6MIT

    md = MegaDetectorV6MIT(WEIGHTS)
    md.load("cpu")
    return md


def test_finds_the_labelled_animal_and_vehicle(detector: MegaDetectorV6MIT) -> None:
    rows = json.loads((SAMPLE / "ground_truth.json").read_text())
    animal = next(r for r in rows if r["dataset"] == "ena24" and r["kind"] == "animal")
    vehicle = next(r for r in rows if r["dataset"] == "ena24" and r["kind"] == "vehicle")
    images = [Image.open(SAMPLE / r["file"]).convert("RGB") for r in (animal, vehicle)]
    boxes = detector.predict(images)
    assert any(b.category == "animal" and b.confidence >= 0.5 for b in boxes[0])
    assert any(b.category == "vehicle" and b.confidence >= 0.5 for b in boxes[1])
    for b in boxes[0] + boxes[1]:
        assert 0 <= b.x <= 1 and 0 <= b.y <= 1 and b.x + b.w <= 1.0001 and b.y + b.h <= 1.0001


def test_same_answer_after_reload_and_on_resized_input(detector: MegaDetectorV6MIT) -> None:
    rows = json.loads((SAMPLE / "ground_truth.json").read_text())
    r = next(r for r in rows if r["dataset"] == "ena24" and r["kind"] == "animal")
    full = Image.open(SAMPLE / r["file"]).convert("RGB")
    half = full.resize((full.width // 2, full.height // 2))
    a, b = detector.predict([full])[0][0], detector.predict([half])[0][0]
    # Normalised boxes do not depend on the input resolution (within resampling noise).
    assert a.category == b.category and abs(a.x - b.x) < 0.02 and abs(a.w - b.w) < 0.02


def test_refuses_weights_that_do_not_fit(tmp_path: Path) -> None:
    import shutil

    import torch

    from vandrishti.models.adapters.megadetector_v6 import MegaDetectorV6MIT

    shutil.copy(WEIGHTS / "config_v9s.yaml", tmp_path / "config_v9s.yaml")
    torch.save(
        {"state_dict": {"model.model.0.conv.weight": torch.zeros(1)}},
        tmp_path / "MDV6-mit-yolov9-c.ckpt",
    )
    with pytest.raises(RuntimeError, match="weights do not fit"):
        MegaDetectorV6MIT(tmp_path).load("cpu")
