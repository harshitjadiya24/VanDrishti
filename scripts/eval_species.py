"""Measure 5.3-5.6 against the labelled LILA sample already run through the pipeline.

    uv run --project backend python scripts/eval_species.py [--reserve LILA-TEST]

Each sample label is mapped (below) to the taxon it implies, at the label's own precision:
Caltech's "deer" means the deer family, ENA24's "White_Tailed_Deer" the species. A decision
is "correct" if its taxon lies within that taxon, "too general" if it stops above it (for
example "mammal" for a deer), and "wrong" otherwise. Reported overall and per routing band
(high >= 0.9, medium 0.6-0.9, low < 0.6), and for OpenCLIP: when it disagrees, how often is
SpeciesNet actually wrong? Caveat: SpeciesNet was very likely trained on these datasets.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from sqlalchemy import select

from vandrishti.db.models import Camera, Decision, Image, Reserve
from vandrishti.db.session import get_sessionmaker

ROOT = Path(__file__).resolve().parents[1]
GT = ROOT / "data" / "samples" / "lila" / "ground_truth.json"

M, AV = "mammalia", "aves"
# Sample label (lower case) → expected taxon prefix "class;order;family;genus;species".
EXPECTED = {
    # Caltech Camera Traps (coarse labels)
    "opossum": f"{M};didelphimorphia;didelphidae;didelphis;virginiana",
    "raccoon": f"{M};carnivora;procyonidae;procyon;lotor",
    "coyote": f"{M};carnivora;canidae;canis;latrans",
    "deer": f"{M};artiodactyla;cervidae",
    "rabbit": f"{M};lagomorpha;leporidae",
    "bobcat": f"{M};carnivora;felidae;lynx;rufus",
    "cat": f"{M};carnivora;felidae;felis;catus",
    "bird": AV,
    "dog": f"{M};carnivora;canidae;canis;familiaris",
    "squirrel": f"{M};rodentia;sciuridae",
    "rodent": f"{M};rodentia",
    "skunk": f"{M};carnivora;mephitidae",
    "fox": f"{M};carnivora;canidae",
    "lizard": "reptilia",
    "mountain_lion": f"{M};carnivora;felidae;puma;concolor",
    "badger": f"{M};carnivora;mustelidae;taxidea;taxus",
    "cow": f"{M};artiodactyla;bovidae;bos",
    "pig": f"{M};artiodactyla;suidae;sus;scrofa",
    # ENA24 (mostly species)
    "virginia opossum": f"{M};didelphimorphia;didelphidae;didelphis;virginiana",
    "american crow": f"{AV};passeriformes;corvidae;corvus;brachyrhynchos",
    "american black bear": f"{M};carnivora;ursidae;ursus;americanus",
    "chicken": f"{AV};galliformes;phasianidae;gallus",
    "domestic cat": f"{M};carnivora;felidae;felis;catus",
    "grey fox": f"{M};carnivora;canidae;urocyon;cinereoargenteus",
    "wild turkey": f"{AV};galliformes;phasianidae;meleagris;gallopavo",
    "red fox": f"{M};carnivora;canidae;vulpes;vulpes",
    "white_tailed_deer": f"{M};artiodactyla;cervidae;odocoileus;virginianus",
    "eastern fox squirrel": f"{M};rodentia;sciuridae;sciurus;niger",
    "eastern cottontail": f"{M};lagomorpha;leporidae;sylvilagus;floridanus",
    "eastern gray squirrel": f"{M};rodentia;sciuridae;sciurus;carolinensis",
    "eastern chipmunk": f"{M};rodentia;sciuridae;tamias;striatus",
    "striped skunk": f"{M};carnivora;mephitidae;mephitis;mephitis",
    "northern raccoon": f"{M};carnivora;procyonidae;procyon;lotor",
    "woodchuck": f"{M};rodentia;sciuridae;marmota;monax",
    "horse": f"{M};perissodactyla;equidae;equus",
}


def strip(taxon: str) -> list[str]:
    return [p for p in taxon.split(";") if p] if taxon else []


def judge(decided: str | None, expected: str) -> str:
    d, e = strip(decided or ""), strip(expected)
    if not d:
        return "unnamed"
    if d[: len(e)] == e:
        return "correct"
    if e[: len(d)] == d:
        return "too general"
    return "wrong"


def band(c: float) -> str:
    return "high (>=0.9)" if c >= 0.9 else "medium (0.6-0.9)" if c >= 0.6 else "low (<0.6)"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reserve", default="LILA-TEST")
    args = ap.parse_args()
    truth: dict[str, set[str]] = {}
    for r in json.loads(GT.read_text()):
        labels = {b["label"].lower() for b in r["boxes"] if b["category"] == "animal"}
        if labels:
            truth[r["file"].split("/", 1)[1]] = labels
    rows: list[dict[str, Any]] = []
    with get_sessionmaker()() as s:
        q = (
            select(Decision, Image.original_filename)
            .join(Image, Image.id == Decision.image_id)
            .join(Camera, Camera.id == Image.camera_id)
            .join(Reserve, Reserve.id == Camera.reserve_id)
            .where(Reserve.code == args.reserve)
            .order_by(Decision.created_at)
        )
        latest: dict[str, tuple[Decision, str]] = {}
        for d, name in s.execute(q):
            latest[str(d.image_id)] = (d, name)
    unmapped: Counter[str] = Counter()
    for d, name in latest.values():
        labels = truth.get(name)
        if not labels or len(labels) > 1:
            continue  # unlabelled or several species: no single right answer
        (label,) = labels
        if label not in EXPECTED:
            unmapped[label] += 1
            continue
        clip = next(
            (f for f in d.explanation.get("factors", []) if f["name"] == "model agreement"), None
        )
        rows.append(
            {
                "label": label,
                "decided": d.label,
                "verdict": judge(d.taxon, EXPECTED[label]),
                "confidence": d.confidence,
                "clip_disagrees": bool(clip and clip["factor"] is not None and clip["factor"] < 1),
            }
        )
    by_band: dict[str, Counter[str]] = defaultdict(Counter)
    for r in rows:
        by_band[band(r["confidence"])][r["verdict"]] += 1
        by_band["all"][r["verdict"]] += 1
    clip_rows = [r for r in rows if r["verdict"] in ("correct", "wrong")]
    flagged = [r for r in clip_rows if r["clip_disagrees"]]
    report = {
        "images_scored": len(rows),
        "unmapped_labels": dict(unmapped),
        "by_band": {k: dict(v) for k, v in by_band.items()},
        "clip": {
            "disagreed_on": len(flagged),
            "of_which_speciesnet_wrong": sum(r["verdict"] == "wrong" for r in flagged),
            "agreed_on": len(clip_rows) - len(flagged),
            "of_which_speciesnet_wrong_when_agreed": sum(
                r["verdict"] == "wrong" for r in clip_rows if not r["clip_disagrees"]
            ),
        },
        "wrong_examples": [
            (r["label"], r["decided"], r["confidence"]) for r in rows if r["verdict"] == "wrong"
        ][:15],
    }
    out = ROOT / "data" / "benchmarks" / "species_eval.json"
    out.write_text(json.dumps(report, indent=1))
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
