"""Sections 2-4 over HTTP: secure upload, batch reports, image metadata, display copies."""

from __future__ import annotations

import secrets
import shutil
import tempfile
import uuid
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select

from vandrishti import audit
from vandrishti.api.deps import (
    COOKIE,
    DB,
    Config,
    Scoped,
    Storage,
    User,
    audit_view,
    authenticated,
    guard_camera,
    guard_image,
    require,
)
from vandrishti.auth.rbac import Permission, can, round_coord
from vandrishti.db.models import (
    Camera,
    Decision,
    Detection,
    Image,
    IngestBatch,
    IngestSource,
    QualityStatus,
    Reserve,
    ScreenOutcome,
    Segmentation,
)
from vandrishti.ingest.service import IMAGE_SUFFIXES, ingest_files

router = APIRouter(tags=["images"])
# Uploads also accept the ingest token (camera stations, scripts), so this router is not
# behind the session check as a whole.
upload_router = APIRouter(tags=["images"])
GPS_KEYS = ("GPSInfo", "gps", "GPS", "latitude", "longitude")


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


def _uploader(
    request: Request,
    session: DB,
    settings: Config,
    camera_id: uuid.UUID,
    authorization: Annotated[str | None, Header()] = None,
    x_csrf_token: Annotated[str | None, Header()] = None,
) -> str:
    """A signed-in person with RUN permission, or a machine with the ingest token."""
    if request.cookies.get(COOKIE):
        user = authenticated(request, session, settings, x_csrf_token)
        if not can(user.user, Permission.RUN):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "your role cannot upload")
        guard_camera(session, user, camera_id)
        return f"user:{user.name}"
    token = settings.ingest_token
    given = (authorization or "").removeprefix("Bearer ").strip()
    if (
        token is None
        or not given
        or not secrets.compare_digest(given.encode(), token.get_secret_value().encode())
    ):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "sign in or send the ingest token",
            {"WWW-Authenticate": "Bearer"},
        )
    return "ingest-token"


@upload_router.post("/cameras/{camera_id}/images", status_code=status.HTTP_201_CREATED)
def upload_images(
    camera_id: uuid.UUID,
    files: list[UploadFile],
    session: DB,
    storage: Storage,
    settings: Config,
    who: Annotated[str, Depends(_uploader)],
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
    audit.append(
        session,
        actor=who,
        action="upload",
        entity="batch",
        entity_id=result.batch_id,
        payload={"camera": camera.code, "files": len(files)},
    )
    session.commit()
    batch = session.get(IngestBatch, uuid.UUID(result.batch_id))
    if batch is None:  # pragma: no cover - ingest_files always commits its batch
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "batch missing")
    return _batch_out(batch)


@router.get("/batches/{batch_id}")
def get_batch(batch_id: uuid.UUID, session: DB, user: User) -> BatchOut:
    batch = session.get(IngestBatch, batch_id)
    if batch is None or (
        batch.camera_id is None and not can(user.user, Permission.MANAGE_REGISTRY)
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "batch not found")
    if batch.camera_id is not None:
        guard_camera(session, user, batch.camera_id)
    return _batch_out(batch)


@router.get("/images/{image_id}")
def get_image(image_id: uuid.UUID, session: DB, user: User) -> ImageOut:
    guard_image(session, user, image_id)
    img = session.get(Image, image_id)
    if img is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "image not found")
    return _image_out(img, user)


def _image_out(img: Image, user: Any) -> ImageOut:
    precise = can(user.user, Permission.PRECISE_LOCATIONS)
    exif = img.exif if precise else {k: v for k, v in img.exif.items() if k not in GPS_KEYS}
    return ImageOut(
        id=img.id,
        sha256=img.sha256,
        camera_id=img.camera_id,
        sequence_id=img.sequence_id,
        original_filename=img.original_filename,
        captured_at=img.captured_at,
        time_source=img.time_source.value,
        latitude=round_coord(img.latitude, user.user),
        longitude=round_coord(img.longitude, user.user),
        gps_source=img.gps_source.value,
        width=img.width,
        height=img.height,
        format=img.format,
        file_size=img.file_size,
        exif=exif,
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
def get_detections(image_id: uuid.UUID, session: DB, user: User) -> list[DetectionOut]:
    """Boxes from the config the image was last screened with (5.2)."""
    guard_image(session, user, image_id)
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


@router.get("/quality/review", dependencies=[require(Permission.REVIEW_SPECIES)])
def quality_review(
    session: DB, user: User, reserve: Scoped, camera: uuid.UUID | None = None, limit: int = 100
) -> list[ImageOut]:
    """5.1 FAIL queue: images a person should look at (nothing is deleted)."""
    q = (
        select(Image)
        .join(Camera, Camera.id == Image.camera_id)
        .join(Reserve, Reserve.id == Camera.reserve_id)
        .where(Image.quality_status == QualityStatus.FAIL)
    )
    if reserve:
        q = q.where(Reserve.code == reserve)
    if camera:
        guard_camera(session, user, camera)
        q = q.where(Image.camera_id == camera)
    return [
        _image_out(i, user)
        for i in session.scalars(q.order_by(Image.captured_at).limit(min(limit, 500)))
    ]


@router.get("/images/{image_id}/display")
def get_display(image_id: uuid.UUID, session: DB, storage: Storage, user: User) -> FileResponse:
    """The normalised copy, already blurred if people or vehicles were detected. Originals are
    never served over HTTP. Frames with people or vehicles need a role that reviews them or
    acts on alerts, and every view of one is audited."""
    guard_image(session, user, image_id)
    img = session.get(Image, image_id)
    if img is None or not img.display_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no display copy for this image")
    if img.screen is ScreenOutcome.HUMAN_VEHICLE:
        if not (can(user.user, Permission.REVIEW_PEOPLE) or can(user.user, Permission.ACT_ALERTS)):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "frames with people need a reviewing role"
            )
        audit_view(session, user, "people_frame", str(img.id))
    return FileResponse(storage.path(img.display_key), media_type="image/jpeg")


class DecisionOut(BaseModel):
    label: str
    taxon: str | None
    taxon_level: str
    confidence: float
    engine_version: str
    explanation: dict[str, Any]
    verified_by_human: bool
    mask_url: str | None


@router.get("/images/{image_id}/decision")
def get_decision(image_id: uuid.UUID, session: DB, user: User) -> DecisionOut:
    """5.6 label + confidence and the 5.7 explanation (newest engine config)."""
    guard_image(session, user, image_id)
    d = session.scalar(
        select(Decision).where(Decision.image_id == image_id).order_by(Decision.created_at.desc())
    )
    if d is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no decision for this image yet")
    has_mask = "mask" in d.explanation
    return DecisionOut(
        label=d.label,
        taxon=d.taxon,
        taxon_level=d.taxon_level,
        confidence=d.confidence,
        engine_version=d.engine_version,
        explanation=d.explanation,
        verified_by_human=d.verified_by_human,
        mask_url=f"/images/{image_id}/mask" if has_mask else None,
    )


@router.get("/images/{image_id}/mask")
def get_mask(image_id: uuid.UUID, session: DB, storage: Storage, user: User) -> FileResponse:
    """5.5 SAM 2 mask (PNG, original resolution of the analysis copy) for visualisation."""
    guard_image(session, user, image_id)
    seg = session.scalar(
        select(Segmentation)
        .where(Segmentation.image_id == image_id)
        .order_by(Segmentation.created_at.desc())
    )
    if seg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no mask for this image")
    return FileResponse(storage.path(seg.mask_key), media_type="image/png")
