---
name: VanDrishti
description: "The Forest Board: camera-trap monitoring where AI proposes and people decide, painted as forest-department signboards, check-posts and milestones."
colors:
  board: "#14532d"
  board-deep: "#0e3d21"
  board-line: "#2c6b45"
  on-board: "#f5f6f1"
  on-board-dim: "#b9cdbd"
  check: "#f2c230"
  on-check: "#15170f"
  signboard-red: "#c8372d"
  ground: "#f3f4ee"
  plate: "#ffffff"
  plate-raised: "#e8ebe3"
  ink: "#142019"
  dim: "#4e5f53"
  line: "#cfd6cb"
  check-text: "#7a5800"
  alarm: "#b3271c"
  ok: "#1e6b3c"
  on-alarm: "#ffffff"
  on-ok: "#ffffff"
  focus-ring: "#14532d"
  neutral-mark: "#3f6f8f"
  ground-night: "#0b130e"
  plate-night: "#121d16"
  plate-raised-night: "#1a281f"
  ink-night: "#e7efe9"
  dim-night: "#9db1a3"
  line-night: "#2a3a30"
  check-text-night: "#f2c230"
  alarm-night: "#f0705f"
  ok-night: "#5fbf85"
  on-alarm-night: "#0b130e"
  on-ok-night: "#0b130e"
  focus-ring-night: "#f2c230"
  neutral-mark-night: "#7fa8c4"
typography:
  display:
    fontFamily: "Big Shoulders Stencil Variable, Mukta, ui-sans-serif, sans-serif"
    fontSize: "clamp(3.6rem, 11vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Big Shoulders Stencil Variable, Mukta, ui-sans-serif, sans-serif"
    fontSize: "clamp(2.4rem, 6vw, 4.25rem)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Mukta, Noto Sans Devanagari, ui-sans-serif, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
  stat:
    fontFamily: "Mukta, Noto Sans Devanagari, ui-sans-serif, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "tnum"
  body:
    fontFamily: "Mukta, Noto Sans Devanagari, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  body-console:
    fontFamily: "Mukta, Noto Sans Devanagari, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Mukta, Noto Sans Devanagari, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  devanagari:
    fontFamily: "Baloo 2, Mukta, Noto Sans Devanagari, sans-serif"
    fontSize: "clamp(1.5rem, 3.4vw, 2.2rem)"
    fontWeight: 600
  recipe:
    fontFamily: "ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
rounded:
  stone-foot: "4px"
  badge: "6px"
  control: "8px"
  segmented: "10px"
  plate: "12px"
  board: "14px"
  milestone-top: "56px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  page-gutter-phone: "16px"
  page-gutter-desk: "32px"
  sidebar: "272px"
  content-max: "1360px"
components:
  button-primary:
    backgroundColor: "{colors.board}"
    textColor: "{colors.on-board}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 12px"
  button-primary-hover:
    backgroundColor: "{colors.board-deep}"
    textColor: "{colors.on-board}"
  button-secondary:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 12px"
  button-secondary-hover:
    backgroundColor: "{colors.plate-raised}"
  button-alarm:
    backgroundColor: "{colors.alarm}"
    textColor: "{colors.on-alarm}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  field:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 10px"
  plate:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "16px"
  board:
    backgroundColor: "{colors.board}"
    textColor: "{colors.on-board}"
    rounded: "{rounded.board}"
    padding: "16px"
  enamel-plate-on-board:
    backgroundColor: "{colors.on-board}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "16px 20px"
  stage-badge-auto:
    backgroundColor: "{colors.ok}"
    textColor: "{colors.on-ok}"
    typography: "{typography.label}"
    rounded: "{rounded.badge}"
    padding: "2px 8px"
  stage-badge-review:
    backgroundColor: "{colors.check}"
    textColor: "{colors.on-check}"
    typography: "{typography.label}"
    rounded: "{rounded.badge}"
    padding: "2px 8px"
  stage-badge-people:
    backgroundColor: "{colors.alarm}"
    textColor: "{colors.on-alarm}"
    typography: "{typography.label}"
    rounded: "{rounded.badge}"
    padding: "2px 8px"
  stage-badge-quiet:
    backgroundColor: "{colors.plate-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.badge}"
    padding: "2px 8px"
  count-badge-check:
    backgroundColor: "{colors.check}"
    textColor: "{colors.on-check}"
    rounded: "{rounded.full}"
    padding: "0 6px"
  count-badge-alarm:
    backgroundColor: "{colors.signboard-red}"
    textColor: "{colors.on-board}"
    rounded: "{rounded.full}"
    padding: "0 6px"
  nav-item-active:
    backgroundColor: "{colors.on-board}"
    textColor: "{colors.board}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
  milestone:
    backgroundColor: "{colors.on-board}"
    textColor: "{colors.board}"
    rounded: "{rounded.milestone-top}"
    width: "132px"
  toast:
    backgroundColor: "{colors.board}"
    textColor: "{colors.on-board}"
    rounded: "{rounded.plate}"
    padding: "12px 16px"
  toast-alarm:
    backgroundColor: "{colors.alarm}"
    textColor: "{colors.on-alarm}"
    rounded: "{rounded.plate}"
    padding: "12px 16px"
