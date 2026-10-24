# 0012 — Frontend redesign: "Cinematic night-vision"

- **Status:** accepted
- **Date:** 2026-10-24
- **Supersedes:** 0011 (Ink & Sandstone palette); replaces the visual world of 0010 (The Forest Board).
  0010's structure stands: a public story at `/` with no API calls, and a separate console chunk at `/app/*`.

## Context
The developer found The Forest Board, and two recolours of it (Ink & Sandstone, then Midnight &
Tiger), unimpressive. They asked for the whole frontend, architecture and design, to be redone at
a senior frontend and UI/UX standard. In a structured question they chose **Cinematic night-vision**:
- a dark, full-bleed, documentary look;
- a three.js night forest that opens the story;
- an IR and thermal visual language;
- a premium dark console with a ⌘K palette.

Libraries were left to my judgement. The work ran in phases R0–R4, each ending at a checkpoint.

## Decisions
1. **The world: a camera trap's night.** The story's first viewport is the photograph being
   taken. "Fire the camera" flashes the scene, freezes it in infrared greyscale and draws the
   detector's box. The trap's burned-in data strip (camera, reserve-local time, IR or day mode) is
   the system's chrome on every frame.
2. **Attention is heat.** An ironbow thermal ramp (`heat-0..6`) shows how much a person is needed:
   cold means settled (IR cyan), and hot means review or uncertain (orange to amber).
   - Crimson (`danger`) is only for people, vehicles, high risk and failures.
   - Every heat colour comes with a word.
3. **Themes.** Night is the default, for long night-IR review sessions. Flash is the daylight
   theme for rangers outdoors. The story is always night (`.night-scope`).
4. **Contrast.** Every pair is script-checked against `design/tokens.css`. Text is at least 4.5:1
   on every surface in all three scopes; the lowest is 4.59. Focus rings and data marks are at
   least 3:1.
5. **Type.** All four faces are self-hosted through `@fontsource`; there are no third-party requests.
   - Archivo, at expanded width, for display.
   - Geist for the UI.
   - Martian Mono only for data: times, scores, hashes and model recipes.
   - Noto Sans Devanagari for वनदृष्टि.
6. **Architecture (`frontend/src`).**
   - `app/`: entry, router and global CSS.
   - `lib/`: the API client, session, `time` (`localTime`, `stripTime`, `dayIn` in the reserve's zone) and `keys` (`isTypingTarget`, `isControlActivation`).
   - `design/`: tokens, Radix-based primitives, the kit, `IRFrame` and `TrapStrip`.
   - `console/`: the shell, the ⌘K palette and the navigation model.
   - `features/<domain>/`: each screen with its tests.
   - `story/`: the chapters, the R3F scene and the fork.
   - `vendor/motion-primitives`: MIT, copied in.
7. **Libraries.** All are pinned to releases at least 14 days old.
   - Added: `@react-three/fiber`, `drei` and `postprocessing` (lazy 3D chunk only); Radix
     primitives (dialog, dropdown, popover, tooltip, tabs, toggle group, select, scroll area); `cmdk`.
   - Kept: GSAP, ScrollTrigger and Lenis on the story only; Motion in the console.
   - Not added: anime.js, because GSAP and Motion already cover it.
8. **Interaction rules learned during the build.**
   - Enter or Space on a focused control belongs to that control. A page-wide review key must never
     confirm the frame on screen when the person was pointing at a thumbnail or Undo.
   - People/vehicle frames are never loaded as thumbnails, because each display request is an
     audited view.
   - The hero flash fires at most once every 2 s, and never under reduced motion.
9. **Honesty on the story.**
   - Every number comes from `story/results.ts`, tested against `EVALUATION.md`, now including the
     risk sample (17 MEDIUM, 0 HIGH).
   - Synthetic examples are labelled as such.
   - Person detection is stated as unmeasured.
   - The synthetic detection score is 0.96, so it can't be mistaken for the measured detector
     precision of 0.94.

## Consequences
- **DESIGN.md and `.impeccable/design.json`** were rewritten from the built code after the finish review.
- **Screenshots:** `docs/screenshots/` were recaptured. The console captures use a synthetic API,
  because the backend was not running; `PROVENANCE.md` says so.
- **Old class names:** the Forest Board names (text-dim, bg-board, bg-check …) no longer exist. New
  code uses only the tokens listed in CLAUDE.md.
