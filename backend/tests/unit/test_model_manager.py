import pytest

from vandrishti.models.adapters.dummy import DummyModel
from vandrishti.models.base import Model
from vandrishti.models.manager import ModelBudgetError, ModelManager


def manager(**kw: int) -> tuple[ModelManager, list[int]]:
    cleared: list[int] = []
    m = ModelManager(device="cpu", clear_cache=lambda: cleared.append(1), **kw)
    return m, cleared


def test_dummy_satisfies_the_interface() -> None:
    assert isinstance(DummyModel(), Model)


def test_one_model_resident_at_a_time() -> None:
    m, cleared = manager(max_loaded=1, budget_mb=1000)
    a, b = DummyModel("a"), DummyModel("b")
    assert m.get(a).predict([1]) == [{"input": 1, "model": "a"}]
    m.get(b)
    assert m.resident == ["b@1"] and not a.loaded and b.loaded and cleared == [1]


def test_reuses_a_loaded_model_and_evicts_least_recently_used() -> None:
    m, _ = manager(max_loaded=2, budget_mb=1000)
    a, b, c = DummyModel("a"), DummyModel("b"), DummyModel("c")
    m.get(a)
    m.get(b)
    m.get(a)  # a is now most recent
    m.get(c)
    assert m.resident == ["a@1", "c@1"] and a.load_count == 1 and not b.loaded


def test_memory_budget_is_respected() -> None:
    m, _ = manager(max_loaded=3, budget_mb=100)
    big, small = (
        DummyModel("big", memory_estimate_mb=80),
        DummyModel("small", memory_estimate_mb=30),
    )
    m.get(big)
    m.get(small)  # 80 + 30 > 100: big is unloaded first
    assert m.resident == ["small@1"]
    with pytest.raises(ModelBudgetError):
        m.get(DummyModel("huge", memory_estimate_mb=500))
    m.unload_all()
    assert m.resident == [] and not small.loaded
