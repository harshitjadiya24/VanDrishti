---
version: 1
slug: "frontend-src-story-storypage-tsx"
primary_target: "frontend/src/story/StoryPage.tsx"
related_targets: ["frontend/src/Shell.tsx"]
---

## Scope and mode
- **Surfaces:** the public story site (`/`, mode: Persuade, with a layered audience) is the
  primary surface. The signed-in console (`/app/*`, mode: Operate) inherits the same world.
- **Audiences:**
  - forest-department officials, who want outcomes first;
  - technical and portfolio readers, who get the engineering deep-dive further down.
- **Primary action:**
  - "See how it works", which scrolls into the pipeline sequence;
  - "Sign in", which opens the console.
- **Build path:** code-led (no image generation available). The ambition lives in this
  contract.
- **Scene and theme:**
  - The story's ground is the owned forest green with white enamel.
  - The console defaults to a **white-enamel daylight** board, because rangers work outdoors
    on phones and analysts at desks.
  - A **night-patrol** dark mode follows the system setting, for night-IR review.

## Direction contract
THESIS: The workflow is a forest road. Every stage is a painted Forest Department board, and
every place a human decides is a check-post whose boom only a person lifts. It refuses the
category default: a dark AI dashboard with a neon accent, or a hero photo above feature
cards.

OWN-WORLD:
- **Colour:**
  - deep forest green (#14532d family) is owned outright as the story's ground;
  - white enamel is the only relief, and the console's daylight ground;
  - signal yellow and black mark a check-post (a person decides);
  - signboard red is only for people, vehicles and failures.
- **Type:** stencilled board titles, a sturdy Devanagari-capable sans for the text, and
  enamel plates with riveted corners as cards.
- **Controls:**
  - milestones (rounded-top stones carrying a stage number and distance) are navigation and
    progress;
  - the striped boom is the routing gate;
  - every card has three tiers: verdict, label, reason.

STORY: A visitor follows one frame down the road:
1. camera post;
2. records office (an immutable original);
3. the AI milestones (quality, detect, species, check, outline, decide, why);
4. the check-post fork (≥ 0.9 auto with spot checks, 0.6–0.9 review, < 0.6 uncertain;
   people and vehicles always stop);
5. the ranger's desk (review, audit chain);
6. the privacy screen;
7. the risk board;
8. the stripe register (identity proposals);
9. the notice board (alerts, reports, API).

They come away believing that AI proposes, people decide, and every decision has its
reasons and its record. Then they sign in or read the engineering.

FIRST VIEWPORT:
- A full-width green board fills about 80% of the height. "VanDrishti" is stencilled large
  in white, with वनदृष्टि beneath it, and one line: "AI proposes. People decide."
- Bottom-left, an enamel plate shows a synthetic camera frame: a box draws itself around the
  tiger and a verdict plate appears.
- Along the bottom edge, a road of five milestones (Camera, Detect, Decide, Review, Act)
  starts. The first milestone is the primary action, "See how it works ↓"; "Sign in" is a
  small white plate top-right.
- Signature interaction: scrolling drives the frame down the road, and at the check-post the
  boom lifts only when the visitor presses the "Review" key.

FORM: Indian Forest Department signboards, check-posts and painted milestones. Position 4 on
the grounded list; seed key 1df32c7c, re-roll 1.

RAISES:
- **Single-hue program:** forest green owned outright as the ground.
- **Minihompy room:** the reserve is one persistent scene whose state visibly changes.
- **Glaze shelf:** every frame carries its recipe (model, version, config) beside it.
- **Iridescent cloud:** uncertainty is a named, visible state with its competing explanation.
- **Pulp rack:** every card has a fixed three-tier hierarchy (verdict, label, reason).

MOTION GRAMMAR:
- **Story:** boards swing in on their posts, milestones count up as the frame passes,
  stencil text paints on, the boom lifts, stamps press.
- **Console:** the same verbs, quieter:
  - plates slide like boards being hung;
  - decisions press a stamp;
  - counts roll like milestone digits.
- **Reduced motion:** final states only.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Boundaries and anti-goals
- **Honesty:**
  - only numbers from `docs/EVALUATION.md` (via `src/story/results.ts`), with their caveats;
  - illustrative frames labelled synthetic;
  - no faces, and no photos of people (blurred silhouettes only);
  - no implied Indian field validation;
  - no movement between cameras drawn as observed.
- **The story site:** no API calls and no third-party requests (fonts self-hosted).
- **Not a costume:** the boards must be the working navigation, cards and controls, not
  illustrations on a template.
- **The console:** keep every function, the keyboard review shortcuts, roles and API
  contracts.
