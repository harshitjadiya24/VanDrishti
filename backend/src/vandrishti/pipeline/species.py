"""Run 5.3 (species), 5.4 (semantic check), 5.5 (segmentation) and 5.6/5.7 (decision).

All four work on images screened ANIMAL (5.2) and only on their animal boxes at or above
the animal threshold. Each stage is idempotent under its config hash. Only one model is
resident at a time: the caller loads a model, runs its stage, unloads, moves on.
"""

from __future__ import annotations

import hashlib
import io
import json
import time
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import numpy as np
from PIL import Image as PILImage
from sqlalchemy import delete, exists, select
from sqlalchemy.orm import Session

from vandrishti.core.config import Settings
from vandrishti.core.storage import LocalStorage
from vandrishti.db.models import (
    Camera,
    Classification,
    ClassificationKind,
    Decision,
    Detection,
    DetectionCategory,
    Image,
    Reserve,
    ReserveSpecies,
    ScreenOutcome,
    Segmentation,
    SemanticCheck,
)
from vandrishti.models.base import Model
from vandrishti.models.detection import Box, ClipRequest
from vandrishti.pipeline.decision import EngineConfig, Evidence, decide
from vandrishti.taxonomy import Taxon

CROP_PAD = 0.10
ANALYSIS_SIDE = 1024


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


def config_hash(model: Model, extra: dict[str, Any]) -> str:
    payload = {"model": model.name, "version": model.version, **extra}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def _animal_images(session: Session, reserve: str | None) -> Any:
    q = (
        select(Image)
        .join(Camera, Camera.id == Image.camera_id)
        .where(Image.screen == ScreenOutcome.ANIMAL)
    )
    if reserve:
        q = q.join(Reserve, Reserve.id == Camera.reserve_id).where(Reserve.code == reserve)
    return q


def animal_boxes(session: Session, img: Image, settings: Settings) -> list[Detection]:
    """This image's animal boxes from the config it was screened with, best first."""
    return list(
        session.scalars(
            select(Detection)
            .where(
                Detection.image_id == img.id,
                Detection.config_hash == img.screened_with,
                Detection.category == DetectionCategory.ANIMAL,
                Detection.confidence >= settings.animal_threshold,
            )
            .order_by(Detection.confidence.desc())
        )
    )


def _box(d: Detection) -> Box:
    return Box(d.category.value, d.confidence, d.x, d.y, d.w, d.h)


def _open(storage: LocalStorage, img: Image, side: int = ANALYSIS_SIDE) -> PILImage.Image:
    with storage.open(img.storage_key) as f, PILImage.open(f) as im:
        im.draft("RGB", (side, side))
        return im.convert("RGB")


def crop(image: PILImage.Image, d: Detection) -> PILImage.Image:
    w, h = image.size
    left = max(0, int((d.x - d.w * CROP_PAD) * w))
    top = max(0, int((d.y - d.h * CROP_PAD) * h))
    right = min(w, int((d.x + d.w * (1 + CROP_PAD)) * w) + 1)
    bottom = min(h, int((d.y + d.h * (1 + CROP_PAD)) * h) + 1)
    return image.crop((left, top, right, bottom))


# --- 5.3 species ---------------------------------------------------------------------------


