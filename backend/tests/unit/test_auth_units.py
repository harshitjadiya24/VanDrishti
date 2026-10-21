"""Phase 8 pure pieces: password policy and hashing, roles, rate limiter, production guard."""

from __future__ import annotations

import pytest
from pydantic import SecretStr

from vandrishti.api.ratelimit import RateLimiter
from vandrishti.auth import passwords
from vandrishti.auth.rbac import ROLE_PERMISSIONS, Permission, can, round_coord
from vandrishti.core.config import Settings
from vandrishti.db.models import Role, UserAccount


def test_password_policy_and_argon2id() -> None:
    with pytest.raises(passwords.PasswordPolicyError):
        passwords.check_policy("short", "asha")
    with pytest.raises(passwords.PasswordPolicyError):
        passwords.check_policy("asha-likes-tigers", "asha")
    h = passwords.hash_password("correct horse battery")
    assert h.startswith("$argon2id$")
    assert passwords.verify(h, "correct horse battery")
    assert not passwords.verify(h, "correct horse batterY")
    assert not passwords.verify("not a hash", "x")


def test_roles_are_least_privilege() -> None:
    assert ROLE_PERMISSIONS[Role.ADMIN] == frozenset(Permission)
    ranger = UserAccount(role=Role.RANGER, reserves=["KAN"], active=True)
    assert can(ranger, Permission.ACT_ALERTS) and not can(ranger, Permission.REVIEW_SPECIES)
    assert round_coord(22.34567, ranger) == 22.3
    for role in (Role.REVIEWER, Role.RANGER, Role.VIEWER):
        assert Permission.PRECISE_LOCATIONS not in ROLE_PERMISSIONS[role]
        assert Permission.MANAGE_USERS not in ROLE_PERMISSIONS[role]
        assert Permission.VIEW_AUDIT not in ROLE_PERMISSIONS[role]
    ranger.active = False
    assert not can(ranger, Permission.VIEW)


def test_rate_limiter_window() -> None:
    lim = RateLimiter(2, window_seconds=60)
    assert [lim.allow("k", now=t) for t in (0, 1, 2)] == [True, True, False]
    assert lim.allow("other", now=2)
    assert lim.allow("k", now=61)  # the first hit left the window


def test_production_guard() -> None:
    assert Settings(env="dev").production_problems() == []
    problems = Settings(
        env="prod", alert_webhook_url="http://x.org/hook", ingest_token=SecretStr("short")
    ).production_problems()
    assert len(problems) == 4  # default db password, http webhook, no secret, short token
    assert (
        Settings(env="prod", db_password=SecretStr("a-strong-db-secret-1234")).production_problems()
        == []
    )
