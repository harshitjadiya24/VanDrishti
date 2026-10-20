"""The names VanDrishti can use: SpeciesNet's own label list (animals only), for corrections
and reserve species lists. Loaded once from the downloaded model folder."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from vandrishti.taxonomy import Taxon, parse_label

SPECIESNET_DIR = "kagglehub/models/google/speciesnet/pyTorch/v4.0.3a/1"


@lru_cache(maxsize=4)
def load(model_cache: Path) -> tuple[Taxon, ...]:
    labels = next((model_cache / SPECIESNET_DIR).glob("*.labels.*.txt"), None)
    if labels is None:
        return ()
    seen: dict[str, Taxon] = {}
    for line in labels.read_text().splitlines():
        t = parse_label(line)
        if t.is_animal_taxon:
            seen.setdefault(t.common_name, t)
    return tuple(sorted(seen.values(), key=lambda t: t.common_name))


@lru_cache(maxsize=4)
def _geofence(model_cache: Path) -> dict[str, dict[str, Any]]:
    path = next((model_cache / SPECIESNET_DIR).glob("geofence_release.*.json"), None)
    return json.loads(path.read_text()) if path else {}


def allowed_in(model_cache: Path, taxon: str, country: str | None) -> bool:
    """SpeciesNet's geofence: may this taxon occur in the country? No rule → allowed."""
    if not country:
        return True
    rule = _geofence(model_cache).get(taxon)
    if not rule:
        return True
    allow, block = rule.get("allow"), rule.get("block", {})
    if allow is not None and country not in allow:
        return False
    return not (country in block and block[country] == [])


def search(
    model_cache: Path,
    query: str,
    limit: int = 20,
    first: frozenset[str] = frozenset(),
    country: str | None = None,
) -> list[Taxon]:
    """Names matching the query, best first:
    1. on the reserve's own species list;
    2. allowed in the reserve's country by SpeciesNet's geofence;
    3. the typed word is the name's last word, the kind of animal in English
       ("northern raccoon" before "raccoon dog", which is a dog);
    4. the typed word is a whole word in the name; then names starting with it; shorter first.
    """
    q = query.strip().lower()
    if len(q) < 2:
        return []
    hits = [t for t in load(model_cache) if q in t.common_name or q in t.taxon]

    def rank(t: Taxon) -> tuple[bool, ...]:
        words = t.common_name.split()
        return (
            t.taxon not in first,
            not allowed_in(model_cache, t.taxon, country),
            not (words and words[-1] == q),
            q not in words,
            not t.common_name.startswith(q),
        )

    hits.sort(key=lambda t: (*rank(t), len(t.common_name)))
    return hits[:limit]
