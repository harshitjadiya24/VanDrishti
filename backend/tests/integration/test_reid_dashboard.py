"""10.1-10.5: settled labels, dashboard numbers, re-ID proposals decided by people."""

from __future__ import annotations

import sys
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from vandrishti.analytics import dashboard
from vandrishti.analytics.labels import TIGER, settled_labels
from vandrishti.api.app import create_app
from vandrishti.db.models import (
    AuditEvent,
    Camera,
    Decision,
    Detection,
    DetectionCategory,
    GpsSource,
    Image,
    ProposalKind,
    ProposalState,
    QualityStatus,
    ReidEmbedding,
    ReidProposal,
    Reserve,
    Review,
    ReviewAction,
    Route,
    RouteState,
    Routing,
    ScreenOutcome,
    TimeSource,
)
from vandrishti.db.session import get_session
from vandrishti.reid import service

pytestmark = pytest.mark.integration
MODEL = "test-embedder"


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
) -> tuple[Image, Detection]:
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


@pytest.fixture
def world(engine: Engine) -> Iterator[tuple[sessionmaker[Session], str, dict[str, Any]]]:
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    tag = uuid.uuid4().hex[:6]
    t0 = datetime(2024, 3, 4, 18, 30, tzinfo=UTC)  # Monday 2024-03-05 00:00 in IST
    with factory() as s:
        r = Reserve(code=f"D{tag}", name="Dash", timezone="Asia/Kolkata", country="IND")
        s.add(r)
        s.flush()
        placed = Camera(reserve_id=r.id, code="C-1", latitude=22.3, longitude=80.6)
        unplaced = Camera(reserve_id=r.id, code="C-2")
        s.add_all([placed, unplaced])
        s.flush()
        rows: dict[str, Any] = {}
        for k in range(5):  # five auto-accepted tiger frames
            rows[f"tiger{k}"] = animal(
                s,
                placed,
                t0 + timedelta(hours=k),
                label="tiger",
                taxon=TIGER,
                route=Route.AUTO_ACCEPT,
            )
        rows["chital"] = animal(
            s, unplaced, t0, label="chital", taxon="x;chital", route=Route.AUTO_ACCEPT
        )
        # Medium band, nobody has looked: must not count as a species.
        rows["pending"] = animal(
            s, unplaced, t0, label="sambar", taxon="x;sambar", route=Route.REVIEW
        )
        # The model said tiger; a person corrected it to leopard: the person wins.
        rows["corrected"] = animal(s, placed, t0, label="tiger", taxon=TIGER, route=Route.REVIEW)
        s.add(
            Review(
                image_id=rows["corrected"][0].id,
                reviewer="asha",
                action=ReviewAction.CORRECT,
                human_label="leopard",
                human_taxon="x;leopard",
            )
        )
        # Time only from the file date: counted, but kept out of time charts.
        rows["untimed"] = animal(
            s,
            placed,
            t0,
            label="chital",
            taxon="x;chital",
            route=Route.AUTO_ACCEPT,
            time_source=TimeSource.FILE_MTIME,
        )
        # Embeddings: tigers 0-2 share a pattern (one tiger), 3 is another, 4 a third.
        patterns = [
            [1, 0.05, 0, 0],
            [1, 0, 0.05, 0],
            [1, 0.02, 0.02, 0],
            [0, 1, 0, 0],
            [0, 0, 0, 1],
        ]
        for k, p in enumerate(patterns):
            img, det = rows[f"tiger{k}"]
            s.add(
                ReidEmbedding(
                    image_id=img.id,
                    detection_id=det.id,
                    model_name=MODEL,
                    model_version="1",
                    dim=4,
                    vector=service.to_bytes(unit(p)),
                    crop_box=[0.1, 0.1, 0.5, 0.5],
                )
            )
        s.commit()
    yield factory, r.code, rows


def _proposal(s: Session, img: Image) -> ReidProposal:
    p = s.scalar(
        select(ReidProposal)
        .join(ReidEmbedding, ReidEmbedding.id == ReidProposal.embedding_id)
        .where(ReidEmbedding.image_id == img.id)
    )
    assert p is not None
    return p


@pytest.fixture
def no_torch() -> None:
    if "torch" in sys.modules:  # FAISS and PyTorch must not share a process (reid.index)
        pytest.skip("torch already imported in this test process")


def test_settled_labels_and_dashboard(world) -> None:  # type: ignore[no-untyped-def]
    factory, code, rows = world
    with factory() as s:
        labels = settled_labels(s, reserve=code)
        assert labels[rows["corrected"][0].id].label == "leopard"
        assert labels[rows["corrected"][0].id].source == "person"
        assert rows["pending"][0].id not in labels
        o = dashboard.overview(s, reserve=code)
        assert o["tiger_images"] == 5
        assert o["animal_images_unsettled"] == 1
        assert {x["label"] for x in o["top_species"]} == {"tiger", "chital", "leopard"}
        m = dashboard.camera_map(s, reserve=code)
        assert [c["code"] for c in m["cameras"]] == ["C-1"]
        assert [c["code"] for c in m["without_location"]] == ["C-2"]
        assert m["cameras"][0]["tiger_images"] == 5
        cam = s.scalar(
            select(Camera).where(Camera.code == "C-1", Camera.id == rows["tiger0"][0].camera_id)
        )
        assert cam is not None
        d = dashboard.camera_detail(s, cam.id)
        assert d is not None
        # 00:00-04:00 IST, one tiger frame per hour; the leopard frame is at 00:00 too.
        assert d["hourly_tiger_images"][:5] == [1, 1, 1, 1, 1]
        assert d["hourly_animal_images"][0] == 2
        assert d["untimed_animal_images"] == 1
        t = dashboard.trends(s, reserve=code, period="week")
        assert [b["start"] for b in t["buckets"]] == ["2024-03-04"]  # local Monday
        assert t["buckets"][0]["animal_images"] == 7  # 5 tigers, chital, leopard; not untimed
        assert t["untimed_animal_images"] == 1


