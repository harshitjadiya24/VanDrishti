# VanDrishti architecture

Source: the architecture image turned into [`MASTER_PROMPT.md`](../MASTER_PROMPT.md). This file
records how each part is built; it grows phase by phase.

## 1. Flow

```
1 camera network ─► 2 ingestion ─► 3 raw storage (immutable) ─► 4 preprocessing
                                                                    │
5 AI pipeline: 5.1 quality gate ─► 5.2 MegaDetector V6 ─► 5.3 SpeciesNet ─► 5.4 OpenCLIP
               ─► 5.5 SAM 2 ─► 5.6 decision engine ─► 5.7 explanation
      │ human/vehicle                          │ label + confidence
      ▼                                        ▼
6 human/vehicle + poaching risk      7 confidence routing: ≥90 auto · 60–90 review · <60 uncertain
      └──────────────► 8 human-in-the-loop review (feedback, audit) ◄──┘
                                    ▼
                  9 central database (+ FAISS embeddings)
                                    ▼
          10 analytics & dashboard ─► 11 alerts, reports, integration
```

## 2. Phase status

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundations | built |
| 1 | Cameras, ingestion, raw storage, preprocessing | built |
| 2 | Quality gate, MegaDetector V6, privacy blur | next |
| 3 | SpeciesNet, OpenCLIP, SAM 2, decision engine, explanations | planned |
| 4 | Confidence routing, review UI, feedback | planned |
| 5 | Human/vehicle activity, poaching risk | planned |
| 6 | Dashboard, re-identification | planned |
| 7 | Alerts, reports (PDF/Excel), integration API | planned |
| 8 | Hardening and production | planned |

## 3. Foundations (Phase 0)

- **Settings:** Pydantic Settings, `VANDRISHTI_*` and `.env`; relative paths anchored to the
  repo root; unknown keys ignored.
- **Logging:** one JSON object per line; `extra=` fields become keys.
- **Raw storage:** `LocalStorage.store_original()` copies a file to
  `originals/<sha[:2]>/<sha>.<ext>`. The key comes from the bytes, so a repeat is a no-op
  (the duplicate check) and an original can never be replaced; files are read-only.
  Derivatives go under `derived/` and can be regenerated. Keys cannot escape the root.
- **Database:** UUID keys, timezone-aware timestamps, deterministic constraint names.
  Tables so far: `reserve` (with its time zone), `camera` (the registry: code, location,
  model, status), `model_registry` (name, version, licence, source).
- **Models:** the `Model` protocol (`load/unload/predict`, `name/version/licence/
  memory_estimate_mb`) and `ModelManager`: lazy loading, at most N resident (1 on the
  laptop), a memory budget, least-recently-used eviction, accelerator cache cleared after
  each unload. Only `models/adapters/` imports ML libraries.
- **API:** `/health` (process up), `/health/ready` (database answers, else 503), `/version`.
- **Compose:** Postgres 16 + PostGIS and Redis, memory-limited, bound to 127.0.0.1, on a
  new volume (`pgdata_v2`).

## 4. Sections 1–4: cameras, ingestion, raw storage, preprocessing (Phase 1, ADR 0002)

```
camera registry ─┐
SD-card folder ──┼─► ingest_files (one file at a time, one commit per file)
upload (token) ──┤     1 sha256 → already known? duplicate, skip
inbox watcher ───┘     2 check_image: verify + full decode (empty, not an image, truncated)
                       3 store original: originals/<sha[:2]>/<sha>.<ext>, read-only
                       4 metadata: time EXIF → manifest → file mtime (time_source)
                                   GPS EXIF → camera location (gps_source); make, model, serial
                       5 display copy: EXIF orientation, RGB, long side 1600, JPEG q88,
                                   optional median-3 denoise → derived/display/<sha>.jpg
                     then: regroup this camera's bursts (gap > 10 s), camera.last_seen_at
```

- **Tables:** `ingest_batch` (source, counts, status), `image` (identity, time and GPS with
  their sources, size, EXIF subset, corruption, display key and preprocessing record,
  burst), `sequence` (camera, start, end, count). `camera` gained `serial`, `installed_at`,
  `last_seen_at`. Images and sequences reference cameras with `RESTRICT`: a camera with
  images is retired by status, never deleted with its evidence.
- **Time:** camera clocks have no time zone, so EXIF and manifest times are read in the
  reserve's zone and stored as UTC. Manifests are read as local clock times by default
  (LILA labels local times "+00:00"); `--manifest-utc` for true instants.
- **Corrupt files** are archived and marked (`is_corrupt`, reason), never dropped silently,
  and get no display copy.
- **Auto fetch / sync:** `vandrishti watch <inbox>` polls `inbox/<RESERVE>/<CAMERA>/...`;
  a file is taken once size and mtime are unchanged across two polls; sources are never
  deleted; files for unregistered cameras are retried later.
- **API:** `GET|POST /reserves`, `GET|POST /cameras`, `PATCH /cameras/{id}` (status),
  `POST /cameras/{id}/images` (multipart; base names only; size limit), `GET /batches/{id}`,
  `GET /images/{id}`, `GET /images/{id}/display`. Writes need `Bearer VANDRISHTI_INGEST_TOKEN`
  (constant-time check); without a token they work only in `env=dev`. Login and roles
  replace this in Phase 8.
- **Measured** (SWG Laos `loc_0032`, 125 real images, 2560×1920, M3 8 GB): 8.3 s for the
  batch (~15 images/s, no models), peak RSS 161 MB; 116 bursts, the same count as the
  dataset's own sequence labels; a rerun stored nothing (125 duplicates). (That sample was
  deleted with `data/` afterwards; the numbers are kept as a measurement record.)
