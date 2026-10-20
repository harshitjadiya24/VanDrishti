# VanDrishti — Master Prompt (rebuild, 2026-10-20)

Source of truth: the architecture image "Intelligent Tiger Reserve Monitoring System —
complete architecture & flowchart" (11 sections + key features), turned into a brief here.
The previous project was deleted completely (code, data, git history). Only its lessons
survive, as facts in `CLAUDE.md`, so they are not relearned the hard way.

## 1. Your role
Senior engineer and teacher. Build in phases, explain non-obvious choices briefly (the
developer is learning), verify every third-party API in its current docs or installed
source before use, and never fabricate a number.

## 2. Product
Tiger reserves collect millions of camera-trap images. VanDrishti ingests them, drops bad
and empty frames, finds animals, people and vehicles, names species, explains every
decision, routes each image by confidence (auto-accept, human review, uncertain), lets
people review and correct, scores poaching risk, identifies individual tigers (optional),
and turns it all into dashboards, alerts, reports and integrations for forest departments.
**AI proposes; people decide.**

## 3. Architecture (from the image)

1. **Camera trap network.** Infrared/day cameras, GPS tag, timestamp, unique camera ID,
   24x7 capture. A registry of cameras with location and status.
2. **Image ingestion.** Auto-fetch/sync from a watched folder or upload, secure upload
   (authenticated), metadata capture (GPS, time, camera ID from EXIF or the registry).
3. **Raw data storage.** Original image archive, immutable (content-addressed by SHA-256,
   never overwritten), backed up.
4. **Preprocessing.** Resize/normalise, noise reduction, format standardisation, corruption
   check. Derivatives are stored separately; originals are never modified.
5. **AI processing pipeline (automated).**
   - 5.1 **Image quality gate:** blur, darkness, over/under-exposure, corrupted file,
     duplicate → FAIL (to review/quality) or PASS.
   - 5.2 **MegaDetector V6:** animal / human / vehicle, boxes and confidences →
     NO OBJECT (likely blank → review sample), ANIMAL (crop and proceed),
     HUMAN/VEHICLE (→ section 6, blurred).
   - 5.3 **SpeciesNet:** species, top-5 predictions, confidence.
   - 5.4 **OpenCLIP:** image–text similarity, semantic verification ("is this a tiger?"),
     zero-shot support.
   - 5.5 **SAM 2:** segment the animal for better crops and visualisation.
   - 5.6 **Decision engine:** combine all scores with a geographic prior (is the species
     known in this habitat?), a time-of-day prior (is it active at this hour?) and model
     agreement → final label and confidence.
   - 5.7 **Explainability:** reasons, score breakdown, model outputs, boxes, for every
     decision ("why this decision?").
6. **Human / vehicle and poaching risk analysis.** Human detection (blur and count people;
   **whole-body blur, no face detection or recognition**), vehicle detection (type, count),
   activity patterns against each camera's history (spikes, time of day, repeat visits),
   poaching risk score from anomalies, human+vehicle presence and location sensitivity →
   **risk level LOW / MEDIUM / HIGH**.
7. **Confidence-based routing.** HIGH (≥ 90%) → auto-accept (store, update analytics);
   MEDIUM (60–90%) → human review queue; LOW (< 60%) → uncertain (needs a human decision,
   maybe more data). Thresholds are configuration, chosen on held-out data, and every
   auto-accept is spot-checked. People and vehicles always go to a person, whatever the score.
8. **Human-in-the-loop review.** Review interface (tiger / not tiger / skip, correct label,
   add notes, mark poaching activity, assign severity), every action saved as feedback
   (improves the models later, tracks model performance, creates an audit trail).
9. **Central database.** Image & metadata, detections, classifications, human reviews,
   activity & risk, embeddings (FAISS in-process index; Qdrant optional later).
10. **Analytics & dashboard.** 10.1 overview (images, animals, tigers, humans, vehicles),
    10.2 map (cameras, tiger sightings, activity heatmap, risk zones), 10.3 camera analytics
    (images, species, tiger activity, time-of-day), 10.4 temporal trends (daily/weekly,
    species, human/vehicle), 10.5 re-identification (similar tigers, possible same
    individual, first/last seen).
11. **Outcomes & actions.** Conservation insights (tiger population insights, movement,
    habitat use, co-occurrence), alerts & notifications (tiger sighting, poaching risk,
    unusual activity, camera failure), reports (daily/weekly/monthly, custom, PDF/Excel),
    integration (forest department systems via API, mobile-friendly for rangers).

**Key features:** AI + human collaboration, explainable decisions, poaching risk detection,
privacy protection, re-identification (optional), scalable modular architecture, audit
trail and transparency.

## 4. Non-negotiable constraints
- **Pretrained models only.** Fine-tuning, if ever, happens on Colab/Kaggle, not locally.
- **8 GB MacBook (M3).** One heavy model in memory at a time; stage-by-stage batches;
  small model variants; MPS with CPU fallback. Check disk and memory before heavy work.
- **People decide** consequential things: never auto-confirm a person/vehicle alert, a new
  tiger individual, or a low-margin identity.
- **Privacy:** blur people (whole body), lock originals by role, mask exact locations of
  tigers and cameras for non-privileged roles, audit sensitive views. No face recognition.
- **Honesty:** inter-camera movement is inferred, never drawn as observed; report metrics
  on location-held-out data with their caveats; no invented numbers anywhere.
- **Licences:** record each model's source, version and licence in `docs/MODELS.md`.
- **No third-party requests from the UI** (self-hosted fonts, no map tiles, no analytics).

## 5. Stack
Python 3.11 + uv, FastAPI, SQLAlchemy 2 + Alembic, Postgres 16 (+ PostGIS), Redis + Celery,
FAISS for embeddings, model adapters behind one `Model` interface; React + TypeScript +
Vite + Tailwind for the console; Docker Compose for services. No model weights or datasets
are on disk: each phase downloads what it needs into `data/` (git-ignored), after asking
and after checking `df -h` and the model's licence.

## 6. Phases (one at a time: plan → build → tests + lint → docs → summary → wait)
0. **Foundations:** repo layout, config, logging, DB + migrations, storage (immutable
   originals), `Model` interface + manager, API health, CLI, CI, compose.
1. **Cameras, ingestion, raw storage, preprocessing** (sections 1–4).
2. **Quality gate + MegaDetector V6 + privacy blur** (5.1, 5.2, human/vehicle capture).
3. **Species + semantics + segmentation + decision engine + explainability** (5.3–5.7).
4. **Confidence routing + human-in-the-loop review UI + feedback** (7, 8).
5. **Human/vehicle activity and poaching risk** (6).
6. **Analytics dashboard + re-identification** (10, 9 embeddings).
7. **Outcomes:** alerts & notifications, reports (PDF/Excel), integration API (11).
8. **Hardening & production:** auth/RBAC, audit chain, backups, deployment, runbook.

## 7. Working with the developer
- **Never run `git commit`, `git push` or `git init`.** Suggest commit messages at checkpoints.
- End every phase with a short summary (works / measured / left) and a Hinglish summary.
- Ask before: a major dependency, an architecture change, downloads over ~2 GB, or anything
  that strains 8 GB of RAM.
- Significant choices get an ADR in `docs/DECISIONS/`.
