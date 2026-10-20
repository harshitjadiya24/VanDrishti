# 0003 — Quality gate that never hides evidence; MegaDetector V6 (MIT) without AGPL code

- **Status:** accepted
- **Date:** 2026-10-20
- **Chosen by the developer:** bundle the MIT YOLO code; compact model (119 MB); a small
  labelled LILA sample (~100 MB) for measurement.

## Decisions
1. **Quality gate: FAIL only when nothing is visible** (unreadable, brightest 0.1% near
   black, ≥ 95% white). Blur, dimness, over-exposure, low contrast and near-duplicates are
   warnings. A 75%-white test frame still showed a vehicle, and blurred frames are often fast
   animals. FAIL images go to a person (quality review), never deleted. Thresholds were
   calibrated on the sample (docs/EVALUATION.md).
2. **MegaDetector V6 MIT compact**, run from a bundled, inference-only copy of the MIT YOLOv9
   code (licences kept; changes marked "VanDrishti:"). Not the PytorchWildlife package, which
   pulls AGPL/GPL dependencies and several GB. Weights checksum-verified, loaded with
   `weights_only=True`, and refused unless every layer is filled (the upstream loader
   ignores mismatches silently).
3. **CPU by default** for the detector: measured 0.16 s/image vs 0.33 s on MPS.
4. **Thresholds:** animal 0.2 (recall first), people/vehicles 0.1 (privacy first). Outcome
   priority: human/vehicle > animal > no object.
5. **Whole-body blur:** padded boxes, pixelated then Gaussian-blurred; the display copy is
   rebuilt from the blurred image so no unblurred derivative remains; the original is kept
   but locked (role checks and audit come with login in Phase 8).
6. **Idempotent stages:** detections are keyed by model, version and config hash; an image is
   re-screened only when the config changes.

## Consequences
- Person detection cannot be measured on public data; a reserve's own labelled images are
  needed before trusting it, and every person/vehicle frame goes to a person anyway.
- Once blurred and locked, an image stays locked even if a later config sees no one (safe
  default).