def run_classification(
    session: Session,
    storage: LocalStorage,
    settings: Settings,
    tool: Model,
    *,
    reserve: str | None = None,
    limit: int | None = None,
    batch: int = 64,
) -> StageStats:
    """SpeciesNet on every animal box. `tool` is a loaded SpeciesNetTool."""
    from vandrishti.models.adapters.speciesnet_tool import BoxSpecies, SpeciesRequest

    cfg = config_hash(tool, getattr(tool, "config", {}))
    started, stats = time.perf_counter(), StageStats()
    done = exists().where(Classification.image_id == Image.id, Classification.config_hash == cfg)
    images = list(session.scalars(_animal_images(session, reserve).where(~done).limit(limit)))
    for start in range(0, len(images), batch):
        chunk = images[start : start + batch]
        boxes = [animal_boxes(session, img, settings) for img in chunk]
        requests = [
            SpeciesRequest(storage.path(img.storage_key), [_box(d) for d in dets])
            for img, dets in zip(chunk, boxes, strict=True)
        ]
        results: list[list[BoxSpecies]] = tool.predict(requests)
        for img, dets, per_box in zip(chunk, boxes, results, strict=True):
            session.execute(
                delete(Classification).where(
                    Classification.image_id == img.id, Classification.config_hash == cfg
                )
            )
            for r in per_box:
                det = dets[r.box_index]
                for rank, (taxon, score) in enumerate(r.raw, start=1):
                    session.add(
                        _row(img, det, tool, cfg, ClassificationKind.RAW, rank, taxon, score, None)
                    )
                if r.final:
                    taxon, score, source = r.final
                    session.add(
                        _row(img, det, tool, cfg, ClassificationKind.FINAL, 1, taxon, score, source)
                    )
                    stats.outcomes[taxon.level] += 1
            stats.processed += 1
        session.commit()
    stats.seconds = round(time.perf_counter() - started, 2)
    return stats


def _row(
    img: Image,
    det: Detection,
    tool: Model,
    cfg: str,
    kind: ClassificationKind,
    rank: int,
    taxon: Taxon,
    score: float,
    source: str | None,
) -> Classification:
    return Classification(
        image_id=img.id,
        detection_id=det.id,
        model_name=tool.name,
        model_version=tool.version,
        config_hash=cfg,
        kind=kind,
        rank=rank,
        taxon=taxon.taxon,
        common_name=taxon.common_name[:200],
        score=score,
        source=source,
    )


def _species_for(
    session: Session, det: Detection
) -> tuple[tuple[Taxon, float, str] | None, list[tuple[Taxon, float]]]:
    rows = session.scalars(
        select(Classification)
        .where(Classification.detection_id == det.id)
        .order_by(Classification.created_at.desc(), Classification.kind, Classification.rank)
    ).all()
    if not rows:
        return None, []
    newest = rows[0].config_hash
    rows = [r for r in rows if r.config_hash == newest]
    final = next(
        (
            (Taxon(r.taxon, r.common_name), r.score, r.source or "")
            for r in rows
            if r.kind is ClassificationKind.FINAL
        ),
        None,
    )
    raw = [
        (Taxon(r.taxon, r.common_name), r.score) for r in rows if r.kind is ClassificationKind.RAW
    ]
    return final, sorted(raw, key=lambda x: -x[1])


# --- 5.4 semantic check --------------------------------------------------------------------


def run_semantic(
    session: Session,
    storage: LocalStorage,
    settings: Settings,
    clip: Model,
    *,
    reserve: str | None = None,
    limit: int | None = None,
) -> StageStats:
    cfg = config_hash(clip, getattr(clip, "config", {}))
    started, stats = time.perf_counter(), StageStats()
    done = exists().where(SemanticCheck.image_id == Image.id, SemanticCheck.config_hash == cfg)
    has_species = exists().where(Classification.image_id == Image.id)
    q = _animal_images(session, reserve).where(~done, has_species)
    for img in session.scalars(q.limit(limit)).all():
        dets = animal_boxes(session, img, settings)
        if not dets:
            continue
        top = dets[0]
        final, raw = _species_for(session, top)
        # Species-level names only: CLIP prefers vague text ("possum family") over species.
        names = [x.common_name for x, _ in raw if x.is_animal_taxon and x.level == "species"]
        if final and final[0].level == "species" and final[0].common_name not in names:
            names.insert(0, final[0].common_name)
        if not names:
            continue
        result = clip.predict([ClipRequest(crop(_open(storage, img), top), names)])[0]
        session.add(
            SemanticCheck(
                image_id=img.id,
                detection_id=top.id,
                model_name=clip.name,
                model_version=clip.version,
                config_hash=cfg,
                candidates=[{"label": n, "probability": round(p, 4)} for n, p in result],
                top_label=result[0][0],
                top_probability=round(result[0][1], 4),
            )
        )
        session.commit()
        stats.processed += 1
        agrees = final is not None and result[0][0] == final[0].common_name
        stats.outcomes["agrees" if agrees else "differs"] += 1
    stats.seconds = round(time.perf_counter() - started, 2)
    return stats