---

# Design System: VanDrishti

## Overview

**Creative North Star: "The Forest Board"**

The workflow is a forest road. Every stage is a painted Forest Department board, and every place a human decides is a check-post whose boom only a person lifts. The system borrows the material of Indian forest-department signage: deep green painted boards with a white keyline, white enamel plates screwed on with rivets, rounded-top milestones, black-and-yellow check-post striping, and red reserved for danger. These are the working parts of the interface (navigation, cards, badges, gates), never decoration laid over a template.

Two surfaces share the world. The public story (`/`) stands on board green: one synthetic night frame walks down the road from camera to a person's decision, with milestones as navigation and progress. The signed-in console (`/app/*`) keeps the green board as its sidebar and puts the work on enamel: white plates on a pale ground by daylight, dark plates on a near-black forest ground for night patrol. Density is a desk tool's: 13 to 15 px text, tight plates, keyboard review, every state spelled out in a word.

The world rejects the category default: a dark AI dashboard with a neon accent, or a hero photo above feature cards.

**Key Characteristics:**
- Board green owns the ground of the story and the console's sidebar; white enamel is the only relief.
- Check yellow means "a person decides here"; red means people, vehicles and failures, nothing else.
- Every state carries a word; colour never stands alone.
- Stencilled board lettering for titles, a sturdy Devanagari-capable sans (Mukta) for everything read.
- Enamel plates with rivets as cards; one soft elevation; no hard offset shadows.
- Milestone stones mark the road's five stages; hectometre stones mark stops between them.
- Every frame carries its recipe (model, version, config) on a monospace foot strip.
- Motion verbs from the world: boards swing in, stencils paint on, the boom lifts, stamps press, counts roll. Reduced motion shows final states.

## Colors

A single-hue program: forest green owned outright, white enamel as relief, and two signal colours with fixed meanings.

### Primary
- **Forest Board Green** (`board`): the story's ground, the console sidebar, the phone header, the primary button and the default toast. It is the brand.
- **Deep Board** (`board-deep`): the story page's ground behind the boards, the primary button's hover, and the sidebar's select fields.
- **Board Keyline Green** (`board-line`): the band at the top of every milestone stone, the rule above the hero's road, and dividers on the board.
- **Enamel White** (`on-board`): text on the board, enamel plates on the story's boards, the active nav plate, and the board's keyline.
- **Weathered Enamel** (`on-board-dim`): secondary text on the board (Devanagari wordmark, explanations, group titles, the Synthetic label).

### Secondary
- **Check-Post Yellow** (`check`, text `on-check`): a person decides here. Review and uncertain stage badges, waiting-queue counts, spot-check chips, the detector's box and label, the skip link, text selection, and the active step ring in the story. Always paired with near-black `on-check`.
- **Check Text** (`check-text`, night `check-text-night`): the readable yellow-family colour for "check" values written as text on plates (a dark ochre by day, the full yellow at night).

### Tertiary
- **Signboard Red** (`signboard-red`): the fixed red painted on boards: alarm counts on the green sidebar, the story's alarm plate, the boom's stripes and person boxes in synthetic scenes.
- **Alarm** (`alarm`, night `alarm-night`, text `on-alarm`): people, vehicles, high risk and failures on the console's plates: the "People or vehicles" badge, high-risk badge, error banners, alarm toasts.
- **Settled Green** (`ok`, night `ok-night`, text `on-ok`): auto-accepted and "Decided by a person" states, confidence at or above 0.9, positive checks.

