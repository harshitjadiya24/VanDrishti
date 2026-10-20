"""Section 1: reserves and the camera registry."""

from __future__ import annotations

import uuid
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from vandrishti.api.deps import DB, Writer
from vandrishti.db.models import Camera, CameraStatus, Reserve

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
    installed_at: datetime | None
    last_seen_at: datetime | None


class CameraPatch(BaseModel):
    status: CameraStatus


def _camera_out(c: Camera, reserve_code: str) -> CameraOut:
    return CameraOut(
        id=c.id,
        reserve=reserve_code,
        code=c.code,
        latitude=c.latitude,
        longitude=c.longitude,
        model=c.model,
        serial=c.serial,
        status=c.status,
        installed_at=c.installed_at,
        last_seen_at=c.last_seen_at,
    )


@router.get("/reserves")
def list_reserves(session: DB) -> list[ReserveOut]:
    rows = session.scalars(select(Reserve).order_by(Reserve.code))
    return [
        ReserveOut(id=r.id, code=r.code, name=r.name, timezone=r.timezone, country=r.country)
        for r in rows
    ]


@router.post("/reserves", status_code=status.HTTP_201_CREATED, dependencies=[Writer])
def create_reserve(body: ReserveIn, session: DB) -> ReserveOut:
    r = Reserve(**body.model_dump())
    session.add(r)
    try:
        session.commit()
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, f"reserve {body.code} exists") from None
    return ReserveOut(id=r.id, **body.model_dump())


@router.get("/cameras")
def list_cameras(session: DB, reserve: str | None = None) -> list[CameraOut]:
    q = select(Camera, Reserve.code).join(Reserve, Reserve.id == Camera.reserve_id)
    if reserve:
        q = q.where(Reserve.code == reserve)
    return [
        _camera_out(c, code) for c, code in session.execute(q.order_by(Reserve.code, Camera.code))
    ]


@router.post("/cameras", status_code=status.HTTP_201_CREATED, dependencies=[Writer])
def create_camera(body: CameraIn, session: DB) -> CameraOut:
    reserve = session.scalar(select(Reserve).where(Reserve.code == body.reserve))
    if reserve is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no reserve {body.reserve}")
    c = Camera(reserve_id=reserve.id, **body.model_dump(exclude={"reserve"}))
    session.add(c)
    try:
        session.commit()
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, f"camera {body.code} exists") from None
    return _camera_out(c, reserve.code)


@router.patch("/cameras/{camera_id}", dependencies=[Writer])
def update_camera(camera_id: uuid.UUID, body: CameraPatch, session: DB) -> CameraOut:
    row = session.execute(
        select(Camera, Reserve.code)
        .join(Reserve, Reserve.id == Camera.reserve_id)
        .where(Camera.id == camera_id)
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "camera not found")
    camera, code = row
    camera.status = body.status
    session.commit()
    return _camera_out(camera, code)
