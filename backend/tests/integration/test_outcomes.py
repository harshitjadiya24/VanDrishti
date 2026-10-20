"""Section 11: alert rules and people's actions, signed webhook, reports, Camtrap DP, API v1."""

from __future__ import annotations

import csv
import hashlib
import hmac
import io
import json
import re
import threading
import uuid
import zipfile
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, ClassVar

import jsonschema
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session, sessionmaker

from vandrishti.alerts import rules
from vandrishti.alerts import service as alerts
from vandrishti.analytics.labels import TIGER
from vandrishti.api.app import create_app
from vandrishti.core.config import Settings
from vandrishti.db.models import (
    Alert,
    AlertDelivery,
    AlertKind,
    AlertSeverity,
    AlertState,
    AuditEvent,
    Camera,
    DeliveryStatus,
    PresenceEvent,
    QualityStatus,
    Reserve,
    RiskAssessment,
    RiskLevel,
    Route,
    ScreenOutcome,
    Sequence,
)
from vandrishti.db.session import get_session
from vandrishti.exports import camtrap_dp
from vandrishti.integration import keys
from vandrishti.pipeline.risk import RiskConfig
from vandrishti.reports import data as reports
from vandrishti.reports import render

from .factories import animal, plain

pytestmark = pytest.mark.integration
SCHEMAS = Path(__file__).resolve().parents[1] / "fixtures" / "camtrap_dp_1.0.2"
NOW = datetime(2024, 3, 20, 12, 0, tzinfo=UTC)
T0 = datetime(2024, 3, 18, 4, 0, tzinfo=UTC)  # Monday 09:30 in IST


@pytest.fixture
def world(engine: Engine) -> Iterator[tuple[sessionmaker[Session], str, dict[str, Any]]]:
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    tag = uuid.uuid4().hex[:6]
    with factory() as s:
        r = Reserve(code=f"O{tag}", name="Outcomes", timezone="Asia/Kolkata", country="IND")
        s.add(r)
        s.flush()
        a = Camera(reserve_id=r.id, code="A-1", latitude=22.34567, longitude=80.61234)
        b = Camera(reserve_id=r.id, code="B-1", latitude=22.4, longitude=80.7)
        c = Camera(reserve_id=r.id, code="C-1")  # no coordinates
        s.add_all([a, b, c])
        s.flush()
        burst = Sequence(
            camera_id=a.id, start_at=T0, end_at=T0 + timedelta(seconds=4), image_count=3
        )
        s.add(burst)
        s.flush()
        for k in range(3):
            animal(
                s,
                a,
                T0 + timedelta(seconds=2 * k),
                label="tiger",
                taxon=TIGER,
                route=Route.AUTO_ACCEPT,
                sequence_id=burst.id,
            )
        animal(s, a, T0 + timedelta(days=1), label="tiger", taxon=TIGER, route=Route.AUTO_ACCEPT)
        animal(
            s,
            a,
            T0,
            label="chital",
            taxon="mammalia;artiodactyla;cervidae;axis;axis",
            route=Route.AUTO_ACCEPT,
        )
        people = plain(s, a, T0 + timedelta(hours=2), screen=ScreenOutcome.HUMAN_VEHICLE)
        event = PresenceEvent(
            camera_id=a.id,
            first_image_id=people.id,
            image_ids=[str(people.id)],
            start_at=people.captured_at,
            end_at=people.captured_at,
            people_count=2,
            vehicle_count=0,
            night=False,
            night_basis="sun",
        )
        s.add(event)
        s.flush()
        s.add(
            RiskAssessment(
                event_id=event.id,
                config_hash=RiskConfig().hash(),
                score=9,
                level=RiskLevel.HIGH,
                factors=[
                    {"name": "person", "points": 2, "reason": "2 people (estimated count)"},
                    {"name": "unusual spike", "points": 2, "reason": "spike"},
                ],
                dismissed=False,
            )
        )
        plain(s, b, datetime(2024, 3, 1, tzinfo=UTC))  # B silent since 1 March
        for k in range(12):  # C: most recent frames unusable
            plain(s, c, NOW - timedelta(hours=k + 1), quality=QualityStatus.FAIL, screen=None)
        s.commit()
    yield factory, r.code, {"people": people, "event": event}