### Neutral
- **Enamel Ground** (`ground` / `ground-night`): the console page background, and fields' fill.
- **Plate** (`plate` / `plate-night`): console cards, segmented control track.
- **Raised Plate** (`plate-raised` / `plate-raised-night`): quiet badges (likely blank, quality, low risk), skeletons, secondary hover, icon wells.
- **Ink** (`ink` / `ink-night`): body text; the segmented control's sliding plate.
- **Dim** (`dim` / `dim-night`): explanations, labels, secondary values.
- **Line** (`line` / `line-night`): borders on buttons and fields, plate rivets, the dial's track, scrollbars.
- **Focus Ring** (`focus-ring` / `focus-ring-night`): board green by day, check yellow at night.
- **Neutral Mark** (`neutral-mark` / `neutral-mark-night`): the palette's only blue, for neutral data marks: cameras with no open risk on the map and plain count bars on the dashboard. Never for state, buttons or links.

### Named Rules
**The Check-Post Rule.** Yellow means a person decides here, and nothing else. A spot-check chip is check yellow; so is a review queue count.

**The Red Is for Danger Rule.** Red marks people, vehicles, high risk and failures only. It is never decoration, never a brand accent.

**The Word With Every Colour Rule.** Every stage, risk level and route shows its word ("Needs a person", "High risk", "Auto-accepted"); colour is reinforcement.

**The Palette Is Closed Rule.** No hue enters outside these tokens; blue lives only in `neutral-mark` data marks.

**The On-Fill Rule.** Text on alarm or ok fills uses `on-alarm` / `on-ok` (white by day, dark ink at night, because the night fills are light). Never hard-code white on a theme-driven fill.

## Typography

**Display Font:** Big Shoulders Stencil Variable (with Mukta, ui-sans-serif)
**Body Font:** Mukta (with Noto Sans Devanagari, system-ui)
**Devanagari Wordmark:** Baloo 2 (with Mukta)
**Recipe/Mono:** ui-monospace

**Character:** Stencilled condensed capitals, as painted on a forest-department board, over a sturdy humanist sans that sets Hindi and English with equal weight. All fonts are self-hosted.

### Hierarchy
- **Display** (800, `clamp(3.6rem, 11vw, 6rem)`, 0.92): the hero's stencilled "VANDRISHTI" only. Uppercase, balanced wrapping.
- **Headline** (800, `clamp(2.4rem, 6vw, 4.25rem)`, 0.92): story section titles in the stage-title, uppercase, beside their stone.
- **Title** (600, 26px): console page titles and the decision panel's label. Console wordmark is the stencil at 30px (24px on phones).
- **Stat** (600, 34px, tabular): stat-tile numbers, rolling to new values.
- **Body** (400, 16px, 1.5): base text. The console's explanations run at 15px in `dim`, capped at 72ch; story paragraphs at 17 to 18px, capped at 46 to 60ch.
- **Label** (600, 13px): badges, nav group titles, field labels. Controls are 14px; fields are 16px on phones (no zoom) and 14px from `md`.
- **Recipe** (400, 12px, monospace): model/version/config strips, hashes, frame captions (11px).

### Named Rules
**The Stencil Is for Boards Rule.** The stencil face sets board titles and the wordmark only; anything read closely is in Mukta.

**The No Eyebrow Rule.** No small label sits above a heading. A heading stands alone; provenance rides the plate's monospace foot strip.

**The Tracking Floor Rule.** Display sizes cap at 6rem and tracking never goes below -0.02em.

## Layout

The console is a sidebar board plus a work area. From `md` (768px) the green sidebar is a fixed 272px column, sticky at full height; below `md` it becomes a slim sticky green header (wordmark, alerts bell with count, menu button) and the sidebar slides in as a sheet at `min(86vw, 320px)` over a dimmed page. The work area is padded 16px on phones and 32px from `md`, centred to a 1360px maximum.

Spacing follows Tailwind's 4px step. Gaps of 8 and 12px dominate inside plates and between controls; plates pad 16px (stat tiles, toasts) to 20px (empty states, story plates). Page headers wrap: title and state badges on one line, one paragraph of plain explanation beneath, actions to the right.

The story is a single scroll of full-width sections (16px gutters on phones, 40px from `md`; 80px vertical rhythm, 112px from `md`). The hero fills the first viewport: the board takes most of the height on two banded posts, and the road of five milestones runs along the bottom edge (a five-column grid on phones, a row of 132px stones from `md`). The pipeline section pins the frame plate while step plates scroll beside it.