# --- 5.5 segmentation ----------------------------------------------------------------------


def mask_box(mask: np.ndarray[Any, Any]) -> list[float]:
    ys, xs = np.nonzero(mask)
    if not len(xs):
        return []
    h, w = mask.shape
    return [
        round(xs.min() / w, 5),
        round(ys.min() / h, 5),
        round((xs.max() - xs.min() + 1) / w, 5),
        round((ys.max() - ys.min() + 1) / h, 5),
    ]


def run_segmentation(
    session: Session,
    storage: LocalStorage,
    settings: Settings,
    sam: Model,
    *,
    reserve: str | None = None,
    limit: int | None = None,
) -> StageStats:
    cfg = config_hash(sam, {"side": ANALYSIS_SIDE})
    started, stats = time.perf_counter(), StageStats()
    done = exists().where(Segmentation.image_id == Image.id, Segmentation.config_hash == cfg)
    for img in session.scalars(_animal_images(session, reserve).where(~done).limit(limit)).all():
        dets = animal_boxes(session, img, settings)
        if not dets:
            continue
        top = dets[0]
        picture = _open(storage, img)
        result = sam.predict([(picture, _box(top))])[0]
        mask = result.mask
        h, w = mask.shape
        x0, y0 = int(top.x * w), int(top.y * h)
        x1, y1 = max(x0 + 1, int((top.x + top.w) * w)), max(y0 + 1, int((top.y + top.h) * h))
        fill = float(mask[y0:y1, x0:x1].mean()) if mask.size else 0.0
        buf = io.BytesIO()
        PILImage.fromarray(mask.astype(np.uint8) * 255).convert("1").save(buf, "PNG", optimize=True)
        key = f"derived/masks/{img.sha256[:2]}/{img.sha256}-{top.det_index}.png"
        storage.put_derived(key, io.BytesIO(buf.getvalue()))
        session.add(
            Segmentation(
                image_id=img.id,
                detection_id=top.id,
                model_name=sam.name,
                model_version=sam.version,
                config_hash=cfg,
                mask_key=key,
                box_fill=round(fill, 4),
                predicted_iou=round(result.predicted_iou, 4),
                mask_box=mask_box(mask),
            )
        )
        session.commit()
        stats.processed += 1
        stats.outcomes["good_mask" if result.predicted_iou >= 0.7 else "weak_mask"] += 1
    stats.seconds = round(time.perf_counter() - started, 2)
    return stats


# --- 5.6 / 5.7 decision --------------------------------------------------------------------


def hour_bin(at: datetime, timezone: str, bins: int) -> int:
    return at.astimezone(ZoneInfo(timezone)).hour * bins // 24


def activity_profile(
    session: Session, reserve_id: Any, timezone: str, bins: int
) -> dict[str, list[int]]:
    """Per taxon, counts of human-verified sightings per hour bin (reserve local time).

    Verified = a person confirmed the model's species or corrected it (the person's taxon
    counts), and did not undo it.
    """
    from vandrishti.db.models import Review, ReviewAction

    rows = session.execute(
        select(Review.human_taxon, Image.captured_at)
        .join(Image, Image.id == Review.image_id)
        .join(Camera, Camera.id == Image.camera_id)
        .where(
            Camera.reserve_id == reserve_id,
            Review.action.in_([ReviewAction.CONFIRM, ReviewAction.CORRECT]),
            Review.undone_at.is_(None),
            Review.human_taxon.is_not(None),
            Image.captured_at.is_not(None),
        )
    ).all()
    out: dict[str, list[int]] = {}
    for taxon, at in rows:
        if taxon is None or at is None:  # excluded by the query; for the type checker
            continue
        out.setdefault(taxon, [0] * bins)[hour_bin(at, timezone, bins)] += 1
    return out


