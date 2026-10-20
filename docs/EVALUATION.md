# Evaluation

Every number here was measured, on the data named, with the caveats next to it. Nothing
here is a claim about Indian reserves: no labelled Indian camera-trap images exist yet.

## 5.2 MegaDetector V6 (MIT, compact) — Phase 2, 2026-10-20

- **Model:** MDV6-mit-yolov9-c (9.7 M parameters), CPU, letterbox 640, boxes kept from 0.05.
- **Data:** 252 labelled images from LILA BC (`scripts/download_sample.py`, seed 42, at most 4
  per camera location except vehicles at 15; 52 locations):
  - 70 Caltech Camera Traps animal images, 32 Caltech car images, 60 Caltech empty images
    (image-level "empty", no drawn box);
  - 60 ENA24 animal images, 30 ENA24 vehicle images.
- **Caveat 1, optimistic:** MegaDetector was very likely trained on Caltech and ENA24.
- **Caveat 2, people unmeasured:** LILA removes images of people, so person recall cannot be
  measured. Yet 6 of the 60 Caltech "empty" frames contain people (MegaDetector found them,
  confidence 0.91–0.96; confirmed by eye on blurred copies). Labels are imperfect.
- **Caveat 3, label quality:** the Caltech *box* file's 186 "empty" entries all carry boxes and
  the ones inspected showed animals; empties are taken from the image-level labels instead.
  30 of the 32 Caltech car labels are whole-frame boxes, so vehicle box recall is quoted from
  ENA24 only.

Image level ("does this image contain X?"), all 252 images:

| Threshold | Animal precision | Animal recall | Vehicle precision | Vehicle recall | Empty frames given an animal/vehicle box |
|---|---|---|---|---|---|
| 0.1 | 0.86 | 0.92 | 0.98 | 0.92 | 27% |
| **0.2** (used) | **0.94** | **0.91** | **1.00** | **0.92** | **12% (7 of 60)** |
| 0.3 | 0.94 | 0.89 | 1.00 | 0.92 | 10% |
| 0.5 | 0.97 | 0.85 | 1.00 | 0.92 | 3% |
| 0.7 | 0.98 | 0.70 | 1.00 | 0.84 | 2% |

At 0.2, box recall (IoU ≥ 0.5): animals 0.84 (all), 0.91 (ENA24); vehicles 0.83 (ENA24, 30
boxes). Night IR frames (110): animal recall 0.95, precision 0.97.

Speed and memory (M3, 8 GB): 0.15–0.16 s per image on CPU (MPS was slower: 0.33 s), peak
1.4 GB for the evaluation run. End to end through the database (decode, detect, store,
blur): 252 images in 44.5 s, peak 1.6 GB.

**Choice:** animal threshold 0.2 (high recall: a missed animal is lost, a false box costs a
reviewer a second); people and vehicles are blurred from 0.1 (privacy errs on the safe side).

## 5.1 Quality gate — calibration

- On the 252 sample images, the blur metric (Laplacian variance on a 512 px grey copy) was
  ≥ 226 for every frame; a 4 px Gaussian blur gave a median of 61, 8 px at most 18. The
  warning threshold is 100.
- A frame 75% clipped white still showed a vehicle, so only ≥ 95% white (or a frame whose
  brightest 0.1% is near black) fails the gate; heavier problems are warnings.
- Result on the sample: 252 pass; 104 flagged night IR, 15 dim, 1 low contrast; 3.9 s for
  252 images.

## 5.3–5.7 Species, semantic check, segmentation, decision — Phase 3, 2026-10-20

- **Pipeline:** MegaDetector V6 animal boxes → SpeciesNet v4.0.3a crop classifier (country
  geofence, label roll-up) → OpenCLIP ViT-B/16 check on the top crop → SAM 2.1 tiny mask →
  decision engine v1. Run on the 125 sample images screened ANIMAL (`vandrishti analyse`).
- **Scoring** (`scripts/eval_species.py`): each sample label maps to the taxon it implies at
  its own precision (Caltech "deer" = deer family, ENA24 "White_Tailed_Deer" = species). A
  decision is correct if its taxon lies inside, too general if it stops above, wrong
  otherwise. 117 images have exactly one labelled species and were scored.
- **Caveat:** SpeciesNet was very likely trained on Caltech and ENA24, so its near-perfect
  accuracy here is optimistic; it says nothing yet about Indian reserves.

| Confidence band (routing, section 7) | Images | Correct | Too general | Wrong |
|---|---|---|---|---|
| High (≥ 0.9) | 86 | 84 | 2 | 0 |
| Medium (0.6–0.9) | 26 | 19 | 7 | 0 |
| Low (< 0.6) | 5 | — | — | — (all 5 "animal, unidentified") |

