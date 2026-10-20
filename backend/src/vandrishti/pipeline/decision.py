"""5.6 decision engine and 5.7 explanation.

Starts from SpeciesNet's final answer (already geofenced to the country and rolled up when
unsure) and multiplies its score by named factors, each with a plain-language reason:

- model agreement: does OpenCLIP, looking at the same crop, prefer the same taxon? Shown
  for information only by default: on the labelled test sample its 51 disagreements were
  all cases where SpeciesNet was right (docs/EVALUATION.md). `clip_affects_confidence`
  turns its factors on once a reserve's own labelled data shows it catches errors;
- detection strength: a weak MegaDetector box lowers trust;
- geographic prior: is the taxon on the reserve's own species list (when one exists)?
  SpeciesNet's country geofence has already acted; that is reported too;
- time-of-day prior: is this hour usual for the species *in this reserve*, learned only
  from human-verified sightings (neutral until there are enough).

The result is a confidence score for routing (section 7), not a calibrated probability;
docs/EVALUATION.md reports how accurate each confidence band was on labelled data. An animal
SpeciesNet cannot name is capped at 0.5, so it always goes to a person.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from typing import Any

from vandrishti.taxonomy import Taxon

ENGINE_VERSION = "1"
NOTHING = "__nothing__"


@dataclass(frozen=True)
class EngineConfig:
    unnamed_cap: float = 0.5  # an animal without a name never auto-accepts
    clip_affects_confidence: bool = False  # see the module docstring
    clip_disagrees: float = 0.80
    clip_same_genus: float = 0.95
    clip_sees_nothing: float = 0.70
    weak_detection_below: float = 0.5  # detector confidence; factor 0.6 + 0.8 * conf below it
    off_reserve_list: float = 0.60
    geofenced: float = 0.90
    rare_hour: float = 0.85
    hour_bins: int = 8  # 3-hour bins
    min_verified_for_time_prior: int = 30
    rare_hour_share: float = 0.25  # of a uniform share (1 / hour_bins)

    def hash(self) -> str:
        payload = {"engine": ENGINE_VERSION, **asdict(self)}
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


@dataclass(frozen=True)
class Evidence:
    detector_confidence: float
    species_final: tuple[Taxon, float, str] | None  # taxon, score, ensemble source
    species_raw: list[tuple[Taxon, float]] = field(default_factory=list)
    clip: list[tuple[str, float]] | None = None  # (common name or marker, probability)
    reserve_taxa: frozenset[str] = frozenset()  # empty: no list configured
    country: str | None = None
    hour_bin_share: float | None = None  # share of verified sightings in this hour bin
    verified_sightings: int = 0  # of this taxon in this reserve


@dataclass
class Factor:
    name: str
    factor: float
    reason: str


@dataclass
class Outcome:
    label: str
    taxon: str | None
    taxon_level: str
    confidence: float
    explanation: dict[str, Any]


def _clip_factor(ev: Evidence, final: Taxon, cfg: EngineConfig) -> Factor:
    f = _clip_opinion(ev, final, cfg)
    if f.factor < 1.0 and not cfg.clip_affects_confidence:
        return Factor(f.name, 1.0, f"{f.reason} (for information; not used for confidence)")
    return f


def _clip_opinion(ev: Evidence, final: Taxon, cfg: EngineConfig) -> Factor:
    if not ev.clip:
        return Factor("model agreement", 1.0, "OpenCLIP check not run")
    top, prob = ev.clip[0]
    if top == NOTHING:
        return Factor(
            "model agreement", cfg.clip_sees_nothing, f"OpenCLIP sees no animal ({prob:.2f})"
        )
    names = {t.common_name: t for t, _ in ev.species_raw}
    names.setdefault(final.common_name, final)
    clip_taxon = names.get(top)
    if top == final.common_name or (clip_taxon and clip_taxon.taxon == final.taxon):
        return Factor("model agreement", 1.0, f"OpenCLIP agrees: {top} ({prob:.2f})")
    if clip_taxon and final.level != "species" and clip_taxon.shares(final, final.level):
        # SpeciesNet rolled up to e.g. the genus; CLIP's species lies inside it.
        return Factor("model agreement", 1.0, f"OpenCLIP agrees within {final.level}: {top}")
    if clip_taxon and clip_taxon.shares(final, "genus"):
        return Factor("model agreement", cfg.clip_same_genus, f"OpenCLIP prefers {top}, same genus")
    return Factor("model agreement", cfg.clip_disagrees, f"OpenCLIP prefers {top} ({prob:.2f})")


def _detection_factor(ev: Evidence, cfg: EngineConfig) -> Factor:
    c = ev.detector_confidence
    if c >= cfg.weak_detection_below:
        return Factor("detection strength", 1.0, f"clear detection ({c:.2f})")
    return Factor("detection strength", round(0.6 + 0.8 * c, 3), f"weak detection ({c:.2f})")


def _geo_factors(ev: Evidence, final: Taxon, source: str, cfg: EngineConfig) -> list[Factor]:
    out = []
    if "geofence" in source:
        out.append(
            Factor(
                "geographic prior",
                cfg.geofenced,
                f"SpeciesNet's geofence changed its first answer (not known in {ev.country})",
            )
        )
    if not ev.reserve_taxa:
        out.append(Factor("reserve species list", 1.0, "no reserve species list configured"))
    elif any(final.taxon == t or Taxon(t, "").shares(final, final.level) for t in ev.reserve_taxa):
        out.append(Factor("reserve species list", 1.0, "on the reserve's species list"))
    else:
        out.append(
            Factor(
                "reserve species list",
                cfg.off_reserve_list,
                "not on the reserve's species list: check carefully",
            )
        )
    return out


def _time_factor(ev: Evidence, cfg: EngineConfig) -> Factor:
    if ev.hour_bin_share is None or ev.verified_sightings < cfg.min_verified_for_time_prior:
        return Factor(
            "time-of-day prior",
            1.0,
            f"neutral: {ev.verified_sightings} verified sightings of this taxon here so far",
        )
    uniform = 1 / cfg.hour_bins
    if ev.hour_bin_share < cfg.rare_hour_share * uniform:
        return Factor(
            "time-of-day prior",
            cfg.rare_hour,
            f"rarely seen at this hour here ({ev.hour_bin_share:.0%} of verified sightings)",
        )
    return Factor(
        "time-of-day prior", 1.0, f"usual hour here ({ev.hour_bin_share:.0%} of verified sightings)"
    )


def decide(ev: Evidence, cfg: EngineConfig | None = None) -> Outcome:
    cfg = cfg or EngineConfig()
    explanation: dict[str, Any] = {
        "engine_version": ENGINE_VERSION,
        "detector_confidence": ev.detector_confidence,
        "species_top": [
            {"label": t.common_name, "taxon": t.taxon, "score": round(s, 4)}
            for t, s in ev.species_raw
        ],
        "openclip_top": [{"label": n, "probability": round(p, 4)} for n, p in (ev.clip or [])[:5]],
    }
    final = ev.species_final
    if final is None or not final[0].is_animal_taxon:
        name = final[0].common_name if final else "no answer"
        confidence = round(min(cfg.unnamed_cap, ev.detector_confidence), 4)
        explanation |= {
            "base": {"source": "detector", "score": ev.detector_confidence},
            "factors": [
                {
                    "name": "unnamed animal",
                    "factor": None,
                    "reason": f"SpeciesNet could not name it ({name}): capped at {cfg.unnamed_cap}",
                }
            ],
            "summary": "An animal was detected but not identified; a person should name it.",
        }
        return Outcome("animal (unidentified)", None, "none", confidence, explanation)

    taxon, score, source = final
    factors = [
        _clip_factor(ev, taxon, cfg),
        _detection_factor(ev, cfg),
        *_geo_factors(ev, taxon, source, cfg),
        _time_factor(ev, cfg),
    ]
    confidence = score
    for f in factors:
        confidence *= f.factor
    confidence = round(max(0.0, min(1.0, confidence)), 4)
    lowered = [f.reason for f in factors if f.factor < 1.0]
    level_note = "" if taxon.level == "species" else f" (named to {taxon.level} only)"
    explanation |= {
        "base": {"source": f"SpeciesNet ({source})", "score": round(score, 4)},
        "factors": [asdict(f) for f in factors],
        "summary": (
            f"{taxon.common_name}{level_note}: SpeciesNet {score:.2f}"
            + (f"; lowered because {'; '.join(lowered)}" if lowered else "; nothing lowered it")
            + f" → {confidence:.2f}."
        ),
    }
    return Outcome(taxon.common_name, taxon.taxon, taxon.level, confidence, explanation)
