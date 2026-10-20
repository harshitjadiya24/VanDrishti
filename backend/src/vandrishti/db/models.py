"""Database schema.

Phase 0: reserves, the camera registry, the model registry.
Phase 1 (image sections 1-4): ingest batches, images, burst sequences.
Phase 2 (5.1-5.2): quality fields, detections, privacy locks.
Phase 3 (5.3-5.7): classifications, semantic checks, segmentations, decisions.
Phase 4 (7-8): routing, human reviews (feedback), hash-chained audit trail.
Phase 5 (6): presence events (people/vehicles), camera sensitivity, risk assessments.
Phase 6 adds embeddings (section 9).
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
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


class Sensitivity(enum.StrEnum):
    """How much a person or vehicle at this camera matters (set by the reserve)."""

    NORMAL = "normal"
    SENSITIVE = "sensitive"  # e.g. waterhole, known tiger route
    CORE = "core"  # core zone: nobody should be there unannounced


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
    sensitivity: Mapped[Sensitivity] = mapped_column(
        _str_enum(Sensitivity, "sensitivity"),
        default=Sensitivity.NORMAL,
        server_default=Sensitivity.NORMAL.value,
    )


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


class QualityStatus(enum.StrEnum):
    PENDING = "pending"
    PASS = "pass"  # noqa: S105 (a quality verdict, not a password)
    FAIL = "fail"


class ScreenOutcome(enum.StrEnum):
    NO_OBJECT = "no_object"  # likely blank → a sample goes to review
    ANIMAL = "animal"  # crop and proceed to species (section 5.3)
    HUMAN_VEHICLE = "human_vehicle"  # blurred → section 6, always a person decides


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

    # 5.1 quality gate: pass, or fail (→ quality review). Flags explain both; metrics are the
    # measured values the flags came from.
    quality_status: Mapped[QualityStatus] = mapped_column(
        _str_enum(QualityStatus, "quality_status"),
        default=QualityStatus.PENDING,
        server_default=QualityStatus.PENDING.value,
        index=True,
    )
    quality_flags: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    quality_metrics: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default="{}"
    )
    # 64-bit difference hash (hex) for near-duplicate frames from the same camera.
    dhash: Mapped[str | None] = mapped_column(String(16))

    # 5.2 detection outcome under the detector config in `screened_with`.
    screen: Mapped[ScreenOutcome | None] = mapped_column(
        _str_enum(ScreenOutcome, "screen_outcome"), index=True
    )
    screened_with: Mapped[str | None] = mapped_column(String(64))

    # Section 6 privacy: people/vehicles seen → whole-body blur; the original is then locked
    # (only privileged roles, audited, from Phase 8) and every derivative is blurred.
    is_original_locked: Mapped[bool] = mapped_column(default=False, server_default="false")
    blurred_key: Mapped[str | None] = mapped_column(String(300))


class DetectionCategory(enum.StrEnum):
    ANIMAL = "animal"
    PERSON = "person"
    VEHICLE = "vehicle"


class Detection(UUIDPrimaryKey, Timestamps, Base):
    """One box from a detector run (5.2). Re-running the same config upserts, never duplicates."""

    __tablename__ = "detection"
    __table_args__ = (
        UniqueConstraint("image_id", "model_name", "model_version", "config_hash", "det_index"),
        CheckConstraint("confidence BETWEEN 0 AND 1", name="confidence_range"),
        CheckConstraint(
            "x >= 0 AND y >= 0 AND w > 0 AND h > 0 AND x + w <= 1.0001 AND y + h <= 1.0001",
            name="box_normalised",
        ),
    )

    image_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("image.id", ondelete="CASCADE"), index=True
    )
    model_name: Mapped[str] = mapped_column(String(100))
    model_version: Mapped[str] = mapped_column(String(100))
    config_hash: Mapped[str] = mapped_column(String(64), index=True)
    det_index: Mapped[int] = mapped_column(Integer)
    category: Mapped[DetectionCategory] = mapped_column(
        _str_enum(DetectionCategory, "detection_category"), index=True
    )
    confidence: Mapped[float] = mapped_column(Float)
    # Normalised 0-1: top-left x, y, width, height (independent of image resolution).
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    w: Mapped[float] = mapped_column(Float)
    h: Mapped[float] = mapped_column(Float)


class ClassificationKind(enum.StrEnum):
    RAW = "raw"  # the classifier's own top-k
    FINAL = "final"  # after SpeciesNet's ensemble rules (geofence, rollup, blank/human logic)


class Classification(UUIDPrimaryKey, Timestamps, Base):
    """5.3: species predictions for one detection (crop)."""

    __tablename__ = "classification"
    __table_args__ = (
        UniqueConstraint(
            "detection_id", "model_name", "model_version", "config_hash", "kind", "rank"
        ),
        CheckConstraint("score >= 0 AND score <= 1.0001", name="score_range"),
    )

    image_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("image.id", ondelete="CASCADE"), index=True
    )
    detection_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("detection.id", ondelete="CASCADE"), index=True
    )
    model_name: Mapped[str] = mapped_column(String(100))
    model_version: Mapped[str] = mapped_column(String(100))
    config_hash: Mapped[str] = mapped_column(String(64), index=True)
    kind: Mapped[ClassificationKind] = mapped_column(
        _str_enum(ClassificationKind, "classification_kind")
    )
    rank: Mapped[int] = mapped_column(Integer)
    # "class;order;family;genus;species" (lower case; empty levels allowed).
    taxon: Mapped[str] = mapped_column(String(300), index=True)
    common_name: Mapped[str] = mapped_column(String(200))
    score: Mapped[float] = mapped_column(Float)
    source: Mapped[str | None] = mapped_column(String(100))  # ensemble rule that decided


class SemanticCheck(UUIDPrimaryKey, Timestamps, Base):
    """5.4: OpenCLIP image-text similarity of the crop against candidate labels."""

    __tablename__ = "semantic_check"
    __table_args__ = (UniqueConstraint("detection_id", "model_name", "config_hash"),)

    image_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("image.id", ondelete="CASCADE"), index=True
    )
    detection_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("detection.id", ondelete="CASCADE"), index=True
    )
    model_name: Mapped[str] = mapped_column(String(100))
    model_version: Mapped[str] = mapped_column(String(100))
    config_hash: Mapped[str] = mapped_column(String(64))
    # [{"label": "tiger", "taxon": "...", "probability": 0.81}, ...] in descending order.
    candidates: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    top_label: Mapped[str] = mapped_column(String(200))
    top_probability: Mapped[float] = mapped_column(Float)


class Segmentation(UUIDPrimaryKey, Timestamps, Base):
    """5.5: SAM 2 mask of the main animal, stored as a PNG derivative."""

    __tablename__ = "segmentation"
    __table_args__ = (UniqueConstraint("detection_id", "model_name", "config_hash"),)

    image_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("image.id", ondelete="CASCADE"), index=True
    )
    detection_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("detection.id", ondelete="CASCADE"), index=True
    )
    model_name: Mapped[str] = mapped_column(String(100))
    model_version: Mapped[str] = mapped_column(String(100))
    config_hash: Mapped[str] = mapped_column(String(64))
    mask_key: Mapped[str] = mapped_column(String(300))
    # Share of the detection box covered by the mask, and SAM's own predicted IoU.
    box_fill: Mapped[float] = mapped_column(Float)
    predicted_iou: Mapped[float] = mapped_column(Float)
    # Tight box around the mask (normalised x, y, w, h): a better crop than the detector's.
    mask_box: Mapped[list[float]] = mapped_column(JSONB, default=list)


class Decision(UUIDPrimaryKey, Timestamps, Base):
    """5.6 + 5.7: the final label and confidence for an image, with its explanation."""

    __tablename__ = "decision"
    __table_args__ = (
        UniqueConstraint("image_id", "config_hash"),
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="confidence_range"),
    )

    image_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("image.id", ondelete="CASCADE"), index=True
    )
    engine_version: Mapped[str] = mapped_column(String(32))
    config_hash: Mapped[str] = mapped_column(String(64), index=True)
    label: Mapped[str] = mapped_column(String(200))  # common name, e.g. "tiger"
    taxon: Mapped[str | None] = mapped_column(String(300), index=True)
    taxon_level: Mapped[str] = mapped_column(String(16))  # species | genus | ... | none
    confidence: Mapped[float] = mapped_column(Float)
    # 5.7: every factor with its value and a plain-language reason; model outputs; boxes.
    explanation: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    # Set by people in Phase 4; the time-of-day prior learns only from verified decisions.
    verified_by_human: Mapped[bool] = mapped_column(default=False, server_default="false")


class ReserveSpecies(UUIDPrimaryKey, Timestamps, Base):
    """Species known in a reserve (geographic prior, finer than SpeciesNet's country geofence)."""

    __tablename__ = "reserve_species"
    __table_args__ = (UniqueConstraint("reserve_id", "taxon"),)

    reserve_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("reserve.id", ondelete="CASCADE"), index=True
    )
    taxon: Mapped[str] = mapped_column(String(300))
    common_name: Mapped[str] = mapped_column(String(200))
    source: Mapped[str | None] = mapped_column(String(300))  # e.g. a management plan citation


