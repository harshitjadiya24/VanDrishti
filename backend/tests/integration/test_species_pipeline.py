"""5.3-5.7 on a real database with stand-in models (real models: tests/slow)."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any, ClassVar

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import sessionmaker

from tests.images import write_jpeg
from vandrishti.api.app import create_app
from vandrishti.core.config import Settings, get_settings
from vandrishti.core.storage import LocalStorage
from vandrishti.db.models import (
    Camera,
    Classification,
    Decision,
    Image,
    IngestSource,
    Reserve,
    ReserveSpecies,
    Segmentation,
    SemanticCheck,
)
from vandrishti.db.session import get_session
from vandrishti.ingest.service import ingest_files, iter_images
from vandrishti.models.adapters.speciesnet_tool import BoxSpecies
from vandrishti.models.detection import Box, MaskResult
from vandrishti.pipeline import species as stages
from vandrishti.pipeline.screen import run_detection, run_quality
from vandrishti.taxonomy import parse_label

pytestmark = pytest.mark.integration
TIGER = parse_label("x;mammalia;carnivora;felidae;panthera;tigris;tiger")
LEOPARD = parse_label("x;mammalia;carnivora;felidae;panthera;pardus;leopard")


class Fake:
    licence, memory_estimate_mb, loaded = "test", 1, True
    config: ClassVar[dict[str, Any]] = {}

    def __init__(self, name: str, fn: Any) -> None:
        self.name, self.version, self.fn = name, "1", fn

    def load(self, device: str) -> None: ...
    def unload(self) -> None: ...

    def predict(self, batch: list[Any]) -> list[Any]:
        return [self.fn(x) for x in batch]


def test_species_semantics_mask_and_explained_decision(engine: Engine, tmp_path: Path) -> None:
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    settings = Settings(storage_root=tmp_path / "store")  # type: ignore[arg-type]
    storage = LocalStorage(settings.storage_root)
    write_jpeg(tmp_path / "card" / "a.jpg", taken="2024:01:13 03:40:00")
    tag = uuid.uuid4().hex[:6]
    with factory() as s:
        r = Reserve(code=f"S{tag}", name="Species", country="IND")
        s.add(r)
        s.flush()
        cam = Camera(reserve_id=r.id, code="S-01")
        s.add(cam)
        s.add(ReserveSpecies(reserve_id=r.id, taxon=LEOPARD.taxon, common_name="leopard"))
        s.commit()
        ingest_files(
            s, storage, settings, cam, iter_images(tmp_path / "card"), source=IngestSource.FOLDER
        )
        run_quality(s, storage, reserve=r.code)
        animal = Fake("det", lambda _: [Box("animal", 0.9, 0.2, 0.2, 0.5, 0.5)])
        run_detection(s, storage, settings, animal, reserve=r.code)

        tool = Fake(
            "speciesnet",
            lambda req: [
                BoxSpecies(
                    0, raw=[(TIGER, 0.93), (LEOPARD, 0.05)], final=(TIGER, 0.93, "classifier")
                )
            ],
        )
        assert stages.run_classification(s, storage, settings, tool, reserve=r.code).processed == 1
        assert stages.run_classification(s, storage, settings, tool, reserve=r.code).processed == 0

        clip = Fake("clip", lambda req: [("leopard", 0.6), ("tiger", 0.3), ("__nothing__", 0.1)])
        assert stages.run_semantic(s, storage, settings, clip, reserve=r.code).processed == 1

        def mask(pair: Any) -> MaskResult:
            image, _ = pair
            m = np.zeros((image.height, image.width), dtype=bool)
            m[60:150, 80:200] = True
            return MaskResult(m, 0.88)

        sam = Fake("sam", mask)
        assert stages.run_segmentation(s, storage, settings, sam, reserve=r.code).processed == 1

        d = stages.run_decisions(s, settings, reserve=r.code)
        assert d.processed == 1
        assert stages.run_decisions(s, settings, reserve=r.code).processed == 0  # same inputs

        img = s.scalar(select(Image).where(Image.camera_id == cam.id))
        assert img is not None
        decision = s.scalar(select(Decision).where(Decision.image_id == img.id))
        assert decision is not None and decision.label == "tiger"
        # Tiger is not on this reserve's list (only leopard): 0.93 x 0.6.
        assert decision.confidence == pytest.approx(0.93 * 0.6, abs=1e-3)
        factors = {f["name"]: f for f in decision.explanation["factors"]}
        assert "for information" in factors["model agreement"]["reason"]
        assert factors["reserve species list"]["factor"] == 0.6
        assert decision.explanation["mask"]["predicted_iou"] == 0.88
        assert (
            s.scalar(
                select(func.count())
                .select_from(Classification)
                .where(Classification.image_id == img.id)
            )
            == 3
        )
        assert (
            s.scalar(
                select(func.count())
                .select_from(SemanticCheck)
                .where(SemanticCheck.image_id == img.id)
            )
            == 1
        )
        seg = s.scalar(select(Segmentation).where(Segmentation.image_id == img.id))
        assert seg is not None and storage.exists(seg.mask_key) and seg.box_fill > 0.3

    app = create_app()

    def session_dep() -> Any:
        with factory() as sess:
            yield sess

    app.dependency_overrides[get_session] = session_dep
    app.dependency_overrides[get_settings] = lambda: settings
    c = TestClient(app)
    body = c.get(f"/images/{img.id}/decision").json()
    assert body["label"] == "tiger" and body["mask_url"].endswith("/mask")
    assert "summary" in body["explanation"]
    m = c.get(body["mask_url"])
    assert m.status_code == 200 and m.headers["content-type"] == "image/png"
