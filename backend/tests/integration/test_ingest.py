"""Sections 1-4 end to end on a real database: folder, upload and inbox ingestion."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image as PILImage
from sqlalchemy import Engine, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from tests.images import write_jpeg
from vandrishti.api.app import create_app
from vandrishti.core.config import Settings, get_settings
from vandrishti.core.storage import LocalStorage
from vandrishti.db.models import Camera, Image, IngestSource, Reserve, Sequence, TimeSource
from vandrishti.db.session import get_session
from vandrishti.ingest.metadata import Manifest
from vandrishti.ingest.service import ingest_files, iter_images
from vandrishti.ingest.watch import run_watch

pytestmark = pytest.mark.integration


@pytest.fixture
def factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)


@pytest.fixture
def camera(factory: sessionmaker[Session]) -> Camera:
    tag = uuid.uuid4().hex[:6]
    with factory() as s:
        r = Reserve(code=f"R{tag}", name="Test reserve", timezone="Asia/Kolkata")
        s.add(r)
        s.flush()
        c = Camera(reserve_id=r.id, code=f"C{tag}", latitude=22.1, longitude=80.5)
        s.add(c)
        s.commit()
        return c


def _settings(tmp_path: Path, **kw: object) -> Settings:
    return Settings(storage_root=tmp_path / "store", **kw)  # type: ignore[arg-type]


def test_folder_ingest_is_idempotent_and_builds_bursts(
    factory: sessionmaker[Session], camera: Camera, tmp_path: Path
) -> None:
    card = tmp_path / "card"
    for i, second in enumerate([0, 2, 4, 600]):  # a burst of 3, then one frame 10 min later
        write_jpeg(
            card / "DCIM" / f"IMG_{i}.JPG",
            taken=f"2024:01:13 03:{40 + second // 60:02d}:{second % 60:02d}",
        )
    write_jpeg(card / "DCIM" / "nogps_notime.jpg")  # falls back to file mtime + camera GPS
    (card / "DCIM" / "broken.jpg").write_bytes(b"\xff\xd8\xff garbage")
    (card / ".hidden.jpg").write_bytes(b"x")  # skipped
    settings = _settings(tmp_path)
    storage = LocalStorage(settings.storage_root)

    with factory() as s:
        first = ingest_files(
            s, storage, settings, s.merge(camera), iter_images(card), source=IngestSource.FOLDER
        )
    assert (first.total, first.stored, first.corrupt, first.duplicate) == (6, 5, 1, 0)
    assert first.time_sources == {"exif": 4, "file_mtime": 2}

    with factory() as s:
        again = ingest_files(
            s, storage, settings, s.merge(camera), iter_images(card), source=IngestSource.FOLDER
        )
    assert (again.total, again.stored, again.duplicate) == (6, 0, 6)

    with factory() as s:
        imgs = list(s.scalars(select(Image).where(Image.camera_id == camera.id)))
        exif_imgs = [i for i in imgs if i.time_source is TimeSource.EXIF]
        assert min(i.captured_at for i in exif_imgs).isoformat() == "2024-01-12T22:10:00+00:00"
        no_meta = next(i for i in imgs if i.original_filename.endswith("nogps_notime.jpg"))
        assert (no_meta.latitude, no_meta.gps_source.value) == (22.1, "camera")
        broken = next(i for i in imgs if i.is_corrupt)
        assert broken.display_key is None and storage.exists(broken.storage_key)
        good = exif_imgs[0]
        with PILImage.open(storage.path(good.display_key or "")) as im:
            assert max(im.size) <= settings.display_max_side
        # 3-frame burst + lone frame + the undated-by-EXIF frame (mtime, far away in time).
        counts = sorted(
            s.scalars(select(Sequence.image_count).where(Sequence.camera_id == camera.id))
        )
        assert counts == [1, 1, 3]
        cam = s.get(Camera, camera.id)
        assert cam is not None and cam.last_seen_at is not None
        # A camera with images cannot be deleted (it is retired by status instead).
        s.delete(cam)
        with pytest.raises(IntegrityError):
            s.flush()


def test_manifest_supplies_times_when_exif_has_none(
    factory: sessionmaker[Session], camera: Camera, tmp_path: Path
) -> None:
    from datetime import datetime

    write_jpeg(tmp_path / "card" / "2017" / "a.jpg")
    manifest = Manifest({"2017/a.jpg": datetime(2017, 10, 21, 5, 3, 46)})
    settings = _settings(tmp_path)
    with factory() as s:
        r = ingest_files(
            s,
            LocalStorage(settings.storage_root),
            settings,
            s.merge(camera),
            iter_images(tmp_path / "card"),
            source=IngestSource.FOLDER,
            manifest=manifest,
        )
        assert r.time_sources == {"manifest": 1}
        img = s.scalar(select(Image).where(Image.camera_id == camera.id))
        assert img is not None and img.captured_at.isoformat() == "2017-10-20T23:33:46+00:00"


def _client(factory: sessionmaker[Session], settings: Settings) -> TestClient:
    app = create_app()

    def session_dep() -> Iterator[Session]:
        with factory() as s:
            yield s

    app.dependency_overrides[get_session] = session_dep
    app.dependency_overrides[get_settings] = lambda: settings
    return TestClient(app)


def test_upload_needs_the_token_and_runs_the_pipeline(
    factory: sessionmaker[Session], camera: Camera, tmp_path: Path
) -> None:
    c = _client(factory, _settings(tmp_path, ingest_token="t" * 32))
    pic = write_jpeg(tmp_path / "up.jpg", taken="2024:02:01 12:00:00")
    url = f"/cameras/{camera.id}/images"

    def send(headers: dict[str, str] | None = None) -> object:
        with pic.open("rb") as f:
            return c.post(
                url, files=[("files", ("../../etc/up.jpg", f, "image/jpeg"))], headers=headers
            )

    assert send().status_code == 401  # type: ignore[attr-defined]
    assert send({"Authorization": "Bearer wrong"}).status_code == 401  # type: ignore[attr-defined]
    ok = send({"Authorization": "Bearer " + "t" * 32})
    assert ok.status_code == 201 and ok.json()["stored"] == 1  # type: ignore[attr-defined]
    with factory() as s:
        img = s.scalar(select(Image).where(Image.camera_id == camera.id))
        assert img is not None and img.original_filename == "up.jpg"  # path parts dropped
    assert c.get(f"/images/{img.id}").json()["time_source"] == "exif"
    shown = c.get(f"/images/{img.id}/display")
    assert shown.status_code == 200 and shown.headers["content-type"] == "image/jpeg"
    batch = c.get(f"/batches/{ok.json()['id']}").json()  # type: ignore[attr-defined]
    assert batch["source"] == "upload" and batch["status"] == "done"
    text = tmp_path / "x.txt"
    text.write_text("hi")
    with text.open("rb") as f:
        bad = c.post(
            url,
            files=[("files", ("x.txt", f, "text/plain"))],
            headers={"Authorization": "Bearer " + "t" * 32},
        )
    assert bad.status_code == 415


def test_writes_refused_outside_dev_without_a_token(
    factory: sessionmaker[Session], tmp_path: Path
) -> None:
    c = _client(factory, _settings(tmp_path, env="test"))
    r = c.post("/reserves", json={"code": "NOPE", "name": "x"})
    assert r.status_code == 403
    assert c.get("/reserves").status_code == 200


def test_registry_api(factory: sessionmaker[Session], tmp_path: Path) -> None:
    c = _client(factory, _settings(tmp_path))  # env=dev, no token: local writes allowed
    code = f"API{uuid.uuid4().hex[:5]}"
    assert (
        c.post("/reserves", json={"code": code, "name": "A", "timezone": "Mars/Base"}).status_code
        == 422
    )
    assert c.post("/reserves", json={"code": code, "name": "A"}).status_code == 201
    assert c.post("/reserves", json={"code": code, "name": "A"}).status_code == 409
    cam = c.post(
        "/cameras", json={"reserve": code, "code": "S-01", "latitude": 22.0, "longitude": 80.0}
    )
    assert cam.status_code == 201
    patched = c.patch(f"/cameras/{cam.json()['id']}", json={"status": "faulty"})
    assert patched.json()["status"] == "faulty"
    assert [x["code"] for x in c.get("/cameras", params={"reserve": code}).json()] == ["S-01"]


def test_inbox_watch_ingests_registered_cameras_only(
    factory: sessionmaker[Session], camera: Camera, tmp_path: Path
) -> None:
    with factory() as s:
        reserve_code = s.scalar(select(Reserve.code).where(Reserve.id == camera.reserve_id))
    inbox = tmp_path / "inbox"
    write_jpeg(
        inbox / str(reserve_code) / camera.code / "DCIM" / "a.jpg", taken="2024:03:01 01:00:00"
    )
    write_jpeg(inbox / str(reserve_code) / "UNKNOWN" / "b.jpg")
    settings = _settings(tmp_path)
    run_watch(
        factory, LocalStorage(settings.storage_root), settings, inbox, polls=2, sleep=lambda _: None
    )
    with factory() as s:
        n = s.scalar(select(func.count()).select_from(Image).where(Image.camera_id == camera.id))
    assert n == 1
    assert (inbox / str(reserve_code) / camera.code / "DCIM" / "a.jpg").exists()  # never deleted
