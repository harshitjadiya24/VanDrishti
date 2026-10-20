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
| 2 | Quality gate, MegaDetector V6, privacy blur | built |
| 3 | SpeciesNet, OpenCLIP, SAM 2, decision engine, explanations | built |
| 4 | Confidence routing, review UI, feedback | built |
| 5 | Human/vehicle activity, poaching risk | built |
| 6 | Dashboard, re-identification | next |
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

## 5. Sections 5.1–5.2 and privacy: quality gate, detection, whole-body blur (Phase 2, ADR 0003)

```
image (quality_status=pending)
  └─ 5.1 run_quality: grey 512 px copy → p99.9, white share, mean, std, Laplacian variance,
         dHash vs previous frame, infrared check
         FAIL (unreadable | too_dark | white_out) ──► GET /quality/review (a person looks)
         PASS (+ warnings: dim, overexposed, low_contrast, blurry, near_duplicate, night_ir)
  └─ 5.2 run_detection (MegaDetector V6 MIT compact, CPU, batches of 8, JPEG draft 1280 px)
         boxes ≥ 0.05 stored in `detection` (model, version, config hash, normalised box)
         person/vehicle ≥ 0.1 ─► HUMAN_VEHICLE: whole-body blur → derived/blurred, display copy
                                 rebuilt from it, original locked → section 6
         animal ≥ 0.2       ─► ANIMAL → species (Phase 3)
         otherwise          ─► NO_OBJECT (likely blank; a sample goes to review in Phase 4)
```

- `image.screen` + `image.screened_with` (config hash) make detection idempotent; a new
  config re-screens and keeps older boxes for comparison.
- API: `GET /images/{id}/detections`, `GET /quality/review`; `GET /images/{id}` now includes
  quality and screening fields. CLI: `vandrishti quality`, `vandrishti detect`.
- Measured (docs/EVALUATION.md): at 0.2 on 252 LILA images, animal precision 0.94 / recall
  0.91, vehicle 1.00 / 0.92, 12% of empty frames get a false box; 0.16 s/image on CPU.

## 6. Sections 5.3–5.7: species, semantic check, segmentation, decision (Phase 3, ADR 0004)

```
ANIMAL image ─► animal boxes ≥ 0.2 (from 5.2)
  5.3 SpeciesNet v4.0.3a  (subprocess in tools/speciesnet; JSON in/out; our boxes)
      → classification rows: raw top-5 per box + FINAL (after country geofence, roll-up)
  5.4 OpenCLIP ViT-B/16   (top box crop vs species-level candidates + "empty scene")
      → semantic_check (probabilities); informational by default
  5.5 SAM 2.1 tiny (CPU)   (top box as prompt) → segmentation: PNG mask, box fill, tight box
  5.6 decision engine v1   SpeciesNet score x factors: model agreement, detection strength,
      geographic prior (geofence + reserve species list), time-of-day prior (learned from
      verified sightings, neutral < 30); unnamed animal capped at 0.5
  5.7 explanation          JSON: base, every factor with reason, top-5, CLIP top-5, boxes,
      mask, one-line summary → GET /images/{id}/decision, GET /images/{id}/mask
```

- One model resident at a time: `vandrishti analyse --reserve R` loads, runs and unloads
  each stage's model in turn (peak 1.5 GB on the sample).
- Decisions are keyed by engine config + the classification/check/mask config hashes they
  used, so re-running after an upstream change recomputes only what changed.

## 7. Sections 7–8: confidence routing, human review, feedback, audit (Phase 4, ADR 0005)

```
image ─► route_for(quality, screen, decision):
   quality FAIL            → QUALITY (open)
   HUMAN_VEHICLE           → PEOPLE_VEHICLES (open, always a person)
   NO_OBJECT               → LIKELY_BLANK: 10% drawn → open; rest not_sampled
   decision ≥ 0.90         → AUTO_ACCEPT: done; 5% drawn → open spot check
   0.60 ≤ decision < 0.90  → REVIEW (open)
   < 0.60 or unnamed       → UNCERTAIN (open)
review (POST /reviews) → review row (model said / person said, poaching, severity, notes)
   + routing done + decision verified (confirm) + audit event (hash-chained)
undo (POST /reviews/{id}/undo) → review.undone_at, route reopened, audit event
```

- Draws are deterministic from the image hash (salted per purpose): re-routing draws the same
  spot checks and blank samples. Re-routing never touches a route a person finished.
- Allowed actions depend on the route (e.g. people/vehicle frames: confirm presence, false
  alarm, skip); the API refuses anything else.
- `feedback_stats`: human agreement per confidence band and the most common corrections:
  the reserve's own check on the bands, and the data for future model improvement. The
  time-of-day prior (5.6) learns from confirmed and corrected reviews.
- Audit trail: `audit_event` rows hash-chained (SHA-256 over content + previous hash,
  advisory-locked writer); database triggers refuse UPDATE, DELETE and TRUNCATE;
  `GET /audit/verify`, `vandrishti audit verify`.
- Name search for corrections ranks the reserve's species list, then species SpeciesNet's
  geofence allows in the reserve's country, then names ending in the typed word.
- **Console (`frontend/`):** React 19 + TypeScript 6 + Vite 8 + Tailwind 4 + TanStack Query +
  React Router. Screens: routing overview (section 7), five review queues (section 8),
  feedback, audit trail. Review is keyboard-first (Y/Enter, C, N, F, S, P, 1–3, J/K, M, U),
  shows the frame with numbered boxes and the SAM outline, the 5.7 explanation, and only the
  actions allowed for the route. Times are shown in the reserve's zone. The reviewer names
  themselves until login (Phase 8). No third-party requests (system fonts, no map tiles).

## 8. Section 6: people, vehicles, activity patterns and poaching risk (Phase 5, ADR 0006)

```
HUMAN_VEHICLE frames ─► build_events: one PresenceEvent per burst and camera
    counts = most people / vehicles in any one frame (estimate; people overlap)
    night  = sunrise equation at the camera (basis "sun"), else 19:00-06:00 local ("clock")
  ─► classify_vehicles (optional): OpenCLIP guess on the largest vehicle crop;
     "unknown" below 0.6; never adds points
  ─► assess: points with reasons → LOW < 4 ≤ MEDIUM < 8 ≤ HIGH
     person +2 (group of 3+ +1) · vehicle +2 · night +3 · unusual spike vs the camera's own
     28-day history (Poisson tail < 0.05) +2 · 3+ events in 7 days +2 · sensitive place +2 /
     core zone +3 · tiger recorded at the camera within 30 days +2 · reviewer confirmed +1 ·
     reviewer marked poaching +5 and HIGH minimum · reviewer severity = minimum level ·
     reviewer false alarm = dismissed
```

- Time-based signals (night, spike, repeats, tiger nearby) need a real capture time (EXIF or
  manifest); a file-date time skips them and says so.
- History (spike baseline, repeats) counts only events with real times and no false-alarm
  verdict.
- Scores are recomputed on every run, because reviews and history change.
- API: `POST /risk/run`, `GET /risk/events` (urgent first), `GET /risk/summary`;
  `PATCH /cameras/{id}` sets `sensitivity`; people/vehicle queue items carry their risk.
  CLI: `vandrishti risk [--vehicle-types]`, `vandrishti camera set-sensitivity`.
- Console: "Poaching risk" screen (levels, most urgent cameras, events with blurred photo
  and reasons) and the risk inside each people/vehicle review.
- It decides what to look at first, not a prediction: the weights are reasoned defaults,
  not fitted, because no labelled poaching outcomes exist here.
