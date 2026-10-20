# VanDrishti — rules for Claude sessions

Camera-trap monitoring for Indian tiger reserves (rebuild of 2026-10-20).
Brief: `MASTER_PROMPT.md` (from the architecture image). Design: `docs/ARCHITECTURE.md`.
The previous project was deleted completely on 2026-10-20 (code, archive, `data/`, git
history, old Docker volumes). Do not look for it; build from the image.

## Workflow
- **Never run `git commit`, `git push`, `git init` or install git hooks.** The developer
  commits manually; at a checkpoint, stop and suggest a commit message.
- One phase at a time: short plan → build → tests + lint → docs → summary (works / measured /
  left) + Hinglish summary → wait for go-ahead.
- Ask before a major dependency, an architecture change, downloads over ~2 GB, or anything
  that strains 8 GB of RAM. Significant choices get an ADR in `docs/DECISIONS/`.

## Hard constraints
- Pretrained models only. One heavy model resident at a time; MPS with CPU fallback.
- Only `vandrishti/models/adapters/*` imports model libraries; everything else uses the
  `Model` interface (`load/unload/predict`, `name/version/licence/memory_estimate_mb`).
- Every model output row stores model name, version, config hash and timestamps. Stages are
  idempotent (unique keys + upsert).
- Originals are immutable and content-addressed (SHA-256); derivatives are separate files.
- People decide: never auto-confirm a person/vehicle alert, a new tiger, or a low-margin
  identity. Whole-body blur for people; no face detection or recognition.
- Never fabricate a number; quote metrics with their caveats; movement is inferred.
- Config via Pydantic Settings (`VANDRISHTI_*`, `.env`); commit `.env.example` only.
- Type hints everywhere; `mypy --strict` clean; ruff lint + format. Unit tests for logic,
  `@pytest.mark.integration` for DB tests, `@pytest.mark.slow` for real models.
- Never commit data, weights or images (`data/` is git-ignored).

## Commands (from `backend/`)
- `uv sync` · `uv run pytest` · `uv run pytest -m integration` (needs the db)
- `uv run ruff check . && uv run ruff format . && uv run mypy`
- `uv run alembic upgrade head` · `uv run vandrishti-api` → http://127.0.0.1:8000/docs
- From the repo root: `docker compose up -d --wait` (db + redis)

## Facts learned in the previous build (still true)
- Disk runs near-full; Docker's VM disk grows into free space, and a full disk once corrupted
  image layers (fix: `docker image rm` + `docker builder prune -af`). Check `df -h` first.
- The laptop hung once running a worker + detector + polling: check `memory_pressure`
  before model runs; MPS memory may not show in `ps` (use `/usr/bin/time -l`).
- SAM 2 on MPS makes the Metal driver reserve ~2.4 GB (invisible in RSS): run it on CPU.
- Hugging Face downloads can hang at 0 bytes on the "xet" path: set `HF_HUB_DISABLE_XET=1`.
- `postgis/postgis` has no arm64 image: build on `postgres:16` + PGDG postgis/pgvector packages.
- Python 3.11: no PEP 695 generics. Starlette 1.x TestClient wants `httpx2`.
- Postgres caps a query at 65,535 parameters: send big geometries as one WKT string.
- LILA images have no EXIF (times come from a manifest). SWG times are local clock times.
- SpeciesNet's UNKNOWN fills every rank with "no cv result"; roll-up scores can exceed 1.
- BioCLIP is weak on night-IR crops; Florence-2 captions hallucinate (never decide on them).
- IND-ADS (an Indian regional species model) is confidently wrong outside Central India; it never
  reached 95% precision alone. Its calibration is poor (ECE ~0.18).
- MegaDescriptor was likely pretrained on ATRW: ATRW re-ID numbers are optimistic. ATRW
  frames come from videos; quote the cross-scene ("hard") protocol only.
- No open Indian camera-trap images exist on LILA, and WII's Rajaji server is down: never
  imply Indian field validation that has not happened.
- iNaturalist: use API v2 with `fields=`, at most 1 request per second.
- Compose ports must bind to `127.0.0.1:` explicitly; a bare `"5432:5432"` publishes on
  every interface.
- MapLibre (if used) is ESM-only and needs `setWorkerUrl`; no external tiles or fonts.
- Calendar buckets (hours, days, months) use the reserve's time zone, never UTC.
- Duplicate detection is global by SHA-256: synthetic test images must use random pixels
  (`tests/images.write_jpeg`), or one test sees another's image as a duplicate.
- Camera clocks are local: EXIF/manifest times are read in the reserve's zone, stored UTC.
  Every image keeps `time_source` and `gps_source`; never treat `file_mtime` times as reliable.
- The database lives in the Docker volume `vandrishti_pgdata_v2`.
- MegaDetector V6 (MIT) runs from bundled MIT code in `models/adapters/vendor/yolo_mit`
  (excluded from ruff/mypy; changes marked "VanDrishti:"). Never install PytorchWildlife (it
  pulls AGPL ultralytics). Its upstream loader ignores missing weights: our adapter refuses.
- The detector is faster on CPU than MPS on the M3 (0.16 vs 0.33 s/image): keep CPU default.
- LILA labels are imperfect: Caltech's box-file "empty" entries show animals; some image-level
  "empty" frames show people; 30/32 Caltech car boxes are whole-frame. Check by eye (blurred
  copies for people) before trusting a surprising metric.
- Test data: `scripts/download_sample.py` (252 LILA images, ~110 MB, contains a few people:
  `data/` stays git-ignored); weights: `scripts/download_models.py megadetector-v6-mit-c`.
- `.env` predates the rebuild: old keys can collide with new meanings (DETECTOR_BATCH_SIZE
  was 250 and is now images per model batch). Keep `.env.example` the reference.