def test_alert_rules_idempotent_and_people_win(world) -> None:  # type: ignore[no-untyped-def]
    factory, code, w = world
    with factory() as s:
        made = rules.evaluate(s, reserve=code, now=NOW)
        assert made == {
            "new_tiger_sighting": 2,
            "new_poaching_risk": 1,
            "new_unusual_activity": 1,
            "new_camera_failure": 2,
        }
        assert rules.evaluate(s, reserve=code, now=NOW) == {}
        by_kind = {
            (a.kind, a.detail.get("check")): a
            for a in s.scalars(select(Alert).join(Reserve).where(Reserve.code == code))
        }
        risk = by_kind[(AlertKind.POACHING_RISK, None)]
        assert risk.severity is AlertSeverity.CRITICAL
        assert "latitude" not in json.dumps(risk.detail)
        assert by_kind[(AlertKind.CAMERA_FAILURE, "silent")].title.startswith("Camera B-1 silent")
        assert by_kind[(AlertKind.CAMERA_FAILURE, "quality")].detail["failed"] == 12

        alerts.act(s, risk.id, "acknowledge", "asha", "ranger team sent")
        with pytest.raises(alerts.AlertError):
            alerts.act(s, risk.id, "acknowledge", "asha")
        # The reviewer dismisses the event as a false alarm: rules close the open spike alert
        # but never touch the alert a person acknowledged.
        a = s.scalar(select(RiskAssessment).where(RiskAssessment.event_id == w["event"].id))
        assert a is not None
        a.dismissed = True
        s.commit()
        assert rules.evaluate(s, reserve=code, now=NOW) == {"closed_by_system": 1}
        s.refresh(risk)
        assert risk.state is AlertState.ACKNOWLEDGED and risk.acted_by == "asha"
        alerts.act(s, risk.id, "resolve", "asha")
        alerts.act(s, risk.id, "reopen", "ravi")  # undo
        assert risk.state is AlertState.OPEN
        actions = set(
            s.scalars(select(AuditEvent.action).where(AuditEvent.entity_id == str(risk.id)))
        )
        assert actions == {"alert_acknowledge", "alert_resolve", "alert_reopen"}


class _Hook(BaseHTTPRequestHandler):
    received: ClassVar[list[tuple[dict[str, str], bytes]]] = []
    status = 200

    def do_POST(self) -> None:
        body = self.rfile.read(int(self.headers["Content-Length"]))
        type(self).received.append(({k.lower(): v for k, v in self.headers.items()}, body))
        self.send_response(type(self).status)
        self.end_headers()

    def log_message(self, *args: Any) -> None:
        pass


