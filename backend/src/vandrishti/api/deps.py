"""Shared API dependencies: database, settings, storage, the signed-in user and their scope.

Every console route sits behind `authenticated` (added per router in `app.py`): it reads the
session cookie, loads the user and, for writes, checks the CSRF header against the session.
Routes then ask for a permission with `require(Permission.X)`. Reserve scope:
- `Scoped` replaces a `reserve` query parameter: it refuses reserves outside the user's list
  and, for users limited to one reserve, fills it in when missing;
- `guard_*` check items addressed by id (image, camera, alert, ...) against the same list.
Health, version and sign-in are open; `/v1` uses integration keys instead (routes/v1.py).
"""

from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from vandrishti import audit
from vandrishti.auth import accounts
from vandrishti.auth.rbac import Permission, all_reserves, can, may_see
from vandrishti.core.config import Settings, get_settings
from vandrishti.core.storage import LocalStorage
from vandrishti.db.models import (
    Alert,
    Camera,
    Image,
    Individual,
    LoginSession,
    ReidEmbedding,
    ReidProposal,
    Reserve,
    Review,
    UserAccount,
)
from vandrishti.db.session import get_session

DB = Annotated[Session, Depends(get_session)]
Config = Annotated[Settings, Depends(get_settings)]
COOKIE = "vd_session"
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


def get_storage(settings: Config) -> LocalStorage:
    return LocalStorage(settings.storage_root)


Storage = Annotated[LocalStorage, Depends(get_storage)]


@dataclass(frozen=True)
class CurrentUser:
    user: UserAccount
    login: LoginSession

    @property
    def name(self) -> str:
        return self.user.username


def authenticated(
    request: Request,
    session: DB,
    settings: Config,
    x_csrf_token: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    token = request.cookies.get(COOKIE)
    found = accounts.current(session, settings, token) if token else None
    if found is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "sign in first")
    user, login = found
    if request.method in UNSAFE and not secrets.compare_digest(
        (x_csrf_token or "").encode(), login.csrf_token.encode()
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "missing or wrong CSRF token")
    current = CurrentUser(user, login)
    request.state.user = current
    return current


User = Annotated[CurrentUser, Depends(authenticated)]


def require(perm: Permission) -> Any:
    def check(user: User) -> CurrentUser:
        if not can(user.user, perm):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, f"your role cannot do this ({perm.value})"
            )
        return user

    return Depends(check)


def scope_reserve(user: User, reserve: str | None = None) -> str | None:
    if reserve:
        if not may_see(user.user, reserve):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "not your reserve")
        return reserve
    if all_reserves(user.user):
        return None
    if len(user.user.reserves) == 1:
        return user.user.reserves[0]
    raise HTTPException(status.HTTP_400_BAD_REQUEST, "choose a reserve")


Scoped = Annotated[str | None, Depends(scope_reserve)]


def check_reserve(user: CurrentUser, code: str) -> None:
    if not may_see(user.user, code):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")  # do not confirm it exists


def _guard(session: Session, user: CurrentUser, q: Any) -> None:
    code = session.scalar(q)
    if code is None or not may_see(user.user, code):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")


def guard_camera(session: Session, user: CurrentUser, camera_id: uuid.UUID) -> None:
    _guard(
        session,
        user,
        select(Reserve.code)
        .join(Camera, Camera.reserve_id == Reserve.id)
        .where(Camera.id == camera_id),
    )


def guard_image(session: Session, user: CurrentUser, image_id: uuid.UUID) -> None:
    _guard(
        session,
        user,
        select(Reserve.code)
        .join(Camera, Camera.reserve_id == Reserve.id)
        .join(Image, Image.camera_id == Camera.id)
        .where(Image.id == image_id),
    )


def guard_alert(session: Session, user: CurrentUser, alert_id: uuid.UUID) -> None:
    _guard(
        session,
        user,
        select(Reserve.code)
        .join(Alert, Alert.reserve_id == Reserve.id)
        .where(Alert.id == alert_id),
    )


def guard_individual(session: Session, user: CurrentUser, individual_id: uuid.UUID) -> None:
    _guard(
        session,
        user,
        select(Reserve.code)
        .join(Individual, Individual.reserve_id == Reserve.id)
        .where(Individual.id == individual_id),
    )


def guard_embedding(session: Session, user: CurrentUser, embedding_id: uuid.UUID) -> None:
    image_id = session.scalar(
        select(ReidEmbedding.image_id).where(ReidEmbedding.id == embedding_id)
    )
    if image_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
    guard_image(session, user, image_id)


def guard_proposal(session: Session, user: CurrentUser, proposal_id: uuid.UUID) -> None:
    emb = session.scalar(select(ReidProposal.embedding_id).where(ReidProposal.id == proposal_id))
    if emb is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
    guard_embedding(session, user, emb)


def guard_review(session: Session, user: CurrentUser, review_id: uuid.UUID) -> None:
    image_id = session.scalar(select(Review.image_id).where(Review.id == review_id))
    if image_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
    guard_image(session, user, image_id)


def audit_view(
    session: Session, user: CurrentUser, what: str, entity_id: str | None, **payload: Any
) -> None:
    """Record that a person looked at something sensitive (people frames, exact locations)."""
    audit.append(
        session,
        actor=f"user:{user.name}",
        action=f"view_{what}",
        entity="view",
        entity_id=entity_id,
        payload=payload,
    )
    session.commit()
