"""Section 10.5 over HTTP: identity proposals for a person to decide, and named tigers.

The model only proposes. Creating a tiger or assigning a sighting is a person's action,
audited and undoable. This process uses FAISS and must never import PyTorch.
"""

from __future__ import annotations

import io
import uuid
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Response
from PIL import Image as PILImage
from pydantic import BaseModel, Field
from sqlalchemy import select

from vandrishti.api.deps import DB, Config, Storage, Writer
from vandrishti.db.models import (
    Camera,
    Image,
    ProposalState,
    ReidEmbedding,
    ReidProposal,
    Reserve,
)
from vandrishti.reid import service
from vandrishti.reid.service import TIMED

router = APIRouter(tags=["identity"])


class ProposalOut(BaseModel):
    id: uuid.UUID
    kind: str
    state: str
    image_id: uuid.UUID
    embedding_id: uuid.UUID
    camera: str
    reserve: str
    timezone: str
    captured_at: datetime | None
    best_similarity: float | None
    threshold: float
    candidates: list[dict[str, Any]]
    outcome: str | None


class DecideIn(BaseModel):
    action: Literal["same", "new", "not_tiger"]
    reviewer: str = Field(min_length=1, max_length=100)
    individual_id: uuid.UUID | None = None
    code: str | None = Field(default=None, max_length=32)
    name: str | None = Field(default=None, max_length=100)


class UndoIn(BaseModel):
    reviewer: str = Field(min_length=1, max_length=100)


def _when(img: Image) -> datetime | None:
    """Capture time only when it came from the camera or a manifest, never a file date."""
    return img.captured_at if img.time_source in TIMED else None


def _proposal_out(session: Any, p: ReidProposal) -> ProposalOut:
    emb, img, cam, res = session.execute(
        select(ReidEmbedding, Image, Camera, Reserve)
        .join(Image, Image.id == ReidEmbedding.image_id)
        .join(Camera, Camera.id == Image.camera_id)
        .join(Reserve, Reserve.id == Camera.reserve_id)
        .where(ReidEmbedding.id == p.embedding_id)
    ).one()
    return ProposalOut(
        id=p.id,
        kind=p.kind.value,
        state=p.state.value,
        image_id=img.id,
        embedding_id=emb.id,
        camera=cam.code,
        reserve=res.code,
        timezone=res.timezone,
        captured_at=_when(img),
        best_similarity=p.best_similarity,
        threshold=p.threshold,
        candidates=p.candidates,
        outcome=p.outcome,
    )


@router.get("/identity/proposals")
def proposals(
    session: DB,
    reserve: str | None = None,
    state: Literal["open", "done"] = "open",
    limit: int = 100,
) -> list[ProposalOut]:
    q = (
        select(ReidProposal)
        .join(ReidEmbedding, ReidEmbedding.id == ReidProposal.embedding_id)
        .join(Image, Image.id == ReidEmbedding.image_id)
        .join(Camera, Camera.id == Image.camera_id)
        .join(Reserve, Reserve.id == Camera.reserve_id)
        .where(ReidProposal.state == ProposalState(state))
        # Likely matches first (quick to confirm), most similar first.
        .order_by(ReidProposal.kind, ReidProposal.best_similarity.desc().nulls_last())
        .limit(min(max(limit, 1), 500))
    )
    if reserve:
        q = q.where(Reserve.code == reserve)
    return [_proposal_out(session, p) for p in session.scalars(q)]


@router.post("/identity/proposals/{proposal_id}/decide", dependencies=[Writer])
def decide(proposal_id: uuid.UUID, body: DecideIn, session: DB) -> ProposalOut:
    try:
        p = service.decide(
            session,
            service.DecisionInput(
                proposal_id=proposal_id,
                action=body.action,
                reviewer=body.reviewer.strip(),
                individual_id=body.individual_id,
                code=body.code,
                name=body.name,
            ),
        )
    except service.ReidError as e:
        raise HTTPException(409, str(e)) from e
    return _proposal_out(session, p)


@router.post("/identity/proposals/{proposal_id}/undo", dependencies=[Writer])
def undo(proposal_id: uuid.UUID, body: UndoIn, session: DB) -> ProposalOut:
    try:
        p = service.undo(session, proposal_id, body.reviewer.strip())
    except service.ReidError as e:
        raise HTTPException(409, str(e)) from e
    return _proposal_out(session, p)


@router.get("/identity/embeddings/{embedding_id}/crop")
def crop(embedding_id: uuid.UUID, session: DB, storage: Storage) -> Response:
    """The tiger crop, cut from the display copy (already blurred where people were)."""
    row = session.execute(
        select(ReidEmbedding.crop_box, Image.display_key)
        .join(Image, Image.id == ReidEmbedding.image_id)
        .where(ReidEmbedding.id == embedding_id)
    ).first()
    if row is None or row[1] is None:
        raise HTTPException(404, "no such crop")
    box, key = row[0], str(row[1])
    with PILImage.open(storage.path(key)) as im:
        w, h = im.size
        x, y, bw, bh = box
        part = im.convert("RGB").crop(
            (int(x * w), int(y * h), int((x + bw) * w), int((y + bh) * h))
        )
        part.thumbnail((640, 640))
        buf = io.BytesIO()
        part.save(buf, "JPEG", quality=85)
    return Response(
        buf.getvalue(), media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"}
    )


@router.get("/identity/individuals")
def individuals(session: DB, reserve: str | None = None) -> list[dict[str, Any]]:
    return service.individuals(session, reserve=reserve)


@router.get("/identity/individuals/{individual_id}/sightings")
def sightings(individual_id: uuid.UUID, session: DB) -> list[dict[str, Any]]:
    rows = session.execute(
        select(ReidEmbedding, Image, Camera)
        .join(Image, Image.id == ReidEmbedding.image_id)
        .join(Camera, Camera.id == Image.camera_id)
        .where(ReidEmbedding.individual_id == individual_id)
        .order_by(Image.captured_at.desc().nulls_last())
    )
    return [
        {
            "embedding_id": str(e.id),
            "image_id": str(i.id),
            "camera": c.code,
            "captured_at": _when(i),
            "assigned_by": e.assigned_by,
            "assigned_at": e.assigned_at,
        }
        for e, i, c in rows
    ]


@router.get("/identity/similar")
def similar(session: DB, settings: Config, reserve: str | None = None) -> list[dict[str, Any]]:
    """Named tigers that look alike: maybe one tiger named twice. A person checks."""
    return service.similar_individuals(
        session,
        model_name=settings.reid_model,
        threshold=settings.reid_match_threshold,
        reserve=reserve,
    )
