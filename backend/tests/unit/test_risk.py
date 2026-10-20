from datetime import UTC, datetime

import pytest

from vandrishti.db.models import ReviewAction, RiskLevel, Sensitivity, Severity
from vandrishti.pipeline.risk import Context, RiskConfig, poisson_tail, score

CFG = RiskConfig()


def names(out) -> list[str]:  # type: ignore[no-untyped-def]
    return [f["name"] for f in out.factors]


def test_one_person_by_day_is_low() -> None:
    out = score(Context(people=1, vehicles=0), CFG)
    assert (out.score, out.level) == (2, RiskLevel.LOW)
    assert out.factors[0]["reason"] == "1 person (estimated count)"


def test_person_at_night_is_medium_and_says_why() -> None:
    out = score(Context(people=1, vehicles=0, night=True, night_basis="sun"), CFG)
    assert (out.score, out.level) == (5, RiskLevel.MEDIUM)
    assert "after sunset at this camera" in out.factors[1]["reason"]


def test_vehicle_at_night_in_the_core_zone_is_high() -> None:
    out = score(
        Context(
            people=0,
            vehicles=1,
            vehicle_type="motorcycle",
            night=True,
            sensitivity=Sensitivity.CORE,
        ),
        CFG,
    )
    assert (out.score, out.level) == (8, RiskLevel.HIGH)
    assert "possibly a motorcycle (OpenCLIP guess)" in out.factors[0]["reason"]
    unknown = score(Context(people=0, vehicles=1, vehicle_type="unknown"), CFG)
    assert unknown.factors[0]["reason"] == "1 vehicle"


def test_group_spike_repeats_and_tiger() -> None:
    out = score(
        Context(
            people=4,
            vehicles=0,
            events_today=3,
            baseline_per_day=0.0,
            events_recent=5,
            tiger_seen=datetime(2024, 1, 2, tzinfo=UTC),
        ),
        CFG,
    )
    assert names(out) == ["people", "group", "unusual spike", "repeated visits", "tiger nearby"]
    assert out.level is RiskLevel.HIGH


def test_a_busy_camera_does_not_spike_on_its_usual_traffic() -> None:
    # A road camera that sees ~3 vehicles a day: 3 today is normal.
    out = score(Context(people=0, vehicles=1, events_today=3, baseline_per_day=3.0), CFG)
    assert "unusual spike" not in names(out)


def test_reviewer_overrides() -> None:
    dismissed = score(
        Context(
            people=3,
            vehicles=1,
            night=True,
            review_action=ReviewAction.FALSE_ALARM,
            reviewer="ravi",
        ),
        CFG,
    )
    assert dismissed.dismissed and dismissed.level is RiskLevel.LOW and dismissed.score == 0
    marked = score(Context(people=1, vehicles=0, poaching_marked=True, reviewer="ravi"), CFG)
    assert marked.level is RiskLevel.HIGH and marked.score == 7  # 7 points, but always HIGH
    reasons = [f["reason"] for f in marked.factors]
    assert "ravi marked poaching activity" in reasons
    assert "level raised to high: a poaching-activity mark always means high" in reasons
    floor = score(Context(people=1, vehicles=0, severity=Severity.HIGH, reviewer="asha"), CFG)
    assert floor.level is RiskLevel.HIGH and floor.score == 2  # level raised, points unchanged
    assert floor.factors[-1]["reason"] == "level raised to high: asha set severity high"


@pytest.mark.parametrize(
    ("n", "lam", "expected"), [(0, 1.0, 1.0), (1, 1.0, 1 - 0.36788), (3, 0.05, 2.0067e-05)]
)
def test_poisson_tail(n: int, lam: float, expected: float) -> None:
    assert poisson_tail(n, lam) == pytest.approx(expected, rel=1e-2)


def test_unknown_capture_time_skips_every_time_based_signal() -> None:
    out = score(
        Context(
            people=1,
            vehicles=0,
            night=True,
            events_today=3,
            events_recent=5,
            tiger_seen=datetime(2024, 1, 2, tzinfo=UTC),
            time_known=False,
        ),
        CFG,
    )
    assert names(out) == ["people", "time"] and out.level is RiskLevel.LOW
    assert "capture time unknown" in out.factors[1]["reason"]
