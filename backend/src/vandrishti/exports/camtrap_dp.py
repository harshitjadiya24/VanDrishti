"""Camtrap DP 1.0.2 export (TDWG standard for camera-trap data; GBIF can ingest it).

https://camtrap-dp.tdwg.org/ . A zip with datapackage.json and three CSV tables
(deployments, media, observations), columns in the order of the official table schemas.

What goes in, and what does not:
- One deployment per camera that has coordinates and at least one frame with a reliable time;
  start/end are its first/last such frame. VanDrishti does not record deployment periods
  separately, so a camera moved between sites appears as one deployment. Cameras without
  coordinates are left out (Camtrap DP requires them) and counted in the package description.
- Coordinates are rounded to 0.1 degree (about 11 km) with coordinateUncertainty 7900 m, unless
  precise locations were granted explicitly. Tiger locations are sensitive.
- Frames with people or vehicles are never exported (not their media, not their observations).
- Frames without a reliable time are left out (`timestamp` is required).
- Observations are per frame: settled labels (a person's review, or an auto-accepted model
  label), "blank", or "unclassified" while a person has not decided. Reviewer names are not
  exported. A tiger's individualID is only a code a person confirmed.
- Media files are not included (filePublic false); filePath names the stored file.
"""

from __future__ import annotations

import csv
import io
import json
import uuid
import zipfile
from datetime import UTC, datetime
from typing import Any, Literal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from vandrishti import __version__
from vandrishti.analytics.labels import settled_labels
from vandrishti.db.models import (
    Camera,
    Decision,
    Detection,
    DetectionCategory,
    Image,
    Individual,
    ReidEmbedding,
    Reserve,
    Route,
    Routing,
    ScreenOutcome,
    TimeSource,
)

VERSION = "1.0.2"
BASE = f"https://raw.githubusercontent.com/tdwg/camtrap-dp/{VERSION}"
TIMED = (TimeSource.EXIF, TimeSource.MANIFEST)
ROUNDED_UNCERTAINTY_M = 7900  # half-diagonal of a 0.1 x 0.1 degree cell at the equator
SamplingDesign = Literal[
    "simpleRandom",
    "systematicRandom",
    "clusteredRandom",
    "experimental",
    "targeted",
    "opportunistic",
]

DEPLOYMENT_FIELDS = [
    "deploymentID",
    "locationID",
    "locationName",
    "latitude",
    "longitude",
    "coordinateUncertainty",
    "deploymentStart",
    "deploymentEnd",
    "setupBy",
    "cameraID",
    "cameraModel",
    "cameraDelay",
    "cameraHeight",
    "cameraDepth",
    "cameraTilt",
    "cameraHeading",
    "detectionDistance",
    "timestampIssues",
    "baitUse",
    "featureType",
    "habitat",
    "deploymentGroups",
    "deploymentTags",
    "deploymentComments",
]
MEDIA_FIELDS = [
    "mediaID",
    "deploymentID",
    "captureMethod",
    "timestamp",
    "filePath",
    "filePublic",
    "fileName",
    "fileMediatype",
    "exifData",
    "favorite",
    "mediaComments",
]
OBSERVATION_FIELDS = [
    "observationID",
    "deploymentID",
    "mediaID",
    "eventID",
    "eventStart",
    "eventEnd",
    "observationLevel",
    "observationType",
    "cameraSetupType",
    "scientificName",
    "count",
    "lifeStage",
    "sex",
    "behavior",
    "individualID",
    "individualPositionRadius",
    "individualPositionAngle",
    "individualSpeed",
    "bboxX",
    "bboxY",
    "bboxWidth",
    "bboxHeight",
    "classificationMethod",
    "classifiedBy",
    "classificationTimestamp",
    "classificationProbability",
    "observationTags",
    "observationComments",
]
RANKS = ("class", "order", "family", "genus", "species")


class ExportError(ValueError):
    pass


def scientific_name(taxon: str) -> tuple[str, str] | None:
    """'mammalia;carnivora;felidae;panthera;tigris' → ('Panthera tigris', 'species')."""
    parts = [p.strip() for p in taxon.split(";")]
    parts += [""] * (5 - len(parts))
    if parts[4] and parts[3]:
        return f"{parts[3].capitalize()} {parts[4].lower()}", "species"
    for rank, name in reversed(list(zip(RANKS[:4], parts[:4], strict=True))):
        if name:
            return name.capitalize(), rank
    return None


def _ts(t: datetime, tz: ZoneInfo) -> str:
    return t.astimezone(tz).isoformat(timespec="seconds")