@pytest.fixture
def hook() -> Iterator[tuple[str, type[_Hook]]]:
    handler = type("Hook", (_Hook,), {"received": [], "status": 200})
    server = HTTPServer(("127.0.0.1", 0), handler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{server.server_port}/hook", handler
    server.shutdown()


def test_webhook_is_signed_retried_and_never_carries_coordinates(world, hook) -> None:  # type: ignore[no-untyped-def]
    factory, code, _ = world
    url, handler = hook
    settings = Settings(
        alert_webhook_url=url,
        alert_webhook_secret=SecretStr("s3cret"),
        alert_webhook_max_attempts=2,
    )
    with factory() as s:
        rules.evaluate(s, reserve=code, now=NOW)
        # Only alerts of this reserve are open in a fresh test database, except other tests'.
        sent = alerts.deliver(s, settings)
        assert sent["sent"] >= 4
        mine = [json.loads(b) for _, b in handler.received if json.loads(b)["reserve"] == code]
        assert {m["kind"] for m in mine} == {"poaching_risk", "unusual_activity", "camera_failure"}
        for headers, body in handler.received:
            ts = headers["x-vandrishti-timestamp"]
            mac = hmac.new(b"s3cret", f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
            assert headers["x-vandrishti-signature"] == f"sha256={mac}"
            assert "latitude" not in body.decode() and "longitude" not in body.decode()
        n = len(handler.received)
        assert alerts.deliver(s, settings)["sent"] == 0 and len(handler.received) == n

        new = Alert(
            reserve_id=s.scalar(select(Reserve.id).where(Reserve.code == code)),
            kind=AlertKind.CAMERA_FAILURE,
            severity=AlertSeverity.WARNING,
            dedupe_key=f"test:{uuid.uuid4()}",
            rule_version="1",
            title="t",
            detail={},
        )
        s.add(new)
        s.commit()
        handler.status = 500
        assert alerts.deliver(s, settings)["failed"] == 1
        assert alerts.deliver(s, settings)["gave_up"] == 1
        d = s.scalar(select(AlertDelivery).where(AlertDelivery.alert_id == new.id))
        assert d is not None and d.status is DeliveryStatus.GAVE_UP and d.attempts == 2
        with pytest.raises(alerts.AlertError, match="https"):
            alerts.deliver(
                s, Settings(env="prod", alert_webhook_url=url, alert_webhook_secret=SecretStr("x"))
            )


def test_weekly_report_numbers_and_files(world) -> None:  # type: ignore[no-untyped-def]
    factory, code, _ = world
    with factory() as s:
        lo, hi = reports.period_range("weekly", date(2024, 3, 20))
        assert (lo, hi) == (date(2024, 3, 18), date(2024, 3, 24))
        r = reports.build(s, code, lo, hi, "weekly")
    sm = r["summary"]
    assert sm["tiger_frames"] == 4 and sm["animal_frames_settled"] == 5
    assert sm["people_vehicle_events"] == 1 and sm["risk_levels"] == {"high": 1}
    assert {x["label"]: x["naive_occupancy"] for x in r["species"]} == {"tiger": 0.5, "chital": 0.5}
    day = {d["date"]: d for d in r["daily"]}
    assert day["2024-03-18"]["tiger_frames"] == 3 and day["2024-03-19"]["tiger_frames"] == 1
    assert "latitude" not in json.dumps(r, default=str)
    assert render.to_xlsx(r)[:2] == b"PK"
    assert render.to_pdf(r)[:5] == b"%PDF-"


def _check_table(rows: list[dict[str, str]], header: list[str], schema: dict[str, Any]) -> None:
    assert header == [f["name"] for f in schema["fields"]]
    for f in schema["fields"]:
        c = f.get("constraints", {})
        for row in rows:
            v = row[f["name"]]
            if v == "":
                assert not c.get("required"), f["name"]
                continue
            if "enum" in c:
                assert v in c["enum"], (f["name"], v)
            if "pattern" in c:
                assert re.fullmatch(c["pattern"], v), (f["name"], v)
            if f["type"] in ("number", "integer"):
                x = float(v)
                assert c.get("minimum", x) <= x <= c.get("maximum", x), (f["name"], v)
            if f["type"] == "datetime":
                datetime.strptime(v, f["format"])
            if f["type"] == "boolean":
                assert v in ("true", "false")
        if c.get("unique"):
            assert len({r[f["name"]] for r in rows}) == len(rows)


def test_camtrap_dp_validates_and_withholds_people(world) -> None:  # type: ignore[no-untyped-def]
    factory, code, w = world
    with factory() as s:
        body, summary = camtrap_dp.build(s, code, sampling_design="targeted")
        precise, _ = camtrap_dp.build(s, code, sampling_design="targeted", precise=True)
    assert summary["cameras_without_coordinates"] == 1 and summary["people_vehicle_frames"] == 1
    z = zipfile.ZipFile(io.BytesIO(body))
    package = json.loads(z.read("datapackage.json"))
    profile = json.loads((SCHEMAS / "camtrap-dp-profile.json").read_text())
    # Offline: stub the two remote schemas it references (Frictionless, GeoJSON).
    profile["allOf"][0] = {}
    profile["allOf"][1]["properties"]["spatial"] = {"type": "object"}
    jsonschema.validate(package, profile)
    tables: dict[str, list[dict[str, str]]] = {}
    for name in ("deployments", "media", "observations"):
        reader = csv.DictReader(io.StringIO(z.read(f"{name}.csv").decode()))
        tables[name] = list(reader)
        schema = json.loads((SCHEMAS / f"{name}-table-schema.json").read_text())
        _check_table(tables[name], list(reader.fieldnames or []), schema)
    deps = {d["deploymentID"] for d in tables["deployments"]}
    media = {m["mediaID"] for m in tables["media"]}
    assert all(m["deploymentID"] in deps for m in tables["media"])
    assert all(o["mediaID"] in media for o in tables["observations"])
    assert str(w["people"].id) not in media  # people are never exported
    a = next(d for d in tables["deployments"] if d["locationName"] == "A-1")
    assert (a["latitude"], a["longitude"], a["coordinateUncertainty"]) == ("22.3", "80.6", "7900")
    pa = next(
        d
        for d in csv.DictReader(
            io.StringIO(zipfile.ZipFile(io.BytesIO(precise)).read("deployments.csv").decode())
        )
        if d["locationName"] == "A-1"
    )
    assert pa["latitude"] == "22.34567"
    tigers = [o for o in tables["observations"] if o["scientificName"] == "Panthera tigris"]
    assert len(tigers) == 4 and all(o["classificationMethod"] == "machine" for o in tigers)
    assert {t["scientificName"] for t in package["taxonomic"]} == {"Panthera tigris", "Axis axis"}


def test_integration_api_v1(world) -> None:  # type: ignore[no-untyped-def]
    factory, code, _ = world
    with factory() as s:
        key, row = keys.create(s, reserve=code, name="state-mis", created_by="admin")
    app = create_app()

    def session_override() -> Iterator[Session]:
        with factory() as s:
            yield s

    app.dependency_overrides[get_session] = session_override
    with TestClient(app) as client:
        assert client.get("/v1/summary").status_code == 401
        assert client.get("/v1/summary", headers={"X-API-Key": key + "x"}).status_code == 401
        h = {"X-API-Key": key}
        assert client.get("/v1/summary", headers=h).json()["tiger_images"] == 4
        cams = {c["code"]: c for c in client.get("/v1/cameras", headers=h).json()}
        assert cams["A-1"]["latitude"] == 22.3
        obs = client.get("/v1/observations", headers=h, params={"limit": 3}).json()
        assert len(obs["items"]) == 3 and obs["next_offset"] == 3
        rest = client.get("/v1/observations", headers=h, params={"offset": 3}).json()
        assert len(rest["items"]) == 2 and rest["next_offset"] is None
        assert {i["label"] for i in obs["items"] + rest["items"]} == {"tiger", "chital"}
        pdf = client.get(
            "/v1/reports",
            headers=h,
            params={"period": "weekly", "day": "2024-03-20", "format": "pdf"},
        )
        assert pdf.status_code == 200 and pdf.content[:5] == b"%PDF-"
        assert (
            client.get(
                "/v1/camtrap-dp", headers=h, params={"sampling_design": "targeted"}
            ).status_code
            == 200
        )
    with factory() as s:
        keys.revoke(s, row.prefix, "admin")
        reads = s.scalars(
            select(AuditEvent).where(
                AuditEvent.action == "api_read",
                AuditEvent.actor == f"apikey:state-mis({row.prefix})",
            )
        )
        assert len(list(reads)) == 6  # the two refused calls are not reads
    with TestClient(app) as client:
        assert client.get("/v1/summary", headers={"X-API-Key": key}).status_code == 401
