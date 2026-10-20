"""Measure MegaDetector V6 (MIT, compact) on the labelled LILA sample (no database needed).

    uv run --project backend python scripts/eval_detector.py [--device cpu]

Reports, at several confidence thresholds:
- image level, per class (animal, vehicle): precision and recall of "this image contains X";
- empty images: share given an animal or vehicle box (false alarms). Person boxes are
  counted separately: some Caltech frames labelled "empty" do contain people (MegaDetector
  found them; checked by eye on blurred copies), so they are not false alarms;
- box level: recall of ground-truth boxes matched by a same-class box with IoU >= 0.5;
- person boxes: there are no people in the sample, so every person box is a false alarm;
- speed (seconds per image) and peak memory.
Writes data/benchmarks/detector_eval.json. Caveat: MegaDetector was very likely trained on
these datasets, so the numbers are optimistic for new reserves.
"""

from __future__ import annotations

import argparse
import json
import resource
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

from PIL import Image

from vandrishti.models.adapters.megadetector_v6 import MegaDetectorV6MIT
from vandrishti.models.detection import Box
from vandrishti.pipeline.quality import is_infrared

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / "data" / "samples" / "lila"
THRESHOLDS = [0.1, 0.2, 0.3, 0.5, 0.7]


def iou(a: list[float], b: Box) -> float:
    ax2, ay2, bx2, by2 = a[0] + a[2], a[1] + a[3], b.x + b.w, b.y + b.h
    iw = max(0.0, min(ax2, bx2) - max(a[0], b.x))
    ih = max(0.0, min(ay2, by2) - max(a[1], b.y))
    inter = iw * ih
    union = a[2] * a[3] + b.w * b.h - inter
    return inter / union if union > 0 else 0.0


def ratio(n: int, d: int) -> float | None:
    return round(n / d, 3) if d else None


def evaluate(
    rows: list[dict[str, Any]], preds: list[list[Box]], t: float, subset: str
) -> dict[str, Any]:
    out: dict[str, Any] = {"threshold": t, "subset": subset, "images": len(rows)}
    for cls in ("animal", "vehicle"):
        tp = fp = fn = 0
        for r, p in zip(rows, preds, strict=True):
            truth = any(b["category"] == cls for b in r["boxes"])
            said = any(b.category == cls and b.confidence >= t for b in p)
            tp += truth and said
            fp += (not truth) and said
            fn += truth and not said
        out[cls] = {
            "precision": ratio(tp, tp + fp),
            "recall": ratio(tp, tp + fn),
            "tp": tp,
            "fp": fp,
            "fn": fn,
        }
        # Box level; whole-frame labels (some Caltech cars are boxed as the full image) skipped.
        matched = total = 0
        for r, p in zip(rows, preds, strict=True):
            for g in r["boxes"]:
                if g["category"] != cls or g["bbox"][2] * g["bbox"][3] > 0.95:
                    continue
                total += 1
                matched += any(
                    b.category == cls and b.confidence >= t and iou(g["bbox"], b) >= 0.5 for b in p
                )
        out[cls]["box_recall_iou50"] = ratio(matched, total)
        out[cls]["boxes"] = total
    empties = [(r, p) for r, p in zip(rows, preds, strict=True) if r["empty"]]
    out["empty_with_animal_or_vehicle_box"] = ratio(
        sum(any(b.category != "person" and b.confidence >= t for b in p) for _, p in empties),
        len(empties),
    )
    out["empty_with_person_box"] = sum(
        any(b.category == "person" and b.confidence >= t for b in p) for _, p in empties
    )
    out["empty_images"] = len(empties)
    out["person_boxes"] = sum(
        1 for p in preds for b in p if b.category == "person" and b.confidence >= t
    )
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--batch", type=int, default=8)
    args = ap.parse_args()
    rows = json.loads((SAMPLE / "ground_truth.json").read_text())
    md = MegaDetectorV6MIT(ROOT / "data" / "models" / "megadetector", min_confidence=0.05)
    md.load(args.device)
    preds: list[list[Box]] = []
    night: list[bool] = []
    started = time.perf_counter()
    for i in range(0, len(rows), args.batch):
        ims = []
        for r in rows[i : i + args.batch]:
            with Image.open(SAMPLE / r["file"]) as im:
                im.draft("RGB", (1280, 1280))
                ims.append(im.convert("RGB"))
        night += [is_infrared(im) for im in ims]
        preds += md.predict(ims)
    seconds = time.perf_counter() - started
    report: dict[str, Any] = {
        "model": f"{md.name} {md.version}",
        "device": args.device,
        "images": len(rows),
        "seconds_per_image": round(seconds / len(rows), 3),
        "peak_rss_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e6),
        "caveat": "MegaDetector was very likely trained on Caltech and ENA24: optimistic.",
        "results": [],
    }
    groups: dict[str, list[int]] = defaultdict(list)
    for i, r in enumerate(rows):
        groups["all"].append(i)
        groups[r["dataset"]].append(i)
        groups["night_ir" if night[i] else "day"].append(i)
    for name, idx in groups.items():
        sub_rows, sub_preds = [rows[i] for i in idx], [preds[i] for i in idx]
        for t in THRESHOLDS if name == "all" else [0.2]:
            report["results"].append(evaluate(sub_rows, sub_preds, t, name))
    out = ROOT / "data" / "benchmarks" / "detector_eval.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=1))
    print(
        f"{report['model']} on {args.device}: {report['seconds_per_image']} s/image,"
        f" peak {report['peak_rss_mb']} MB"
    )
    print("subset       t | animal P/R/boxR | vehicle P/R/boxR | empty: A/V box, person | person")
    for r in report["results"]:
        a, v = r["animal"], r["vehicle"]
        cells = [
            f"{r['subset']:9s} {r['threshold']:4.1f}",
            f"{a['precision']}/{a['recall']}/{a['box_recall_iou50']}",
            f"{v['precision']}/{v['recall']}/{v['box_recall_iou50']}",
            f"{r['empty_with_animal_or_vehicle_box']}, {r['empty_with_person_box']}",
            str(r["person_boxes"]),
        ]
        print(" | ".join(cells))


if __name__ == "__main__":
    main()
