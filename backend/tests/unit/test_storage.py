import io
from pathlib import Path

import pytest

from vandrishti.core.storage import LocalStorage, StorageError, original_key, sha256_of


def _file(tmp: Path, name: str, data: bytes) -> Path:
    p = tmp / name
    p.write_bytes(data)
    return p


def test_originals_are_content_addressed_and_deduplicated(tmp_path: Path) -> None:
    store = LocalStorage(tmp_path / "store")
    a = _file(tmp_path, "IMG_0001.JPG", b"frame bytes")
    copy = _file(tmp_path, "renamed.jpg", b"frame bytes")
    first = store.store_original(a)
    again = store.store_original(copy)
    assert first.created and not again.created
    assert first.key == again.key == original_key(sha256_of(a), ".jpg")
    assert first.key.startswith(f"originals/{first.sha256[:2]}/")
    with store.open(first.key) as f:
        assert f.read() == b"frame bytes"


def test_originals_are_read_only_and_cannot_be_written_as_derivatives(tmp_path: Path) -> None:
    store = LocalStorage(tmp_path / "store")
    stored = store.store_original(_file(tmp_path, "a.jpg", b"x"))
    assert not (store.path(stored.key).stat().st_mode & 0o222)
    with pytest.raises(StorageError):
        store.put_derived(stored.key, io.BytesIO(b"tampered"))
    assert store.put_derived("derived/small/a.jpg", io.BytesIO(b"small")) == 5


@pytest.mark.parametrize("key", ["", "/etc/passwd", "../outside", "derived/../../x", "a\\b"])
def test_keys_cannot_escape_the_root(tmp_path: Path, key: str) -> None:
    with pytest.raises(StorageError):
        LocalStorage(tmp_path).path(key)


def test_odd_extensions_are_refused() -> None:
    with pytest.raises(StorageError):
        original_key("ab" * 32, ".j/pg")