class Route(enum.StrEnum):
    """Section 7: where an image goes after the models."""

    AUTO_ACCEPT = "auto_accept"  # confidence >= high threshold: stored, counts in analytics
    REVIEW = "review"  # medium band: a person checks
    UNCERTAIN = "uncertain"  # low band or unnamed: a person decides, maybe more data
    LIKELY_BLANK = "likely_blank"  # no object: only a random sample is reviewed
    PEOPLE_VEHICLES = "people_vehicles"  # always a person (section 6)
    QUALITY = "quality"  # failed the quality gate


class RouteState(enum.StrEnum):
    OPEN = "open"  # waiting for a person
    DONE = "done"  # reviewed, or auto-accepted without a spot check
    NOT_SAMPLED = "not_sampled"  # likely blank, not drawn for review


class Routing(UUIDPrimaryKey, Timestamps, Base):
    """One image's route under a routing config (section 7). Re-routing replaces it."""

    __tablename__ = "routing"
    __table_args__ = (UniqueConstraint("image_id"),)

    image_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("image.id", ondelete="CASCADE"))
    decision_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("decision.id", ondelete="SET NULL")
    )
    route: Mapped[Route] = mapped_column(_str_enum(Route, "route"), index=True)
    state: Mapped[RouteState] = mapped_column(_str_enum(RouteState, "route_state"), index=True)
    # An auto-accepted image drawn at random for a person to re-check (keeps the band honest).
    spot_check: Mapped[bool] = mapped_column(Boolean, default=False)
    confidence: Mapped[float | None] = mapped_column(Float)
    config_hash: Mapped[str] = mapped_column(String(64))
    reason: Mapped[str] = mapped_column(String(300))


