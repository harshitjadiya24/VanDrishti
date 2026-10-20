"""10.5 re-identification: embed tiger crops, propose matches, let people decide, report.

Two steps in two processes (PyTorch and FAISS must not share one, see `reid.index`):
- `embed` (PyTorch): every tiger crop → a unit vector in `reid_embedding`;
- `match` (FAISS): compare crops nobody has identified with the tigers people already named;
  similarity ≥ threshold → "possible match", otherwise "possibly a new tiger".
Nothing becomes an identity until a person decides (`decide`), and every decision is
audited and can be undone. The model never names a tiger and never creates one.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import numpy as np
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from vandrishti import audit
from vandrishti.analytics.labels import TIGER, in_reserve, settled_labels
from vandrishti.core.config import Settings
from vandrishti.db.models import (
    Camera,
    Detection,
    DetectionCategory,
    Image,
    Individual,
    ProposalKind,
    ProposalState,
    ReidEmbedding,
    ReidProposal,
    Reserve,
    Segmentation,
    TimeSource,
)

TIMED = (TimeSource.EXIF, TimeSource.MANIFEST)

PAD = 0.05


class ReidError(ValueError):
    pass


def to_bytes(v: np.ndarray[Any, Any]) -> bytes:
    return np.asarray(v, dtype="<f4").tobytes()


def from_bytes(b: bytes) -> np.ndarray[Any, Any]:
    return np.frombuffer(b, dtype="<f4")


def tiger_images(session: Session, *, reserve: str | None = None) -> list[Image]:
    """Images settled as tiger: a person said so, or routing auto-accepted the model's call."""
    ids = [i for i, lab in settled_labels(session, reserve=reserve).items() if lab.taxon == TIGER]
    return list(session.scalars(select(Image).where(Image.id.in_(ids)))) if ids else []


def crop_box(session: Session, det: Detection) -> list[float]:
    """The SAM outline's tight box when there is one (a cleaner crop), else the detector box."""
    seg = session.scalar(select(Segmentation).where(Segmentation.detection_id == det.id))
    x, y, w, h = seg.mask_box if seg and seg.mask_box else [det.x, det.y, det.w, det.h]
    x0, y0 = max(0.0, x - w * PAD), max(0.0, y - h * PAD)
    return [
        round(x0, 5),
        round(y0, 5),
        round(min(1.0, x + w * (1 + PAD)) - x0, 5),
        round(min(1.0, y + h * (1 + PAD)) - y0, 5),
    ]


def embed(
    session: Session,
    storage: Any,
    settings: Settings,
    model: Any,
    *,
    reserve: str | None = None,
    batch: int = 16,
) -> int:
    """PyTorch step: one embedding per tiger image (its best animal box). `model` is loaded."""
    from PIL import Image as PILImage

    todo: list[tuple[Image, Detection]] = []
    for img in tiger_images(session, reserve=reserve):
        det = session.scalar(
            select(Detection)
            .where(
                Detection.image_id == img.id,
                Detection.config_hash == img.screened_with,
                Detection.category == DetectionCategory.ANIMAL,
            )
            .order_by(Detection.confidence.desc())
        )
        if det is None:
            continue
        done = session.scalar(
            select(ReidEmbedding.id).where(
                ReidEmbedding.detection_id == det.id,
                ReidEmbedding.model_name == model.name,
                ReidEmbedding.model_version == model.version,
            )
        )
        if done is None:
            todo.append((img, det))
    for start in range(0, len(todo), batch):
        chunk = todo[start : start + batch]
        crops, boxes = [], []
        for img, det in chunk:
            box = crop_box(session, det)
            with storage.open(img.storage_key) as f, PILImage.open(f) as im:
                im.draft("RGB", (1024, 1024))
                pic = im.convert("RGB")
            w, h = pic.size
            crops.append(
                pic.crop(
                    (
                        int(box[0] * w),
                        int(box[1] * h),
                        int((box[0] + box[2]) * w),
                        int((box[1] + box[3]) * h),
                    )
                )
            )
            boxes.append(box)
        for (img, det), box, vec in zip(chunk, boxes, model.predict(crops), strict=True):
            session.add(
                ReidEmbedding(
                    image_id=img.id,
                    detection_id=det.id,
                    model_name=model.name,
                    model_version=model.version,
                    dim=len(vec),
                    vector=to_bytes(vec),
                    crop_box=box,
                )
            )
        session.commit()
    return len(todo)


def _embeddings(session: Session, model_name: str, reserve: str | None) -> list[ReidEmbedding]:
    q = (
        select(ReidEmbedding)
        .join(Image, Image.id == ReidEmbedding.image_id)
        .where(ReidEmbedding.model_name == model_name)
    )
    return list(session.scalars(in_reserve(q, reserve)))


