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
