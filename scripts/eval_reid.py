"""Measure re-identification embedders on ATRW (labelled re-ID train set, 107 identities).

    uv run --project backend python scripts/eval_reid.py embed [--models ...]   # PyTorch only
    uv run --project backend python scripts/eval_reid.py search                 # FAISS only

Two steps in two processes: PyTorch and FAISS must not share one (vandrishti.reid.index).

For every labelled image, search all the others (FAISS inner product on unit vectors) and
report top-1 / top-5 accuracy and mAP under two protocols:
- naive: every other image may be a match;
- near-duplicates excluded: images of the same tiger whose 64-bit difference hashes are
  within 12 bits (connected groups; ATRW frames come from videos) are removed from that
  query's gallery, so a match must come from a visibly different frame. Video neighbours
  that differ more can still leak, so this is still optimistic.
Open set: queries whose whole identity is held out show how similar the best *wrong* tiger
looks; that sets the "possible new tiger" threshold (a person always decides).
Caveats: MegaDescriptor was most likely trained on ATRW; DINOv2 was not. ATRW is zoo footage
of Amur tigers, not Indian camera traps. Writes data/benchmarks/reid_eval.json.
"""

from __future__ import annotations

import argparse
import csv
import json
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from vandrishti.pipeline.quality import difference_hash, hamming

ROOT = Path(__file__).resolve().parents[1]
ATRW = ROOT / "data" / "samples" / "atrw"
VECTORS = ROOT / "data" / "benchmarks"
MODELS = ["megadescriptor-t-224", "dinov2-small"]
NEAR_DUP_BITS = 12


