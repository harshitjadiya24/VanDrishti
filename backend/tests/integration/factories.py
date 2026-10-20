"""Shared builders for integration tests: settled frames without running any model."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

import numpy as np
from sqlalchemy.orm import Session

from vandrishti.db.models import (
    Camera,
    Decision,
    Detection,
    DetectionCategory,
    GpsSource,
    Image,
    QualityStatus,
    Route,
    RouteState,
    Routing,
    ScreenOutcome,
    TimeSource,
)


def unit(v: list[float]) -> np.ndarray[Any, Any]:
    a = np.asarray(v, dtype=np.float32)
    return a / np.linalg.norm(a)


def animal(
    s: Session,
    cam: Camera,
    at: datetime,
    *,
    label: str,
    taxon: str | None,
    route: Route,
    time_source: TimeSource = TimeSource.EXIF,
    sequence_id: uuid.UUID | None = None,
) -> tuple[Image, Detection]:
    img = Image(
        sha256=uuid.uuid4().hex * 2,
        storage_key="k",
        original_filename=f"{uuid.uuid4().hex}.jpg",
        camera_id=cam.id,
        sequence_id=sequence_id,
        captured_at=at,
        time_source=time_source,
        gps_source=GpsSource.CAMERA,
        file_size=1,
        exif={},
        preprocess={},
        quality_status=QualityStatus.PASS,
        screen=ScreenOutcome.ANIMAL,
        screened_with="cfg",
    )
    s.add(img)
    s.flush()
    det = Detection(
        image_id=img.id,
        model_name="m",
        model_version="1",
        config_hash="cfg",
        det_index=0,
        category=DetectionCategory.ANIMAL,
        confidence=0.9,
        x=0.1,
        y=0.1,
        w=0.5,
        h=0.5,
    )
    dec = Decision(
        image_id=img.id,
        engine_version="1",
        config_hash="c",
        label=label,
        taxon=taxon,
        taxon_level="species",
        confidence=0.95,
        explanation={},
    )
    s.add_all([det, dec])
    s.flush()
    s.add(
        Routing(
            image_id=img.id,
            decision_id=dec.id,
            route=route,
            state=RouteState.DONE if route is Route.AUTO_ACCEPT else RouteState.OPEN,
            config_hash="r",
            reason="test",
        )
    )
    s.flush()
    return img, det


def plain(
    s: Session,
    cam: Camera,
    at: datetime | None,
    *,
    screen: ScreenOutcome | None = ScreenOutcome.NO_OBJECT,
    quality: QualityStatus = QualityStatus.PASS,
    time_source: TimeSource = TimeSource.EXIF,
) -> Image:
    """A frame with no decision: blank, people/vehicles, or quality-failed."""
    img = Image(
        sha256=uuid.uuid4().hex * 2,
        storage_key="k",
        original_filename=f"{uuid.uuid4().hex}.jpg",
        camera_id=cam.id,
        captured_at=at,
        time_source=time_source,
        gps_source=GpsSource.CAMERA,
        file_size=1,
        exif={},
        preprocess={},
        quality_status=quality,
        screen=screen,
        screened_with="cfg",
    )
    s.add(img)
    s.flush()
    return img
