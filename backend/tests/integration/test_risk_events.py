"""Section 6: presence events, explained risk, reviewer overrides, camera sensitivity."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session, sessionmaker

from tests.helpers import sign_in_as
from vandrishti.api.app import create_app
from vandrishti.core.config import Settings, get_settings
from vandrishti.db.models import (
    Camera,
    Decision,
    Detection,
    DetectionCategory,
    GpsSource,
    Image,
    PresenceEvent,
    QualityStatus,
    Reserve,
    Review,
    ReviewAction,
    ScreenOutcome,
    Sensitivity,
    Sequence,
    TimeSource,
)
from vandrishti.db.session import get_session
from vandrishti.pipeline.risk import assess, build_events

pytestmark = pytest.mark.integration
IST = timedelta(hours=5, minutes=30)


def frame(
    s: Session, cam: Camera, at: datetime, seq: Sequence | None, people: int, vehicles: int
) -> Image:
    img = Image(
        sha256=uuid.uuid4().hex * 2,
        storage_key="k",
        original_filename=f"{uuid.uuid4().hex}.jpg",
        camera_id=cam.id,
        sequence_id=seq.id if seq else None,
        captured_at=at,
        time_source=TimeSource.EXIF,
        gps_source=GpsSource.CAMERA,
        file_size=1,
        exif={},
        preprocess={},
        quality_status=QualityStatus.PASS,
        screen=ScreenOutcome.HUMAN_VEHICLE,
        screened_with="cfg",
    )
    s.add(img)
    s.flush()
    for i in range(people + vehicles):
        cat = DetectionCategory.PERSON if i < people else DetectionCategory.VEHICLE
        s.add(
            Detection(
                image_id=img.id,
                model_name="m",
                model_version="1",
                config_hash="cfg",
                det_index=i,
                category=cat,
                confidence=0.9,
                x=0.1 * i,
                y=0.1,
                w=0.05,
                h=0.2,
            )
        )
    return img


@pytest.fixture
def world(engine: Engine) -> Iterator[tuple[sessionmaker[Session], str, dict[str, Image]]]:
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    tag = uuid.uuid4().hex[:6]
    with factory() as s:
        r = Reserve(code=f"K{tag}", name="Risk", timezone="Asia/Kolkata", country="IND")
        s.add(r)
        s.flush()
        core = Camera(
            reserve_id=r.id,
            code="CORE-1",
            latitude=22.33,
            longitude=80.61,
            sensitivity=Sensitivity.CORE,
        )
        road = Camera(reserve_id=r.id, code="ROAD-1", latitude=22.30, longitude=80.60)
        s.add_all([core, road])
        s.flush()
        night = datetime(2024, 12, 21, 23, 0, tzinfo=UTC) - IST  # 23:00 local
        noon = datetime(2024, 12, 21, 12, 0, tzinfo=UTC) - IST
        burst = Sequence(
            camera_id=core.id, start_at=night, end_at=night + timedelta(seconds=4), image_count=2
        )
        s.add(burst)
        s.flush()
        imgs = {
            # Two frames of one burst at night in the core zone: 2 people, then 3 people.
            "night1": frame(s, core, night, burst, people=2, vehicles=0),
            "night2": frame(s, core, night + timedelta(seconds=4), burst, people=3, vehicles=0),
            "noon": frame(s, road, noon, None, people=1, vehicles=0),
        }
        # A tiger at the core camera 10 days earlier (verified).
        tiger_img = Image(
            sha256=uuid.uuid4().hex * 2,
            storage_key="k",
            original_filename="t.jpg",
            camera_id=core.id,
            captured_at=night - timedelta(days=10),
            time_source=TimeSource.EXIF,
            gps_source=GpsSource.CAMERA,
            file_size=1,
            exif={},
            preprocess={},
        )
        s.add(tiger_img)
        s.flush()
        s.add(
            Decision(
                image_id=tiger_img.id,
                engine_version="1",
                config_hash="c",
                label="tiger",
                taxon="mammalia;carnivora;felidae;panthera;tigris",
                taxon_level="species",
                confidence=0.97,
                explanation={},
                verified_by_human=True,
            )
        )
        s.commit()
    yield factory, r.code, imgs


def test_events_risk_and_reviewer_overrides(world, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    factory, code, imgs = world
    settings = Settings(storage_root=tmp_path)  # type: ignore[arg-type]
    with factory() as s:
        assert build_events(s, settings, reserve=code) == 2  # the burst is one event
        assert build_events(s, settings, reserve=code) == 0  # idempotent
        burst = s.scalar(
            select(PresenceEvent).where(PresenceEvent.first_image_id == imgs["night1"].id)
        )
        assert burst is not None and burst.people_count == 3 and len(burst.image_ids) == 2
        assert (burst.night, burst.night_basis) == (True, "sun")
        assert assess(s, reserve=code) == {"high": 1, "low": 1}

    app = create_app()

    sign_in_as(app, "asha", "admin")

    def session_dep() -> Iterator[Session]:
        with factory() as sess:
            yield sess

    app.dependency_overrides[get_session] = session_dep
    app.dependency_overrides[get_settings] = lambda: settings
    c = TestClient(app)
    events = c.get("/risk/events", params={"reserve": code}).json()
    assert [e["level"] for e in events] == ["high", "low"]  # most urgent first
    reasons = [f["reason"] for f in events[0]["factors"]]
    assert "3 people (estimated count)" in reasons and "this camera is in the core zone" in reasons
    assert any("at night, after sunset at this camera" in r for r in reasons)
    assert any(r.startswith("a tiger was recorded at this camera on") for r in reasons)
    summary = c.get("/risk/summary", params={"reserve": code}).json()
    assert (
        summary["levels"] == {"high": 1, "medium": 0, "low": 1}
        and summary["cameras"][0]["camera"] == "CORE-1"
    )
    assert summary["thresholds"] == {"medium": 4, "high": 8}

    # A reviewer says the daytime person was a false alarm, and marks the night one as poaching.
    with factory() as s:
        s.add(Review(image_id=imgs["noon"].id, reviewer="ravi", action=ReviewAction.FALSE_ALARM))
        s.add(
            Review(
                image_id=imgs["night2"].id,
                reviewer="ravi",
                action=ReviewAction.CONFIRM_PEOPLE,
                poaching_activity=True,
            )
        )
        s.commit()
    run = c.post("/risk/run", params={"reserve": code}).json()
    assert run["levels"] == {"high": 1, "dismissed": 1}
    assert len(c.get("/risk/events", params={"reserve": code}).json()) == 1
    everything = c.get("/risk/events", params={"reserve": code, "include_dismissed": True}).json()
    dismissed = next(e for e in everything if e["dismissed"])
    assert "marked a false alarm by ravi" in dismissed["factors"][0]["reason"]

    # Camera sensitivity is set through the API.
    cams = c.get("/cameras", params={"reserve": code}).json()
    road = next(x for x in cams if x["code"] == "ROAD-1")
    patched = c.patch(f"/cameras/{road['id']}", json={"sensitivity": "sensitive"}).json()
    assert patched["sensitivity"] == "sensitive" and patched["status"] == "active"
