"""One settled species label per image, the base for every count in section 10.

- A person's latest review that is not undone wins (confirm, correct, not an animal).
- Otherwise the model's decision counts only if routing auto-accepted it (section 7).
- Anything still waiting for a person (review, uncertain) counts as "unsettled", never as a
  species: a dashboard must not report what nobody has checked in the medium band.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from vandrishti.db.models import (
    Camera,
    Decision,
    Image,
    Reserve,
    Review,
    ReviewAction,
    Route,
    Routing,
)

TIGER = "mammalia;carnivora;felidae;panthera;tigris"
SETTLING = (ReviewAction.CONFIRM, ReviewAction.CORRECT, ReviewAction.NOT_ANIMAL)


@dataclass(frozen=True)
class Label:
    taxon: str | None  # None: blank / not an animal
    label: str
    source: str  # "person" | "auto"


def in_reserve(q: Any, reserve: str | None) -> Any:
    """Join Image → Camera (→ Reserve when filtering). `q` must already select Image."""
    q = q.join(Camera, Camera.id == Image.camera_id)
    if reserve:
        q = q.join(Reserve, Reserve.id == Camera.reserve_id).where(Reserve.code == reserve)
    return q


def settled_labels(session: Session, *, reserve: str | None = None) -> dict[uuid.UUID, Label]:
    labels: dict[uuid.UUID, Label] = {}
    auto = in_reserve(
        select(Image.id, Decision.taxon, Decision.label)
        .select_from(Image)
        .join(Routing, Routing.image_id == Image.id)
        .join(Decision, Decision.id == Routing.decision_id)
        .where(Routing.route == Route.AUTO_ACCEPT),
        reserve,
    )
    for image_id, taxon, label in session.execute(auto):
        labels[image_id] = Label(taxon, label, "auto")
    reviews = in_reserve(
        select(Review.image_id, Review.action, Review.human_taxon, Review.human_label)
        .select_from(Review)
        .join(Image, Image.id == Review.image_id)
        .where(Review.undone_at.is_(None), Review.action.in_(SETTLING))
        .order_by(Review.created_at),
        reserve,
    )
    for image_id, action, taxon, label in session.execute(reviews):  # newest last wins
        if action is ReviewAction.NOT_ANIMAL:
            labels[image_id] = Label(None, "blank", "person")
        else:
            labels[image_id] = Label(taxon, label or "?", "person")
    return labels
