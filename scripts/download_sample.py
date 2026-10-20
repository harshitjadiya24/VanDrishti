"""Build a small, labelled camera-trap sample from LILA BC for testing sections 5.1-5.2.

    uv run --project backend python scripts/download_sample.py [--seed 42]

Takes, with a fixed seed and at most a few images per camera location:
- Caltech Camera Traps (bounding boxes, 2048x1494, many night IR): images with cars and
  images with animals from the box file; empty images from the image-level labels (the
  box file's few "empty" entries all carry drawn boxes, and inspected ones showed animals);
- ENA24-detection (bounding boxes, 1920x1080): images with animals and with vehicles.
Writes data/samples/lila/<dataset>/<file> plus ground_truth.json (boxes normalised to
0-1 as x, y, w, h; category "animal" or "vehicle") and SAMPLE_INFO.json.

Public LILA datasets remove images of people for privacy, so person detection cannot be
measured on this sample. Both datasets were very likely part of MegaDetector's training
data: numbers measured on them are optimistic.
"""

from __future__ import annotations

import argparse
import io
import json
import random
import urllib.request
import zipfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "samples" / "lila"
META = ROOT / "data" / "samples" / "meta"

SOURCES = {
    "cct": {
        "meta_url": "https://storage.googleapis.com/public-datasets-lila/caltechcameratraps/labels/caltech_bboxes_20200316.json",
        "meta_file": "caltech_bboxes.json",
        "image_base": "https://storage.googleapis.com/public-datasets-lila/caltech-unzipped/cct_images/",
        "vehicle": {"car"},
        "empty": {"empty"},
        "licence": "CDLA-Permissive-1.0",
        "citation": (
            "Beery, Van Horn, Perona. Recognition in Terra Incognita. ECCV 2018."
            " Caltech Camera Traps, LILA BC."
        ),
    },
    "ena24": {
        "meta_url": "https://storage.googleapis.com/public-datasets-lila/ena24/ena24_public.json",
        "meta_file": "ena24_public.json",
        "image_base": "https://storage.googleapis.com/public-datasets-lila/ena24/images/",
        "vehicle": {"Vehicle"},
        "empty": set(),
        "licence": "CDLA-Permissive-1.0",
        "citation": (
            "Yousif, Kays, He. Dynamic Programming Selection of Object Proposals for"
            " Sequence-Level Animal Species Classification in the Wild. IEEE TCSVT 2019."
            " ENA24-detection, LILA BC."
        ),
    },
}
# (dataset, kind, how many)
PLAN = [
    ("cct", "vehicle", 70),
    ("cct", "animal", 70),
    ("cct", "empty", 60),
    ("ena24", "animal", 60),
    ("ena24", "vehicle", 30),
]
CCT_IMAGE_LABELS = "https://storage.googleapis.com/public-datasets-lila/caltechcameratraps/labels/caltech_camera_traps.json.zip"
PER_LOCATION = 4
# Cars are concentrated at a few Caltech cameras; a looser cap keeps enough of them.
PER_LOCATION_BY_KIND = {"vehicle": 15}


def load_meta(name: str) -> dict[str, Any]:
    src = SOURCES[name]
    path = META / src["meta_file"]
    if not path.exists():
        META.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(src["meta_url"], path)  # noqa: S310 (fixed https URL)
    return json.loads(path.read_text())


def records(name: str, meta: dict[str, Any]) -> list[dict[str, Any]]:
    src = SOURCES[name]
    cats = {c["id"]: c["name"] for c in meta["categories"]}
    anns: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for a in meta["annotations"]:
        anns[str(a["image_id"])].append(a)
    out = []
    for im in meta["images"]:
        names = {cats[a["category_id"]] for a in anns.get(str(im["id"]), [])}
        if not names:
            continue  # unlabelled: unknown content, unusable as ground truth
        empty = names <= src["empty"]
        boxes = []
        if not empty:
            for a in anns[str(im["id"])]:
                label = cats[a["category_id"]]
                if label in src["empty"] or "bbox" not in a:
                    continue
                x, y, w, h = a["bbox"]
                boxes.append(
                    {
                        "category": "vehicle" if label in src["vehicle"] else "animal",
                        "label": label,
                        "bbox": [
                            round(x / im["width"], 5),
                            round(y / im["height"], 5),
                            round(w / im["width"], 5),
                            round(h / im["height"], 5),
                        ],
                    }
                )
        kinds = {b["category"] for b in boxes}
        out.append(
            {
                "dataset": name,
                "file": f"{name}/{im['file_name']}",
                "url": src["image_base"] + im["file_name"],
                "location": str(im.get("location", "")) or None,
                "datetime": im.get("date_captured"),
                "width": im["width"],
                "height": im["height"],
                "empty": empty,
                "kind": "empty" if empty else ("vehicle" if "vehicle" in kinds else "animal"),
                "boxes": boxes,
            }
        )
    return out


