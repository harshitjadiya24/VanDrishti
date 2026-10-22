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
- SpeciesNet lives in `tools/speciesnet` (own uv env; GPL yolov5 inside). Never import it in
  the backend; call `SpeciesNetTool` (subprocess, JSON). Unset `VIRTUAL_ENV` for that call.
  Weights: `KAGGLEHUB_CACHE=data/models/kagglehub`. Its "no cv result" means unknown.
- OpenCLIP is informational by default: on labelled data its disagreements predicted no
  errors. Do not let it lower confidence again without new labelled evidence (ADR 0004).
- SAM 2 runs on CPU (MPS hides ~2.4 GB); the HF checkpoint is `sam2_video` type, loaded into
  `Sam2Model` with all weights present (the transformers warning is expected).
- Decisions are keyed by engine config + upstream config hashes; a decision only changes when
  something it read changed.
- Frontend (`frontend/`): `npm run lint && npm test && npm run build`. Packages pinned to the
  newest release ≥ 14 days old. Show times in the reserve's zone (`localTime`), never the
  viewer's. New single-key actions must respect typing in inputs. No third-party requests.
- Reviews are append-only (undo = `undone_at`); `audit_event` has triggers refusing edits;
  routing never reopens a route a person finished; spot checks are deterministic draws.
- Risk (section 6) is rule-based points with reasons, not a model; never call it a prediction.
  Time-based signals need EXIF/manifest times; `file_mtime` events skip them. A reviewer's
  poaching mark always means HIGH. Vehicle type is an OpenCLIP guess (≥ 0.6), never scored.
- `vandrishti.sun` gives sunrise/sunset; night uses the camera's location, else 19:00-06:00.
- `.env` predates the rebuild: old keys can collide with new meanings (DETECTOR_BATCH_SIZE
  was 250 and is now images per model batch). Keep `.env.example` the reference.
- PyTorch and FAISS must never share a process (two OpenMP runtimes → segfault 139). Embedding
  (`reid embed`, eval `embed`) is torch-only; matching, the API and FAISS tests are torch-free.
  `pytest.importorskip("torch")` imports torch: use `importlib.util.find_spec` in tests.
- MegaDescriptor-T's `pytorch_model.bin` is a training checkpoint (weights under "model", old
  timm Swin layout): convert with `timm.models.swin_transformer.checkpoint_filter_fn`. Licence
  CC-BY-NC-4.0 (card), not the "mit" in its config.
- Re-ID never names a tiger: proposals only; people decide (audited, undoable). The 0.76 line
  is MegaDescriptor's ATRW open-set 95%-known point; ATRW numbers are optimistic.
- Analytics count settled labels only (person > auto-accept; unreviewed review/uncertain never
  count) and frames, not animals. `file_mtime` times stay out of time charts and "first seen".
- MegaDetector puts whole-frame vehicle boxes on tight crops (ATRW: 58/300): not a bug to "fix"
  by lowering privacy screening.
- Alerts (section 11) are prompts: rules refresh only OPEN alerts; a person's acknowledge/resolve
  is never overwritten; reopen is the undo. No coordinates in alerts, webhooks or reports.
- Camtrap DP schemas are cached in `tests/fixtures/camtrap_dp_1.0.2` (raw.githubusercontent
  works from here now; geojson/frictionless refs are stubbed offline). Sampling design is never
  guessed: the caller states it. People/vehicle frames are never exported.
- urllib title-cases header names (`X-vandrishti-timestamp`): compare headers case-insensitively.
- Python type stubs and packages follow the same "≥ 14 days old" pin rule as npm.
- Every console route needs a signed-in user (`api/deps.authenticated`, added per router in
  `app.py`); writes need `X-CSRF-Token`. New endpoints: `require(Permission.X)`, `Scoped` for a
  `reserve` query, `guard_*` for ids; sensitive views call `audit_view`. Sign actions with
  `user.name`, never a client-sent name. API tests: `tests.helpers.sign_in_as(app, ...)`.
- Rate limiters are in-process (`api/ratelimit.py`): tests that sign in must `LOGIN.reset()`;
  the API must run one worker (or move limits to Redis).
