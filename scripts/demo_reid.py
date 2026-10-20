"""End-to-end re-ID check on an ATRW subset, using ATRW's labels in place of a person.

    uv run --project backend python scripts/demo_reid.py prepare      # copy a subset
    (then: reserve create ATRW-DEMO, camera add, ingest, quality, detect, analyse, route,
     reid embed: see docs/EVALUATION.md "Re-identification")
    uv run --project backend python scripts/demo_reid.py enroll       # name half the tigers
    uv run --project backend vandrishti reid match --reserve ATRW-DEMO
    uv run --project backend python scripts/demo_reid.py report       # score the proposals

`enroll` decides proposals as reviewer "atrw-truth" (ATRW's own labels), so the audit trail
says plainly that no person made these calls. For enrolled tigers it names the first
ENROLL_PER_TIGER sightings; the rest of their sightings and every sighting of the other half
are left for `match`. `report` checks the proposals against the labels:
- a known tiger should be "possible match" with the right tiger first;
- an unknown tiger should be "possibly new".
Caveats: ATRW crops come from zoo videos (near-identical frames inflate scores), and
MegaDescriptor was most likely trained on ATRW. This tests the plumbing and the thresholds,
not field accuracy in an Indian reserve.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import shutil
from collections import defaultdict
from pathlib import Path

from sqlalchemy import select

from vandrishti.db.models import (
    Image,
    Individual,
    ProposalKind,
    ProposalState,
    ReidEmbedding,
    ReidProposal,
)
from vandrishti.db.session import get_sessionmaker
from vandrishti.reid import service

ROOT = Path(__file__).resolve().parents[1]
ATRW = ROOT / "data" / "samples" / "atrw"
OUT = ROOT / "data" / "samples" / "atrw_demo"
RESERVE = "ATRW-DEMO"
TIGERS, PER_TIGER, ENROLL_PER_TIGER = 30, 10, 3
REVIEWER = "atrw-truth"


def prepare() -> None:
    with (ATRW / "reid_list_train.csv").open() as f:
        rows = [(int(a), b) for a, b in csv.reader(f)]
    by_id: dict[int, list[str]] = defaultdict(list)
    for tiger, name in rows:
        by_id[tiger].append(name)
    rng = random.Random(0)  # noqa: S311 (a reproducible sample, not security)
    eligible = sorted(t for t, files in by_id.items() if len(files) >= PER_TIGER)
    chosen = rng.sample(eligible, TIGERS)
    (OUT / "images").mkdir(parents=True, exist_ok=True)
    truth: dict[str, int] = {}
    for tiger in chosen:
        for name in rng.sample(sorted(by_id[tiger]), PER_TIGER):
            shutil.copy2(ATRW / "train" / name, OUT / "images" / name)
            truth[name] = tiger
    enrolled = sorted(rng.sample(chosen, TIGERS // 2))
    (OUT / "truth.json").write_text(json.dumps({"files": truth, "enrolled": enrolled}))
    print(f"{len(truth)} images of {TIGERS} tigers; {len(enrolled)} to be enrolled")


def _truth() -> tuple[dict[str, int], set[int]]:
    t = json.loads((OUT / "truth.json").read_text())
    return t["files"], set(t["enrolled"])


def _rows(session: object) -> list[tuple[ReidProposal, ReidEmbedding, Image]]:
    return list(
        session.execute(  # type: ignore[attr-defined]
            select(ReidProposal, ReidEmbedding, Image)
            .join(ReidEmbedding, ReidEmbedding.id == ReidProposal.embedding_id)
            .join(Image, Image.id == ReidEmbedding.image_id)
            .order_by(Image.original_filename)
        ).all()
    )


def enroll() -> None:
    files, enrolled = _truth()
    named: dict[int, str] = {}
    done: dict[int, int] = defaultdict(int)
    with get_sessionmaker()() as s:
        for p, _, img in _rows(s):
            tiger = files.get(img.original_filename)
            if tiger not in enrolled or p.state is ProposalState.DONE:
                continue
            if done[tiger] >= ENROLL_PER_TIGER:
                continue
            if tiger not in named:
                code = f"ATRW-{tiger:03d}"
                service.decide(s, service.DecisionInput(p.id, "new", REVIEWER, code=code))
                named[tiger] = code
            else:
                ind = s.scalar(select(Individual).where(Individual.code == named[tiger]))
                service.decide(
                    s, service.DecisionInput(p.id, "same", REVIEWER, ind.id if ind else None)
                )
            done[tiger] += 1
    print(f"named {len(named)} tigers from {sum(done.values())} sightings as {REVIEWER!r}")


def report() -> None:
    files, enrolled = _truth()
    counts: dict[str, int] = defaultdict(int)
    for p, _, img in _rows(get_sessionmaker()()):
        if p.state is not ProposalState.OPEN:
            continue
        tiger = files.get(img.original_filename)
        known = tiger in enrolled
        top = p.candidates[0]["code"] if p.candidates else None
        if known:
            counts["known"] += 1
            counts["known_flagged_match"] += p.kind is ProposalKind.POSSIBLE_MATCH
            counts["known_right_first"] += top == f"ATRW-{tiger:03d}"
            counts["known_right_in_top5"] += f"ATRW-{tiger:03d}" in [
                c["code"] for c in p.candidates
            ]
        else:
            counts["unknown"] += 1
            counts["unknown_flagged_new"] += p.kind is ProposalKind.POSSIBLE_NEW
    k, u = counts["known"] or 1, counts["unknown"] or 1
    print(
        json.dumps(
            {
                **counts,
                "known_match_rate": round(counts["known_flagged_match"] / k, 3),
                "known_top1": round(counts["known_right_first"] / k, 3),
                "known_top5": round(counts["known_right_in_top5"] / k, 3),
                "unknown_new_rate": round(counts["unknown_flagged_new"] / u, 3),
            },
            indent=1,
        )
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("step", choices=["prepare", "enroll", "report"])
    {"prepare": prepare, "enroll": enroll, "report": report}[ap.parse_args().step]()


if __name__ == "__main__":
    main()
