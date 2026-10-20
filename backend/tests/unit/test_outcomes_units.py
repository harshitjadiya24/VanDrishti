"""Section 11 pure helpers: report periods, scientific names, webhook signatures, settings."""

from __future__ import annotations

import hashlib
import hmac
from datetime import date

import pytest

from vandrishti.alerts.service import sign
from vandrishti.core.config import Settings
from vandrishti.exports.camtrap_dp import scientific_name
from vandrishti.reports.data import ReportError, period_range


def test_period_ranges_are_local_calendar_periods() -> None:
    assert period_range("daily", date(2024, 2, 29)) == (date(2024, 2, 29), date(2024, 2, 29))
    assert period_range("weekly", date(2024, 3, 24)) == (date(2024, 3, 18), date(2024, 3, 24))
    assert period_range("monthly", date(2024, 2, 10)) == (date(2024, 2, 1), date(2024, 2, 29))
    assert period_range("custom", start=date(2024, 1, 1), end=date(2024, 1, 3)) == (
        date(2024, 1, 1),
        date(2024, 1, 3),
    )
    with pytest.raises(ReportError):
        period_range("custom", start=date(2024, 1, 3), end=date(2024, 1, 1))
    with pytest.raises(ReportError):
        period_range("custom", start=date(2023, 1, 1), end=date(2024, 6, 1))
    with pytest.raises(ReportError):
        period_range("weekly")


@pytest.mark.parametrize(
    ("taxon", "expected"),
    [
        ("mammalia;carnivora;felidae;panthera;tigris", ("Panthera tigris", "species")),
        ("mammalia;artiodactyla;cervidae;;", ("Cervidae", "family")),
        ("aves;galliformes;phasianidae;gallus;", ("Gallus", "genus")),
        ("mammalia;;;;", ("Mammalia", "class")),
        (";;;;", None),
    ],
)
def test_scientific_name(taxon: str, expected: tuple[str, str] | None) -> None:
    assert scientific_name(taxon) == expected


def test_webhook_signature_matches_a_receiver_recomputing_it() -> None:
    body = b'{"id":"x"}'
    mac = hmac.new(b"secret", b"1700000000." + body, hashlib.sha256).hexdigest()
    assert sign("secret", 1700000000, body) == f"sha256={mac}"
    assert sign("secret", 1700000001, body) != f"sha256={mac}"  # replayed timestamp differs


def test_webhook_url_must_be_http() -> None:
    with pytest.raises(ValueError, match="http"):
        Settings(alert_webhook_url="ftp://example.org/hook")
