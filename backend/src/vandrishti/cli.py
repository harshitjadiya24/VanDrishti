"""`vandrishti` command line.

vandrishti version | db check
vandrishti reserve create --code SWG-LAO --name "..." --timezone Asia/Vientiane
vandrishti camera add --reserve SWG-LAO --code loc_0032 [--lat --lon --model --serial]
vandrishti camera list [--reserve CODE] | camera set-status --reserve R --code C --status S
vandrishti ingest <folder> --reserve R --camera C [--manifest CSV [--manifest-utc]]
vandrishti watch <inbox> [--once]
vandrishti batch show <id>
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from vandrishti import __version__
from vandrishti.db.models import Camera, Reserve


def _session() -> Session:
    from vandrishti.db.session import get_sessionmaker

    return get_sessionmaker()()


def _camera(session: Session, reserve: str, code: str) -> Camera:

    camera = session.scalar(
        select(Camera)
        .join(Reserve, Reserve.id == Camera.reserve_id)
        .where(Reserve.code == reserve, Camera.code == code)
    )
    if camera is None:
        sys.exit(f"no camera {code!r} in reserve {reserve!r} (add it with `camera add`)")
    return camera


def _print(obj: object) -> None:
    print(json.dumps(obj, indent=2, default=str))


def cmd_version(_: argparse.Namespace) -> None:
    print(__version__)


def cmd_db_check(_: argparse.Namespace) -> None:
    from sqlalchemy import text

    from vandrishti.db.session import get_engine

    try:
        with get_engine().connect() as conn:
            revision = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": type(exc).__name__}))
        sys.exit(1)
    print(json.dumps({"ok": True, "schema_revision": revision}))


def cmd_reserve_create(args: argparse.Namespace) -> None:
    from zoneinfo import ZoneInfo

    ZoneInfo(args.timezone)  # fail early on a typo
    with _session() as s:
        r = Reserve(code=args.code, name=args.name, timezone=args.timezone, country=args.country)
        s.add(r)
        s.commit()
        print(r.id)


def cmd_camera_add(args: argparse.Namespace) -> None:
    with _session() as s:
        reserve = s.scalar(select(Reserve).where(Reserve.code == args.reserve))
        if reserve is None:
            sys.exit(f"no reserve {args.reserve!r}")
        c = Camera(
            reserve_id=reserve.id,
            code=args.code,
            latitude=args.lat,
            longitude=args.lon,
            model=args.model,
            serial=args.serial,
            installed_at=datetime.fromisoformat(args.installed) if args.installed else None,
        )
        s.add(c)
        s.commit()
        print(c.id)


def cmd_camera_list(args: argparse.Namespace) -> None:
    with _session() as s:
        q = select(Camera, Reserve.code).join(Reserve, Reserve.id == Camera.reserve_id)
        if args.reserve:
            q = q.where(Reserve.code == args.reserve)
        for c, code in s.execute(q.order_by(Reserve.code, Camera.code)):
            print(f"{code}\t{c.code}\t{c.status.value}\tlast seen {c.last_seen_at or '-'}")


def cmd_camera_status(args: argparse.Namespace) -> None:
    from vandrishti.db.models import CameraStatus

    with _session() as s:
        camera = _camera(s, args.reserve, args.code)
        camera.status = CameraStatus(args.status)
        s.commit()
        print(f"{args.code}: {camera.status.value}")


def cmd_ingest(args: argparse.Namespace) -> None:
    from vandrishti.core.config import get_settings
    from vandrishti.core.storage import LocalStorage
    from vandrishti.db.models import IngestSource
    from vandrishti.ingest.metadata import load_manifest
    from vandrishti.ingest.service import ingest_files, iter_images

    folder = Path(args.folder).expanduser().resolve()
    if not folder.is_dir():
        sys.exit(f"not a folder: {folder}")
    settings = get_settings()
    manifest = (
        load_manifest(Path(args.manifest), times_are_local=not args.manifest_utc)
        if args.manifest
        else None
    )
    with _session() as s:
        camera = _camera(s, args.reserve, args.camera)
        result = ingest_files(
            s,
            LocalStorage(settings.storage_root),
            settings,
            camera,
            iter_images(folder),
            source=IngestSource.FOLDER,
            path=str(folder),
            manifest=manifest,
        )
    _print(result.as_dict())


def cmd_watch(args: argparse.Namespace) -> None:
    from vandrishti.core.config import get_settings
    from vandrishti.core.logging import configure_logging
    from vandrishti.core.storage import LocalStorage
    from vandrishti.db.session import get_sessionmaker
    from vandrishti.ingest.watch import run_watch

    settings = get_settings()
    configure_logging(settings.log_level, json_output=settings.log_json)
    inbox = Path(args.inbox).expanduser().resolve()
    logging.getLogger(__name__).info("watching inbox", extra={"inbox": str(inbox)})
    # --once: two polls, so files already in place are seen as stable and ingested.
    run_watch(
        get_sessionmaker(),
        LocalStorage(settings.storage_root),
        settings,
        inbox,
        polls=2 if args.once else None,
        sleep=(lambda _: None) if args.once else time.sleep,
    )


def cmd_batch_show(args: argparse.Namespace) -> None:
    from vandrishti.db.models import IngestBatch

    with _session() as s:
        b = s.get(IngestBatch, uuid.UUID(args.id))
        if b is None:
            sys.exit("no such batch")
        _print(
            {
                k: getattr(b, k)
                for k in (
                    "id",
                    "source",
                    "path",
                    "status",
                    "total",
                    "stored",
                    "duplicate",
                    "corrupt",
                    "failed",
                    "started_at",
                    "finished_at",
                )
            }
        )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="vandrishti")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("version", help="print the version").set_defaults(func=cmd_version)

    db = sub.add_parser("db").add_subparsers(dest="action", required=True)
    db.add_parser("check", help="connect and print the schema revision").set_defaults(
        func=cmd_db_check
    )

    res = sub.add_parser("reserve").add_subparsers(dest="action", required=True)
    rc = res.add_parser("create")
    rc.add_argument("--code", required=True)
    rc.add_argument("--name", required=True)
    rc.add_argument("--timezone", default="Asia/Kolkata")
    rc.add_argument("--country", default="IND")
    rc.set_defaults(func=cmd_reserve_create)

    cam = sub.add_parser("camera").add_subparsers(dest="action", required=True)
    ca = cam.add_parser("add")
    ca.add_argument("--reserve", required=True)
    ca.add_argument("--code", required=True)
    ca.add_argument("--lat", type=float)
    ca.add_argument("--lon", type=float)
    ca.add_argument("--model")
    ca.add_argument("--serial")
    ca.add_argument("--installed", help="ISO date/time")
    ca.set_defaults(func=cmd_camera_add)
    cl = cam.add_parser("list")
    cl.add_argument("--reserve")
    cl.set_defaults(func=cmd_camera_list)
    cs = cam.add_parser("set-status")
    cs.add_argument("--reserve", required=True)
    cs.add_argument("--code", required=True)
    cs.add_argument("--status", required=True, choices=["active", "inactive", "faulty", "stolen"])
    cs.set_defaults(func=cmd_camera_status)

    ing = sub.add_parser("ingest", help="ingest a folder (an SD-card dump) from one camera")
    ing.add_argument("folder")
    ing.add_argument("--reserve", required=True)
    ing.add_argument("--camera", required=True)
    ing.add_argument("--manifest", help="CSV with file_name,datetime (for images without EXIF)")
    ing.add_argument(
        "--manifest-utc",
        action="store_true",
        help="manifest times are real UTC instants (default: camera-local clock readings)",
    )
    ing.set_defaults(func=cmd_ingest)

    w = sub.add_parser("watch", help="poll an inbox/<RESERVE>/<CAMERA>/ folder and ingest")
    w.add_argument("inbox")
    w.add_argument("--once", action="store_true", help="ingest what is there now, then exit")
    w.set_defaults(func=cmd_watch)

    bat = sub.add_parser("batch").add_subparsers(dest="action", required=True)
    bs = bat.add_parser("show")
    bs.add_argument("id")
    bs.set_defaults(func=cmd_batch_show)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
