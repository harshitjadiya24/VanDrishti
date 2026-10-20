"""SpeciesNet label strings → taxonomy.

A label is "uuid;class;order;family;genus;species;common name". VanDrishti stores the taxon
as "class;order;family;genus;species" (lower case) and reports the most specific level.
"""

from __future__ import annotations

from dataclasses import dataclass

LEVELS = ("class", "order", "family", "genus", "species")
NON_ANIMAL = {"blank", "human", "vehicle", "animal", "unknown", "no cv result"}


@dataclass(frozen=True, slots=True)
class Taxon:
    taxon: str  # "class;order;family;genus;species"
    common_name: str

    @property
    def level(self) -> str:
        parts = self.taxon.split(";")
        for name, value in reversed(list(zip(LEVELS, parts, strict=False))):
            if value:
                return name
        return "none"

    @property
    def is_animal_taxon(self) -> bool:
        return self.level != "none" and self.common_name not in NON_ANIMAL

    def shares(self, other: Taxon, level: str) -> bool:
        """Same taxon down to `level` (e.g. "genus"), both known to that level."""
        n = LEVELS.index(level) + 1
        a, b = self.taxon.split(";")[:n], other.taxon.split(";")[:n]
        return len(a) == n and a == b and all(a)


def parse_label(label: str) -> Taxon:
    parts = label.split(";")
    if len(parts) >= 7:
        return Taxon(";".join(p.strip().lower() for p in parts[1:6]), parts[6].strip().lower())
    return Taxon(";;;;", label.strip().lower())