def near_duplicate_groups(files: list[str], ids: list[int]) -> list[int]:
    """Union-find over same-identity pairs whose dHash distance is small."""
    hashes = [difference_hash(Image.open(ATRW / "train" / f)) for f in files]
    parent = list(range(len(files)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    by_id: dict[int, list[int]] = defaultdict(list)
    for i, tiger in enumerate(ids):
        by_id[tiger].append(i)
    for members in by_id.values():
        for a in range(len(members)):
            for b in range(a + 1, len(members)):
                i, j = members[a], members[b]
                if hamming(hashes[i], hashes[j]) <= NEAR_DUP_BITS:
                    parent[find(i)] = find(j)
    return [find(i) for i in range(len(files))]


def rank_metrics(
    sims: np.ndarray[Any, Any],
    order: np.ndarray[Any, Any],
    ids: np.ndarray[Any, Any],
    exclude: list[set[int]],
) -> dict[str, float]:
    top1 = top5 = ap_sum = 0.0
    counted = 0
    for q in range(len(ids)):
        ranked = [g for g in order[q] if g != q and g not in exclude[q]]
        hits = np.array([ids[g] == ids[q] for g in ranked])
        if not hits.any():
            continue  # this tiger has no other usable image
        counted += 1
        top1 += hits[0]
        top5 += hits[:5].any()
        positions = np.nonzero(hits)[0]
        ap_sum += float(np.mean([(k + 1) / (p + 1) for k, p in enumerate(positions)]))
    return {
        "queries": counted,
        "top1": round(top1 / counted, 4),
        "top5": round(top5 / counted, 4),
        "mAP": round(ap_sum / counted, 4),
    }


def open_set(
    vectors: np.ndarray[Any, Any], ids: np.ndarray[Any, Any], seed: int = 0
) -> dict[str, Any]:
    """Hold out 20% of identities: best similarity to the gallery for known vs unknown tigers."""
    rng = np.random.default_rng(seed)
    unique = np.unique(ids)
    held = set(rng.choice(unique, size=len(unique) // 5, replace=False).tolist())
    gallery = np.array([i for i in range(len(ids)) if ids[i] not in held])
    from vandrishti.reid.index import VectorIndex

    index = VectorIndex(vectors.shape[1])
    index.add(vectors[gallery])
    known_best, unknown_best = [], []
    for q in range(len(ids)):
        sims, idx = index.search(vectors[q : q + 1], 2)
        cands = [(s, gallery[i]) for s, i in zip(sims[0], idx[0], strict=True) if gallery[i] != q]
        if not cands:
            continue
        (unknown_best if ids[q] in held else known_best).append(float(cands[0][0]))
    known, unknown = np.array(known_best), np.array(unknown_best)
    threshold = float(np.quantile(known, 0.05))  # 95% of known tigers score above it
    return {
        "held_out_identities": len(held),
        "known_best_similarity_median": round(float(np.median(known)), 3),
        "unknown_best_similarity_median": round(float(np.median(unknown)), 3),
        "threshold_95pct_known": round(threshold, 3),
        "unknown_above_threshold": round(float((unknown >= threshold).mean()), 3),
    }


def load_rows() -> tuple[np.ndarray[Any, Any], list[str]]:
    with (ATRW / "reid_list_train.csv").open() as f:
        rows = [(int(a), b) for a, b in csv.reader(f)]
    return np.array([r[0] for r in rows]), [r[1] for r in rows]


def embed(models: list[str], device: str) -> None:
    from vandrishti.models.adapters.reid_embedders import EMBEDDERS

    _, files = load_rows()
    for name in models:
        model = EMBEDDERS[name](ROOT / "data" / "models" / name)
        model.load(device)
        started = time.perf_counter()
        vectors = []
        for i in range(0, len(files), 32):
            crops = [Image.open(ATRW / "train" / f).convert("RGB") for f in files[i : i + 32]]
            vectors += model.predict(crops)
        seconds = time.perf_counter() - started
        VECTORS.mkdir(parents=True, exist_ok=True)
        np.save(VECTORS / f"atrw_{name}.npy", np.stack(vectors).astype(np.float32))
        (VECTORS / f"atrw_{name}.json").write_text(
            json.dumps(
                {"licence": model.licence, "seconds_per_image": round(seconds / len(files), 4)}
            )
        )
        print(name, f"{seconds / len(files):.3f} s/image")
        model.unload()


def search(models: list[str]) -> None:
    from vandrishti.reid.index import VectorIndex

    ids, files = load_rows()
    groups = near_duplicate_groups(files, ids.tolist())
    group_members: dict[int, set[int]] = defaultdict(set)
    for i, g in enumerate(groups):
        group_members[g].add(i)
    exclude_near = [group_members[groups[q]] - {q} for q in range(len(files))]
    report: dict[str, Any] = {
        "images": len(files),
        "identities": len(np.unique(ids)),
        "near_duplicate_groups": len(group_members),
        "caveats": [
            "MegaDescriptor was most likely trained on ATRW: optimistic for it.",
            "ATRW is zoo footage of Amur tigers, not Indian camera traps.",
            "Near-duplicate exclusion removes only near-identical frames; other video"
            " neighbours can leak.",
        ],
        "models": {},
    }
    for name in models:
        v = np.load(VECTORS / f"atrw_{name}.npy")
        meta = json.loads((VECTORS / f"atrw_{name}.json").read_text())
        index = VectorIndex(v.shape[1])
        index.add(v)
        sims, order = index.search(v, min(len(files), 200))
        result = {
            **meta,
            "naive": rank_metrics(sims, order, ids, [set() for _ in files]),
            "near_duplicates_excluded": rank_metrics(sims, order, ids, exclude_near),
            "open_set": open_set(v, ids),
        }
        report["models"][name] = result
        print(name, json.dumps(result))
    (VECTORS / "reid_eval.json").write_text(json.dumps(report, indent=1))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("step", choices=["embed", "search"])
    ap.add_argument("--models", nargs="+", default=MODELS)
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()
    if args.step == "embed":
        embed(args.models, args.device)
    else:
        search(args.models)


if __name__ == "__main__":
    main()
