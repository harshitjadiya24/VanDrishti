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


def cmd_quality(args: argparse.Namespace) -> None:
    from vandrishti.core.config import get_settings
    from vandrishti.core.storage import LocalStorage
    from vandrishti.pipeline.screen import run_quality

    with _session() as s:
        stats = run_quality(
            s, LocalStorage(get_settings().storage_root), reserve=args.reserve, limit=args.limit
        )
    _print(stats.as_dict())


def cmd_detect(args: argparse.Namespace) -> None:
    from vandrishti.core.config import get_settings
    from vandrishti.core.storage import LocalStorage
    from vandrishti.models.adapters.megadetector_v6 import MegaDetectorV6MIT
    from vandrishti.models.manager import ModelManager
    from vandrishti.pipeline.screen import run_detection

    settings = get_settings()
    weights = settings.model_cache_dir / "megadetector"
    if not (weights / "MDV6-mit-yolov9-c.ckpt").exists():
        sys.exit("weights missing: run scripts/download_models.py megadetector-v6-mit-c")
    manager = ModelManager(
        max_loaded=settings.model_max_loaded,
        budget_mb=settings.model_memory_budget_mb,
        device=args.device or settings.detector_device,
    )
    model = manager.get(MegaDetectorV6MIT(weights, min_confidence=settings.detector_min_confidence))
    try:
        with _session() as s:
            stats = run_detection(
                s,
                LocalStorage(settings.storage_root),
                settings,
                model,
                reserve=args.reserve,
                limit=args.limit,
            )
    finally:
        manager.unload_all()
    _print(stats.as_dict())


STEPS = ("classify", "verify", "segment", "decide")


def cmd_analyse(args: argparse.Namespace) -> None:
    """5.3-5.7 in order, one model in memory at a time (8 GB laptop)."""
    from vandrishti.core.config import get_settings
    from vandrishti.core.storage import LocalStorage
    from vandrishti.models.manager import ModelManager
    from vandrishti.pipeline import species as stages

    settings = get_settings()
    storage = LocalStorage(settings.storage_root)
    steps = args.steps.split(",") if args.steps else list(STEPS)
    report: dict[str, object] = {}
    with _session() as s:
        reserve = s.scalar(select(Reserve).where(Reserve.code == args.reserve))
        if reserve is None:
            sys.exit(f"no reserve {args.reserve!r}")
        country = reserve.country
    for step in steps:
        manager = ModelManager(max_loaded=1, budget_mb=settings.model_memory_budget_mb)
        try:
            with _session() as s:
                if step == "classify":
                    from vandrishti.models.adapters.speciesnet_tool import SpeciesNetTool

                    manager.device = "cpu"
                    tool = manager.get(
                        SpeciesNetTool(
                            settings.speciesnet_tool_dir, settings.model_cache_dir, country=country
                        )
                    )
                    stats = stages.run_classification(
                        s, storage, settings, tool, reserve=args.reserve, limit=args.limit
                    )
                elif step == "verify":
                    from vandrishti.models.adapters.openclip_verifier import OpenClipVerifier

                    manager.device = settings.verifier_device
                    clip = manager.get(
                        OpenClipVerifier(settings.model_cache_dir / "openclip-vit-b-16")
                    )
                    stats = stages.run_semantic(
                        s, storage, settings, clip, reserve=args.reserve, limit=args.limit
                    )
                elif step == "segment":
                    from vandrishti.models.adapters.sam2_segmenter import Sam2Segmenter

                    manager.device = settings.segmenter_device
                    sam = manager.get(Sam2Segmenter(settings.model_cache_dir / "sam2.1-tiny"))
                    stats = stages.run_segmentation(
                        s, storage, settings, sam, reserve=args.reserve, limit=args.limit
                    )
                elif step == "decide":
                    stats = stages.run_decisions(
                        s, settings, reserve=args.reserve, limit=args.limit
                    )
                else:
                    sys.exit(f"unknown step {step!r}; choose from {', '.join(STEPS)}")
        finally:
            manager.unload_all()
        report[step] = stats.as_dict()
        _print({step: report[step]})


def _speciesnet_names() -> dict[str, str]:
    """common name → taxon, from SpeciesNet's own label file (the names it can output)."""
    from vandrishti import species_names
    from vandrishti.core.config import get_settings

    names = {t.common_name: t.taxon for t in species_names.load(get_settings().model_cache_dir)}
    if not names:
        sys.exit("SpeciesNet labels missing: scripts/download_models.py speciesnet-v4.0.3a")
    return names


def cmd_species_add(args: argparse.Namespace) -> None:
    from vandrishti.db.models import ReserveSpecies

    names = _speciesnet_names()
    with _session() as s:
        reserve = s.scalar(select(Reserve).where(Reserve.code == args.reserve))
        if reserve is None:
            sys.exit(f"no reserve {args.reserve!r}")
        for raw in args.name:
            name = raw.strip().lower()
            if name not in names:
                close = [n for n in names if name in n][:5]
                sys.exit(
                    f"{name!r} is not a SpeciesNet label"
                    + (f"; did you mean {close}?" if close else "")
                )
            exists_ = s.scalar(
                select(ReserveSpecies).where(
                    ReserveSpecies.reserve_id == reserve.id, ReserveSpecies.taxon == names[name]
                )
            )
            if exists_ is None:
                s.add(
                    ReserveSpecies(
                        reserve_id=reserve.id,
                        taxon=names[name],
                        common_name=name,
                        source=args.source,
                    )
                )
        s.commit()
    print(f"added {len(args.name)} to {args.reserve}")


