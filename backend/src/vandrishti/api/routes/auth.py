"""Sign in, sign out, who am I, change my password.

The session token travels only in an HttpOnly, SameSite=Strict cookie (Secure outside dev);
the CSRF token comes back in the JSON and must be sent as `X-CSRF-Token` on every write.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from vandrishti.api.deps import COOKIE, DB, Config, User
from vandrishti.api.ratelimit import LOGIN
from vandrishti.auth import accounts, passwords
from vandrishti.auth.rbac import ROLE_PERMISSIONS
from vandrishti.db.models import UserAccount

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class PasswordIn(BaseModel):
    current: str = Field(min_length=1, max_length=256)
    new: str = Field(min_length=1, max_length=256)


def _me(user: UserAccount, csrf: str) -> dict[str, Any]:
    return {
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role.value,
        "reserves": user.reserves,
        "permissions": sorted(p.value for p in ROLE_PERMISSIONS[user.role]),
        "csrf_token": csrf,
    }


@router.post("/login")
def login(
    body: LoginIn, request: Request, response: Response, session: DB, settings: Config
) -> dict[str, Any]:
    client = request.client.host if request.client else "unknown"
    if not LOGIN.allow(client):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "too many sign-in attempts; wait a minute"
        )
    try:
        signin = accounts.login(
            session, settings, body.username, body.password, request.headers.get("user-agent")
        )
    except accounts.AuthError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e)) from e
    response.set_cookie(
        COOKIE,
        signin.token,
        max_age=int(settings.session_max_hours * 3600),
        httponly=True,
        secure=settings.env != "dev",
        samesite="strict",
        path="/",
    )
    return _me(signin.user, signin.login.csrf_token)


@router.post("/logout")
def logout(response: Response, session: DB, user: User) -> dict[str, str]:
    accounts.logout(session, user.login, user.user)
    response.delete_cookie(COOKIE, path="/")
    return {"status": "signed out"}


@router.get("/me")
def me(user: User) -> dict[str, Any]:
    return _me(user.user, user.login.csrf_token)


@router.post("/password")
def change_password(
    body: PasswordIn, response: Response, session: DB, user: User
) -> dict[str, str]:
    """Change your own password; every session (this one too) ends, so sign in again."""
    if not passwords.verify(user.user.password_hash, body.current):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "the current password is wrong")
    try:
        accounts.update_user(session, user.name, by=user.name, password=body.new)
    except (accounts.AuthError, passwords.PasswordPolicyError) as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e
    response.delete_cookie(COOKIE, path="/")
    return {"status": "password changed; sign in again"}