Breakpoints are Tailwind defaults: `sm` 640, `md` 768 (the main switch), `lg` 1024, `xl` 1280.

### Named Rules
**The 44px Rule.** Every phone tap target is at least 44px: controls use `h-11 md:h-9` (44px on phones, 36px at the desk); icon buttons in the phone header are 44px squares.

## Elevation & Depth

Depth is physical and quiet: enamel plates and boards hang a little off the wall with one soft, blurred shadow. Tonal layering (ground → plate → raised plate) carries most hierarchy; shadows only say "this is a plate". In the console, every plate, toast, the active nav plate and the skip link use the single `--shadow-plate` token, which deepens at night. On the story's dark green ground the boards and plates use longer, darker soft drops so they read as standing out from the forest.

### Shadow Vocabulary
- **Plate, daylight** (`0 1px 2px rgb(20 32 25 / 0.08), 0 6px 16px -6px rgb(20 32 25 / 0.18)`): every console plate, toast, active nav plate.
- **Plate, night** (`0 1px 2px rgb(0 0 0 / 0.4), 0 8px 20px -8px rgb(0 0 0 / 0.6)`): the same token in night patrol.
- **Story board** (`0 24px 50px -24px rgb(0 0 0 / 0.7)`): the green boards on the story's deep ground.
- **Story plate** (`0 14px 30px -14px rgb(0 0 0 / 0.6)`): enamel plates on story boards.
- **Stone** (`0 10px 20px -10px rgb(0 0 0 / 0.55)`): milestone stones and the Sign in plate.

### Named Rules
**The One Soft Elevation Rule.** A plate has one soft, blurred elevation. No zero-blur offset shadows, no stacked "neo" shadows, no glow.

## Shapes

Boards and plates have gently rounded corners (14px boards, 12px plates); controls and fields 8px; badges 6px; segmented tracks 10px; counts are pills. A green board carries a 3px enamel keyline inset 8px from its edge and four rivets (6px dots, 8px in from each corner). Enamel plates that hold a record or decision carry rivets too (in `line` on the console, a grey-green on story plates).

Two stone silhouettes mark the road. **Milestones** (stages 1 to 5) are rounded-top stones: a green band with the stage number over an enamel face with the stage word, square-ish at the foot (4px). **Hectometre stones** (stops between stages, numbered like "4·1") are the same form, smaller. The console's sidebar groups use a tiny stone (16 × 20px) with the stage number. The check-post boom and the hero's posts are banded stripes (black/white posts, red/white boom).

### Named Rules
**The No Side Stripe Rule.** No coloured stripe down the side of a card. State goes in a badge with its word.

## Components

### Buttons
Painted and plain: a solid board-green button for the one action that matters, outlined enamel for the rest.
- **Shape:** gently rounded (8px), 44px tall on phones, 36px from `md`.
- **Primary:** board green fill, enamel text, 14px semibold, 12px side padding; hover deepens to `board-deep`; disabled fades.
- **Secondary:** transparent with a 1px `line` border, ink text, 14px; hover fills `plate-raised`; disabled at 40% opacity.
- **Alarm:** `alarm` fill with `on-alarm` text, for consequential people/vehicle actions and error banners.
- **Focus:** a 2px `focus-ring` outline offset 2px on every control; check yellow on green boards, board green on enamel plates on boards.

### Chips / Badges
- **Stage badge:** 6px radius, 13px semibold, 2px × 8px padding, always a word. Auto-accepted (ok fill), Needs a person and Uncertain (check fill), People or vehicles (alarm fill), Likely blank and Quality problem (raised plate), Decided by a person (2px ok outline, ok text).
- **Risk badge:** same shape. High (alarm), Medium (check), Low (raised), Dismissed (line outline, dim).
- **Count badge:** a 20px pill with tabular digits that pops (stamp easing) when the number changes: check for waiting queues, signboard red for urgent alerts, translucent enamel when neutral or on the active nav plate.
- **Spot check chip:** check yellow, 12px semibold.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** `plate` on `ground` (console); enamel white on green boards (story).
- **Shadow Strategy:** one soft elevation (see Elevation & Depth).
- **Border:** none; rivets mark plates that hold a record or decision.
- **Internal Padding:** 16 to 20px.
- **Three tiers:** a verdict card reads verdict badge → label (with its score) → reason, in that fixed order.
- **Recipe strip:** step plates in the story end in a full-bleed raised foot strip in 12px monospace naming the model or rule and its version.

