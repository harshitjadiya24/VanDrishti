import json
from pathlib import Path

from vandrishti import species_names

LABELS = """\
a;mammalia;carnivora;canidae;nyctereutes;procyonoides;raccoon dog
b;mammalia;carnivora;procyonidae;procyon;lotor;northern raccoon
c;mammalia;carnivora;felidae;panthera;tigris;tiger
d;mammalia;artiodactyla;cervidae;odocoileus;hemionus;mule deer
e;mammalia;artiodactyla;cervidae;axis;axis;chital
f;;;;;;blank
"""
GEOFENCE = {
    "mammalia;carnivora;procyonidae;procyon;lotor": {"allow": {"USA": []}},
    "mammalia;carnivora;felidae;panthera;tigris": {"allow": {"IND": []}},
    "mammalia;artiodactyla;cervidae;odocoileus;hemionus": {"block": {"IND": []}},
}


def cache(tmp_path: Path) -> Path:
    folder = tmp_path / species_names.SPECIESNET_DIR
    folder.mkdir(parents=True)
    (folder / "x.labels.1.txt").write_text(LABELS)
    (folder / "geofence_release.1.json").write_text(json.dumps(GEOFENCE))
    species_names.load.cache_clear()
    species_names._geofence.cache_clear()
    return tmp_path


def names(hits: list) -> list[str]:  # type: ignore[type-arg]
    return [t.common_name for t in hits]


def test_head_noun_beats_prefix(tmp_path: Path) -> None:
    m = cache(tmp_path)
    assert names(species_names.search(m, "raccoon")) == ["northern raccoon", "raccoon dog"]
    assert "blank" not in names(species_names.search(m, "bl"))  # only animal names


def test_geofence_and_reserve_list_come_first(tmp_path: Path) -> None:
    m = cache(tmp_path)
    assert not species_names.allowed_in(m, "mammalia;carnivora;procyonidae;procyon;lotor", "IND")
    assert not species_names.allowed_in(
        m, "mammalia;artiodactyla;cervidae;odocoileus;hemionus", "IND"
    )
    assert species_names.allowed_in(m, "mammalia;carnivora;canidae;nyctereutes;procyonoides", "IND")
    # In India the raccoon (not allowed there) drops below the raccoon dog.
    assert names(species_names.search(m, "raccoon", country="IND")) == [
        "raccoon dog",
        "northern raccoon",
    ]
    chital = "mammalia;artiodactyla;cervidae;axis;axis"
    listed = species_names.search(
        m, "mammalia;artiodactyla", first=frozenset({chital}), country="IND"
    )
    assert names(listed)[0] == "chital"
