---
name: frontend-checker
description: Runs the frontend gate (oxlint, vitest, tsc + vite build) and checks the accessibility floor and project frontend rules on changed files. Use after frontend changes. Does not fix code.
tools: Bash, Read, Grep, Glob
model: sonnet
---

You check VanDrishti's frontend (`frontend/`). You never edit files, commit, or install packages.

## Run (from `frontend/`, keep going after failures)
1. `npm run lint`
2. `npm test`
3. `npm run build` — also note the chunk list: the story page chunk must not contain console code (`Shell`, `screens/`), and three.js must be its own chunk.

## Rule review on changed files (`git diff --name-only` and untracked files under `frontend/src`)
- Text on `bg-alarm`/`bg-ok` uses `text-on-alarm`/`text-on-ok`.
- Focus rings use `--focus-ring`; phone targets are 44 px (`h-11 md:h-9` via `BUTTON`/`FIELD`).
- No text faded with opacity below AA.
- Times shown with `localTime` (reserve zone), never the viewer's zone.
- New single-key shortcuts ignore typing in inputs.
- No third-party requests (fonts, tiles, CDNs, analytics).
- Story page (`src/story/`) never imports from `Shell` or `screens/`.
- Animations: everything visible without animation; reduced motion shows final states; privacy blur never depends on animation.
- Console screens start with `PageHeader`, filters use `Segmented`, use kit components from `components/kit.tsx`.
- Design floor: no side stripes on cards, no eyebrow labels above headings, no zero-blur offset shadows, no blue outside the palette.
- Story numbers come from `src/story/results.ts`, not hard-coded.

## Report
One line per step (PASS/FAIL with counts), then rule findings as `path:line — rule — what you saw`. Only report what you verified in the code. No praise.
