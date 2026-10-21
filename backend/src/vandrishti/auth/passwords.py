"""Argon2id password hashing (argon2-cffi defaults: t=3, m=64 MiB, p=4) and a length policy."""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

_hasher = PasswordHasher()
MIN_LENGTH = 12
# Verifying against this when the user does not exist keeps timing the same either way.
DUMMY_HASH = _hasher.hash("not-a-real-password-for-timing")


class PasswordPolicyError(ValueError):
    pass


def check_policy(password: str, username: str) -> None:
    if len(password) < MIN_LENGTH:
        raise PasswordPolicyError(f"use at least {MIN_LENGTH} characters")
    if len(password) > 256:
        raise PasswordPolicyError("use at most 256 characters")
    if username.lower() in password.lower():
        raise PasswordPolicyError("the password must not contain the username")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify(stored: str, password: str) -> bool:
    try:
        return _hasher.verify(stored, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(stored: str) -> bool:
    return _hasher.check_needs_rehash(stored)