- **OpenCLIP as a second opinion:** with species-level candidates, it disagreed with
  SpeciesNet on 51 of 103 correctly named images and on 0 wrong ones (there were none). Its
  disagreements therefore predicted no errors and only pushed correct answers out of the
  high band (with it lowering confidence: high 54, medium 54). It is now **informational by
  default** (`clip_affects_confidence=False`); its opinion stays in every explanation. A first
  version also offered CLIP "a person" and genus/family names as candidates; it chose "a
  person" on 33 dim animal crops, so those prompts were removed.
- **SAM 2.1 tiny:** 123 of 125 masks with predicted IoU ≥ 0.7.
- **Speed (M3 8 GB, CPU):** SpeciesNet 31 s for 125 images (one subprocess, includes model
  start-up), OpenCLIP 14 s, SAM 2 80 s (0.64 s/image), decisions 0.4 s; peak RSS 1.5 GB with
  one model loaded at a time.


## Section 6 — people/vehicle events and risk (Phase 5, 2026-10-21)

- **No ground truth exists** for poaching risk here, so there is no accuracy number. What
  was checked: the rules on hand-built cases (unit and integration tests) and the output on
  the LILA sample's 66 people/vehicle frames, which became 42 events. Final levels: 25 LOW,
  17 MEDIUM, 0 HIGH (the sample's two "cameras" each merge many real locations, so repeat
  and spike signals there say little).
- A first run produced 1 HIGH from an ENA24 event dated by its file (no capture time):
  night and spike points came from a meaningless time. Time-based signals now require EXIF
  or manifest times.
- **Vehicle type (OpenCLIP zero-shot, 8 types):** on the 32 Caltech events labelled "car",
  CLIP said car 10, pickup truck 5, truck 4, jeep 1, bus 6, tractor 3, motorcycle 3. Caltech's
  "car" may cover pickups and trucks, but buses and tractors on these trails are unlikely.
  With a 0.6 floor, 13 of 35 become "unknown". Shown as a guess; never scored.

## 10.5 Tiger re-identification — Phase 6, 2026-10-21

**Embedders on ATRW** (`scripts/eval_reid.py`; 1,887 labelled crops of 107 Amur tigers; CPU,
batch 32). Each crop searches all others (FAISS inner product on unit vectors).
"Near-duplicates excluded": same-tiger frames whose 64-bit dHash differ by ≤ 12 bits are
removed from that query's gallery (1,444 groups), so a hit must come from a visibly different
frame.

| Model | Licence | s/image | Top-1 (naive) | Top-1 (near-dups excluded) | Top-5 | mAP | Unknown tigers above the 95%-known line |
|---|---|---|---|---|---|---|---|
| MegaDescriptor-T-224 | CC-BY-NC-4.0 | 0.028 | 0.982 | **0.974** | 0.990 | **0.919** | **4.4%** (line 0.76) |
| DINOv2-small | Apache-2.0 | 0.019 | 0.977 | 0.963 | 0.988 | 0.737 | 36.1% (line 0.884) |

Open set: 21 of 107 identities held out of the gallery. MegaDescriptor: known tigers' best
similarity median 0.925, unknown 0.459; DINOv2: 0.952 vs 0.870. Top-1 is close, but DINOv2
cannot tell "a tiger I know" from "a new tiger", which is the decision that matters here.
**Chosen: MegaDescriptor-T, threshold 0.76.**

Caveats, all making these numbers optimistic:
- MegaDescriptor was most likely trained on ATRW.
- ATRW is zoo video of Amur tigers, not Indian camera traps (different light, IR, angles).
- Video neighbours that differ by more than 12 bits can still leak.
- No Indian tiger re-ID test exists yet. A test on tigers MegaDescriptor never saw is still
  needed before quoting accuracy for a reserve.

**End-to-end on the real pipeline** (`scripts/demo_reid.py`; 300 ATRW crops of 30 tigers,
reserve ATRW-DEMO). Steps: ingest → quality → MegaDetector → SpeciesNet → decide → route →
embed → match.
- **Screening:** 236 frames screened animal, 58 people/vehicles, 6 blank. The 58 were
  whole-frame **vehicle** boxes (one person box) on tight zoo crops, the same whole-frame
  artefact as Caltech's car boxes, and no people. These crops are not camera-trap frames; they
  stay in the people/vehicle queue, as privacy-first screening intends.
- **Species:** 206 auto-accepted as tiger, 8 "tiger" in the review band, the rest
  higher-level or uncertain. Embedding took 7.6 s for 206 crops (1.1 GB peak).
- **Naming:** reviewer `atrw-truth` (ATRW's labels standing in for a person) named 13 tigers
  from 37 sightings. Two of the 15 planned tigers had too few settled frames.
- **Then `match`:**
  - Of 51 sightings of named tigers, the right tiger was listed first for 50 (98%) and was in
    the top 5 for all 51. Only 38 (74.5%) cleared 0.76 as "possible match": with 3 gallery
    sightings per tiger, a quarter of returning tigers are shown as "possibly new", still with
    the right tiger first.
  - All 118 sightings of unnamed tigers were "possibly new".
- The threshold was not re-tuned on this set (that would fit the test).

