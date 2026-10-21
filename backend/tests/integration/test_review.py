"""Sections 7-8: routing, review actions, undo, feedback statistics and the audit chain."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session, sessionmaker

from tests.helpers import sign_in_as
from tests.images import write_jpeg
from vandrishti import audit
from vandrishti.api.app import create_app
from vandrishti.core.config import Settings, get_settings
from vandrishti.core.storage import LocalStorage
from vandrishti.db.models import (
    Camera,
    Decision,
    Image,
    IngestSource,
    QualityStatus,
    Reserve,
    Route,
    RouteState,
    Routing,
    ScreenOutcome,
)
from vandrishti.db.session import get_session
from vandrishti.ingest.service import ingest_files, iter_images
from vandrishti.pipeline.routing import RoutingConfig, drawn, route_for, run_routing

pytestmark = pytest.mark.integration


@pytest.fixture
def world(
    engine: Engine, tmp_path: Path
) -> Iterator[tuple[sessionmaker[Session], str, dict[str, uuid.UUID]]]:
    """Four images: high, medium, low confidence animals, and a people frame."""
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    settings = Settings(storage_root=tmp_path / "store")  # type: ignore[arg-type]
    for i, name in enumerate(["high", "medium", "low", "people"]):
        write_jpeg(tmp_path / "card" / f"{name}.jpg", taken=f"2024:01:13 0{i}:00:00")
    tag = uuid.uuid4().hex[:6]
    ids = {}
    with factory() as s:
        r = Reserve(code=f"V{tag}", name="Review", timezone="Asia/Kolkata")
        s.add(r)
        s.flush()
        cam = Camera(reserve_id=r.id, code="S-01")
        s.add(cam)
        s.commit()
        ingest_files(
            s,
            LocalStorage(settings.storage_root),
            settings,
            cam,
            iter_images(tmp_path / "card"),
            source=IngestSource.FOLDER,
        )
        conf = {"high": 0.97, "medium": 0.75, "low": 0.3}
        for img in s.scalars(select(Image).where(Image.camera_id == cam.id)):
            name = img.original_filename.removesuffix(".jpg")
            ids[name] = img.id
            img.quality_status = QualityStatus.PASS
            if name == "people":
                img.screen = ScreenOutcome.HUMAN_VEHICLE
                continue
            img.screen = ScreenOutcome.ANIMAL
            s.add(
                Decision(
                    image_id=img.id,
                    engine_version="1",
                    config_hash=f"c{name}",
                    label="tiger",
                    taxon="mammalia;carnivora;felidae;panthera;tigris",
                    taxon_level="species",
                    confidence=conf[name],
                    explanation={"summary": "test"},
                )
            )
        s.commit()
    yield factory, r.code, ids


def test_routing_bands_and_people_always_reviewed(world) -> None:  # type: ignore[no-untyped-def]
    factory, code, ids = world
    with factory() as s:
        cfg = RoutingConfig(spot_check_rate=0.0)
        run_routing(s, reserve=code, cfg=cfg)
        routes = {n: s.scalar(select(Routing).where(Routing.image_id == i)) for n, i in ids.items()}
    assert routes["high"].route is Route.AUTO_ACCEPT and routes["high"].state is RouteState.DONE
    assert routes["medium"].route is Route.REVIEW and routes["medium"].state is RouteState.OPEN
    assert routes["low"].route is Route.UNCERTAIN
    assert (
        routes["people"].route is Route.PEOPLE_VEHICLES
        and routes["people"].state is RouteState.OPEN
    )


def test_spot_checks_and_blank_samples_are_stable_draws() -> None:
    shas = [uuid.uuid4().hex * 2 for _ in range(4000)]
    share = sum(drawn(s, 0.05, "spot") for s in shas) / len(shas)
    assert 0.035 < share < 0.065
    assert [drawn(s, 0.05, "spot") for s in shas[:50]] == [
        drawn(s, 0.05, "spot") for s in shas[:50]
    ]


def test_review_undo_feedback_and_audit_chain(world, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    factory, code, ids = world
    with factory() as s:
        run_routing(s, reserve=code, cfg=RoutingConfig(spot_check_rate=0.0))
    app = create_app()

    def session_dep() -> Iterator[Session]:
        with factory() as sess:
            yield sess

    app.dependency_overrides[get_session] = session_dep
    app.dependency_overrides[get_settings] = lambda: Settings(storage_root=tmp_path / "store")  # type: ignore[arg-type]
    c = TestClient(app)
    # A ranger may not open the species queue or confirm a species; a viewer reviews nothing.
    sign_in_as(app, "ravi", "ranger", [code])
    assert c.get("/review/queue", params={"kind": "review", "reserve": code}).status_code == 403
    assert (
        c.post("/reviews", json={"image_id": str(ids["medium"]), "action": "confirm"}).status_code
        == 403
    )
    sign_in_as(app, "vic", "viewer", [code])
    assert (
        c.get("/review/queue", params={"kind": "people_vehicles", "reserve": code}).status_code
        == 403
    )
    sign_in_as(app, "asha", "reviewer", ["OTHER"])
    assert c.get("/review/queue", params={"kind": "review", "reserve": code}).status_code == 403
    sign_in_as(app, "asha", "reviewer", [code])

    queue = c.get("/review/queue", params={"kind": "review", "reserve": code}).json()
    assert [q["image_id"] for q in queue] == [str(ids["medium"])]
    assert "confirm" in queue[0]["allowed_actions"]
    people = c.get("/review/queue", params={"kind": "people_vehicles", "reserve": code}).json()
    assert people[0]["allowed_actions"] == ["confirm_people", "false_alarm", "skip"]

    # Wrong action for the route, and a correction without a label, are refused.
    bad = c.post(
        "/reviews", json={"image_id": str(ids["people"]), "action": "confirm", "reviewer": "asha"}
    )
    assert bad.status_code == 409
    assert (
        c.post(
            "/reviews", json={"image_id": str(ids["low"]), "action": "correct", "reviewer": "asha"}
        ).status_code
        == 409
    )

    ok = c.post(
        "/reviews", json={"image_id": str(ids["medium"]), "action": "confirm", "reviewer": "asha"}
    )
    assert ok.status_code == 201 and ok.json()["human_label"] == "tiger"
    fix = c.post(
        "/reviews",
        json={
            "image_id": str(ids["low"]),
            "action": "correct",
            "reviewer": "asha",
            "human_label": "leopard",
            "human_taxon": "mammalia;carnivora;felidae;panthera;pardus",
        },
    )
    assert fix.status_code == 201
    sign_in_as(app, "ravi", "ranger", [code])  # rangers review people and vehicles
    alarm = c.post(
        "/reviews",
        json={
            "image_id": str(ids["people"]),
            "action": "confirm_people",
            "reviewer": "ravi",
            "poaching_activity": True,
            "severity": "high",
            "notes": "two people, night",
        },
    )
    assert alarm.status_code == 201
    sign_in_as(app, "asha", "reviewer", [code])
    assert (
        c.post(
            "/reviews", json={"image_id": str(ids["medium"]), "action": "confirm", "reviewer": "x"}
        ).status_code
        == 409
    )

    with factory() as s:
        d = s.scalar(select(Decision).where(Decision.image_id == ids["medium"]))
        assert d is not None and d.verified_by_human

    stats = c.get("/feedback/stats", params={"reserve": code}).json()
    assert stats["by_band"]["medium"]["agreement"] == 1.0
    assert stats["by_band"]["low"]["changed"] == 1 and stats["poaching_marked"] == 1
    assert stats["top_corrections"] == [{"model": "tiger", "human": "leopard", "count": 1}]

    undone = c.post(f"/reviews/{ok.json()['id']}/undo", json={"reviewer": "asha"})
    assert undone.status_code == 200 and undone.json()["undone"]
    assert c.post(f"/reviews/{ok.json()['id']}/undo", json={"reviewer": "asha"}).status_code == 409
    with factory() as s:
        d = s.scalar(select(Decision).where(Decision.image_id == ids["medium"]))
        assert d is not None and not d.verified_by_human
        r = s.scalar(select(Routing).where(Routing.image_id == ids["medium"]))
        assert r is not None and r.state is RouteState.OPEN
        # Re-routing never touches a route a person finished.
        run_routing(s, reserve=code)
        done = s.scalar(select(Routing).where(Routing.image_id == ids["people"]))
        assert done is not None and done.state is RouteState.DONE

    assert c.get("/audit/events").status_code == 403  # the full trail is for admins
    sign_in_as(app, "root", "admin")
    events = c.get("/audit/events").json()
    actors = {e["actor"] for e in events if e["action"].startswith("review_")}
    assert {"reviewer:asha", "reviewer:ravi"} <= actors  # signed by who was signed in
    assert {"review_confirm", "review_correct", "review_confirm_people", "review_undo"} <= {
        e["action"] for e in events
    }
    assert c.get("/audit/verify").json()["ok"] is True
    # The database refuses to rewrite history.
    with factory() as s, pytest.raises(DBAPIError, match="append-only"):
        s.execute(text("UPDATE audit_event SET actor = 'someone else'"))
    with factory() as s, pytest.raises(DBAPIError, match="append-only"):
        s.execute(text("DELETE FROM audit_event"))


def test_verify_detects_a_forged_event(engine: Engine) -> None:
    """Simulate tampering by inserting a row whose hash does not chain."""
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as s:
        audit.append(s, actor="t", action="x", entity="e")
        s.commit()
        last = s.scalar(text("SELECT max(seq) FROM audit_event"))
        s.execute(
            text(
                "INSERT INTO audit_event (at, actor, action, entity, payload, prev_hash, hash)"
                " VALUES (now(), 'forger', 'x', 'e', '{}', :p, :h)"
            ),
            {"p": "f" * 64, "h": uuid.uuid4().hex * 2},
        )
        s.commit()
        v = audit.verify(s)
    assert not v.ok and v.first_broken_seq == last + 1


def test_route_for_quality_and_blank() -> None:
    img = Image(sha256="ab" * 32, quality_status=QualityStatus.FAIL)
    assert route_for(img, None, RoutingConfig())[0] is Route.QUALITY
    img = Image(sha256="ab" * 32, quality_status=QualityStatus.PASS, screen=ScreenOutcome.NO_OBJECT)
    assert route_for(img, None, RoutingConfig(blank_sample_rate=1.0))[1] is RouteState.OPEN
    assert route_for(img, None, RoutingConfig(blank_sample_rate=0.0))[1] is RouteState.NOT_SAMPLED
