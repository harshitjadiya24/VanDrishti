"""Run 5.1 (quality gate) and 5.2 (detection + privacy) over stored images.

Both stages are idempotent:
- the quality gate handles images still `pending`;
- detection handles images that passed the gate and were not yet screened with the
  current detector config (`screened_with` = config hash). Re-running a config replaces
  that config's boxes; other configs' boxes stay, so results can be compared.

Outcomes (from the architecture image):
- quality FAIL → quality review (a person looks; nothing is deleted);
- NO OBJECT → likely blank (a sample is reviewed later);
- ANIMAL → crop and proceed to species (Phase 3);
- HUMAN / VEHICLE → blurred whole-body, original locked, on to section 6.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import time
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from PIL import Image as PILImage
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from vandrishti.core.config import Settings
from vandrishti.core.storage import LocalStorage
from vandrishti.db.models import (
    Camera,
    Detection,
    DetectionCategory,
    Image,
    QualityStatus,
    Reserve,
    ScreenOutcome,
)
from vandrishti.ingest.preprocess import make_display
from vandrishti.models.base import Model
from vandrishti.pipeline.quality import QUALITY_VERSION, QualityConfig, assess
from vandrishti.privacy.blur import blur_regions

logger = logging.getLogger(__name__)
PRIVATE = {DetectionCategory.PERSON, DetectionCategory.VEHICLE}
DRAFT_SIDE = 1280  # decode JPEGs at reduced size for analysis (much faster, same result)


@dataclass
class StageStats:
    processed: int = 0
    seconds: float = 0.0
    outcomes: Counter[str] = field(default_factory=Counter)

    def as_dict(self) -> dict[str, Any]:
        return {
            "processed": self.processed,
            "seconds": self.seconds,
            "outcomes": dict(self.outcomes),
        }


def _scope(q: Any, reserve: str | None) -> Any:
    q = q.join(Camera, Camera.id == Image.camera_id)
    if reserve:
        q = q.join(Reserve, Reserve.id == Camera.reserve_id).where(Reserve.code == reserve)
    return q


def _open(storage: LocalStorage, key: str, side: int) -> PILImage.Image:
    with storage.open(key) as f, PILImage.open(f) as im:
        im.draft("RGB", (side, side))
        return im.convert("RGB")


def run_quality(
    session: Session,
    storage: LocalStorage,
    *,
    reserve: str | None = None,
    limit: int | None = None,
    cfg: QualityConfig | None = None,
) -> StageStats:
    cfg = cfg or QualityConfig()
    started, stats = time.perf_counter(), StageStats()
    q = _scope(select(Image), reserve).where(Image.quality_status == QualityStatus.PENDING)
    images = list(session.scalars(q.order_by(Image.camera_id, Image.captured_at).limit(limit)))
    previous: dict[Any, str | None] = {}
    for img in images:
        if img.is_corrupt:
            img.quality_status, img.quality_flags = QualityStatus.FAIL, ["unreadable"]
            img.quality_metrics = {"version": QUALITY_VERSION}
        else:
            result = assess(_open(storage, img.storage_key, 1024), cfg, previous.get(img.camera_id))
            previous[img.camera_id] = result.dhash
            img.quality_status = QualityStatus.PASS if result.passed else QualityStatus.FAIL
            img.quality_flags = result.flags
            img.quality_metrics = {**result.metrics, "version": QUALITY_VERSION}
            img.dhash = result.dhash
        stats.processed += 1
        stats.outcomes[img.quality_status.value] += 1
        for flag in img.quality_flags:
            stats.outcomes[f"flag:{flag}"] += 1
        if stats.processed % 50 == 0:
            session.commit()
    session.commit()
    stats.seconds = round(time.perf_counter() - started, 2)
    return stats


def detector_config_hash(model: Model, settings: Settings, extra: dict[str, Any]) -> str:
    payload = {
        "model": model.name,
        "version": model.version,
        "animal_threshold": settings.animal_threshold,
        "privacy_threshold": settings.privacy_threshold,
        **extra,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def outcome_of(boxes: Sequence[Any], settings: Settings) -> ScreenOutcome:
    """People/vehicles win (privacy first), then animals, else no object."""
    if any(
        b.category in ("person", "vehicle") and b.confidence >= settings.privacy_threshold
        for b in boxes
    ):
        return ScreenOutcome.HUMAN_VEHICLE
    if any(b.category == "animal" and b.confidence >= settings.animal_threshold for b in boxes):
        return ScreenOutcome.ANIMAL
    return ScreenOutcome.NO_OBJECT


def protect(
    session: Session, storage: LocalStorage, settings: Settings, img: Image, config_hash: str
) -> None:
    """Blur every person/vehicle box on a full-resolution copy; lock the original."""
    boxes = session.scalars(
        select(Detection).where(
            Detection.image_id == img.id,
            Detection.config_hash == config_hash,
            Detection.category.in_(PRIVATE),
            Detection.confidence >= settings.privacy_threshold,
        )
    ).all()
    with storage.open(img.storage_key) as f, PILImage.open(f) as im:
        original = im.convert("RGB")
    blurred = blur_regions(original, [(d.x, d.y, d.w, d.h) for d in boxes])
    buf = io.BytesIO()
    blurred.save(buf, "JPEG", quality=90)
    key = f"derived/blurred/{img.sha256[:2]}/{img.sha256}.jpg"
    storage.put_derived(key, io.BytesIO(buf.getvalue()))
    # The display copy is rebuilt from the blurred image: no unblurred derivative remains.
    data, params = make_display(
        storage.path(key), max_side=settings.display_max_side, denoise=settings.denoise
    )
    display = img.display_key or f"derived/display/{img.sha256[:2]}/{img.sha256}.jpg"
    storage.put_derived(display, io.BytesIO(data))
    img.display_key, img.preprocess = display, {**params, "blurred": True}
    img.blurred_key, img.is_original_locked = key, True


def run_detection(
    session: Session,
    storage: LocalStorage,
    settings: Settings,
    model: Model,
    *,
    reserve: str | None = None,
    limit: int | None = None,
) -> StageStats:
    """`model` must already be loaded (ModelManager.get)."""
    extra = getattr(model, "config", {})
    config_hash = detector_config_hash(model, settings, extra)
    started, stats = time.perf_counter(), StageStats()
    q = _scope(select(Image), reserve).where(
        Image.quality_status == QualityStatus.PASS,
        (Image.screened_with.is_(None)) | (Image.screened_with != config_hash),
    )
    images = list(session.scalars(q.order_by(Image.camera_id, Image.captured_at).limit(limit)))
    size = settings.detector_batch_size
    for start in range(0, len(images), size):
        batch = images[start : start + size]
        pictures = [_open(storage, img.storage_key, DRAFT_SIDE) for img in batch]
        results = model.predict(pictures)
        for img, boxes in zip(batch, results, strict=True):
            session.execute(
                delete(Detection).where(
                    Detection.image_id == img.id, Detection.config_hash == config_hash
                )
            )
            for i, b in enumerate(boxes):
                session.add(
                    Detection(
                        image_id=img.id,
                        model_name=model.name,
                        model_version=model.version,
                        config_hash=config_hash,
                        det_index=i,
                        category=DetectionCategory(b.category),
                        confidence=b.confidence,
                        x=b.x,
                        y=b.y,
                        w=b.w,
                        h=b.h,
                    )
                )
            session.flush()
            img.screen = outcome_of(boxes, settings)
            img.screened_with = config_hash
            if img.screen is ScreenOutcome.HUMAN_VEHICLE:
                protect(session, storage, settings, img, config_hash)
            stats.processed += 1
            stats.outcomes[img.screen.value] += 1
        session.commit()
    stats.seconds = round(time.perf_counter() - started, 2)
    return stats
