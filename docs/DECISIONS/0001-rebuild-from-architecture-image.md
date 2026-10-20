# 0001 — Rebuild from the architecture image

- **Status:** accepted
- **Date:** 2026-10-20
- **Requested by:** the developer ("delete whole project and build according to this image")

## Context
The previous VanDrishti (Phases 0–10a) covered most of the image, but the developer chose a
clean rebuild that follows the image's 11 sections exactly.

## Decisions
1. Archive before deleting: `../VanDrishti-archive-2026-10-20.tar.gz` (code and docs,
   including uncommitted work). Keep `data/` (weights, datasets), git history and `.env`.
2. Keep the name VanDrishti.
3. People are blurred whole-body; no face detection or recognition (the image lists "face
   detection"; the developer chose whole-body blur).
4. Embeddings in FAISS, as the image says (in-process, no extra service); Qdrant later if
   needed. Postgres keeps PostGIS for maps; pgvector is not used.
5. Carry over the previous build's lessons as facts in `CLAUDE.md`, not as code.

## Consequences
- Phases restart at 0; the archive is a reference for working implementations.
- The old database volume (`vandrishti_pgdata`) is left untouched; the rebuild uses
  `pgdata_v2`.

## Update (same day)
The developer then asked to delete everything left of the old project: the archive, `data/`
(weights, datasets, stored images), git history (`.git`) and the old Docker volumes,
containers and images. All were deleted; the new database was reset to an empty schema.
The old history still exists on GitHub (`harshitjadiya24/VanDrishti`) if it was pushed.
Models and datasets are now downloaded phase by phase.
