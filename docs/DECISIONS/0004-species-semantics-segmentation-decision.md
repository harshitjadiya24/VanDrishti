# 0004 — SpeciesNet in its own environment; OpenCLIP informational; explainable decision engine

- **Status:** accepted
- **Date:** 2026-10-20
- **Chosen by the developer:** separate SpeciesNet environment; download all three models;
  time-of-day prior learned from the reserve's own verified sightings.

## Decisions
1. **SpeciesNet v4.0.3a (crop classifier) runs in `tools/speciesnet`**, its own uv project,
   called as a subprocess with JSON (`run_vandrishti.py`). Its package requires `yolov5`
   (GPL) and pins `setuptools<82`; isolating it keeps both out of VanDrishti. Only its
   classifier and ensemble load: detections come from our MegaDetector V6, so its own
   detector never runs. The ensemble's **country geofence** and **label roll-up** are the
   image's geographic prior at country level.
2. **Reserve species list** (`reserve_species`, `vandrishti species add`) refines the
   geographic prior to the reserve; names come from SpeciesNet's own label file. Off-list
   answers are kept but lowered (x 0.6) with a "check carefully" reason. No list → neutral.
3. **Time-of-day prior learned only from human-verified decisions** in that reserve (3-hour
   bins, Laplace-smoothed), neutral below 30 verified sightings of the taxon. No outside
   activity table is assumed. It becomes active after review (Phase 4).
4. **OpenCLIP is a second opinion shown in every explanation but, by default, does not lower
   confidence:** on the labelled sample its disagreements predicted no errors (51 of 51 were
   SpeciesNet-correct). Candidates are species-level names plus an "empty scene" prompt.
5. **SAM 2.1 tiny via transformers** on CPU (MPS reserves ~2.4 GB hidden from RSS), only for
   the top animal box; masks are PNG derivatives used for review and later re-ID crops.
   Weights load only if every tensor is filled.
6. **Decision engine v1**: SpeciesNet's final score x named factors (agreement, detection
   strength, geofence, reserve list, time of day), each with a reason; unnamed animals are
   capped at 0.5. Decisions are keyed by the engine config *and* the upstream results they
   read, so new inputs give a new decision and unchanged inputs are skipped.

## Consequences
- The confidence is a routing score, not a calibrated probability; EVALUATION.md reports the
  accuracy of each band. On the (optimistic) sample, the high band had no wrong answers.
- Nothing yet shows how SpeciesNet behaves on Indian camera traps; a reserve's labelled
  season is needed before trusting auto-accept there.
