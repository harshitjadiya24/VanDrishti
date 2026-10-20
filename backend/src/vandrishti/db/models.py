"""Database schema.

Phase 0: reserves, the camera registry, the model registry.
Phase 1 (image sections 1-4): ingest batches, images, burst sequences.
Later phases add detections, classifications, reviews, risk and embeddings (section 9).
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from vandrishti.db.base import Base, Timestamps, UUIDPrimaryKey


def _str_enum(cls: type[enum.StrEnum], name: str) -> Enum:
    # Stored as plain text (no native Postgres enum), so adding a member needs no type change.
    return Enum(cls, name=name, native_enum=False, values_callable=lambda e: [m.value for m in e])


class CameraStatus(enum.StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    FAULTY = "faulty"
    STOLEN = "stolen"


class Reserve(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "reserve"

    code: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    # Calendar buckets (hours, days, months) use this zone, never UTC.
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata")
    country: Mapped[str] = mapped_column(String(3), default="IND")


class Camera(UUIDPrimaryKey, Timestamps, Base):
    """One physical camera trap (section 3.1). Exact location is sensitive."""

    __tablename__ = "camera"
    __table_args__ = (
        UniqueConstraint("reserve_id", "code"),
        CheckConstraint("latitude BETWEEN -90 AND 90", name="latitude_range"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="longitude_range"),
    )

    reserve_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reserve.id", ondelete="CASCADE"))
    code: Mapped[str] = mapped_column(String(64))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    model: Mapped[str | None] = mapped_column(String(100))
    # The serial number the camera writes into EXIF, if any (matches images to cameras).
    serial: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[CameraStatus] = mapped_column(
        _str_enum(CameraStatus, "camera_status"), default=CameraStatus.ACTIVE
    )
    installed_at: Mapped[datetime | None]
    # Newest capture time seen from this camera (silent cameras are found from this later).
    last_seen_at: Mapped[datetime | None]


class ModelRegistry(UUIDPrimaryKey, Timestamps, Base):
    """Every model the pipeline may load, with where it came from and its licence."""

    __tablename__ = "model_registry"
    __table_args__ = (UniqueConstraint("name", "version"),)

    name: Mapped[str] = mapped_column(String(100))
    version: Mapped[str] = mapped_column(String(100))
    licence: Mapped[str] = mapped_column(String(100))
    source: Mapped[str] = mapped_column(String(500))


class IngestSource(enum.StrEnum):
    FOLDER = "folder"
    UPLOAD = "upload"
    WATCH = "watch"


class BatchStatus(enum.StrEnum):
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class TimeSource(enum.StrEnum):
    EXIF = "exif"
    MANIFEST = "manifest"
    FILE_MTIME = "file_mtime"  # last resort: copying files often changes it
    NONE = "none"


class GpsSource(enum.StrEnum):
    EXIF = "exif"
    CAMERA = "camera"  # the registered camera location
    NONE = "none"


class IngestBatch(UUIDPrimaryKey, Timestamps, Base):
    """One ingest run: a folder (SD-card dump), an upload, or a watched-inbox pickup."""

    __tablename__ = "ingest_batch"

    source: Mapped[IngestSource] = mapped_column(_str_enum(IngestSource, "ingest_source"))
    path: Mapped[str | None] = mapped_column(String(1000))
    camera_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("camera.id", ondelete="SET NULL"), index=True
    )
    status: Mapped[BatchStatus] = mapped_column(
        _str_enum(BatchStatus, "batch_status"), default=BatchStatus.RUNNING
    )
    total: Mapped[int] = mapped_column(Integer, default=0)
    stored: Mapped[int] = mapped_column(Integer, default=0)
    duplicate: Mapped[int] = mapped_column(Integer, default=0)
    corrupt: Mapped[int] = mapped_column(Integer, default=0)
    failed: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime]
    finished_at: Mapped[datetime | None]


class Sequence(UUIDPrimaryKey, Timestamps, Base):
    """A burst: consecutive frames from one camera with small time gaps."""

    __tablename__ = "sequence"

    # RESTRICT: a camera with images is retired (status), never deleted with its evidence.
    camera_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("camera.id", ondelete="RESTRICT"), index=True
    )
    start_at: Mapped[datetime]
    end_at: Mapped[datetime]
    image_count: Mapped[int] = mapped_column(Integer, default=0)


class Image(UUIDPrimaryKey, Timestamps, Base):
    """One original camera-trap image (sections 2-4). The file itself is immutable."""

    __tablename__ = "image"
    __table_args__ = (
        CheckConstraint("latitude BETWEEN -90 AND 90", name="latitude_range"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="longitude_range"),
    )

    # Content hash = identity: the same file ingested twice is one row (the duplicate check).
    sha256: Mapped[str] = mapped_column(String(64), unique=True)
    storage_key: Mapped[str] = mapped_column(String(300))
    original_filename: Mapped[str] = mapped_column(String(500))
    camera_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("camera.id", ondelete="RESTRICT"), index=True
    )
    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("ingest_batch.id", ondelete="SET NULL"), index=True
    )
    sequence_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sequence.id", ondelete="SET NULL"), index=True
    )
    captured_at: Mapped[datetime | None] = mapped_column(index=True)
    time_source: Mapped[TimeSource] = mapped_column(_str_enum(TimeSource, "time_source"))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    gps_source: Mapped[GpsSource] = mapped_column(_str_enum(GpsSource, "gps_source"))
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    format: Mapped[str | None] = mapped_column(String(16))
    file_size: Mapped[int] = mapped_column(BigInteger)
    # A small, privacy-safe subset (make, model, serial, original time, GPS), not every tag.
    exif: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    is_corrupt: Mapped[bool] = mapped_column(default=False)
    corrupt_reason: Mapped[str | None] = mapped_column(String(300))
    # The normalised derivative (section 4) and exactly how it was made.
    display_key: Mapped[str | None] = mapped_column(String(300))
    preprocess: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
