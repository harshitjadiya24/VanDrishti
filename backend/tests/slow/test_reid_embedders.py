"""Real MegaDescriptor-T and DINOv2-small on ATRW crops. Needs the weights
(scripts/download_models.py) and the ATRW re-ID set in data/samples/atrw."""

from __future__ import annotations

import csv
import importlib.util
from collections import defaultdict

import numpy as np
import pytest
from PIL import Image

from vandrishti.core.config import REPO_ROOT

pytestmark = pytest.mark.slow
if importlib.util.find_spec("torch") is None:  # not importorskip: see test_megadetector
    pytest.skip("torch not installed", allow_module_level=True)
MODELS = REPO_ROOT / "data" / "models"
ATRW = REPO_ROOT / "data" / "samples" / "atrw"
if not (ATRW / "reid_list_train.csv").exists():
    pytest.skip("ATRW not downloaded", allow_module_level=True)


@pytest.mark.parametrize("name", ["megadescriptor-t-224", "dinov2-small"])
def test_unit_vectors_and_same_tiger_is_closer(name: str) -> None:
    from vandrishti.models.adapters.reid_embedders import EMBEDDERS

    if not (MODELS / name).exists():
        pytest.skip(f"{name} weights missing")
    by_id: dict[int, list[str]] = defaultdict(list)
    with (ATRW / "reid_list_train.csv").open() as f:
        for tiger, file in csv.reader(f):
            by_id[int(tiger)].append(file)
    a, b = sorted(t for t, files in by_id.items() if len(files) >= 20)[:2]
    # Frames far apart in the list, to avoid near-identical neighbours from one video.
    files = [by_id[a][0], by_id[a][-1], by_id[b][0]]
    model = EMBEDDERS[name](MODELS / name)
    model.load("cpu")
    v = np.stack(model.predict([Image.open(ATRW / "train" / x) for x in files]))
    model.unload()
    assert v.shape == (3, model.dim) and v.dtype == np.float32
    assert np.allclose(np.linalg.norm(v, axis=1), 1, atol=1e-4)
    assert v[0] @ v[1] > v[0] @ v[2]
