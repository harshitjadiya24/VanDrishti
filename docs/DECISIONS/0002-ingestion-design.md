# 0002 — Ingestion design: provenance-first metadata, polling inbox, temporary write token

- **Status:** accepted
- **Date:** 2026-10-20

## Context
Image sections 1–4 need camera identity, capture time and location for every image, from
SD cards, uploads and an auto-sync inbox, on an 8 GB laptop, without ever changing an
original.

## Decisions
1. **Record where every value came from.** `time_source` (exif, manifest, file_mtime) and
   `gps_source` (exif, camera) sit beside the value, so analyses can exclude weak times
   (file mtime changes when files are copied) instead of trusting them silently.
2. **Camera clocks are local.** EXIF and manifest times are read in the reserve's time zone
   and stored as UTC.
3. **Corrupt files are archived and flagged**, not dropped: a missing file is invisible,
   a flagged one can be checked.
4. **One commit per file.** A crash or a bad file never loses earlier work; reruns are free
   because the content hash is unique.
5. **Polling inbox, no filesystem-events dependency.** Works the same on USB drives and
   network shares; a file is taken after it is stable for two polls; sources are never
   deleted.
6. **Temporary write token.** Until login and roles (Phase 8), writes need a bearer token,
   or `env=dev` on localhost. Reads are open on 127.0.0.1 only.
7. **Bursts are regrouped per camera from scratch** after each batch (idempotent). Fine at
   reserve scale; switch to regrouping only the affected time window if cameras reach
   hundreds of thousands of images.