class ReviewAction(enum.StrEnum):
    CONFIRM = "confirm"  # the model's label is right
    CORRECT = "correct"  # a person gives the right label
    NOT_ANIMAL = "not_animal"  # nothing there / not an animal
    SKIP = "skip"  # cannot tell; stays open for someone else
    CONFIRM_PEOPLE = "confirm_people"  # people/vehicle frame: real presence confirmed
    FALSE_ALARM = "false_alarm"  # people/vehicle frame: not actually people/vehicle
    QUALITY_OK = "quality_ok"  # quality-failed frame is usable after all
    QUALITY_BAD = "quality_bad"  # quality-failed frame confirmed unusable


class Severity(enum.StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Review(UUIDPrimaryKey, Timestamps, Base):
    """Section 8: one human action, kept as feedback (never edited; undo adds a new state)."""

    __tablename__ = "review"

    image_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("image.id", ondelete="CASCADE"), index=True
    )
    routing_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("routing.id", ondelete="SET NULL")
    )
    decision_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("decision.id", ondelete="SET NULL")
    )
    reviewer: Mapped[str] = mapped_column(String(100))
    action: Mapped[ReviewAction] = mapped_column(_str_enum(ReviewAction, "review_action"))
    # What the model said and what the person said: the feedback that tracks model
    # performance and can later improve the models.
    model_label: Mapped[str | None] = mapped_column(String(200))
    model_taxon: Mapped[str | None] = mapped_column(String(300))
    model_confidence: Mapped[float | None] = mapped_column(Float)
    human_label: Mapped[str | None] = mapped_column(String(200))
    human_taxon: Mapped[str | None] = mapped_column(String(300))
    poaching_activity: Mapped[bool] = mapped_column(Boolean, default=False)
    severity: Mapped[Severity | None] = mapped_column(_str_enum(Severity, "severity"))
    notes: Mapped[str | None] = mapped_column(String(2000))
    undone_at: Mapped[datetime | None]


class AuditEvent(Base):
    """Append-only, hash-chained log: each row's hash covers the previous row's hash."""

    __tablename__ = "audit_event"

    seq: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    at: Mapped[datetime]
    actor: Mapped[str] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(64), index=True)
    entity: Mapped[str] = mapped_column(String(64))
    entity_id: Mapped[str | None] = mapped_column(String(64), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64), unique=True)


class PresenceEvent(UUIDPrimaryKey, Timestamps, Base):
    """Section 6: one burst at one camera in which people and/or vehicles were detected."""

    __tablename__ = "presence_event"
    __table_args__ = (UniqueConstraint("camera_id", "start_at", "first_image_id"),)

    camera_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("camera.id", ondelete="RESTRICT"), index=True
    )
    sequence_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sequence.id", ondelete="SET NULL")
    )
    first_image_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("image.id", ondelete="CASCADE"))
    image_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)
    start_at: Mapped[datetime] = mapped_column(index=True)
    end_at: Mapped[datetime]
    # Counts are the most seen in any one frame of the burst: an estimate (people overlap).
    people_count: Mapped[int] = mapped_column(Integer, default=0)
    vehicle_count: Mapped[int] = mapped_column(Integer, default=0)
    # OpenCLIP zero-shot guess on the largest vehicle crop; an estimate, never a fact.
    vehicle_type: Mapped[str | None] = mapped_column(String(50))
    vehicle_type_score: Mapped[float | None] = mapped_column(Float)
    night: Mapped[bool] = mapped_column(Boolean, default=False)
    night_basis: Mapped[str] = mapped_column(String(20))  # "sun" (location known) | "clock"


class RiskLevel(enum.StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class RiskAssessment(UUIDPrimaryKey, Timestamps, Base):
    """Section 6: an explained poaching-risk score for one presence event."""

    __tablename__ = "risk_assessment"
    __table_args__ = (UniqueConstraint("event_id", "config_hash"),)

    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("presence_event.id", ondelete="CASCADE"), index=True
    )
    config_hash: Mapped[str] = mapped_column(String(64))
    score: Mapped[int] = mapped_column(Integer)
    level: Mapped[RiskLevel] = mapped_column(_str_enum(RiskLevel, "risk_level"), index=True)
    # [{"name", "points", "reason"}], plus who/what set any override.
    factors: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    dismissed: Mapped[bool] = mapped_column(Boolean, default=False)  # reviewer: false alarm
