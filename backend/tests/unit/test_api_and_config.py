from pathlib import Path

from fastapi.testclient import TestClient

from vandrishti import __version__
from vandrishti.api.app import create_app
from vandrishti.cli import main
from vandrishti.core.config import REPO_ROOT, Settings


def test_health_and_version() -> None:
    c = TestClient(create_app())
    assert c.get("/health").json() == {"status": "ok"}
    v = c.get("/version").json()
    assert v["name"] == "vandrishti" and v["version"] == __version__


def test_relative_paths_are_anchored_to_the_repo() -> None:
    s = Settings(storage_root=Path("data/store"))  # type: ignore[arg-type]
    assert s.storage_root == (REPO_ROOT / "data/store").resolve()
    assert s.database_url.drivername == "postgresql+psycopg"


def test_cli_version(capsys) -> None:  # type: ignore[no-untyped-def]
    main(["version"])
    assert capsys.readouterr().out.strip() == __version__
