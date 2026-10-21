"""Back up VanDrishti: a Postgres dump plus the image store, with a manifest. Then prove a
backup can be restored, without touching the live database.

    python3 scripts/backup.py create [--compose docker-compose.yml] [--store data/store] [--keep N]
    python3 scripts/backup.py verify  backups/<stamp>  [--compose ...]

`create`:
- `pg_dump -Fc` runs inside the db container; the dump's SHA-256 goes in the manifest.
- The store is copied file by file. Files unchanged since the previous backup (same path,
  size and mtime) are hard links to that backup's copy, never to the live store: derived
  files can be rewritten in place, and a link to them would silently change the backup.
- The manifest records counts, the schema revision, and the audit trail's length and last hash.
- Only the newest `--keep` backups are kept.

`verify` restores the dump into a throwaway database (`vandrishti_restore_check`) and checks:
- the schema revision and audit count match the manifest;
- the audit hash chain verifies (`vandrishti audit verify` logic);
- every original's SHA-256 equals its content-addressed name.

The check database is dropped afterwards. A real restore is a deliberate manual step
(docs/RUNBOOK.md).

Runs with the system Python (stdlib only), so it works on a server without the project
environment. `verify` checks the audit chain with `uv run --project backend`, or with
`--in-container` inside the API image (servers without uv).
"""

# Fixed argument lists, no shell: nothing from outside reaches a command line.
# ruff: noqa: S603

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK_DB = "vandrishti_restore_check"


def sh(args: list[str], **kw: object) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(args, check=True, capture_output=True, **kw)  # type: ignore[call-overload]


def compose(args: argparse.Namespace) -> list[str]:
    return ["docker", "compose", "-f", str(args.compose), "exec", "-T", "db"]


def env(name: str, default: str) -> str:
    return os.environ.get(f"VANDRISHTI_{name}", default)


