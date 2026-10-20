"""Section 2-4 pipeline for a batch of files from one camera.

For each file, one at a time (8 GB RAM; streaming):
1. hash it; an already-known hash is a duplicate and is skipped;
2. check it can be decoded (a corrupt original is still archived, and marked);
3. store the original, immutable and content-addressed;
4. read metadata: time (EXIF → manifest → file mtime), GPS (EXIF → camera), camera make,
   model and serial;
5. write the normalised display copy;
6. commit the row (one commit per file: a bad file never loses earlier work).

Then the camera's bursts are regrouped and `last_seen_at` is updated.
"""

from __future__ import annotations

import io
import logging
import time
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from vandrishti.core.config import Settings
from vandrishti.core.storage import LocalStorage, sha256_of
from vandrishti.db.models import (
    BatchStatus,
    Camera,
    GpsSource,
    Image,
    IngestBatch,
    IngestSource,
    Reserve,
    Sequence,
    TimeSource,
)
from vandrishti.ingest.metadata import Manifest, local_to_utc, read_exif
from vandrishti.ingest.preprocess import check_image, make_display
from vandrishti.ingest.sequences import group_bursts

logger = logging.getLogger(__name__)

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}


@dataclass
class BatchResult:
    batch_id: str
    total: int = 0
    stored: int = 0
    duplicate: int = 0
    corrupt: int = 0
    failed: int = 0
    sequences: int = 0
    seconds: float = 0.0
    time_sources: Counter[str] = field(default_factory=Counter)

    def as_dict(self) -> dict[str, object]:
        return {**self.__dict__, "time_sources": dict(self.time_sources)}


def iter_images(folder: Path) -> list[tuple[Path, str]]:
    """Image files under `folder` with their path relative to it, in a stable order.

    Hidden files and folders (e.g. macOS `._*` resource forks) are skipped.
    """
    out = []
    for p in sorted(folder.rglob("*")):
        rel = p.relative_to(folder)
        if any(part.startswith(".") for part in rel.parts):
            continue
        if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES:
            out.append((p, rel.as_posix()))
    return out


def ingest_files(
    session: Session,
    storage: LocalStorage,
    settings: Settings,
    camera: Camera,
    files: Iterable[tuple[Path, str]],
    *,
    source: IngestSource,
    path: str | None = None,
    manifest: Manifest | None = None,
) -> BatchResult:
    timezone = session.scalar(select(Reserve.timezone).where(Reserve.id == camera.reserve_id))
    if timezone is None:
        raise ValueError(f"camera {camera.code} has no reserve")
    started = time.perf_counter()
    batch = IngestBatch(
        source=source,
        path=path,
        camera_id=camera.id,
        status=BatchStatus.RUNNING,
        started_at=datetime.now(UTC),
    )
    session.add(batch)
    session.commit()
    result = BatchResult(batch_id=str(batch.id))

    for file, relative in files:
        result.total += 1
        try:
            outcome = _ingest_one(
                session, storage, settings, camera, batch, file, relative, timezone, manifest
            )
        except Exception:
            session.rollback()
            logger.exception("ingest failed for a file", extra={"file": relative})
            result.failed += 1
            continue
        if outcome is None:
            result.duplicate += 1
            continue
        result.time_sources[outcome.time_source.value] += 1
        if outcome.is_corrupt:
            result.corrupt += 1
        else:
            result.stored += 1

    result.sequences = regroup_sequences(session, camera, settings.sequence_gap_seconds)
    camera.last_seen_at = session.scalar(
        select(func.max(Image.captured_at)).where(Image.camera_id == camera.id)
    )
    batch.total, batch.stored, batch.duplicate = result.total, result.stored, result.duplicate
    batch.corrupt, batch.failed = result.corrupt, result.failed
    batch.status = BatchStatus.DONE
    batch.finished_at = datetime.now(UTC)
    session.commit()
    result.seconds = round(time.perf_counter() - started, 2)
    return result


def _ingest_one(
    session: Session,
    storage: LocalStorage,
    settings: Settings,
    camera: Camera,
    batch: IngestBatch,
    file: Path,
    relative: str,
    timezone: str,
    manifest: Manifest | None,
) -> Image | None:
    sha = sha256_of(file)
    if session.scalar(select(Image.id).where(Image.sha256 == sha)) is not None:
        return None
    check = check_image(file)
    stored = storage.store_original(file, sha256=sha)
    exif = read_exif(file) if check.ok else None

    if exif and exif.captured_local:
        captured, time_source = local_to_utc(exif.captured_local, timezone), TimeSource.EXIF
    elif manifest and (local := manifest.get(relative)):
        captured = local_to_utc(local, timezone) if local.tzinfo is None else local.astimezone(UTC)
        time_source = TimeSource.MANIFEST
    else:
        captured = datetime.fromtimestamp(file.stat().st_mtime, UTC)
        time_source = TimeSource.FILE_MTIME

    if exif and exif.latitude is not None:
        lat, lon, gps_source = exif.latitude, exif.longitude, GpsSource.EXIF
    elif camera.latitude is not None:
        lat, lon, gps_source = camera.latitude, camera.longitude, GpsSource.CAMERA
    else:
        lat, lon, gps_source = None, None, GpsSource.NONE

    display_key: str | None = None
    params: dict[str, Any] = {}
    if check.ok:
        data, params = make_display(
            file, max_side=settings.display_max_side, denoise=settings.denoise
        )
        display_key = f"derived/display/{sha[:2]}/{sha}.jpg"
        storage.put_derived(display_key, io.BytesIO(data))

    image = Image(
        sha256=sha,
        storage_key=stored.key,
        original_filename=relative[:500],
        camera_id=camera.id,
        batch_id=batch.id,
        captured_at=captured,
        time_source=time_source,
        latitude=lat,
        longitude=lon,
        gps_source=gps_source,
        width=check.width,
        height=check.height,
        format=check.format,
        file_size=stored.size,
        exif=exif.subset() if exif else {},
        is_corrupt=not check.ok,
        corrupt_reason=check.reason,
        display_key=display_key,
        preprocess=params,
    )
    session.add(image)
    session.commit()
    return image


def regroup_sequences(session: Session, camera: Camera, gap_seconds: float) -> int:
    """Rebuild this camera's bursts from scratch (idempotent; cheap at reserve scale)."""
    frames = session.execute(
        select(Image.id, Image.captured_at).where(
            Image.camera_id == camera.id,
            Image.captured_at.is_not(None),
            Image.is_corrupt.is_(False),
        )
    ).all()
    session.execute(update(Image).where(Image.camera_id == camera.id).values(sequence_id=None))
    session.execute(delete(Sequence).where(Sequence.camera_id == camera.id))
    times = dict(frames)
    bursts = group_bursts(((i, at) for i, at in frames if at is not None), gap_seconds)
    for burst in bursts:
        seq = Sequence(
            camera_id=camera.id,
            start_at=times[burst[0]],
            end_at=times[burst[-1]],
            image_count=len(burst),
        )
        session.add(seq)
        session.flush()
        session.execute(update(Image).where(Image.id.in_(burst)).values(sequence_id=seq.id))
    session.commit()
    return len(bursts)