def test_reid_proposals_people_decide_and_undo(world, no_torch) -> None:  # type: ignore[no-untyped-def]
    factory, code, rows = world
    with factory() as s:
        assert service.match(s, model_name=MODEL, threshold=0.76, reserve=code) == {
            "possible_new": 5
        }
        first = _proposal(s, rows["tiger0"][0])
        assert first.candidates == []
        service.decide(s, service.DecisionInput(first.id, "new", "asha", code="T-1"))
        with pytest.raises(service.ReidError, match="already decided"):
            service.decide(s, service.DecisionInput(first.id, "new", "asha", code="T-9"))

        counts = service.match(s, model_name=MODEL, threshold=0.76, reserve=code)
        assert counts == {"possible_match": 2, "possible_new": 2}
        p1 = _proposal(s, rows["tiger1"][0])
        assert p1.kind is ProposalKind.POSSIBLE_MATCH and p1.candidates[0]["code"] == "T-1"
        assert _proposal(s, rows["tiger3"][0]).kind is ProposalKind.POSSIBLE_NEW
        # The model never assigns: the embedding is still unidentified.
        emb1 = s.get(ReidEmbedding, p1.embedding_id)
        assert emb1 is not None and emb1.individual_id is None

        ind_id = uuid.UUID(p1.candidates[0]["individual_id"])
        service.decide(s, service.DecisionInput(p1.id, "same", "asha", individual_id=ind_id))
        p3 = _proposal(s, rows["tiger3"][0])
        with pytest.raises(service.ReidError, match="already exists"):
            service.decide(s, service.DecisionInput(p3.id, "new", "asha", code="T-1"))
        p4 = _proposal(s, rows["tiger4"][0])
        service.decide(s, service.DecisionInput(p4.id, "not_tiger", "ravi"))

        service.match(s, model_name=MODEL, threshold=0.76, reserve=code)
        s.refresh(p4)
        assert p4.state is ProposalState.DONE  # a person's "not a tiger" is never reopened

        inds = service.individuals(s, reserve=code)
        assert [(i["code"], i["sightings"]) for i in inds] == [("T-1", 2)]
        assert inds[0]["first_seen"] is not None

        service.undo(s, p1.id, "asha")
        s.refresh(emb1)
        assert emb1.individual_id is None
        assert service.individuals(s, reserve=code)[0]["sightings"] == 1
        actions = set(
            s.scalars(select(AuditEvent.action).where(AuditEvent.entity == "reid_proposal"))
        )
        assert {"identity_new", "identity_same", "identity_not_tiger", "identity_undo"} <= actions


def test_similar_individuals_flags_double_naming(world, no_torch) -> None:  # type: ignore[no-untyped-def]
    factory, code, rows = world
    with factory() as s:
        service.match(s, model_name=MODEL, threshold=0.76, reserve=code)
        for k, c in ((0, "T-1"), (1, "T-2"), (3, "T-3")):  # 0 and 1 are the same tiger
            service.decide(
                s,
                service.DecisionInput(_proposal(s, rows[f"tiger{k}"][0]).id, "new", "asha", code=c),
            )
        pairs = service.similar_individuals(s, model_name=MODEL, threshold=0.76, reserve=code)
        assert [(p["a"], p["b"]) for p in pairs] == [("T-1", "T-2")]


def test_identity_api(world, no_torch) -> None:  # type: ignore[no-untyped-def]
    factory, code, _ = world
    with factory() as s:
        service.match(s, model_name=MODEL, threshold=0.76, reserve=code)
    app = create_app()

    def session_override() -> Iterator[Session]:
        with factory() as s:
            yield s

    app.dependency_overrides[get_session] = session_override
    with TestClient(app) as client:
        props = client.get("/identity/proposals", params={"reserve": code}).json()
        assert len(props) == 5
        pid = props[0]["id"]
        bad = client.post(
            f"/identity/proposals/{pid}/decide", json={"action": "new", "reviewer": "asha"}
        )
        assert bad.status_code == 409  # a new tiger needs a code
        ok = client.post(
            f"/identity/proposals/{pid}/decide",
            json={"action": "new", "reviewer": "asha", "code": "T-7"},
        )
        assert ok.status_code == 200 and ok.json()["outcome"] == "new"
        assert (
            client.get("/identity/individuals", params={"reserve": code}).json()[0]["code"] == "T-7"
        )
        assert (
            client.post(f"/identity/proposals/{pid}/undo", json={"reviewer": "asha"}).json()[
                "state"
            ]
            == "open"
        )
        o = client.get("/dashboard/overview", params={"reserve": code}).json()
        assert o["named_tigers"] == 1 and o["open_identity_proposals"] == 5
    with factory() as s:
        n = s.scalar(select(func.count()).select_from(ReidProposal))
        assert n is not None and n >= 5
