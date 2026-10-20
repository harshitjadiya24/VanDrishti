"""Download model weights into data/models/, verifying each file's checksum.

    uv run --project backend python scripts/download_models.py megadetector-v6-mit-c
    uv run --project backend python scripts/download_models.py openclip-vit-b-16 sam2.1-tiny
    uv run --project backend python scripts/download_models.py speciesnet-v4.0.3a

Nothing downloads at run time: adapters only read files this script has verified.
Every model here is recorded in docs/MODELS.md with its source and licence.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import subprocess
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
    md5: str | None = None
    sha256: str | None = None  # Hugging Face LFS checksum; small files trust the pinned revision


def hf(repo: str, revision: str, file: str, folder: str, sha256: str | None = None) -> Asset:
    """A file from a Hugging Face repo, pinned to an exact commit."""
    return Asset(
        f"https://huggingface.co/{repo}/resolve/{revision}/{file}",
        f"{folder}/{file}",
        sha256=sha256,
    )


OPENCLIP = ("laion/CLIP-ViT-B-16-laion2B-s34B-b88K", "7288da5a0d6f0b51c4a2b27c624837a9236d0112")
SAM2 = ("facebook/sam2.1-hiera-tiny", "de431c4043854a71d8101e17995dfe596bf101a5")
SPECIESNET = "google/speciesnet/pyTorch/v4.0.3a/1"  # Kaggle; fetched inside tools/speciesnet


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
    # OpenCLIP ViT-B/16 trained on LAION-2B (MIT), section 5.4.
    "openclip-vit-b-16": [
        hf(*OPENCLIP, "open_clip_config.json", "openclip-vit-b-16"),
        hf(
            *OPENCLIP,
            "open_clip_model.safetensors",
            "openclip-vit-b-16",
            "3f25d29d3cc74e1d25d47e0593b4dd0864ced1e9b4d8e486a247ca4502f227f1",
        ),
    ],
    # SAM 2.1 hiera-tiny in Hugging Face transformers format (Apache-2.0), section 5.5.
    "sam2.1-tiny": [
        hf(*SAM2, "config.json", "sam2.1-tiny"),
        hf(*SAM2, "preprocessor_config.json", "sam2.1-tiny"),
        hf(*SAM2, "processor_config.json", "sam2.1-tiny"),
        hf(
            *SAM2,
            "model.safetensors",
            "sam2.1-tiny",
            "48c14467e5cf9e51870511feb72c89688e82dd74523142c0538b663e193ac2a7",
        ),
    ],
}


def digest(path: Path, algorithm: str) -> str:
    h = hashlib.new(algorithm)  # md5 only to compare with the publisher's checksum
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def verified(path: Path, asset: Asset) -> bool:
    if asset.sha256:
        return digest(path, "sha256") == asset.sha256
    if asset.md5:
        return digest(path, "md5") == asset.md5
    return path.stat().st_size > 0


def fetch(asset: Asset) -> Path:
    dst = MODELS / asset.path
    if dst.exists() and verified(dst, asset):
        print(f"ok (cached) {asset.path}")
        return dst
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(dst.suffix + ".part")
    with urllib.request.urlopen(asset.url, timeout=60) as r, tmp.open("wb") as out:  # noqa: S310
        shutil.copyfileobj(r, out, 1 << 20)
    if not verified(tmp, asset):
        tmp.unlink()
        sys.exit(f"checksum mismatch for {asset.path}")
    tmp.replace(dst)
    print(f"ok {asset.path} ({dst.stat().st_size / 1e6:.1f} MB)")
    return dst


def fetch_speciesnet() -> None:
    """SpeciesNet weights come from Kaggle through its own isolated environment."""
    env = {**os.environ, "KAGGLEHUB_CACHE": str(MODELS / "kagglehub")}
    code = f"import kagglehub; print(kagglehub.model_download({SPECIESNET!r}))"
    subprocess.run(  # noqa: S603 (fixed argv, no shell)
        ["uv", "run", "--project", str(ROOT / "tools" / "speciesnet"), "python", "-c", code],  # noqa: S607
        env=env,
        check=True,
    )


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("names", nargs="+", choices=[*sorted(CATALOG), "speciesnet-v4.0.3a"])
    args = p.parse_args()
    for name in args.names:
        if name == "speciesnet-v4.0.3a":
            fetch_speciesnet()
            continue
        for asset in CATALOG[name]:
            fetch(asset)


if __name__ == "__main__":
    main()
