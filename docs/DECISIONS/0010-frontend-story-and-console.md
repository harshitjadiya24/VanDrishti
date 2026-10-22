# 0010 — Frontend: a public story site and a redesigned console in one visual world

- **Status:** accepted
- **Date:** 2026-10-22

## Context
The console worked but read as a plain admin tool, and nothing explained the workflow
(camera → ingestion → AI pipeline → confidence routing → people decide → insight → action)
to someone seeing VanDrishti for the first time. The developer asked for a frontend that is
fascinating, relatable and animated where it helps, with three.js and GSAP where required.
Users are biologists at desks (long keyboard review sessions), rangers on phones outdoors,
and officials reading dashboards and reports. The story must stay honest: every public
number comes from `docs/EVALUATION.md`, illustrations are labelled synthetic, and no photo
of a person is shown.

## Decisions
1. **Two surfaces, one world.**
   - `/` is a public scroll story: one frame walks down the road, from the camera to a
     person's decision. It makes no API calls and no third-party requests.
   - `/app/*` is the signed-in console. Old console paths redirect to `/app/...`.
   - Both live in "The Forest Board": Indian forest-department signboards, check-posts and
     painted milestones. This world came from the impeccable design round (seed 1df32c7c,
     re-roll 1). The direction contract is in `.impeccable/surfaces/`, and the design system
     is in `DESIGN.md`.
2. **Tokens, not ad-hoc colours.**
   - Board green owns the ground; check yellow means "needs a person"; red means people,
     vehicles and failures.
   - Every state carries a word, never colour alone.
   - Daylight is the default, because rangers work outdoors; a night theme follows the
     system or a switch.
   - Text on red and green fills uses `--on-alarm`/`--on-ok` (white by day, dark ink at
     night). Focus rings use `--focus-ring`.
3. **Motion explains state; one library per job.**
   - **Story:** GSAP with ScrollTrigger and Lenis handles pinned and scrubbed sequences.
     They load only in the story chunk.
   - **Console:** Motion handles route transitions, layout and exit animations, number
     rolls and toasts.
   - **CSS** handles small loops (skeleton sheen, the map's risk pulse).
   - Motion tokens (`--ease-board`, `--ease-boom`, `--ease-stamp`, durations) live in
     `app.css` and are mirrored in `src/motion/tokens.ts`.
   - Under `prefers-reduced-motion`, every surface shows its final state. Privacy visuals
     (blur, rounded coordinates) never depend on an animation.
4. **three.js only for the check-post fork.**
   - The fork is the one scene where depth carries meaning: five lanes, and a boom that
     lifts only on the visitor's "Review" key.
   - It is its own chunk (about 136 KB gzipped), imported only when the section nears
     view. A static SVG replaces it without WebGL.
5. **Code splitting.**
   - The story, the three.js scene and the console (`src/console.ts`, loaded through route
     `lazy`) are separate chunks.
   - The story page loads 170 KB of gzipped JS, the console 188 KB; the budget is 250 KB.
6. **Visuals read real values.**
   - The live pipeline view (`GET /dashboard/pipeline`) shows exact counts; its moving dots
     are labelled decorative.
   - The risk point stack reads the thresholds from `/risk/summary`.
   - The audit chain shows each entry's `hash` and `prev_hash` from `/audit/events`; only
     the server verifies the chain.
7. **Accessibility floor:**
   - WCAG AA text contrast in both themes, and focus rings at least 3:1;
   - 44 px controls on phones, and at least 24 px everywhere;
   - a skip link, labelled controls, and keyboard review shortcuts that ignore typing in
     inputs;
   - undo toasts never time out.
8. **Packages** (each the newest release at least 14 days old):
   - `motion` 14.0.0, `gsap` 3.15.0, `@gsap/react` 2.1.2, `lenis` 1.3.26;
   - `three` 0.186.1 with `@types/three` 0.186.0;
   - self-hosted `@fontsource` fonts: Mukta, Big Shoulders Stencil, Baloo 2.

## Consequences
- The story page must never import from `Shell` or `screens/`. Shared helpers (such as
  `story/stripes.ts`) sit outside both.
- `src/story/results.ts` is the only source of public numbers, and a test checks it against
  `docs/EVALUATION.md`.
- Screenshots committed to `docs/screenshots/` show only synthetic illustrations and
  photo-free console views. Captures with camera-trap frames stay in the git-ignored
  `.impeccable/review/`.
- Not yet verified: real touch gestures on phones (only widths were emulated), screen
  readers, and the Audit screen live (it was checked by tests).
