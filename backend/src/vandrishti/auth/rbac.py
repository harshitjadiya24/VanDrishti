"""Roles → permissions, and reserve scope.

A user sees only the reserves listed on their account ("*" = all). Exact coordinates need
PRECISE_LOCATIONS (admins); everyone else gets them rounded to 0.1 degree.
"""

from __future__ import annotations

import enum

from vandrishti.db.models import Role, UserAccount


class Permission(enum.StrEnum):
    VIEW = "view"  # dashboard, alerts list, reports, named tigers
    REVIEW_SPECIES = "review_species"  # review / uncertain / blank / quality queues
    REVIEW_PEOPLE = "review_people"  # people & vehicles queue (blurred frames)
    DECIDE_IDENTITY = "decide_identity"  # tiger identity proposals
    ACT_ALERTS = "act_alerts"  # acknowledge / resolve / reopen
    RUN = "run"  # re-run routing, risk, alert rules; upload images
    EXPORT = "export"  # Camtrap DP, Excel/PDF downloads
    VIEW_AUDIT = "view_audit"  # the full trail spans every reserve: admins only
    MANAGE_REGISTRY = "manage_registry"  # reserves, cameras, species lists
    MANAGE_USERS = "manage_users"
    PRECISE_LOCATIONS = "precise_locations"


P = Permission
ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.ADMIN: frozenset(Permission),
    Role.REVIEWER: frozenset(
        {
            P.VIEW,
            P.REVIEW_SPECIES,
            P.REVIEW_PEOPLE,
            P.DECIDE_IDENTITY,
            P.ACT_ALERTS,
            P.RUN,
            P.EXPORT,
        }
    ),
    Role.RANGER: frozenset({P.VIEW, P.REVIEW_PEOPLE, P.ACT_ALERTS}),
    Role.VIEWER: frozenset({P.VIEW}),
}


def can(user: UserAccount, perm: Permission) -> bool:
    return user.active and perm in ROLE_PERMISSIONS[user.role]


def all_reserves(user: UserAccount) -> bool:
    return "*" in user.reserves


def may_see(user: UserAccount, reserve_code: str) -> bool:
    return all_reserves(user) or reserve_code in user.reserves


def round_coord(value: float | None, user: UserAccount) -> float | None:
    if value is None or can(user, P.PRECISE_LOCATIONS):
        return value
    return round(value, 1)
