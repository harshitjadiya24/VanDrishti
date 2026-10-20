"""5.1 + 5.2 on a real database with a stand-in detector (the real one is a slow test)."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any, ClassVar

import numpy as np
import pytest
from PIL import Image as PILImage
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import sessionmaker

from tests.images import write_jpeg
from vandrishti.core.config import Settings
from vandrishti.core.storage import LocalStorage
from vandrishti.db.models import Camera, Detection, Image, IngestSource, QualityStatus, Reserve
from vandrishti.ingest.service import ingest_files, iter_images
from vandrishti.models.detection import Box
from vandrishti.pipeline.screen import run_detection, run_quality

pytestmark = pytest.mark.integration


class FakeDetector:
    """Says 'person' for files named person*, 'animal' for animal*, nothing otherwise."""

    name, version, licence, memory_estimate_mb = "fake-detector", "1", "test", 1
    config: ClassVar[dict[str, Any]] = {"min_confidence": 0.05}
    loaded = True

    def __init__(self, names: list[str]) -> None:
        self.names = iter(names)

    def load(self, device: str) -> None: ...
    def unload(self) -> None: ...

    def predict(self, batch: list[Any]) -> list[Any]:
        out = []
        for _ in batch:
            name = next(self.names)
            if name.startswith("person"):
                out.append([Box("person", 0.9, 0.25, 0.25, 0.5, 0.5)])
            elif name.startswith("animal"):
                out.append([Box("animal", 0.8, 0.1, 0.1, 0.3, 0.3)])
            else:
                out.append([])
        return out


def test_quality_then_detection_then_blur(engine: Engine, tmp_path: Path) -> None:
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    settings = Settings(storage_root=tmp_path / "store")  # type: ignore[arg-type]
    storage = LocalStorage(settings.storage_root)
    card = tmp_path / "card"
    for i, name in enumerate(["animal", "blank", "person"]):
        write_jpeg(card / f"{name}.jpg", taken=f"2024:01:13 03:4{i}:00")
    PILImage.new("RGB", (320, 240), (0, 0, 0)).save(card / "zz_black.jpg")  # fails the gate
    tag = uuid.uuid4().hex[:6]
    with factory() as s:
        r = Reserve(code=f"Q{tag}", name="Screening")
        s.add(r)
        s.flush()
        cam = Camera(reserve_id=r.id, code="S-01")
        s.add(cam)
        s.commit()
        ingest_files(s, storage, settings, cam, iter_images(card), source=IngestSource.FOLDER)

        q = run_quality(s, storage, reserve=r.code)
        assert q.outcomes["pass"] == 3 and q.outcomes["fail"] == 1
        assert run_quality(s, storage, reserve=r.code).processed == 0  # idempotent

        # Passing images in camera/time order: animal, blank, person.
        d = run_detection(
            s, storage, settings, FakeDetector(["animal", "blank", "person"]), reserve=r.code
        )
        assert d.outcomes == {"animal": 1, "no_object": 1, "human_vehicle": 1}
        assert run_detection(s, storage, settings, FakeDetector([]), reserve=r.code).processed == 0

        imgs = {
            i.original_filename: i
            for i in s.scalars(select(Image).where(Image.camera_id == cam.id))
        }
        assert imgs["zz_black.jpg"].quality_status is QualityStatus.FAIL
        assert imgs["zz_black.jpg"].screen is None  # failed images are never screened
        person = imgs["person.jpg"]
        assert person.is_original_locked and person.blurred_key
        n = s.scalar(
            select(func.count()).select_from(Detection).where(Detection.image_id == person.id)
        )
        assert n == 1

        # The display copy is the blurred one: the centre (the person box) lost its detail.
        def centre_std(path: Path) -> float:
            with PILImage.open(path) as im:
                w, h = im.size
                box = (int(w * 0.35), int(h * 0.35), int(w * 0.65), int(h * 0.65))
                return float(np.asarray(im.convert("L").crop(box)).std())

        shown = centre_std(storage.path(person.display_key or ""))
        assert shown < centre_std(storage.path(person.storage_key)) / 3
        assert storage.exists(person.storage_key)  # the original itself is kept, locked
        assert not imgs["animal.jpg"].is_original_locked