def psql(args: argparse.Namespace, sql: str, db: str | None = None) -> str:
    out = sh(
        [
            *compose(args),
            "psql",
            "-U",
            env("DB_USER", "vandrishti"),
            "-d",
            db or env("DB_NAME", "vandrishti"),
            "-At",
            "-c",
            sql,
        ]
    )
    return out.stdout.decode().strip()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def copy_store(src: Path, dst: Path, previous: Path | None) -> dict[str, int]:
    stats = {"files": 0, "bytes": 0, "linked": 0, "copied": 0}
    for path in sorted(src.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(src)
        target = dst / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        st = path.stat()
        old = previous / rel if previous else None
        same = old is not None and old.is_file() and old.stat().st_size == st.st_size
        if same and old is not None and int(old.stat().st_mtime) == int(st.st_mtime):
            os.link(old, target)
            stats["linked"] += 1
        else:
            shutil.copy2(path, target)
            stats["copied"] += 1
        stats["files"] += 1
        stats["bytes"] += st.st_size
    return stats


def backups(out: Path) -> list[Path]:
    return sorted(p for p in out.glob("20*") if (p / "manifest.json").exists())


def create(args: argparse.Namespace) -> None:
    started = time.monotonic()
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    out: Path = args.out
    previous = backups(out)[-1] if backups(out) else None
    work = out / f"{stamp}.partial"
    work.mkdir(parents=True)
    dump = work / "db.dump"
    with dump.open("wb") as f:
        subprocess.run(
            [
                *compose(args),
                "pg_dump",
                "-U",
                env("DB_USER", "vandrishti"),
                "-d",
                env("DB_NAME", "vandrishti"),
                "-Fc",
                "--no-owner",
            ],
            stdout=f,
            check=True,
        )
    store = copy_store(args.store, work / "store", previous / "store" if previous else None)
    manifest = {
        "created": stamp,
        "db": {"file": "db.dump", "bytes": dump.stat().st_size, "sha256": sha256_file(dump)},
        "schema_revision": psql(args, "SELECT version_num FROM alembic_version"),
        "audit_events": int(psql(args, "SELECT count(*) FROM audit_event")),
        "audit_last_hash": psql(args, "SELECT hash FROM audit_event ORDER BY seq DESC LIMIT 1"),
        "images": int(psql(args, "SELECT count(*) FROM image")),
        "store": store,
        "previous": previous.name if previous else None,
        "seconds": round(time.monotonic() - started, 1),
    }
    (work / "manifest.json").write_text(json.dumps(manifest, indent=1))
    final = out / stamp
    work.rename(final)  # only complete backups get a final name
    for old in backups(out)[: -args.keep]:
        shutil.rmtree(old)
    print(json.dumps({"backup": str(final), **manifest}, indent=1))


def verify(args: argparse.Namespace) -> None:
    started = time.monotonic()
    bdir: Path = args.backup
    m = json.loads((bdir / "manifest.json").read_text())
    problems = []
    if sha256_file(bdir / "db.dump") != m["db"]["sha256"]:
        problems.append("db.dump checksum differs from the manifest")
    user = env("DB_USER", "vandrishti")
    psql(args, f'DROP DATABASE IF EXISTS "{CHECK_DB}" WITH (FORCE)')
    psql(args, f'CREATE DATABASE "{CHECK_DB}"')
    try:
        with (bdir / "db.dump").open("rb") as f:
            subprocess.run(
                [
                    *compose(args),
                    "pg_restore",
                    "-U",
                    user,
                    "-d",
                    CHECK_DB,
                    "--no-owner",
                    "--exit-on-error",
                ],
                stdin=f,
                check=True,
                capture_output=True,
            )
        revision = psql(args, "SELECT version_num FROM alembic_version", CHECK_DB)
        audit_n = int(psql(args, "SELECT count(*) FROM audit_event", CHECK_DB))
        last = psql(args, "SELECT hash FROM audit_event ORDER BY seq DESC LIMIT 1", CHECK_DB)
        if revision != m["schema_revision"]:
            problems.append(f"schema {revision} != manifest {m['schema_revision']}")
        if audit_n != m["audit_events"] or last != m["audit_last_hash"]:
            problems.append("audit trail differs from the manifest")
        if args.in_container:  # a server: the API image has the verifier
            cmd = [
                "docker",
                "compose",
                "-f",
                str(args.compose),
                "run",
                "--rm",
                "-T",
                "--no-deps",
                "-e",
                f"VANDRISHTI_DB_NAME={CHECK_DB}",
                "api",
                "vandrishti",
                "audit",
                "verify",
            ]
        else:  # a development machine with the project environment
            cmd = ["uv", "run", "--project", str(ROOT / "backend"), "vandrishti", "audit", "verify"]
        chain = subprocess.run(
            cmd,
            env={**os.environ, "VANDRISHTI_DB_NAME": CHECK_DB},
            capture_output=True,
            check=False,
        )
        chain_ok = chain.returncode == 0 and '"ok": true' in chain.stdout.decode()
        if not chain_ok:
            problems.append("audit hash chain does not verify in the restored copy")
    finally:
        psql(args, f'DROP DATABASE IF EXISTS "{CHECK_DB}" WITH (FORCE)')
    originals = list((bdir / "store" / "originals").rglob("*.*"))
    bad = [p.name for p in originals if sha256_file(p) != p.stem]
    if bad:
        problems.append(f"{len(bad)} original(s) do not match their SHA-256 name: {bad[:5]}")
    if len(list((bdir / "store").rglob("*.*"))) != m["store"]["files"]:
        problems.append("store file count differs from the manifest")
    report = {
        "backup": bdir.name,
        "ok": not problems,
        "problems": problems,
        "schema_revision": m["schema_revision"],
        "audit_events": m["audit_events"],
        "originals_checked": len(originals),
        "seconds": round(time.monotonic() - started, 1),
    }
    print(json.dumps(report, indent=1))
    sys.exit(0 if not problems else 1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("step", choices=["create", "verify"])
    ap.add_argument("backup", nargs="?", type=Path, help="for verify: backups/<stamp>")
    ap.add_argument("--compose", type=Path, default=ROOT / "docker-compose.yml")
    ap.add_argument("--store", type=Path, default=ROOT / "data" / "store")
    ap.add_argument("--out", type=Path, default=ROOT / "backups")
    ap.add_argument("--keep", type=int, default=14)
    ap.add_argument(
        "--in-container",
        action="store_true",
        help="verify: run the audit check in the api container (servers)",
    )
    args = ap.parse_args()
    if args.step == "create":
        create(args)
    elif args.backup is None:
        sys.exit("verify needs a backup directory")
    else:
        verify(args)


if __name__ == "__main__":
    main()
