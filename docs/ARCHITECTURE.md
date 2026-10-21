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
| 6 | Dashboard, re-identification | built |
| 7 | Alerts, reports (PDF/Excel), integration API | built |
| 8 | Hardening and production | built |

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

## 9. Section 10: dashboard (10.1-10.4) and tiger re-identification (10.5) (Phase 6, ADR 0007)

```
settled label per image (analytics/labels.py):
    latest non-undone review (confirm / correct / not an animal)  >  auto-accepted decision
    review / uncertain items nobody has looked at  →  "unsettled", never a species
  ─► 10.1 overview · 10.2 camera map · 10.3 camera analytics · 10.4 trends (analytics/dashboard.py)

10.5, two processes (PyTorch and FAISS each bring their own OpenMP runtime: together → segfault)
  vandrishti reid embed   [PyTorch]  settled-tiger frames → best animal box (SAM outline box if
                                      present, +5% pad) → MegaDescriptor-T → unit vector
                                      → reid_embedding (float32 bytes, model name + version)
  vandrishti reid match   [FAISS]    unidentified crops vs crops people named (same reserve, same
                                      model); best similarity per tiger, top 5
                                      ≥ 0.76 → possible_match, else possible_new  (a proposal)
  person (console / API)             same tiger · new tiger (code) · not a tiger → audited, undoable
  vandrishti reid similar [FAISS]    named tigers whose mean vectors are ≥ 0.76 alike:
                                      maybe one tiger named twice (a person checks)
```

- Counts are frames, not animals. Hour-of-day and calendar buckets use the reserve's time zone;
  frames and events timed only by file date are left out of time charts and counted as such.
- The map is an SVG of camera coordinates with no tiles (no third-party requests). Cameras
  without coordinates are listed, never placed. Exact camera coordinates are shown to everyone
  until roles arrive (Phase 8 must mask them for non-privileged roles).
- The model never names or creates a tiger: `reid_embedding.individual_id` is set only by
  `reid.service.decide`. A person's "not a tiger" is never reopened by a later `match`.
- The API process (FAISS for `/identity/similar`) must never import PyTorch;
  `reid.index` raises `TorchLoadedError` if it is loaded.
- API: `GET /dashboard/overview|map|trends`, `GET /dashboard/cameras/{id}`,
  `GET /identity/proposals`, `POST /identity/proposals/{id}/decide|undo`,
  `GET /identity/embeddings/{id}/crop` (cut from the blurred display copy),
  `GET /identity/individuals[/{id}/sightings]`, `GET /identity/similar`.
- Console: Dashboard (default screen), Tiger identities (one proposal at a time with the
  closest sighting of each candidate), Named tigers (sightings, look-alike warning).

## 10. Section 11: alerts, reports, Camtrap DP, integration API (Phase 7, ADR 0008)

```
alerts/rules.evaluate (idempotent: one alert per dedupe_key; refreshes only OPEN alerts)
  tiger sighting   info      one per burst of settled tiger frames (+ person-confirmed tiger codes)
  poaching risk    warning / critical   per MEDIUM / HIGH event, not dismissed
  unusual activity warning   per camera and local day with an "unusual spike" event
  camera failure   warning   silent > camera_silent_days (reliable times) · ≥ 60% of the last
                             30 frames failed the quality gate
  condition gone + still OPEN → resolved by "system" with a note; acknowledged/resolved
  alerts are never touched by rules
person: acknowledge · resolve · reopen (audited; reopen undoes)
alerts/service.deliver → signed webhook (HMAC-SHA256 over "<ts>.<body>"), min severity,
  retries up to max attempts, no redirects, https outside dev, no coordinates or images

reports/data.build(reserve, local start..end) → JSON → render.to_xlsx (openpyxl) / to_pdf (reportlab)
exports/camtrap_dp.build → zip: datapackage.json + deployments/media/observations (1.0.2)
integration/keys + api/routes/v1 → read-only /v1/* per reserve key, every read audited
```

- Reports and exports use the dashboard's rules: settled labels, frames not animals,
  reserve-local days, unreliable times left out and counted.
- Camtrap DP: one deployment per camera (no separate deployment periods are recorded), people
  and vehicle frames never exported, reviewer names not exported, coordinates rounded to 0.1°
  (uncertainty 7,900 m) unless a key or the CLI asks for precise ones. Sampling design is not
  recorded in VanDrishti, so the caller must state it.
- API keys: `vd_<prefix>_<secret>`, SHA-256 stored, prefix lookup + constant-time compare,
  `precise_locations` off by default; creation and revocation audited.
- Console: Alerts (state filter, reasons, acknowledge/resolve/reopen with a note; sidebar
  count of open warning + critical), Reports and exports (period preview, PDF/Excel download,
  Camtrap DP with a chosen sampling design).
- Scheduling is not built in: run `vandrishti alerts run` from cron (or the watcher host).

## 11. Hardening: sign-in, roles, privacy by role, deployment, backups (Phase 8, ADR 0009)

```
browser ──HTTPS──► Caddy (CSP, HSTS, no third parties) ──/api──► API (1 worker, uid 10001, read-only fs)
                     │ serves the built console                        │
                     │                                                  ├─► Postgres/PostGIS (private network)
                     │                                                  └─► image store (host dir)
other systems ──► /v1 (integration key, rate-limited, audited)
camera stations ──► POST /cameras/{id}/images (ingest token) ── same pipeline
```

- **Sign-in.** `POST /auth/login` checks an Argon2id password. It returns a 256-bit session
  token as an HttpOnly, SameSite=Strict (Secure in prod) cookie; Postgres stores only its
  SHA-256. Writes must carry `X-CSRF-Token`, which comes from the session.
  - Lockout after 5 failures for 15 minutes; 10 attempts a minute per address.
  - Sessions end after 12 h idle or 7 days in all, and immediately on sign-out,
    deactivation, or a role, reserve or password change.
- **Roles** (`auth/rbac.py`): admin, reviewer, ranger, viewer → permissions. Every console
  router requires a signed-in user, and each endpoint asks for its permission.
- **Reserve scope:** `Scoped` for `reserve` query parameters, plus `guard_*` for items
  addressed by id.
- **Privacy by role:**
  - non-admins get coordinates rounded to 0.1° (camera lists, map, image metadata) and EXIF
    without GPS;
  - frames with people need a people-reviewing or alert role, and each view is audited
    (`view_people_frame`);
  - the full audit trail is admin-only;
  - actions are signed with the signed-in user, never a name typed by the client.
- **Integration:** `/v1` is limited to 120 requests a minute per key; refused keys are audited
  (prefix only, at most 30 a minute per client).
- **Production guard:** in `env=prod` the API refuses to start with the default database
  password, an http webhook, a webhook without a secret, or a short ingest token. The API
  browser is off.
- **Deployment** (`deploy/compose.prod.yml`):
  - `db`, then a one-shot `migrate`, then `api`, then `web`;
  - only `web` publishes ports;
  - API image without PyTorch; model stages run as batch jobs elsewhere.
- **Backups** (`scripts/backup.py`):
  - `pg_dump -Fc`, plus the store copied with hard links to the previous backup, plus a
    manifest;
  - `verify` restores into a throwaway database and checks the schema, the audit chain and
    every original's SHA-256. A real restore is manual (docs/RUNBOOK.md).

