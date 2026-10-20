# VanDrishti

Camera-trap monitoring for Indian tiger reserves. **AI proposes; people decide.**

VanDrishti ingests camera-trap images, drops bad and empty frames, finds animals, people and
vehicles, names species, explains every decision, routes each image by confidence to
auto-accept, human review or "uncertain", scores poaching risk, and turns the result into
dashboards, alerts and reports for forest departments. People are blurred, originals are
locked by role, and exact locations are protected.

> **Rebuild in progress (from 2026-10-20).** The brief is [`MASTER_PROMPT.md`](MASTER_PROMPT.md);
> design in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Built so far: foundations, image
> sections 1–4 (cameras, ingestion, raw storage, preprocessing) and 5.1–5.2 (quality gate,
> MegaDetector V6, whole-body blur of people and vehicles). Measurements: [`docs/EVALUATION.md`](docs/EVALUATION.md).

## Run the foundations

Requirements: Docker Desktop, [uv](https://docs.astral.sh/uv/).

```bash
cp .env.example .env
docker compose up -d --build --wait          # Postgres 16 + PostGIS, Redis (127.0.0.1 only)
cd backend && uv sync
uv run alembic upgrade head
uv run vandrishti db check                   # {"ok": true, "schema_revision": "0001"}
uv run vandrishti-api                        # http://127.0.0.1:8000/docs
```

## Ingest camera-trap images

```bash
uv run vandrishti reserve create --code KAN --name "Kanha" --timezone Asia/Kolkata
uv run vandrishti camera add --reserve KAN --code S-01 --lat 22.33 --lon 80.61
uv run vandrishti ingest /path/to/sd_card --reserve KAN --camera S-01 [--manifest times.csv]
uv run vandrishti watch /path/to/inbox                        # inbox/<RESERVE>/<CAMERA>/...
```
## Quality gate and detection

```bash
uv run --project backend python scripts/download_models.py megadetector-v6-mit-c   # 119 MB, verified
uv run vandrishti quality --reserve KAN        # 5.1: pass / fail (+ warnings)
uv run vandrishti detect --reserve KAN         # 5.2: animal / no object / person-vehicle (blurred)
uv run --project backend python scripts/download_sample.py && \
  uv run --project backend python scripts/eval_detector.py   # measure on 252 labelled LILA images
```

Uploads: `POST /cameras/{id}/images` (multipart, `Authorization: Bearer $VANDRISHTI_INGEST_TOKEN`).

Checks: `uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest`
(integration tests: `uv run pytest -m integration`, needs the database).

## Layout
```
backend/src/vandrishti/
  core/      settings, JSON logging, immutable content-addressed storage
  db/        SQLAlchemy models, Alembic migrations
  models/    the Model interface, a memory-aware ModelManager, adapters (only place for ML libs)
  ingest/    metadata (EXIF, manifest), preprocessing, bursts, ingest service, inbox watcher
  pipeline/  5.1 quality gate, 5.2 detection stage
  privacy/   whole-body blur
  api/       FastAPI app: health, reserves and cameras, uploads, batches, images
  cli.py     `vandrishti` command
docker/      database image (Postgres 16 + PostGIS on arm64 and amd64)
docs/        architecture, models and licences, decisions
data/        weights and datasets (git-ignored)
```

Licence: Apache-2.0 for the code. Each model keeps its own licence ([`docs/MODELS.md`](docs/MODELS.md)).
