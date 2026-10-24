---
version: 1
slug: "frontend-src-story-storypage-tsx"
primary_target: "frontend/src/story/StoryPage.tsx"
related_targets: []
---

## Scope and mode
- **Surface:** the public story site (`/`), mode Persuade, layered audience: forest-department officials (outcomes first), technical and portfolio readers (engineering deep-dive further down).
- **Primary action:** "Fire the camera" (the hero's working demonstration), then "See how it works" (scrolls into the pipeline) and "Sign in" (console).
- **Build path:** code-led (no image generation on this machine); the ambition lives in this contract.
- **Scene and theme:** always night. The story happens at 22:41 in a reserve; the page is the camera's night.
- **Replaces** The Forest Board (rejected by the developer on 2026-10-24 as unimpressive, after two recolours).

## Direction contract
THESIS: The page is a camera trap's night. The first viewport is the frame being taken; every section is a stage that frame passes through. It refuses the dark AI dashboard with a neon accent and the hero-photo-over-feature-cards template.

OWN-WORLD: IR black (#0A0B0D) and IR silver greys are the ground; the camera's flash is the only white. Attention is heat: the ironbow thermal ramp (cold violet → magenta → orange → amber → white-hot) means "a person is needed here", hottest where a person decides; cold IR cyan means settled; crimson only for people, vehicles and danger. Type: Archivo at expanded width (115–125%) for display, Geist for reading, Martian Mono only for the camera's own data strip (camera, local time, IR, model recipes). The trap's data strip is the system's chrome: every frame, card and section carries one.

STORY: one synthetic night frame of a tiger: eyeshine in the dark, the flash, the detector box, species, outline, the decision with reasons, the five-road routing, a person's review with an append-only record, the privacy blur, stripes compared for identity, risk with reasons, alerts and reports. The visitor believes AI proposes, people decide, every decision keeps its reasons and record; then signs in or reads the engineering.

FIRST VIEWPORT: a full-bleed WebGL night forest (silhouetted trunks, ground fog, drifting fireflies) fills 100% of the viewport. Two eyes glint low in the trees. Top-left: the wordmark VanDrishti in expanded Archivo with वनदृष्टि beside it; top-right: Sign in. Bottom-left, large: "AI proposes. People decide." with one line beneath and two actions: "Fire the camera" (primary, amber) and "See how it works ↓". Along the bottom edge, the trap's data strip: ☾ CAM S-07 · 22:41:07 IST · IR · SYNTHETIC FRAME. Signature interaction: firing the camera flashes the scene to IR silver, freezes it, reveals the striped body, draws the detector box with "animal 0.94" and stamps the strip; scrolling then carries that frozen frame down the pipeline.

FORM: camera-trap night photography and the thermal-imaging scale (user-pinned direction "Cinematic night-vision", chosen through the structured question on 2026-10-24; pinned, so no concept roll; seed key: none, user-pinned).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Motion grammar
- Story: GSAP + ScrollTrigger + Lenis. Verbs: flash (white-out, 120 ms, then IR decay), freeze, draw-on (boxes, outlines), heat rise (thermal colour climbing as attention is needed), strip stamp (data strip types on). One authored moment per chapter, never the same entrance everywhere.
- Reduced motion: the post-flash frame is shown already captured; every final state visible without animation; no flashing at all (photosensitivity).

## Boundaries
- Only numbers from `src/story/results.ts`; illustrations labelled synthetic; no faces or photos of people; no implied Indian field validation; no movement between cameras drawn as observed.
- No API calls and no third-party requests; WebGL in its own lazy chunk with a static fallback.
- Flash: never more than one flash per 2 s and never a full-screen strobe (WCAG 2.3.1); off under reduced motion.
