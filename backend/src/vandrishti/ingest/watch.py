"""Auto fetch / sync (section 2): poll an inbox and ingest new files.

Layout: `<inbox>/<RESERVE_CODE>/<CAMERA_CODE>/<any sub-folders>/<images>`. Field staff (or
a sync tool) copy SD-card contents there. A file is picked up once its size and
modification time have stayed the same for two polls, so half-copied files are left alone.
Source files are never deleted or moved; the content hash makes re-ingesting harmless.

Polling instead of filesystem events: no extra dependency, and it works the same on
network shares and USB drives, where event APIs are unreliable.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from vandrishti.core.config import Settings
from vandrishti.core.storage import LocalStorage
from vandrishti.db.models import Camera, IngestSource, Reserve
from vandrishti.ingest.service import IMAGE_SUFFIXES, BatchResult, ingest_files

logger = logging.getLogger(__name__)

Signature = tuple[int, int]  # size, mtime in ns


@dataclass
class InboxScanner:
    """Remembers what it has seen, so stable, already-handled files are never re-hashed."""

    inbox: Path
    pending: dict[Path, Signature] = field(default_factory=dict)
    done: dict[Path, Signature] = field(default_factory=dict)

    def poll(self) -> list[Path]:
        """Files that are unchanged since the previous poll and not handled yet."""
        ready, seen_now = [], {}
        for p in self.inbox.rglob("*"):
            rel = p.relative_to(self.inbox)
            if any(part.startswith(".") for part in rel.parts) or len(rel.parts) < 3:
                continue
            if not p.is_file() or p.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            st = p.stat()
            sig = (st.st_size, st.st_mtime_ns)
            if self.done.get(p) == sig:
                continue
            seen_now[p] = sig
            if self.pending.get(p) == sig:
                ready.append(p)
        self.pending = {p: s for p, s in seen_now.items() if p not in ready}
        for p in ready:
            self.done[p] = seen_now[p]
        return sorted(ready)

    def retry(self, paths: list[Path]) -> None:
        """Forget these files so a later poll offers them again (e.g. camera not registered)."""
        for p in paths:
            sig = self.done.pop(p, None)
            if sig is not None:
                self.pending[p] = sig  # already known stable: offered on the next poll


def ingest_ready(
    session: Session, storage: LocalStorage, settings: Settings, inbox: Path, files: list[Path]
) -> tuple[list[BatchResult], list[Path]]:
    """Group ready files by reserve/camera folder and ingest each group as one batch.

    Returns the batch results and the files skipped because their camera is not registered
    yet (the caller retries those on a later poll).
    """
    groups: dict[tuple[str, str], list[Path]] = defaultdict(list)
    for p in files:
        reserve, camera = p.relative_to(inbox).parts[:2]
        groups[(reserve, camera)].append(p)
    results, skipped = [], []
    for (reserve_code, camera_code), paths in groups.items():
        camera = session.scalar(
            select(Camera)
            .join(Reserve, Reserve.id == Camera.reserve_id)
            .where(Reserve.code == reserve_code, Camera.code == camera_code)
        )
        if camera is None:
            logger.warning(
                "inbox folder has no registered camera; skipped",
                extra={"reserve": reserve_code, "camera": camera_code, "files": len(paths)},
            )
            skipped += paths
            continue
        root = inbox / reserve_code / camera_code
        results.append(
            ingest_files(
                session,
                storage,
                settings,
                camera,
                [(p, p.relative_to(root).as_posix()) for p in paths],
                source=IngestSource.WATCH,
                path=str(root),
            )
        )
    return results, skipped


def run_watch(
    factory: sessionmaker[Session],
    storage: LocalStorage,
    settings: Settings,
    inbox: Path,
    *,
    polls: int | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    """Poll forever (or `polls` times, for tests and one-off syncs)."""
    scanner = InboxScanner(inbox)
    n = 0
    while polls is None or n < polls:
        ready = scanner.poll()
        if ready:
            with factory() as session:
                results, skipped = ingest_ready(session, storage, settings, inbox, ready)
            for r in results:
                logger.info("inbox batch ingested", extra=r.as_dict())
            scanner.retry(skipped)
        n += 1
        if polls is None or n < polls:
            sleep(settings.watch_interval_seconds)
