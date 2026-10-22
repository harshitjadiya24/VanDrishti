# Screenshot provenance

Every image here is a browser capture of this repository's own frontend, taken on
2026-10-22 with Playwright (Chromium) against the local dev server, then converted to WebP
(`cwebp -q 82`). Nothing is generated, retouched or composited.

Only photo-free views are committed. Captures that show camera-trap frames, including
blurred people, stay in the git-ignored `.impeccable/review/` (CLAUDE.md: never commit
images).

| File | Page | Viewport | What the data is |
|---|---|---|---|
| `story-hero.webp` | `/` first view, full motion | 1440 × 900 | Synthetic: stripe geometry in a drawn night frame, labelled "synthetic frame" |
| `story-pipeline.webp` | `/`, the pipeline plate at its last step | 1440 × 900 | Synthetic example frame; the SHA-256 is computed live from a fixed label |
| `story-check-post.webp` | `/`, the three.js check-post fork | 1440 × 900 | Synthetic: the five lanes; the counts beside them come from `docs/EVALUATION.md` |
| `story-hero-phone.webp` | `/` first view | 390 × 844 | Synthetic, as above |
| `story-check-post-phone.webp` | `/`, the fork | 390 × 844 | Synthetic, as above |
| `console-road-live.webp` | `/app/pipeline`, daylight | 1440 × 900 | Exact counts from the local LILA test sample (252 public research images), the same figures as `docs/EVALUATION.md` section 7; the signed-in name is a throwaway review account |
| `console-road-live-night.webp` | `/app/pipeline`, night theme | 1440 × 900 | As above |
| `sign-in.webp` | `/app` signed out | 1440 × 900 | Synthetic frame; no data |