def match(
    session: Session, *, model_name: str, threshold: float, reserve: str | None = None, top: int = 5
) -> dict[str, int]:
    """FAISS step: (re)propose for every crop nobody has identified yet."""
    from vandrishti.reid.index import VectorIndex

    rows = _embeddings(session, model_name, reserve)
    gallery = [e for e in rows if e.individual_id is not None]
    open_ = [e for e in rows if e.individual_id is None]
    codes = {i.id: i.code for i in session.scalars(select(Individual))}
    index = None
    if gallery:
        index = VectorIndex(gallery[0].dim)
        index.add(np.stack([from_bytes(e.vector) for e in gallery]))
    counts: dict[str, int] = defaultdict(int)
    for e in open_:
        proposal = session.scalar(select(ReidProposal).where(ReidProposal.embedding_id == e.id))
        if proposal is not None and proposal.state is ProposalState.DONE:
            continue  # a person decided (e.g. "not a tiger"): never reopened by the model
        candidates: list[dict[str, Any]] = []
        if index is not None:
            sims, idx = index.search(from_bytes(e.vector)[None, :], min(len(gallery), 50))
            best: dict[uuid.UUID, tuple[float, uuid.UUID]] = {}
            for s, i in zip(sims[0], idx[0], strict=True):
                g = gallery[int(i)]
                if g.individual_id is None:
                    continue
                if g.individual_id not in best or s > best[g.individual_id][0]:
                    best[g.individual_id] = (float(s), g.id)
            for ind, (s, example) in sorted(best.items(), key=lambda kv: -kv[1][0])[:top]:
                candidates.append(
                    {
                        "individual_id": str(ind),
                        "code": codes.get(ind),
                        "similarity": round(s, 4),
                        "example_embedding_id": str(example),
                    }
                )
        best_sim = candidates[0]["similarity"] if candidates else None
        kind = (
            ProposalKind.POSSIBLE_MATCH
            if best_sim is not None and best_sim >= threshold
            else ProposalKind.POSSIBLE_NEW
        )
        if proposal is None:
            proposal = ReidProposal(embedding_id=e.id, threshold=threshold)
            session.add(proposal)
        proposal.kind, proposal.candidates, proposal.best_similarity = kind, candidates, best_sim
        proposal.threshold, proposal.state = threshold, ProposalState.OPEN
        counts[kind.value] += 1
    session.commit()
    return dict(counts)


@dataclass(frozen=True)
class DecisionInput:
    proposal_id: Any
    action: str  # same | new | not_tiger
    reviewer: str
    individual_id: Any = None  # for "same"
    code: str | None = None  # for "new"
    name: str | None = None


def decide(session: Session, data: DecisionInput) -> ReidProposal:
    proposal = session.get(ReidProposal, data.proposal_id)
    if proposal is None:
        raise ReidError("no such proposal")
    if proposal.state is ProposalState.DONE:
        raise ReidError("already decided")
    emb = session.get(ReidEmbedding, proposal.embedding_id)
    if emb is None:
        raise ReidError("the crop for this proposal is gone")
    camera = session.scalar(
        select(Camera).join(Image, Image.camera_id == Camera.id).where(Image.id == emb.image_id)
    )
    if camera is None:
        raise ReidError("the image for this proposal has no camera")
    if data.action == "same":
        ind = session.get(Individual, data.individual_id)
        if ind is None or ind.reserve_id != camera.reserve_id:
            raise ReidError("choose a tiger from this reserve")
    elif data.action == "new":
        code = (data.code or "").strip()
        if not code:
            raise ReidError("a new tiger needs a code, e.g. T-12")
        if session.scalar(
            select(Individual).where(
                Individual.reserve_id == camera.reserve_id, Individual.code == code
            )
        ):
            raise ReidError(f"{code} already exists in this reserve")
        ind = Individual(
            reserve_id=camera.reserve_id,
            code=code,
            name=data.name or None,
            created_by=data.reviewer,
        )
        session.add(ind)
        session.flush()
    elif data.action == "not_tiger":
        ind = None
    else:
        raise ReidError("action must be same, new or not_tiger")
    now = datetime.now(UTC)
    if ind is not None:
        emb.individual_id, emb.assigned_by, emb.assigned_at = ind.id, data.reviewer, now
    proposal.state, proposal.outcome = ProposalState.DONE, data.action
    proposal.decided_by, proposal.decided_at = data.reviewer, now
    audit.append(
        session,
        actor=f"reviewer:{data.reviewer}",
        action=f"identity_{data.action}",
        entity="reid_proposal",
        entity_id=str(proposal.id),
        payload={
            "image": str(emb.image_id),
            "individual": ind.code if ind else None,
            "model_best": proposal.candidates[0]["code"] if proposal.candidates else None,
            "best_similarity": proposal.best_similarity,
        },
    )
    session.commit()
    return proposal