def _csv(fields: list[str], rows: list[dict[str, Any]]) -> bytes:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=fields, lineterminator="\n")
    w.writeheader()
    for r in rows:
        w.writerow(
            {k: ("true" if v is True else "false" if v is False else v) for k, v in r.items()}
        )
    return buf.getvalue().encode()


def build(
    session: Session, reserve_code: str, *, sampling_design: SamplingDesign, precise: bool = False
) -> tuple[bytes, dict[str, Any]]:
    """Return (zip bytes, summary)."""
    res = session.scalar(select(Reserve).where(Reserve.code == reserve_code))
    if res is None:
        raise ExportError(f"no reserve {reserve_code!r}")
    tz = ZoneInfo(res.timezone)
    cams = list(
        session.scalars(select(Camera).where(Camera.reserve_id == res.id).order_by(Camera.code))
    )
    images = (
        list(
            session.scalars(
                select(Image).where(
                    Image.camera_id.in_([c.id for c in cams]),
                    Image.is_corrupt.is_(False),
                    Image.time_source.in_(TIMED),
                    Image.captured_at.is_not(None),
                )
            )
        )
        if cams
        else []
    )
    by_cam: dict[uuid.UUID, list[Image]] = {}
    for img in images:
        by_cam.setdefault(img.camera_id, []).append(img)

    labels = settled_labels(session, reserve=res.code)
    confidence = dict(
        session.execute(
            select(Routing.image_id, Decision.confidence)
            .join(Decision, Decision.id == Routing.decision_id)
            .where(Routing.route == Route.AUTO_ACCEPT)
        ).all()
    )
    named = dict(
        session.execute(
            select(ReidEmbedding.image_id, Individual.code).join(
                Individual, Individual.id == ReidEmbedding.individual_id
            )
        ).all()
    )

    deployments: list[dict[str, Any]] = []
    media: list[dict[str, Any]] = []
    observations: list[dict[str, Any]] = []
    skipped = {
        "cameras_without_coordinates": 0,
        "cameras_without_timed_frames": 0,
        "people_vehicle_frames": 0,
    }
    for cam in cams:
        frames = sorted(by_cam.get(cam.id, []), key=lambda i: i.captured_at)  # type: ignore[arg-type,return-value]
        if cam.latitude is None or cam.longitude is None:
            skipped["cameras_without_coordinates"] += 1
            continue
        if not frames:
            skipped["cameras_without_timed_frames"] += 1
            continue
        lat, lon = (
            (cam.latitude, cam.longitude)
            if precise
            else (round(cam.latitude, 1), round(cam.longitude, 1))
        )
        dep_id = str(cam.id)
        deployments.append(
            {
                "deploymentID": dep_id,
                "locationID": dep_id,
                "locationName": cam.code,
                "latitude": lat,
                "longitude": lon,
                "coordinateUncertainty": None if precise else ROUNDED_UNCERTAINTY_M,
                "deploymentStart": _ts(frames[0].captured_at, tz),  # type: ignore[arg-type]
                "deploymentEnd": _ts(frames[-1].captured_at, tz),  # type: ignore[arg-type]
                "cameraID": cam.serial,
                "cameraModel": cam.model,
                "timestampIssues": False,
                "deploymentComments": "one per VanDrishti camera; start/end: first/last frame",
            }
        )
        dets = {
            d.image_id: d
            for d in session.scalars(
                select(Detection)
                .where(
                    Detection.image_id.in_([f.id for f in frames]),
                    Detection.category == DetectionCategory.ANIMAL,
                )
                .order_by(Detection.confidence)
            )
        }  # highest confidence wins (last written)
        for img in frames:
            if img.screen is ScreenOutcome.HUMAN_VEHICLE:
                skipped["people_vehicle_frames"] += 1
                continue
            ts = _ts(img.captured_at, tz)  # type: ignore[arg-type]
            ext = (img.format or "jpeg").lower()
            media.append(
                {
                    "mediaID": str(img.id),
                    "deploymentID": dep_id,
                    "captureMethod": "activityDetection",
                    "timestamp": ts,
                    "filePath": f"originals/{img.sha256[:2]}/{img.sha256}.{ext}",
                    "filePublic": False,
                    "fileMediatype": f"image/{ext}",
                }
            )
            lab = labels.get(img.id)
            obs: dict[str, Any] = {
                "observationID": f"{img.id}-1",
                "deploymentID": dep_id,
                "mediaID": str(img.id),
                "eventID": str(img.sequence_id) if img.sequence_id else None,
                "eventStart": ts,
                "eventEnd": ts,
                "observationLevel": "media",
            }
            if lab is not None and lab.taxon:
                sci = scientific_name(lab.taxon)
                det = dets.get(img.id)
                obs |= {
                    "observationType": "animal" if sci else "unknown",
                    "scientificName": sci[0] if sci else None,
                    "individualID": named.get(img.id),
                    "classificationMethod": "human" if lab.source == "person" else "machine",
                    "classifiedBy": "VanDrishti reviewer"
                    if lab.source == "person"
                    else "VanDrishti decision engine (SpeciesNet-based)",
                    "classificationProbability": None
                    if lab.source == "person"
                    else round(confidence.get(img.id, 0.0), 4) or None,
                }
                if det is not None:
                    obs |= {
                        "bboxX": round(det.x, 4),
                        "bboxY": round(det.y, 4),
                        "bboxWidth": round(det.w, 4),
                        "bboxHeight": round(det.h, 4),
                    }
            elif lab is not None:  # a person said "not an animal"
                obs |= {
                    "observationType": "blank",
                    "classificationMethod": "human",
                    "classifiedBy": "VanDrishti reviewer",
                }
            elif img.screen is ScreenOutcome.NO_OBJECT:
                obs |= {
                    "observationType": "blank",
                    "classificationMethod": "machine",
                    "classifiedBy": "MegaDetector V6 (no object above threshold)",
                }
            else:
                obs["observationType"] = "unclassified"
            observations.append(obs)

    if not deployments:
        raise ExportError("nothing to export: no camera has coordinates and reliably timed frames")
    names: dict[str, dict[str, Any]] = {}
    for o in observations:
        if o.get("scientificName") and o["scientificName"] not in names:
            names[o["scientificName"]] = {"scientificName": o["scientificName"]}
    lats = [d["latitude"] for d in deployments]
    lons = [d["longitude"] for d in deployments]
    starts = sorted(d["deploymentStart"] for d in deployments)
    ends = sorted(d["deploymentEnd"] for d in deployments)
    package = {
        "resources": [
            {
                "name": n,
                "path": f"{n}.csv",
                "profile": "tabular-data-resource",
                "format": "csv",
                "mediatype": "text/csv",
                "encoding": "utf-8",
                "schema": f"{BASE}/{n}-table-schema.json",
            }
            for n in ("deployments", "media", "observations")
        ],
        "profile": f"{BASE}/camtrap-dp-profile.json",
        "name": f"vandrishti-{res.code.lower()}",
        "id": str(uuid.uuid4()),
        "created": datetime.now(UTC).isoformat(timespec="seconds"),
        "title": f"{res.name}: camera-trap observations exported from VanDrishti",
        "description": (
            "Settled labels only (a person's review or an auto-accepted model label); frames still "
            "waiting for a person are 'unclassified'. People and vehicles are not exported. "
            f"Left out: {skipped['cameras_without_coordinates']} camera(s) without coordinates, "
            f"{skipped['cameras_without_timed_frames']} without reliably timed frames, "
            f"{skipped['people_vehicle_frames']} frame(s) with people or vehicles. "
            + ("Coordinates are exact." if precise else "Coordinates are rounded to 0.1 degree.")
        ),
        "contributors": [{"title": res.name, "role": "rightsHolder"}],
        "sources": [{"title": "VanDrishti", "version": __version__}],
        "project": {
            "title": res.name,
            "samplingDesign": sampling_design,
            "captureMethod": ["activityDetection"],
            "individualAnimals": any(o.get("individualID") for o in observations),
            "observationLevel": ["media"],
        },
        "spatial": {
            "type": "Polygon",
            "coordinates": [
                [
                    [min(lons), min(lats)],
                    [max(lons), min(lats)],
                    [max(lons), max(lats)],
                    [min(lons), max(lats)],
                    [min(lons), min(lats)],
                ]
            ],
        },
        "temporal": {"start": starts[0][:10], "end": ends[-1][:10]},
        "taxonomic": sorted(names.values(), key=lambda t: t["scientificName"]),
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("datapackage.json", json.dumps(package, indent=2))
        z.writestr("deployments.csv", _csv(DEPLOYMENT_FIELDS, deployments))
        z.writestr("media.csv", _csv(MEDIA_FIELDS, media))
        z.writestr("observations.csv", _csv(OBSERVATION_FIELDS, observations))
    summary = {
        "deployments": len(deployments),
        "media": len(media),
        "observations": len(observations),
        "taxa": len(names),
        "precise": precise,
        **skipped,
    }
    return buf.getvalue(), summary
