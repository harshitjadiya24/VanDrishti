"""Section 1: reserves and the camera registry."""

from __future__ import annotations

import uuid
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from vandrishti import audit
from vandrishti.api.deps import DB, Scoped, User, check_reserve, guard_camera, require
from vandrishti.auth.rbac import Permission, can, may_see, round_coord
from vandrishti.db.models import Camera, CameraStatus, Reserve, Sensitivity, UserAccount

router = APIRouter(tags=["registry"])


class ReserveIn(BaseModel):
    code: str = Field(min_length=2, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=200)
    timezone: str = "Asia/Kolkata"
    country: str = Field(default="IND", min_length=3, max_length=3)

    @field_validator("timezone")
    @classmethod
    def _known_zone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError(f"unknown time zone {value!r}") from None
        return value


class ReserveOut(ReserveIn):
    id: uuid.UUID


class CameraIn(BaseModel):
    reserve: str
    code: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    model: str | None = None
    serial: str | None = None
    installed_at: datetime | None = None


class CameraOut(BaseModel):
    id: uuid.UUID
    reserve: str
    code: str
    latitude: float | None
    longitude: float | None
    model: str | None
    serial: str | None
    status: CameraStatus
    sensitivity: Sensitivity
    installed_at: datetime | None
    last_seen_at: datetime | None


class CameraPatch(BaseModel):
    status: CameraStatus | None = None
    sensitivity: Sensitivity | None = None  # section 6: location sensitivity


def _camera_out(c: Camera, reserve_code: str, user: UserAccount) -> CameraOut:
    return CameraOut(
        id=c.id,
        reserve=reserve_code,
        code=c.code,
        latitude=round_coord(c.latitude, user),
        longitude=round_coord(c.longitude, user),
        model=c.model,
        serial=c.serial,
        status=c.status,
        sensitivity=c.sensitivity,
        installed_at=c.installed_at,
        last_seen_at=c.last_seen_at,
    )


@router.get("/reserves")
def list_reserves(session: DB, user: User) -> list[ReserveOut]:
    rows = session.scalars(select(Reserve).order_by(Reserve.code))
    return [
        ReserveOut(id=r.id, code=r.code, name=r.name, timezone=r.timezone, country=r.country)
        for r in rows
        if may_see(user.user, r.code)
    ]


@router.post(
    "/reserves",
    status_code=status.HTTP_201_CREATED,
    dependencies=[require(Permission.MANAGE_REGISTRY)],
)
def create_reserve(body: ReserveIn, session: DB, user: User) -> ReserveOut:
    r = Reserve(**body.model_dump())
    session.add(r)
    try:
        session.flush()
        audit.append(
            session,
            actor=f"user:{user.name}",
            action="reserve_create",
            entity="reserve",
            entity_id=str(r.id),
            payload={"code": r.code},
        )
        session.commit()
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, f"reserve {body.code} exists") from None
    return ReserveOut(id=r.id, **body.model_dump())


@router.get("/cameras")
def list_cameras(session: DB, user: User, reserve: Scoped) -> list[CameraOut]:
    q = select(Camera, Reserve.code).join(Reserve, Reserve.id == Camera.reserve_id)
    if reserve:
        q = q.where(Reserve.code == reserve)
    return [
        _camera_out(c, code, user.user)
        for c, code in session.execute(q.order_by(Reserve.code, Camera.code))
    ]


@router.post(
    "/cameras",
    status_code=status.HTTP_201_CREATED,
    dependencies=[require(Permission.MANAGE_REGISTRY)],
)
def create_camera(body: CameraIn, session: DB, user: User) -> CameraOut:
    check_reserve(user, body.reserve)
    reserve = session.scalar(select(Reserve).where(Reserve.code == body.reserve))
    if reserve is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no reserve {body.reserve}")
    c = Camera(reserve_id=reserve.id, **body.model_dump(exclude={"reserve"}))
    session.add(c)
    try:
        session.flush()
        audit.append(
            session,
            actor=f"user:{user.name}",
            action="camera_create",
            entity="camera",
            entity_id=str(c.id),
            payload={"code": c.code},
        )
        session.commit()
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, f"camera {body.code} exists") from None
    return _camera_out(c, reserve.code, user.user)


@router.patch("/cameras/{camera_id}", dependencies=[require(Permission.ACT_ALERTS)])
def update_camera(camera_id: uuid.UUID, body: CameraPatch, session: DB, user: User) -> CameraOut:
    """Rangers report a camera's state (faulty, stolen); sensitivity is an admin decision."""
    guard_camera(session, user, camera_id)
    if body.sensitivity is not None and not can(user.user, Permission.MANAGE_REGISTRY):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only admins set location sensitivity")
    row = session.execute(
        select(Camera, Reserve.code)
        .join(Reserve, Reserve.id == Camera.reserve_id)
        .where(Camera.id == camera_id)
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "camera not found")
    camera, code = row
    if body.status is not None:
        camera.status = body.status
    if body.sensitivity is not None:
        camera.sensitivity = body.sensitivity
    audit.append(
        session,
        actor=f"user:{user.name}",
        action="camera_update",
        entity="camera",
        entity_id=str(camera.id),
        payload=body.model_dump(mode="json", exclude_none=True),
    )
    session.commit()
    return _camera_out(camera, code, user.user)