def undo(session: Session, proposal_id: Any, reviewer: str) -> ReidProposal:
    proposal = session.get(ReidProposal, proposal_id)
    if proposal is None or proposal.state is not ProposalState.DONE:
        raise ReidError("nothing to undo")
    emb = session.get(ReidEmbedding, proposal.embedding_id)
    if emb is None:
        raise ReidError("the crop for this proposal is gone")
    previous = emb.individual_id
    emb.individual_id = emb.assigned_by = emb.assigned_at = None
    proposal.state, proposal.outcome, proposal.decided_by, proposal.decided_at = (
        ProposalState.OPEN,
        None,
        None,
        None,
    )
    audit.append(
        session,
        actor=f"reviewer:{reviewer}",
        action="identity_undo",
        entity="reid_proposal",
        entity_id=str(proposal.id),
        payload={"image": str(emb.image_id), "individual": str(previous) if previous else None},
    )
    session.commit()
    return proposal


def individuals(session: Session, *, reserve: str | None = None) -> list[dict[str, Any]]:
    """Each named tiger: sightings, cameras, first and last seen (person-confirmed only).
    First/last seen use only EXIF or manifest times, never a file's modification date."""
    timed = case((Image.time_source.in_(TIMED), Image.captured_at))
    q = (
        select(
            Individual,
            func.count(ReidEmbedding.id),
            func.count(func.distinct(Image.camera_id)),
            func.min(timed),
            func.max(timed),
        )
        .join(ReidEmbedding, ReidEmbedding.individual_id == Individual.id, isouter=True)
        .join(Image, Image.id == ReidEmbedding.image_id, isouter=True)
        .join(Reserve, Reserve.id == Individual.reserve_id)
        .group_by(Individual.id)
        .order_by(Individual.code)
    )
    if reserve:
        q = q.where(Reserve.code == reserve)
    return [
        {
            "id": str(i.id),
            "code": i.code,
            "name": i.name,
            "sightings": n,
            "cameras": cams,
            "first_seen": first,
            "last_seen": last,
            "created_by": i.created_by,
        }
        for i, n, cams, first, last in session.execute(q)
    ]


def similar_individuals(
    session: Session, *, model_name: str, threshold: float, reserve: str | None = None
) -> list[dict[str, Any]]:
    """Pairs of named tigers whose average embeddings are alike: possibly one tiger named twice."""
    from vandrishti.reid.index import VectorIndex

    by_ind: dict[uuid.UUID, list[np.ndarray[Any, Any]]] = defaultdict(list)
    for e in _embeddings(session, model_name, reserve):
        if e.individual_id is not None:
            by_ind[e.individual_id].append(from_bytes(e.vector))
    if len(by_ind) < 2:
        return []
    ids = list(by_ind)
    cents = np.stack([np.mean(by_ind[i], axis=0) for i in ids])
    cents /= np.linalg.norm(cents, axis=1, keepdims=True)
    index = VectorIndex(cents.shape[1])
    index.add(cents)
    sims, idx = index.search(cents, min(len(ids), 6))
    codes = {
        i.id: i.code for i in session.scalars(select(Individual).where(Individual.id.in_(ids)))
    }
    pairs: dict[tuple[str, str], float] = {}
    for a, (row_s, row_i) in enumerate(zip(sims, idx, strict=True)):
        for s, b in zip(row_s, row_i, strict=True):
            if int(b) == a or s < threshold:
                continue
            x, y = sorted((codes[ids[a]], codes[ids[int(b)]]))
            pairs[(x, y)] = max(pairs.get((x, y), 0.0), float(s))
    return [
        {"a": a, "b": b, "similarity": round(s, 4)}
        for (a, b), s in sorted(pairs.items(), key=lambda kv: -kv[1])
    ]


def has_proposal_queue(session: Session, reserve: str | None) -> Any:
    q = (
        select(func.count())
        .select_from(ReidProposal)
        .join(ReidEmbedding, ReidEmbedding.id == ReidProposal.embedding_id)
        .join(Image, Image.id == ReidEmbedding.image_id)
        .where(ReidProposal.state == ProposalState.OPEN)
    )
    return session.scalar(in_reserve(q, reserve))


__all__ = [
    "DecisionInput",
    "ReidError",
    "decide",
    "embed",
    "individuals",
    "match",
    "similar_individuals",
    "tiger_images",
    "undo",
]