- Non-admins get coordinates rounded to 0.1° and EXIF without GPS (`rbac.round_coord`).
- Originals are stored read-only: tamper tests must copy and `chmod u+w` the copy. Backups
  hard-link only to the previous backup, never to the live store (derived files change).
- Docker Hub pulls can fail here with "short read"/stall: retry, keep base images few, and pin
  tags (python 3.11.15-slim-bookworm, node 24.12.0-alpine, caddy 2.11.4-alpine, uv 0.12.23).
- Local dev admin credentials live in `data/local/admin_credentials.txt` (git-ignored).
- Frontend design (F0+): world "The Forest Board" (PRODUCT.md, .impeccable/surfaces/). Story at
  `/` (public, no API calls, lazy), console at `/app/*`. Every story number lives in
  `src/story/results.ts` and a test checks it against docs/EVALUATION.md (`?raw` import; Vite
  `server.fs.allow` includes `../docs`). Illustrative frames are stripe geometry, labelled synthetic.
- three.js: one scene (`story/fork`), its own chunk, imported only when the section nears view.
  Each mount creates its own canvas (React StrictMode mounts twice; two renderers on one canvas
  showed stale frames). `frustumCulled = false` on moving InstancedMeshes. THREE.Clock is
  deprecated: time with performance.now().
- GSAP + ScrollTrigger + Lenis only on the story page (`story/scroll.ts`); everything is visible
  without animation, and reduced motion shows final states. Privacy visuals never depend on an
  animation (blur is always on). jsdom lacks matchMedia: `src/test/setup.ts` provides one.
- Playwright screenshots are written asynchronously: wait ~2 s before reading the file, or
  you review the previous capture.
- Console kit (`frontend/src/components/kit.tsx`): Plate, StatTile/CountNumber, CountBadge,
  StageBadge (always a word), ConfidenceDial, Skeleton, EmptyState, ToastProvider/useToast. Undo
  toasts never time out (WCAG timing); undo is a new audited action, never an erase.
  Screens start with `PageHeader`; filters use `Segmented`; buttons/fields use `BUTTON`/`FIELD`.
  Visuals draw from real API values: risk thresholds come from `/risk/summary` `thresholds`, audit
  links from `/audit/events` `prev_hash`/`hash` (verification stays server-side).
- Tests: `MotionGlobalConfig.skipAnimations` is on in `src/test/setup.ts` (jsdom cannot finish
  Motion exits). Reviewers with several reserves must pass `reserve=` to list endpoints.
- Browser checks against dev data: undo any action you take (reopen alerts, undo reviews).
- Accessibility floor (F5): text on `bg-alarm`/`bg-ok` uses `text-on-alarm`/`text-on-ok` (white by day,
  dark ink at night; white failed 4.5:1 on the night fills). Focus rings use `--focus-ring` (green by
  day, yellow at night and on `.bg-board`); check yellow alone is 1.6:1 on daylight. Phone targets are
  44 px (`h-11 md:h-9` in `BUTTON`/`FIELD`); never fade text with opacity below AA.
- The console is its own chunk (`src/console.ts`, route `lazy` in router.tsx): the story page must not
  import from `Shell` or `screens/`. Shared code they both need lives outside both (e.g. `story/stripes`).
- Design system: `DESIGN.md` + `.impeccable/design.json` (The Forest Board). Floor rules from the finish
  review: no side stripes on cards, no eyebrow labels above headings, no zero-blur offset shadows, no
  blue outside the palette, milestone stones carry number + stage word ("4·1" hectometre stones between
  stages, never invented distances). The synthetic frame is `story/frame.tsx` (NightFrame, BODY, BOX):
  SVG rects need `width`/`height` keys (spreading `w`/`h` renders nothing).
- `docs/screenshots/` holds only photo-free captures (WebP) with `PROVENANCE.md`; anything showing
  camera-trap frames stays in the git-ignored `.impeccable/review/`. Impeccable's finish reviewer and
  documenter are not registered agent types here: run them as fresh general-purpose agents that load
  `~/.claude/skills/impeccable/agents/*.toml` themselves.