def run_decisions(
    session: Session,
    settings: Settings,
    *,
    reserve: str | None = None,
    limit: int | None = None,
    cfg: EngineConfig | None = None,
) -> StageStats:
    cfg = cfg or EngineConfig()
    started, stats = time.perf_counter(), StageStats()
    has_species = exists().where(Classification.image_id == Image.id)
    images: Sequence[Image] = session.scalars(
        _animal_images(session, reserve).where(has_species).limit(limit)
    ).all()
    contexts: dict[Any, tuple[Reserve, frozenset[str], dict[str, list[int]]]] = {}
    for img in images:
        camera = session.get(Camera, img.camera_id)
        if camera is None:
            continue
        if camera.reserve_id not in contexts:
            res = session.get(Reserve, camera.reserve_id)
            if res is None:
                continue
            taxa = frozenset(
                session.scalars(
                    select(ReserveSpecies.taxon).where(ReserveSpecies.reserve_id == res.id)
                )
            )
            contexts[res.id] = (
                res,
                taxa,
                activity_profile(session, res.id, res.timezone, cfg.hour_bins),
            )
        res, taxa, profile = contexts[camera.reserve_id]
        dets = animal_boxes(session, img, settings)
        if not dets:
            continue
        top = dets[0]
        final, raw = _species_for(session, top)
        check = session.scalar(
            select(SemanticCheck)
            .where(SemanticCheck.detection_id == top.id)
            .order_by(SemanticCheck.created_at.desc())
        )
        share, verified = None, 0
        if final and img.captured_at:
            counts = profile.get(final[0].taxon)
            if counts:
                verified = sum(counts)
                b = hour_bin(img.captured_at, res.timezone, cfg.hour_bins)
                share = (counts[b] + 1) / (verified + cfg.hour_bins)  # Laplace smoothing
        evidence = Evidence(
            detector_confidence=top.confidence,
            species_final=final,
            species_raw=raw,
            clip=[(c["label"], c["probability"]) for c in check.candidates] if check else None,
            reserve_taxa=taxa,
            country=res.country,
            hour_bin_share=share,
            verified_sightings=verified,
        )
        seg = session.scalar(
            select(Segmentation)
            .where(Segmentation.detection_id == top.id)
            .order_by(Segmentation.created_at.desc())
        )
        # The key covers the engine *and* the inputs it read: new upstream results → a new
        # decision; nothing changed → skip.
        species_cfg = session.scalar(
            select(Classification.config_hash)
            .where(Classification.detection_id == top.id)
            .order_by(Classification.created_at.desc())
        )
        chash = hashlib.sha256(
            "|".join(
                [
                    cfg.hash(),
                    str(species_cfg),
                    check.config_hash if check else "-",
                    seg.config_hash if seg else "-",
                    str(verified),
                ]
            ).encode()
        ).hexdigest()
        if session.scalar(
            select(Decision.id).where(Decision.image_id == img.id, Decision.config_hash == chash)
        ):
            continue
        outcome = decide(evidence, cfg)
        outcome.explanation["boxes"] = [
            {"index": d.det_index, "box": [d.x, d.y, d.w, d.h], "confidence": d.confidence}
            for d in dets
        ]
        if seg:
            outcome.explanation["mask"] = {"key": seg.mask_key, "predicted_iou": seg.predicted_iou}
        session.add(
            Decision(
                image_id=img.id,
                engine_version=outcome.explanation["engine_version"],
                config_hash=chash,
                label=outcome.label[:200],
                taxon=outcome.taxon,
                taxon_level=outcome.taxon_level,
                confidence=outcome.confidence,
                explanation=outcome.explanation,
            )
        )
        session.commit()
        stats.processed += 1
        band = (
            "high"
            if outcome.confidence >= 0.9
            else "medium"
            if outcome.confidence >= 0.6
            else "low"
        )
        stats.outcomes[band] += 1
    stats.seconds = round(time.perf_counter() - started, 2)
    return stats
