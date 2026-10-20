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
> MegaDetector V6, whole-body blur of people and vehicles) and 5.3–5.7 (SpeciesNet, OpenCLIP,
> SAM 2, explainable decision engine) and 7–8 (confidence routing, the review console, feedback,
> hash-chained audit trail) and 6 (people/vehicle events, activity patterns, explained poaching-risk
> levels). Measurements: [`docs/EVALUATION.md`](docs/EVALUATION.md).

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

## Species, checks, masks and decisions

```bash
(cd tools/speciesnet && uv sync)                                  # isolated SpeciesNet env
uv run --project backend python scripts/download_models.py speciesnet-v4.0.3a openclip-vit-b-16 sam2.1-tiny
uv run vandrishti species add --reserve KAN --name tiger --name leopard --name chital   # optional prior
uv run vandrishti analyse --reserve KAN        # 5.3 species → 5.4 OpenCLIP → 5.5 SAM 2 → 5.6/5.7
curl http://127.0.0.1:8000/images/<id>/decision                    # label, confidence, explanation
```

## Route and review

```bash
uv run vandrishti route --reserve KAN      # 7: auto-accept ≥ 0.9, review 0.6-0.9, uncertain < 0.6
uv run vandrishti-api                      # API on 127.0.0.1:8000
cd ../frontend && npm ci && npm run dev    # console on http://127.0.0.1:5173
uv run vandrishti audit verify             # recompute the audit hash chain
```

## People, vehicles and poaching risk

```bash
uv run vandrishti camera set-sensitivity --reserve KAN --code S-07 --level core   # optional
uv run vandrishti risk --reserve KAN --vehicle-types     # events + LOW/MEDIUM/HIGH with reasons
```
The console's "Poaching risk" screen lists events most urgent first. The level is a triage
order with reasons, not a prediction.

In the console, name yourself in the sidebar, pick a queue and review with the keyboard:
`Y`/`Enter` confirm, `C` correct, `N` not an animal, `F` false alarm, `S` skip, `P` poaching,
`1`–`3` severity, `M` outline, `J`/`K` next/previous, `U` undo.

Uploads: `POST /cameras/{id}/images` (multipart, `Authorization: Bearer $VANDRISHTI_INGEST_TOKEN`).

Checks: `uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest`
(integration tests: `uv run pytest -m integration`, needs the database).

## Dashboard and tiger identities

```bash
uv run vandrishti reid embed --reserve KAN     # PyTorch: one vector per settled tiger frame
uv run vandrishti reid match --reserve KAN     # FAISS: proposals for a person to decide
uv run vandrishti individual list --reserve KAN
uv run vandrishti reid similar --reserve KAN   # named tigers that look alike
```
The console opens on the Dashboard (overview, camera map, camera analytics, trends). Under
"Tiger identities" a person confirms "same tiger as…", creates a new tiger, or rejects the
proposal; the model never names a tiger. MegaDescriptor is **non-commercial** (CC-BY-NC-4.0):
see [`docs/MODELS.md`](docs/MODELS.md).

## Layout
```
backend/src/vandrishti/
  core/      settings, JSON logging, immutable content-addressed storage
  db/        SQLAlchemy models, Alembic migrations
  models/    the Model interface, a memory-aware ModelManager, adapters (only place for ML libs)
  ingest/    metadata (EXIF, manifest), preprocessing, bursts, ingest service, inbox watcher
  pipeline/  5.1 quality gate, 5.2 detection, 5.3-5.5 species/check/mask stages, 5.6 decision engine
  analytics/ settled labels, 10.1-10.4 dashboard numbers
  reid/      10.5 embeddings, FAISS index, proposals, people's decisions
  privacy/   whole-body blur
  api/       FastAPI app: health, reserves and cameras, uploads, batches, images
  cli.py     `vandrishti` command
docker/      database image (Postgres 16 + PostGIS on arm64 and amd64)
tools/       speciesnet/: isolated SpeciesNet environment and bridge script
frontend/    review console (React, TypeScript, Vite, Tailwind)
docs/        architecture, models and licences, decisions
data/        weights and datasets (git-ignored)
```

Licence: Apache-2.0 for the code. Each model keeps its own licence ([`docs/MODELS.md`](docs/MODELS.md)).
