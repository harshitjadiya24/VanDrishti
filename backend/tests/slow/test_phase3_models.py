"""Real SpeciesNet (isolated env), OpenCLIP and SAM 2.1 on real labelled sample images."""

from __future__ import annotations

import importlib.util
import json

import pytest
from PIL import Image

from vandrishti.core.config import REPO_ROOT

pytestmark = pytest.mark.slow
if importlib.util.find_spec("torch") is None:  # not importorskip: see test_megadetector
    pytest.skip("torch not installed", allow_module_level=True)
MODELS = REPO_ROOT / "data" / "models"
SAMPLE = REPO_ROOT / "data" / "samples" / "lila"
if not (SAMPLE / "ground_truth.json").exists():
    pytest.skip("sample not downloaded", allow_module_level=True)

from vandrishti.models.detection import Box  # noqa: E402


def ena24(kind: str, n: int = 2) -> list[dict]:  # type: ignore[type-arg]
    rows = json.loads((SAMPLE / "ground_truth.json").read_text())
    return [r for r in rows if r["dataset"] == "ena24" and r["kind"] == kind][:n]


@pytest.mark.skipif(
    not (MODELS / "kagglehub").exists() or not (REPO_ROOT / "tools/speciesnet/.venv").exists(),
    reason="SpeciesNet environment or weights missing",
)
def test_speciesnet_names_labelled_animals() -> None:
    from vandrishti.models.adapters.speciesnet_tool import SpeciesNetTool, SpeciesRequest

    tool = SpeciesNetTool(REPO_ROOT / "tools/speciesnet", MODELS, country="USA")
    tool.load("cpu")
    rows = ena24("animal")
    reqs = [
        SpeciesRequest(SAMPLE / r["file"], [Box("animal", 0.9, *r["boxes"][0]["bbox"])])
        for r in rows
    ]
    results = tool.predict(reqs)
    for r, per_box in zip(rows, results, strict=True):
        assert per_box and per_box[0].final is not None
        assert per_box[0].raw and per_box[0].raw[0][1] > 0
        # The label's last word appears in SpeciesNet's answer or its top-5 (e.g. "crow").
        word = r["boxes"][0]["label"].lower().split()[-1]
        names = [t.common_name for t, _ in per_box[0].raw] + [per_box[0].final[0].common_name]
        assert any(word in n for n in names), (word, names)


@pytest.mark.skipif(not (MODELS / "openclip-vit-b-16").exists(), reason="OpenCLIP weights missing")
def test_openclip_prefers_the_right_animal_over_a_wrong_one() -> None:
    from vandrishti.models.adapters.openclip_verifier import OpenClipVerifier
    from vandrishti.models.detection import ClipRequest

    clip = OpenClipVerifier(MODELS / "openclip-vit-b-16")
    clip.load("cpu")
    r = next(r for r in ena24("animal", 30) if r["boxes"][0]["label"] == "American Black Bear")
    x, y, w, h = r["boxes"][0]["bbox"]
    with Image.open(SAMPLE / r["file"]) as im:
        img_w, img_h = im.size
        crop = im.convert("RGB").crop(
            (int(x * img_w), int(y * img_h), int((x + w) * img_w), int((y + h) * img_h))
        )
    out = clip.predict([ClipRequest(crop, ["american black bear", "wild turkey"])])[0]
    probs = dict(out)
    assert probs["american black bear"] > probs["wild turkey"]


@pytest.mark.skipif(not (MODELS / "sam2.1-tiny").exists(), reason="SAM 2 weights missing")
def test_sam2_mask_stays_inside_the_prompt_box() -> None:
    from vandrishti.models.adapters.sam2_segmenter import Sam2Segmenter

    sam = Sam2Segmenter(MODELS / "sam2.1-tiny")
    sam.load("cpu")
    r = ena24("animal", 1)[0]
    x, y, w, h = r["boxes"][0]["bbox"]
    with Image.open(SAMPLE / r["file"]) as im:
        image = im.convert("RGB")
    result = sam.predict([(image, Box("animal", 0.9, x, y, w, h))])[0]
    mask_h, mask_w = result.mask.shape
    assert image.size == (mask_w, mask_h) and result.mask.any()
    pad = 0.05
    inside = result.mask[
        max(0, int((y - pad) * mask_h)) : int((y + h + pad) * mask_h),
        max(0, int((x - pad) * mask_w)) : int((x + w + pad) * mask_w),
    ].sum()
    assert inside / result.mask.sum() > 0.9 and 0 < result.predicted_iou <= 1
