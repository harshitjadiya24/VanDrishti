"""Phase 8: real sign-in (cookie + CSRF), lockout, roles, reserve scope, privacy, /v1 limits."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session, sessionmaker

from tests.images import write_jpeg
from vandrishti.api.app import create_app
from vandrishti.api.ratelimit import LOGIN
from vandrishti.api.routes import v1
from vandrishti.auth import accounts
from vandrishti.core.config import Settings, get_settings
from vandrishti.db.models import AuditEvent, Camera, LoginSession, Reserve, Role, ScreenOutcome
from vandrishti.db.session import get_session
from vandrishti.integration import keys

from .factories import plain

pytestmark = pytest.mark.integration
PASSWORD = "correct horse battery"


@pytest.fixture
def world(engine: Engine, tmp_path: Path) -> Iterator[dict[str, Any]]:
    LOGIN.reset()
    v1.REFUSED.reset()
    v1._LIMITS.clear()
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    tag = uuid.uuid4().hex[:6]
    settings = Settings(storage_root=tmp_path / "store", api_rate_per_minute=3)  # type: ignore[arg-type]
    with factory() as s:
        mine = Reserve(code=f"A{tag}", name="Mine", timezone="Asia/Kolkata")
        other = Reserve(code=f"B{tag}", name="Other", timezone="Asia/Kolkata")
        s.add_all([mine, other])
        s.flush()
        cam = Camera(reserve_id=mine.id, code="S-1", latitude=22.34567, longitude=80.61234)
        s.add(cam)
        s.flush()
        people = plain(s, cam, datetime(2024, 1, 1, tzinfo=UTC), screen=ScreenOutcome.HUMAN_VEHICLE)
        people.display_key = f"derived/display/{people.sha256}.jpg"
        write_jpeg(settings.storage_root / people.display_key)
        s.commit()
        users = {}
        for name, role in (
            ("asha", Role.REVIEWER),
            ("vic", Role.VIEWER),
            ("ravi", Role.RANGER),
            ("root", Role.ADMIN),
        ):
            users[name] = accounts.create_user(
                s,
                username=f"{name}-{tag}",
                display_name=name,
                password=PASSWORD,
                role=role,
                reserves=[mine.code],
                by="test",
            )
    app = create_app()

    def session_dep() -> Iterator[Session]:
        with factory() as sess:
            yield sess

    app.dependency_overrides[get_session] = session_dep
    app.dependency_overrides[get_settings] = lambda: settings
    yield {
        "factory": factory,
        "app": app,
        "tag": tag,
        "mine": mine.code,
        "other": other.code,
        "cam": cam.id,
        "people": people.id,
        "settings": settings,
    }


def _login(app: Any, username: str, password: str = PASSWORD) -> tuple[TestClient, str]:
    c = TestClient(app)
    r = c.post("/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return c, r.json()["csrf_token"]


def test_cookie_session_csrf_and_logout(world) -> None:  # type: ignore[no-untyped-def]
    app, tag = world["app"], world["tag"]
    c = TestClient(app)
    assert c.get("/dashboard/overview").status_code == 401
    r = c.post("/auth/login", json={"username": f"asha-{tag}", "password": PASSWORD})
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie
    me = c.get("/auth/me").json()
    assert me["role"] == "reviewer" and "review_species" in me["permissions"]
    assert c.get("/dashboard/overview").status_code == 200  # one reserve: filled in
    assert c.post("/routing/run").status_code == 403  # no CSRF header
    ok = c.post("/routing/run", headers={"X-CSRF-Token": me["csrf_token"]})
    assert ok.status_code == 200
    assert c.post("/auth/logout", headers={"X-CSRF-Token": me["csrf_token"]}).status_code == 200
    assert c.get("/auth/me").status_code == 401
    with world["factory"]() as s:
        hashes = list(s.scalars(select(LoginSession.token_hash)))
        assert all(len(h) == 64 for h in hashes)  # only hashes stored


def test_wrong_passwords_lock_the_account_and_are_audited(world) -> None:  # type: ignore[no-untyped-def]
    app, tag = world["app"], world["tag"]
    c = TestClient(app)
    for _ in range(5):
        bad = c.post("/auth/login", json={"username": f"vic-{tag}", "password": "nope"})
        assert bad.status_code == 401 and bad.json()["detail"] == "wrong username or password"
    locked = c.post("/auth/login", json={"username": f"vic-{tag}", "password": PASSWORD})
    assert locked.status_code == 401 and "try again later" in locked.json()["detail"]
    unknown = c.post("/auth/login", json={"username": "nobody", "password": "x"})
    assert unknown.json()["detail"] == "wrong username or password"  # no hint it is unknown
    for _ in range(3):
        c.post("/auth/login", json={"username": "nobody", "password": "x"})
    assert c.post("/auth/login", json={"username": "nobody", "password": "x"}).status_code == 429
    with world["factory"]() as s:
        fails = list(
            s.scalars(
                select(AuditEvent).where(
                    AuditEvent.action == "login_failed", AuditEvent.actor == f"user:vic-{tag}"
                )
            )
        )
        assert [e.payload["why"] for e in fails] == ["password"] * 5 + ["locked"]


def test_roles_scope_and_privacy(world) -> None:  # type: ignore[no-untyped-def]
    app, tag, mine, other = world["app"], world["tag"], world["mine"], world["other"]
    viewer, _ = _login(app, f"vic-{tag}")
    assert viewer.get("/dashboard/overview", params={"reserve": other}).status_code == 403
    assert viewer.get(f"/reports/{other}").status_code == 404
    assert [r["code"] for r in viewer.get("/reserves").json()] == [mine]
    cams = viewer.get("/cameras").json()
    assert (cams[0]["latitude"], cams[0]["longitude"]) == (22.3, 80.6)  # rounded
    people = world["people"]
    assert viewer.get(f"/images/{people}/display").status_code == 403  # people frames
    assert viewer.get("/review/queue", params={"kind": "review"}).status_code == 403
    assert viewer.get("/audit/events").status_code == 403

    ranger, _ = _login(app, f"ravi-{tag}")
    assert ranger.get(f"/images/{people}/display").status_code == 200
    with world["factory"]() as s:
        seen = s.scalar(
            select(AuditEvent).where(
                AuditEvent.action == "view_people_frame", AuditEvent.entity_id == str(people)
            )
        )
        assert seen is not None and seen.actor == f"user:ravi-{tag}"

    admin, _ = _login(app, f"root-{tag}")
    assert admin.get("/cameras", params={"reserve": mine}).json()[0]["latitude"] == 22.34567
    assert admin.get("/audit/events").status_code == 200


def test_deactivation_and_password_change_end_sessions(world) -> None:  # type: ignore[no-untyped-def]
    app, tag = world["app"], world["tag"]
    c, csrf = _login(app, f"asha-{tag}")
    weak = c.post(
        "/auth/password", json={"current": PASSWORD, "new": "short"}, headers={"X-CSRF-Token": csrf}
    )
    assert weak.status_code == 400
    wrong = c.post(
        "/auth/password",
        json={"current": "nope", "new": "a much longer secret"},
        headers={"X-CSRF-Token": csrf},
    )
    assert wrong.status_code == 403
    changed = c.post(
        "/auth/password",
        json={"current": PASSWORD, "new": "a much longer secret"},
        headers={"X-CSRF-Token": csrf},
    )
    assert changed.status_code == 200 and c.get("/auth/me").status_code == 401
    c2, _ = _login(app, f"asha-{tag}", "a much longer secret")
    with world["factory"]() as s:
        accounts.update_user(s, f"asha-{tag}", by="root", active=False)
    assert c2.get("/auth/me").status_code == 401
    bad = TestClient(app).post(
        "/auth/login", json={"username": f"asha-{tag}", "password": "a much longer secret"}
    )
    assert bad.status_code == 401


def test_v1_rate_limit_and_refused_keys_audited(world) -> None:  # type: ignore[no-untyped-def]
    app, mine = world["app"], world["mine"]
    with world["factory"]() as s:
        key, _ = keys.create(s, reserve=mine, name="mis", created_by="root")
    c = TestClient(app)
    assert c.get("/v1/summary", headers={"X-API-Key": "vd_dead_beef"}).status_code == 401
    codes = [c.get("/v1/summary", headers={"X-API-Key": key}).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]
    with world["factory"]() as s:
        refused = s.scalar(
            select(AuditEvent)
            .where(AuditEvent.action == "api_key_refused")
            .order_by(AuditEvent.seq.desc())
        )
        assert refused is not None and refused.payload == {"prefix": "dead"}
        assert "beef" not in str(refused.payload)  # never store the secret part
