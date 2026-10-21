"""Accounts and sessions: create users, sign in and out, find the user behind a cookie.

Sign-in failures are audited; after `login_max_failures` the account locks for
`login_lock_minutes`. Messages never say whether the username exists. Session tokens are
256-bit random; only their SHA-256 is stored. Sessions expire after `session_idle_hours`
without use and `session_max_hours` in all. Deactivating a user or changing their password
or role revokes their sessions.
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from vandrishti import audit
from vandrishti.auth import passwords
from vandrishti.core.config import Settings
from vandrishti.db.models import LoginSession, Reserve, Role, UserAccount


class AuthError(ValueError):
    pass


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(UTC)


def _revoke_all(session: Session, user_id: object) -> None:
    session.execute(
        update(LoginSession)
        .where(LoginSession.user_id == user_id, LoginSession.revoked_at.is_(None))
        .values(revoked_at=_now())
    )


def create_user(
    session: Session,
    *,
    username: str,
    display_name: str,
    password: str,
    role: Role,
    reserves: list[str],
    by: str,
) -> UserAccount:
    username = username.strip().lower()
    if (
        not username
        or len(username) > 64
        or not username.replace("-", "").replace(".", "").replace("_", "").isalnum()
    ):
        raise AuthError("username: letters, digits, '.', '-', '_' only")
    if session.scalar(select(UserAccount).where(UserAccount.username == username)):
        raise AuthError(f"user {username!r} exists")
    if role is Role.ADMIN:
        reserves = ["*"]
    elif "*" in reserves or not reserves:
        raise AuthError("non-admin users need explicit reserve codes")
    known = set(session.scalars(select(Reserve.code)))
    if unknown := [r for r in reserves if r != "*" and r not in known]:
        raise AuthError(f"unknown reserve(s): {', '.join(unknown)}")
    passwords.check_policy(password, username)
    user = UserAccount(
        username=username,
        display_name=display_name or username,
        password_hash=passwords.hash_password(password),
        role=role,
        reserves=reserves,
        active=True,
        failed_logins=0,
        password_changed_at=_now(),
    )
    session.add(user)
    session.flush()
    audit.append(
        session,
        actor=f"admin:{by}",
        action="user_create",
        entity="user",
        entity_id=str(user.id),
        payload={"username": username, "role": role.value, "reserves": reserves},
    )
    session.commit()
    return user


def update_user(
    session: Session,
    username: str,
    *,
    by: str,
    role: Role | None = None,
    reserves: list[str] | None = None,
    active: bool | None = None,
    password: str | None = None,
) -> UserAccount:
    user = session.scalar(select(UserAccount).where(UserAccount.username == username.lower()))
    if user is None:
        raise AuthError("no such user")
    changes: dict[str, object] = {}
    if role is not None and role is not user.role:
        user.role, changes["role"] = role, role.value
        if role is Role.ADMIN:
            user.reserves = ["*"]
    if reserves is not None and user.role is not Role.ADMIN:
        if not reserves or "*" in reserves:
            raise AuthError("non-admin users need explicit reserve codes")
        user.reserves, changes["reserves"] = reserves, reserves
    if active is not None and active != user.active:
        user.active, changes["active"] = active, active
    if password is not None:
        passwords.check_policy(password, user.username)
        user.password_hash = passwords.hash_password(password)
        user.password_changed_at, user.failed_logins, user.locked_until = _now(), 0, None
        changes["password"] = "changed"  # noqa: S105 (an audit note, not a secret)
    if changes:
        _revoke_all(session, user.id)  # new rights or credentials: sign in again
        audit.append(
            session,
            actor=f"admin:{by}",
            action="user_update",
            entity="user",
            entity_id=str(user.id),
            payload={"username": user.username, **changes},
        )
    session.commit()
    return user


@dataclass(frozen=True)
class Signin:
    token: str
    login: LoginSession
    user: UserAccount


def login(
    session: Session,
    settings: Settings,
    username: str,
    password: str,
    user_agent: str | None = None,
) -> Signin:
    now = _now()
    user = session.scalar(
        select(UserAccount).where(UserAccount.username == username.strip().lower())
    )
    if user is None:
        passwords.verify(passwords.DUMMY_HASH, password)  # same work as a real check
        audit.append(
            session,
            actor="anonymous",
            action="login_failed",
            entity="user",
            payload={"username": username[:64], "why": "unknown"},
        )
        session.commit()
        raise AuthError("wrong username or password")
    if user.locked_until and user.locked_until > now:
        audit.append(
            session,
            actor=f"user:{user.username}",
            action="login_failed",
            entity="user",
            entity_id=str(user.id),
            payload={"why": "locked"},
        )
        session.commit()
        raise AuthError("too many failed attempts; try again later")
    if not passwords.verify(user.password_hash, password) or not user.active:
        user.failed_logins += 1
        why = "inactive" if user.active is False else "password"
        if user.failed_logins >= settings.login_max_failures:
            user.locked_until = now + timedelta(minutes=settings.login_lock_minutes)
            user.failed_logins = 0
        audit.append(
            session,
            actor=f"user:{user.username}",
            action="login_failed",
            entity="user",
            entity_id=str(user.id),
            payload={"why": why},
        )
        session.commit()
        raise AuthError("wrong username or password")
    if passwords.needs_rehash(user.password_hash):
        user.password_hash = passwords.hash_password(password)
    user.failed_logins, user.locked_until, user.last_login_at = 0, None, now
    token = secrets.token_urlsafe(32)
    row = LoginSession(
        user_id=user.id,
        token_hash=token_hash(token),
        csrf_token=secrets.token_urlsafe(32),
        expires_at=now + timedelta(hours=settings.session_max_hours),
        last_seen_at=now,
        user_agent=(user_agent or "")[:300] or None,
    )
    session.add(row)
    session.flush()
    audit.append(
        session,
        actor=f"user:{user.username}",
        action="login",
        entity="user",
        entity_id=str(user.id),
        payload={"session": str(row.id)},
    )
    session.commit()
    return Signin(token, row, user)


def current(
    session: Session, settings: Settings, token: str
) -> tuple[UserAccount, LoginSession] | None:
    now = _now()
    row = session.scalar(select(LoginSession).where(LoginSession.token_hash == token_hash(token)))
    if row is None or row.revoked_at is not None or row.expires_at <= now:
        return None
    if now - row.last_seen_at > timedelta(hours=settings.session_idle_hours):
        row.revoked_at = now
        session.commit()
        return None
    user = session.get(UserAccount, row.user_id)
    if user is None or not user.active:
        return None
    if now - row.last_seen_at > timedelta(minutes=1):  # avoid a write on every request
        row.last_seen_at = now
        session.commit()
    return user, row


def logout(session: Session, row: LoginSession, user: UserAccount) -> None:
    row.revoked_at = _now()
    audit.append(
        session,
        actor=f"user:{user.username}",
        action="logout",
        entity="user",
        entity_id=str(user.id),
        payload={"session": str(row.id)},
    )
    session.commit()
