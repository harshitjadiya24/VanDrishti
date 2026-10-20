from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest

from vandrishti.sun import is_night, sun_times

IST = ZoneInfo("Asia/Kolkata")


def local(dt: datetime) -> str:
    return dt.astimezone(IST).strftime("%H:%M")


def test_delhi_midsummer_matches_published_times() -> None:
    # Published (timeanddate.com) for New Delhi, 21 June 2024: sunrise 05:24, sunset 19:22.
    rise, set_ = sun_times(date(2024, 6, 21), 28.6139, 77.2090)  # type: ignore[misc]
    assert abs((rise.astimezone(IST).hour * 60 + rise.astimezone(IST).minute) - (5 * 60 + 24)) <= 4
    assert abs((set_.astimezone(IST).hour * 60 + set_.astimezone(IST).minute) - (19 * 60 + 22)) <= 4


def test_winter_sunset_is_over_an_hour_earlier_in_central_india() -> None:
    kanha = (22.33, 80.61)
    _, june = sun_times(date(2024, 6, 21), *kanha)  # type: ignore[misc]
    _, dec = sun_times(date(2024, 12, 21), *kanha)  # type: ignore[misc]
    june_min = june.astimezone(IST).hour * 60 + june.astimezone(IST).minute
    dec_min = dec.astimezone(IST).hour * 60 + dec.astimezone(IST).minute
    assert june_min - dec_min > 60


@pytest.mark.parametrize(
    ("hour_ist", "night"), [(3, True), (7, False), (13, False), (18, True), (22, True)]
)
def test_is_night_in_december_at_kanha(hour_ist: int, night: bool) -> None:
    at = datetime(2024, 12, 21, hour_ist, 30, tzinfo=IST).astimezone(UTC)
    assert is_night(at, "Asia/Kolkata", 22.33, 80.61) == (night, "sun")


def test_without_a_location_the_clock_is_used_and_said_so() -> None:
    at = datetime(2024, 12, 21, 18, 30, tzinfo=IST)
    assert is_night(at, "Asia/Kolkata", None, None) == (False, "clock")
    assert is_night(at.replace(hour=20), "Asia/Kolkata", None, None) == (True, "clock")


def test_polar_summer_has_no_sunset() -> None:
    assert sun_times(date(2024, 6, 21), 78.2, 15.6) is None  # Svalbard


@pytest.mark.parametrize(
    ("tz", "lat", "lon", "hour", "night"),
    [
        ("America/Los_Angeles", 34.05, -118.25, 19, False),  # long June evening
        ("America/Los_Angeles", 34.05, -118.25, 21, True),
        ("Pacific/Auckland", -36.85, 174.76, 7, True),  # southern winter morning
        ("Pacific/Auckland", -36.85, 174.76, 12, False),
    ],
)
def test_both_hemispheres_and_far_longitudes(
    tz: str, lat: float, lon: float, hour: int, night: bool
) -> None:
    at = datetime(2024, 6, 21, hour, 0, tzinfo=ZoneInfo(tz))
    assert is_night(at, tz, lat, lon)[0] is night
