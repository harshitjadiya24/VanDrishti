# 0007 — Dashboard on settled labels; re-identification that only proposes

- **Status:** accepted
- **Date:** 2026-10-21

## Context
Section 10 of the architecture image asks for an overview, a map, camera analytics, temporal
trends (10.1-10.4) and tiger re-identification (10.5), with section 9 storing embeddings in
FAISS. Two models were candidates for the embeddings: MegaDescriptor-T (built for animal
re-ID, non-commercial licence) and DINOv2-small (general, Apache-2.0).

## Decisions
1. **Dashboards count settled labels only.** A person's latest review wins; otherwise only
   auto-accepted decisions count. Items in the review/uncertain bands that nobody has checked
   are shown as "waiting for a person", not as species.
2. **Counts are frames.** Labels say so; no "number of animals" is claimed.
3. **Local time, reliable time.** Hours and days use the reserve's zone. File-date times are
   left out of charts and of a tiger's first/last seen, and the number left out is shown.
4. **Map without tiles.** An SVG of camera coordinates, so nothing is sent to a tile server.
   Cameras without coordinates are listed, not placed.
5. **MegaDescriptor-T is the default embedder** after measuring both on ATRW. Top-1 accuracy
   is similar, but only MegaDescriptor separates known from unknown tigers: 4.4% vs 36.1% of
   unknown tigers above the line. Its CC-BY-NC-4.0 licence is recorded in MODELS.md and the
   README; DINOv2 remains a setting for commercial use.
6. **Threshold 0.76.** 95% of known tigers score above it in the ATRW open-set test. It only
   chooses the wording ("possible match" or "possibly new"); candidates are always shown.
7. **Proposals, not identities.** Only a person sets an identity, creates a tiger or rejects
   a crop. Each is audited and undoable. "Not a tiger" is never reopened by the model.
   Look-alike named tigers are flagged for a person to check, never merged.
8. **Exact FAISS index (`IndexFlatIP`) rebuilt per run.** Galleries are hundreds to thousands
   of crops per reserve, which is milliseconds; vectors live in Postgres (`reid_embedding`),
   the single source of truth. An approximate or persisted index can come when sizes demand it.
9. **PyTorch and FAISS in separate processes.** Together they crashed (two OpenMP runtimes).
   `embed` is the torch step and `match`/API the FAISS step; a guard refuses FAISS once torch
   is loaded.

## Consequences
- The ATRW numbers are optimistic (zoo video, Amur tigers, MegaDescriptor likely trained on
  ATRW). Indian field validation has not happened and must not be implied.
- With few gallery sightings per tiger, many returning tigers show as "possibly new" while
  still listing the right tiger first (74.5% flagged as matches in the end-to-end demo). People
  see the candidates either way.
- Phase 8 must mask exact camera coordinates for non-privileged roles.