def cmd_species_list(args: argparse.Namespace) -> None:
    from vandrishti.db.models import ReserveSpecies

    with _session() as s:
        rows = s.scalars(
            select(ReserveSpecies)
            .join(Reserve, Reserve.id == ReserveSpecies.reserve_id)
            .where(Reserve.code == args.reserve)
        )
        for r in rows:
            print(f"{r.common_name}\t{r.taxon}\t{r.source or ''}")


def cmd_route(args: argparse.Namespace) -> None:
    from vandrishti.pipeline.routing import run_routing

    with _session() as s:
        _print(run_routing(s, reserve=args.reserve))


def cmd_audit_verify(args: argparse.Namespace) -> None:
    from vandrishti import audit

    with _session() as s:
        v = audit.verify(s)
    _print({"ok": v.ok, "events_checked": v.events, "first_broken_seq": v.first_broken_seq})
    if not v.ok:
        sys.exit(2)


def cmd_risk(args: argparse.Namespace) -> None:
    from vandrishti.core.config import get_settings
    from vandrishti.pipeline.risk import assess, build_events, classify_vehicles

    settings = get_settings()
    with _session() as s:
        created = build_events(s, settings, reserve=args.reserve)
        typed = 0
        if args.vehicle_types:
            from vandrishti.core.storage import LocalStorage
            from vandrishti.models.adapters.openclip_verifier import OpenClipVerifier
            from vandrishti.models.manager import ModelManager

            manager = ModelManager(max_loaded=1, device=settings.verifier_device)
            try:
                clip = manager.get(OpenClipVerifier(settings.model_cache_dir / "openclip-vit-b-16"))
                typed = classify_vehicles(
                    s, LocalStorage(settings.storage_root), clip, reserve=args.reserve, force=True
                )
            finally:
                manager.unload_all()
        _print(
            {
                "new_events": created,
                "vehicle_types_estimated": typed,
                "levels": assess(s, reserve=args.reserve),
            }
        )


def cmd_camera_sensitivity(args: argparse.Namespace) -> None:
    from vandrishti.db.models import Sensitivity

    with _session() as s:
        camera = _camera(s, args.reserve, args.code)
        camera.sensitivity = Sensitivity(args.level)
        s.commit()
        print(f"{args.code}: {camera.sensitivity.value}")


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
    cz = cam.add_parser("set-sensitivity", help="section 6 location sensitivity")
    cz.add_argument("--reserve", required=True)
    cz.add_argument("--code", required=True)
    cz.add_argument("--level", required=True, choices=["normal", "sensitive", "core"])
    cz.set_defaults(func=cmd_camera_sensitivity)

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

    qu = sub.add_parser("quality", help="5.1 quality gate on images not yet checked")
    qu.add_argument("--reserve")
    qu.add_argument("--limit", type=int)
    qu.set_defaults(func=cmd_quality)

    de = sub.add_parser("detect", help="5.2 MegaDetector V6 (MIT) + whole-body privacy blur")
    de.add_argument("--reserve")
    de.add_argument("--limit", type=int)
    de.add_argument("--device", choices=["cpu", "mps", "cuda", "auto"])
    de.set_defaults(func=cmd_detect)

    an = sub.add_parser("analyse", help="5.3-5.7: SpeciesNet, OpenCLIP, SAM 2, decision")
    an.add_argument("--reserve", required=True)
    an.add_argument("--steps", help=f"comma-separated subset of {','.join(STEPS)}")
    an.add_argument("--limit", type=int)
    an.set_defaults(func=cmd_analyse)

    sp = sub.add_parser("species").add_subparsers(dest="action", required=True)
    sa = sp.add_parser("add", help="add SpeciesNet common names to a reserve's species list")
    sa.add_argument("--reserve", required=True)
    sa.add_argument("--name", action="append", required=True, help="repeatable, e.g. --name tiger")
    sa.add_argument("--source", help="where the list comes from (e.g. a management plan)")
    sa.set_defaults(func=cmd_species_add)
    sl = sp.add_parser("list")
    sl.add_argument("--reserve", required=True)
    sl.set_defaults(func=cmd_species_list)

    ro = sub.add_parser("route", help="7: route screened images by confidence")
    ro.add_argument("--reserve")
    ro.set_defaults(func=cmd_route)

    au = sub.add_parser("audit").add_subparsers(dest="action", required=True)
    au.add_parser("verify", help="recompute the audit hash chain").set_defaults(
        func=cmd_audit_verify
    )

    rk = sub.add_parser("risk", help="6: presence events and explained risk levels")
    rk.add_argument("--reserve")
    rk.add_argument(
        "--vehicle-types", action="store_true", help="estimate vehicle types (OpenCLIP)"
    )
    rk.set_defaults(func=cmd_risk)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
