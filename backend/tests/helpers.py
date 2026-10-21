"""Test helpers: act as a signed-in user without going through /auth/login.

The real sign-in flow (cookie, CSRF, lockout) is tested in tests/integration/test_auth.py.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import FastAPI

from vandrishti.api.deps import CurrentUser, authenticated
from vandrishti.db.models import LoginSession, Role, UserAccount


def sign_in_as(
    app: FastAPI, username: str = "asha", role: str = "admin", reserves: list[str] | None = None
) -> None:
    """Every later request is made by this user (call again to switch person)."""
    user = UserAccount(
        username=username,
        display_name=username,
        password_hash="x",
        role=Role(role),
        reserves=reserves or ["*"],
        active=True,
        failed_logins=0,
    )
    login = LoginSession(
        token_hash="x", csrf_token="x", expires_at=datetime.now(UTC), last_seen_at=datetime.now(UTC)
    )
    app.dependency_overrides[authenticated] = lambda: CurrentUser(user, login)
