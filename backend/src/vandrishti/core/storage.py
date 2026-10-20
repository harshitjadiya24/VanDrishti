"""Raw data storage: immutable, content-addressed originals plus separate derivatives.

Originals are stored under `originals/<sha[:2]>/<sha>.<ext>`. The key is derived from the
bytes, so storing the same file twice is a no-op (that is the duplicate check) and an
original can never be replaced by different content; the file is also made read-only.
Derivatives (resized, blurred, crops) go under `derived/` and may be regenerated.
"""

from __future__ import annotations

import hashlib
import os
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

CHUNK = 1 << 20


class StorageError(ValueError):
    """Bad key, or an attempt to change an immutable original."""


@dataclass(frozen=True, slots=True)
class StoredOriginal:
    key: str
    sha256: str
    size: int
    created: bool  # False when identical bytes were already stored (a duplicate)


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(CHUNK), b""):
            h.update(chunk)
    return h.hexdigest()


def original_key(sha256: str, suffix: str) -> str:
    ext = suffix.lower().lstrip(".") or "bin"
    if not ext.isalnum() or len(ext) > 8:
        raise StorageError(f"unusable file extension {suffix!r}")
    return f"originals/{sha256[:2]}/{sha256}.{ext}"


class LocalStorage:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()

    def path(self, key: str) -> Path:
        if not key or key.startswith("/") or "\\" in key:
            raise StorageError(f"bad storage key {key!r}")
        p = (self.root / key).resolve()
        if self.root not in p.parents:
            raise StorageError(f"storage key escapes the root: {key!r}")
        return p

    def exists(self, key: str) -> bool:
        return self.path(key).is_file()

    def open(self, key: str) -> BinaryIO:
        return self.path(key).open("rb")

    def store_original(self, src: Path, sha256: str | None = None) -> StoredOriginal:
        """Copy a file in as an immutable original (idempotent for identical bytes).

        Pass `sha256` when the caller already hashed the file, to avoid reading it twice.
        """
        sha = sha256 or sha256_of(src)
        key = original_key(sha, src.suffix)
        dst = self.path(key)
        size = src.stat().st_size
        if dst.exists():
            return StoredOriginal(key, sha, size, created=False)
        self._atomic_copy(src, dst)
        os.chmod(dst, 0o444)  # read-only: a second guard against accidental edits
        return StoredOriginal(key, sha, size, created=True)

    def put_derived(self, key: str, data: BinaryIO) -> int:
        """Write (or replace) a derivative. Originals cannot be written this way."""
        if not key.startswith("derived/"):
            raise StorageError("derivatives must live under derived/")
        dst = self.path(key)
        dst.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=dst.parent, prefix=".tmp-")
        with os.fdopen(fd, "wb") as out:
            shutil.copyfileobj(data, out, CHUNK)
        os.replace(tmp, dst)
        return dst.stat().st_size

    def _atomic_copy(self, src: Path, dst: Path) -> None:
        dst.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=dst.parent, prefix=".tmp-")
        with os.fdopen(fd, "wb") as out, src.open("rb") as inp:
            shutil.copyfileobj(inp, out, CHUNK)
        os.replace(tmp, dst)