### Inputs / Fields
- **Style:** 1px `line` border, `ground` fill, ink text, 8px radius; 44px and 16px text on phones, 36px and 14px from `md`. Selects on the board use `board-deep` with a translucent enamel border.
- **Focus:** the global 2px focus ring.

### Navigation
- **Console sidebar:** a green board. Groups follow the road (Insight; Decide 3; Review 4; Act 5; Records) with a tiny stone carrying the stage number. Items are 15px with a 17px line icon; hover is a 10% white wash; the active item is an enamel plate (`on-board`, board-green semibold text, plate shadow) that slides between items like a board being hung. Reserve select, theme switch (System / Daylight / Night) and the signed-in person sit at the board's foot.
- **Phones:** slim green header with a 44px alerts bell and menu button; the same board slides in from the left; Escape or a followed link closes it.
- **Story:** the hero's road of five milestones is the navigation; the first stone is the primary action ("See how it works ↓"); "Sign in" is a small enamel plate top-right.
- **Skip link:** "Skip to content", a check-yellow plate that appears on focus.

### Segmented Control
A 10px `plate` track with a `line` border; the chosen option is a dark ink plate that slides to it (board easing), its text in `plate` colour.

### Confidence Dial
A half dial on a `line` track with ink tick marks at the routing thresholds 0.6 and 0.9; the arc is ok at 0.9 and above, check from 0.6, alarm below, and its label names the band in words.

### Toasts
Board-green plates (alarm plates for failures) bottom-right, 15px. A toast that offers Undo has an enamel Undo button and never times out; plain confirmations fade on their own. Undo is a new audited action, never an erase.

### Empty States and Skeletons
An empty state is a small plate: an optional icon in a round raised well, an 18px semibold title, one dim paragraph (60ch) and an action. Skeletons are raised-plate blocks with a slow, low-contrast sheen that stops under reduced motion.

### Synthetic Night Frame (signature)
One shared SVG frame (420 × 190) used by the hero, the pipeline plate and the sign-in page: a dark sky, two layers of seeded grass and a striped body in a capsule, never a drawing of a tiger. The detector's check-yellow box sits around the body with a margin, its label above it; SAM's enamel outline traces exactly the body. A black caption strip in monospace names the camera, the local time and "SYNTHETIC FRAME". It sits inside an enamel plate with rivets.

### Named Rules
**The Visible Find Rule.** The detector box must visibly find a subject inside the frame: the striped body is always inside the box, never empty grass.

**The Stone Carries Its Stage Rule.** A milestone carries its stage number and word; a stop between stages uses a hectometre stone ("4·1"). Never an invented distance.

## Do's and Don'ts

### Do:
- **Do** put board green under the story and the console's navigation, and work on enamel plates.
- **Do** use check yellow only where a person decides, with `on-check` text.
- **Do** spell every state as a word inside its badge.
- **Do** use `on-alarm` / `on-ok` for text on alarm and ok fills so both themes pass AA.
- **Do** keep the focus ring at 3:1 or better: board green by day, check yellow at night and on boards.
- **Do** give phone targets 44px with `h-11 md:h-9`.
- **Do** carry provenance on a monospace foot strip at the plate's base.
- **Do** label every illustrative frame "Synthetic" and build it from stripe geometry.
- **Do** time motion with the board, boom and stamp easings and the quick (140ms), base (240ms) and board (520ms) durations, and show final states under reduced motion.

### Don't:
- **Don't** put a coloured stripe down the side of a card.
- **Don't** put an eyebrow label above a heading.
- **Don't** use a zero-blur offset shadow; plates take one soft elevation.
- **Don't** bring blue (or any hue) in from outside the palette; the spot-check chip is check yellow.
- **Don't** put an invented distance on a milestone; stops between stages use hectometre stones such as "4·1".
- **Don't** draw a detector box around empty grass; it must visibly find the subject.
- **Don't** use red for anything but people, vehicles, high risk and failures.
- **Don't** let a privacy blur or any meaning depend on an animation finishing.
- **Don't** make a dark AI dashboard with a neon accent, or a hero photo above feature cards.
