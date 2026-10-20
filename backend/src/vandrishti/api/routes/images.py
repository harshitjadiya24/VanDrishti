"""Sections 2-4 over HTTP: secure upload, batch reports, image metadata, display copies."""

from __future__ import annotations

import shutil
import tempfile
import uuid
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any

from fastapi import APIRouter, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select

from vandrishti.api.deps import DB, Config, Storage, Writer
from vandrishti.db.models import Camera, Detection, Image, IngestBatch, IngestSource, QualityStatus
from vandrishti.ingest.service import IMAGE_SUFFIXES, ingest_files

router = APIRouter(tags=["images"])


class BatchOut(BaseModel):
    id: uuid.UUID
    source: str
    camera_id: uuid.UUID | None
    status: str
    total: int
    stored: int
    duplicate: int
    corrupt: int
    failed: int
    started_at: datetime
    finished_at: datetime | None


class ImageOut(BaseModel):
    id: uuid.UUID
    sha256: str
    camera_id: uuid.UUID
    sequence_id: uuid.UUID | None
    original_filename: str
    captured_at: datetime | None
    time_source: str
    latitude: float | None
    longitude: float | None
    gps_source: str
    width: int | None
    height: int | None
    format: str | None
    file_size: int
    exif: dict[str, Any]
    is_corrupt: bool
    corrupt_reason: str | None
    preprocess: dict[str, Any]
    quality_status: str
    quality_flags: list[str]
    quality_metrics: dict[str, Any]
    screen: str | None
    is_original_locked: bool


class DetectionOut(BaseModel):
    category: str
    confidence: float
    box: list[float]  # x, y, w, h normalised 0-1
    model: str
    config_hash: str


def _batch_out(b: IngestBatch) -> BatchOut:
    return BatchOut(
        id=b.id,
        source=b.source.value,
        camera_id=b.camera_id,
        status=b.status.value,
        total=b.total,
        stored=b.stored,
        duplicate=b.duplicate,
        corrupt=b.corrupt,
        failed=b.failed,
        started_at=b.started_at,
        finished_at=b.finished_at,
    )


@router.post(
    "/cameras/{camera_id}/images", status_code=status.HTTP_201_CREATED, dependencies=[Writer]
)
def upload_images(
    camera_id: uuid.UUID, files: list[UploadFile], session: DB, storage: Storage, settings: Config
) -> BatchOut:
    """Upload one or more images from one camera; they go through the same pipeline."""
    camera = session.get(Camera, camera_id)
    if camera is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "camera not found")
    limit = settings.upload_max_mb * 1024 * 1024
    with tempfile.TemporaryDirectory(prefix="vandrishti-upload-") as tmp:
        staged = []
        for i, f in enumerate(files):
            # Only the base name is kept: a client-supplied path must not steer where we write.
            name = PurePosixPath(f.filename or f"upload-{i}.jpg").name or f"upload-{i}.jpg"
            if Path(name).suffix.lower() not in IMAGE_SUFFIXES:
                raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, f"{name}: not an image")
            dst = Path(tmp) / f"{i:05d}-{name}"
            with dst.open("wb") as out:
                shutil.copyfileobj(f.file, out, 1 << 20)
            if dst.stat().st_size > limit:
                raise HTTPException(
                    status.HTTP_413_CONTENT_TOO_LARGE, f"{name}: over {settings.upload_max_mb} MB"
                )
            staged.append((dst, name))
        result = ingest_files(
            session, storage, settings, camera, staged, source=IngestSource.UPLOAD, path=None
        )
    batch = session.get(IngestBatch, uuid.UUID(result.batch_id))
    if batch is None:  # pragma: no cover - ingest_files always commits its batch
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "batch missing")
    return _batch_out(batch)


@router.get("/batches/{batch_id}")
def get_batch(batch_id: uuid.UUID, session: DB) -> BatchOut:
    batch = session.get(IngestBatch, batch_id)
    if batch is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "batch not found")
    return _batch_out(batch)


@router.get("/images/{image_id}")
def get_image(image_id: uuid.UUID, session: DB) -> ImageOut:
    img = session.get(Image, image_id)
    if img is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "image not found")
    return ImageOut(
        id=img.id,
        sha256=img.sha256,
        camera_id=img.camera_id,
        sequence_id=img.sequence_id,
        original_filename=img.original_filename,
        captured_at=img.captured_at,
        time_source=img.time_source.value,
        latitude=img.latitude,
        longitude=img.longitude,
        gps_source=img.gps_source.value,
        width=img.width,
        height=img.height,
        format=img.format,
        file_size=img.file_size,
        exif=img.exif,
        is_corrupt=img.is_corrupt,
        corrupt_reason=img.corrupt_reason,
        preprocess=img.preprocess,
        quality_status=img.quality_status.value,
        quality_flags=img.quality_flags,
        quality_metrics=img.quality_metrics,
        screen=img.screen.value if img.screen else None,
        is_original_locked=img.is_original_locked,
    )


@router.get("/images/{image_id}/detections")
def get_detections(image_id: uuid.UUID, session: DB) -> list[DetectionOut]:
    """Boxes from the config the image was last screened with (5.2)."""
    img = session.get(Image, image_id)
    if img is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "image not found")
    rows = session.scalars(
        select(Detection)
        .where(Detection.image_id == img.id, Detection.config_hash == img.screened_with)
        .order_by(Detection.det_index)
    )
    return [
        DetectionOut(
            category=d.category.value,
            confidence=d.confidence,
            box=[d.x, d.y, d.w, d.h],
            model=f"{d.model_name} {d.model_version}",
            config_hash=d.config_hash,
        )
        for d in rows
    ]


@router.get("/quality/review")
def quality_review(
    session: DB, camera: uuid.UUID | None = None, limit: int = 100
) -> list[ImageOut]:
    """5.1 FAIL queue: images a person should look at (nothing is deleted)."""
    q = select(Image).where(Image.quality_status == QualityStatus.FAIL)
    if camera:
        q = q.where(Image.camera_id == camera)
    return [
        get_image(i.id, session)
        for i in session.scalars(q.order_by(Image.captured_at).limit(min(limit, 500)))
    ]


@router.get("/images/{image_id}/display")
def get_display(image_id: uuid.UUID, session: DB, storage: Storage) -> FileResponse:
    """The normalised copy, already blurred if people or vehicles were detected. Never the
    original: locked originals get role checks and audit in Phase 8."""
    img = session.get(Image, image_id)
    if img is None or not img.display_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no display copy for this image")
    return FileResponse(storage.path(img.display_key), media_type="image/jpeg")
