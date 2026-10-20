"""Download model weights into data/models/, verifying each file's checksum.

    uv run --project backend python scripts/download_models.py megadetector-v6-mit-c

Nothing downloads at run time: adapters only read files this script has verified.
Every model here is recorded in docs/MODELS.md with its source and licence.
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "data" / "models"


@dataclass(frozen=True)
class Asset:
    url: str
    path: str  # relative to data/models
    md5: str


# Zenodo record 15398270 (Pytorch-Wildlife model weights, CC-BY-4.0), checksums from its API.
CATALOG: dict[str, list[Asset]] = {
    "megadetector-v6-mit-c": [
        Asset(
            "https://zenodo.org/records/15398270/files/MDV6-mit-yolov9-c.ckpt?download=1",
            "megadetector/MDV6-mit-yolov9-c.ckpt",
            "d8626ba22fccbd9c520e0deb19d721f7",
        ),
        Asset(
            "https://zenodo.org/records/15398270/files/config_v9s.yaml?download=1",
            "megadetector/config_v9s.yaml",
            "707474e2d544215d1c87fb398cd1fd2e",
        ),
    ],
}


def md5_of(path: Path) -> str:
    h = hashlib.md5()  # noqa: S324 (integrity check against the publisher's checksum)
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(asset: Asset) -> Path:
    dst = MODELS / asset.path
    if dst.exists() and md5_of(dst) == asset.md5:
        print(f"ok (cached) {asset.path}")
        return dst
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(dst.suffix + ".part")
    with urllib.request.urlopen(asset.url, timeout=60) as r, tmp.open("wb") as out:  # noqa: S310
        shutil.copyfileobj(r, out, 1 << 20)
    got = md5_of(tmp)
    if got != asset.md5:
        tmp.unlink()
        sys.exit(f"checksum mismatch for {asset.path}: {got} != {asset.md5}")
    tmp.replace(dst)
    print(f"ok {asset.path} ({dst.stat().st_size / 1e6:.1f} MB)")
    return dst


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("name", choices=sorted(CATALOG))
    args = p.parse_args()
    for asset in CATALOG[args.name]:
        fetch(asset)


if __name__ == "__main__":
    main()
