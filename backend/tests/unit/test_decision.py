import pytest

from vandrishti.pipeline.decision import NOTHING, EngineConfig, Evidence, decide
from vandrishti.taxonomy import Taxon, parse_label

TIGER = parse_label("x;mammalia;carnivora;felidae;panthera;tigris;tiger")
LEOPARD = parse_label("x;mammalia;carnivora;felidae;panthera;pardus;leopard")
PANTHERA = parse_label("x;mammalia;carnivora;felidae;panthera;;panthera species")
CHITAL = parse_label("x;mammalia;artiodactyla;cervidae;axis;axis;chital")
BLANK = parse_label("x;;;;;;blank")


def ev(**kw: object) -> Evidence:
    base: dict[str, object] = {
        "detector_confidence": 0.9,
        "species_final": (TIGER, 0.95, "classifier"),
        "species_raw": [(TIGER, 0.95), (LEOPARD, 0.03)],
        "clip": [("tiger", 0.8), ("leopard", 0.1), (NOTHING, 0.05)],
    }
    return Evidence(**{**base, **kw})  # type: ignore[arg-type]


def factor(outcome: object, name: str) -> float:
    return next(f["factor"] for f in outcome.explanation["factors"] if f["name"] == name)  # type: ignore[attr-defined]


def test_clean_agreement_keeps_speciesnet_score() -> None:
    out = decide(ev())
    assert (out.label, out.taxon_level, out.confidence) == ("tiger", "species", 0.95)
    assert "nothing lowered it" in out.explanation["summary"]


def test_clip_disagreement_and_same_genus_when_enabled() -> None:
    on = EngineConfig(clip_affects_confidence=True)
    other = decide(ev(clip=[("chital", 0.7)], species_raw=[(TIGER, 0.95), (CHITAL, 0.01)]), on)
    assert other.confidence == pytest.approx(0.95 * 0.80)
    genus = decide(ev(clip=[("leopard", 0.6)]), on)
    assert genus.confidence == pytest.approx(0.95 * 0.95)
    nothing = decide(ev(clip=[(NOTHING, 0.7)]), on)
    assert nothing.confidence == pytest.approx(0.95 * 0.70)


def test_clip_is_informational_by_default() -> None:
    out = decide(ev(clip=[("chital", 0.7)], species_raw=[(TIGER, 0.95), (CHITAL, 0.01)]))
    assert out.confidence == 0.95
    reason = next(f["reason"] for f in out.explanation["factors"] if f["name"] == "model agreement")
    assert "prefers chital" in reason and "for information" in reason


def test_rollup_agrees_with_a_species_inside_it() -> None:
    out = decide(ev(species_final=(PANTHERA, 0.9, "classifier+rollup_to_genus")))
    assert out.taxon_level == "genus" and factor(out, "model agreement") == 1.0
    assert "named to genus only" in out.explanation["summary"]


def test_weak_detection_lowers_confidence() -> None:
    out = decide(ev(detector_confidence=0.25))
    assert factor(out, "detection strength") == pytest.approx(0.8)


def test_reserve_list_and_geofence() -> None:
    off = decide(ev(reserve_taxa=frozenset({CHITAL.taxon})))
    assert factor(off, "reserve species list") == 0.6
    on = decide(ev(reserve_taxa=frozenset({TIGER.taxon})))
    assert factor(on, "reserve species list") == 1.0
    fenced = decide(ev(species_final=(TIGER, 0.95, "classifier+geofence_rollup"), country="IND"))
    assert factor(fenced, "geographic prior") == 0.9


def test_time_prior_is_neutral_until_enough_verified_sightings() -> None:
    few = decide(ev(hour_bin_share=0.0, verified_sightings=5))
    assert factor(few, "time-of-day prior") == 1.0
    rare = decide(ev(hour_bin_share=0.01, verified_sightings=200))
    assert factor(rare, "time-of-day prior") == 0.85
    usual = decide(ev(hour_bin_share=0.3, verified_sightings=200))
    assert factor(usual, "time-of-day prior") == 1.0


def test_unnamed_animal_is_capped_so_a_person_decides() -> None:
    for final in (None, (BLANK, 0.99, "classifier"), (Taxon(";;;;", "animal"), 0.9, "detector")):
        out = decide(ev(species_final=final))
        assert out.label == "animal (unidentified)"
        assert out.confidence <= EngineConfig().unnamed_cap


def test_config_hash_changes_with_any_factor() -> None:
    assert EngineConfig().hash() != EngineConfig(rare_hour=0.8).hash()
