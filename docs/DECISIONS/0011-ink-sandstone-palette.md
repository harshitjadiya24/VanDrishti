# 0011 — Recolour the Forest Board: Ink & Sandstone

- **Status:** superseded by 0012 (the Cinematic night-vision redesign)
- **Date:** 2026-10-24
- **Amends:** 0010 (decision 2, colours only)

## Context
The developer found the all-green Forest Board heavy and wanted a palette that is more
elegant and sober. They picked "Ink & Sandstone" from three options and asked for a
recolour only. The signboard world stays: its shapes, stencil lettering, milestones,
check-post, rivets and motion are unchanged.

## Decisions
1. **Same token names, new values.** `board`, `check`, `on-board` and the rest keep their
   names, so components did not change. The values live in `frontend/src/app.css`, the
   `DESIGN.md` frontmatter and `.impeccable/design.json` (ramps regenerated in OKLCH).
2. **Roles.**
   - Charcoal `#1c1b19` is the board (story ground, sidebar, primary button).
   - Ivory and sandstone (`#fbf9f4` / `#f2eee6`) are the daylight enamel.
   - Brass `#b8925a` means "a person decides".
   - Signboard red `#c04432` and alarm red `#a8382b` mean people, vehicles and failures.
   - Moss `#4f6b4f` is the only green, for settled states.
   - Slate `#6e7f8c` stays the single neutral data mark.
3. **Contrast.** All pairs are measured with the WCAG formula.
   - Text pairs are ≥ 4.5:1: on-board on board 15.4, dim on raised plate 4.55, check-text
     on ground 5.4, white on alarm 6.4, white on ok 5.9; at night every text pair is ≥ 5.7.
   - Brass alone is 2.5:1 on daylight, so brass written as text uses `check-text`
     (`#7a5b2b` by day, `#d2ae74` at night).
   - Signboard red was raised from `#b23c2c` to `#c04432`, so badges reach 3.4:1 against
     the charcoal sidebar while white on them stays at 5.1:1.
4. **Night sidebar keyline.** At night the charcoal sidebar sits on a near-black ground
   (1.1:1), so it gets a 1px `board-line` right edge.
5. **Copy follows colour.** UI text that named colours now says "gold" (tiger bars,
   medium risk) and "moss green" (pipeline legend).
6. **Illustrations.** The synthetic frame's greys moved from green-tinted to warm, and the
   detector box is light brass. The tiger flank's orange and the black stripes are
   unchanged. The three.js fork uses the same mapping.

## Consequences
- The photo-free captures in `docs/screenshots/` show the old palette until they are recaptured.
- Any new colour must come from these tokens (the "Palette Is Closed" rule still holds).