def cct_true_empties(boxed_ids: set[str]) -> list[dict[str, Any]]:
    """Caltech images whose image-level label is only "empty" and that have no drawn box."""
    path = META / "cct_images.json.zip"
    if not path.exists():
        urllib.request.urlretrieve(CCT_IMAGE_LABELS, path)
    with zipfile.ZipFile(path) as z:
        name = next(n for n in z.namelist() if n.endswith(".json"))
        meta = json.load(io.TextIOWrapper(z.open(name), encoding="utf-8"))
    cats = {c["id"]: c["name"] for c in meta["categories"]}
    labels: dict[str, set[str]] = defaultdict(set)
    for a in meta["annotations"]:
        labels[str(a["image_id"])].add(cats[a["category_id"]])
    out = []
    for im in meta["images"]:
        if labels.get(str(im["id"])) != {"empty"} or str(im["id"]) in boxed_ids:
            continue
        out.append(
            {
                "dataset": "cct",
                "file": f"cct/{im['file_name']}",
                "url": SOURCES["cct"]["image_base"] + im["file_name"],
                "location": str(im.get("location", "")) or None,
                "datetime": im.get("date_captured"),
                "width": im["width"],
                "height": im["height"],
                "empty": True,
                "kind": "empty",
                "boxes": [],
            }
        )
    return out


def pick(
    pool: list[dict[str, Any]], n: int, rng: random.Random, cap: int = PER_LOCATION
) -> list[dict[str, Any]]:
    """n records, at most `cap` per camera location, in random order."""
    rng.shuffle(pool)
    taken: dict[str | None, int] = defaultdict(int)
    out = []
    for r in pool:
        loc = r["location"]
        if loc is not None and taken[loc] >= cap:
            continue
        taken[loc] += 1
        out.append(r)
        if len(out) == n:
            break
    return out


def download(r: dict[str, Any]) -> str:
    dst = OUT / r["file"]
    if dst.exists() and dst.stat().st_size > 0:
        return "cached"
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".part")
    urllib.request.urlretrieve(r["url"], tmp)  # noqa: S310 (fixed https base URL)
    tmp.replace(dst)
    return "ok"


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()
    rng = random.Random(args.seed)  # noqa: S311 (reproducible sampling, not crypto)
    chosen: list[dict[str, Any]] = []
    for name in ("cct", "ena24"):
        meta = load_meta(name)
        recs = [r for r in records(name, meta) if r["kind"] != "empty"]
        if name == "cct":
            recs += cct_true_empties({str(im["id"]) for im in meta["images"]})
        for ds, kind, n in PLAN:
            if ds == name:
                cap = PER_LOCATION_BY_KIND.get(kind, PER_LOCATION)
                chosen += pick([r for r in recs if r["kind"] == kind], n, rng, cap)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(download, chosen))
    for r in chosen:
        r.pop("url")
    (OUT / "ground_truth.json").write_text(json.dumps(chosen, indent=1))
    keep = {OUT / r["file"] for r in chosen}
    for old in OUT.glob("*/*.jpg"):  # images from an earlier sample that are no longer used
        if old not in keep:
            old.unlink()
    info = {
        "seed": args.seed,
        "images": len(chosen),
        "by_kind": {k: sum(r["kind"] == k for r in chosen) for k in ("animal", "vehicle", "empty")},
        "bytes": sum((OUT / r["file"]).stat().st_size for r in chosen),
        "sources": {
            k: {"licence": v["licence"], "citation": v["citation"]} for k, v in SOURCES.items()
        },
        "caveats": [
            "People are not labelled (LILA removes images of people), so person recall is"
            " unmeasured; yet some Caltech frames labelled empty do show people (found by"
            " MegaDetector).",
            "MegaDetector was very likely trained on these datasets: numbers here are optimistic.",
        ],
    }
    (OUT / "SAMPLE_INFO.json").write_text(json.dumps(info, indent=1))
    print(
        json.dumps(
            {**info, "downloaded": results.count("ok"), "cached": results.count("cached")}, indent=1
        )
    )


if __name__ == "__main__":
    main()
