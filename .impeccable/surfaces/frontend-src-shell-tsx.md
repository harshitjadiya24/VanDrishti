---
version: 1
slug: "frontend-src-shell-tsx"
primary_target: "frontend/src/Shell.tsx"
related_targets: ["frontend/src/screens/ReviewScreen.tsx"]
---

## Scope and mode
- **Surface:** the signed-in console (`/app/*`), mode Operate. Biologists review hundreds of frames per sitting at a desk (keyboard); rangers act on alerts on phones outdoors; officials read dashboards.
- **Task priority:** Review queue first, then alerts, dashboard, identity, risk, the rest.
- **Scene and theme:** analysts work indoors on night-IR frames for hours, so Night (dark) is the default; rangers stand in daylight, so Flash (light) is first-class and follows the system or a switch.
- **Keep:** every function, permission, CSRF write, audit_view path, `reserve=` scoping, the keyboard review shortcuts (Y/C/N/F/S/P/1–3/J/K/M/U), undo toasts that never time out, localTime in the reserve's zone.

## Direction contract
THESIS: A desk for deciding night frames fast: the frame is the largest thing on screen and the human decision is the centre. It refuses the grey admin template with one accent and the neon-glow AI dashboard.

OWN-WORLD: the story's world lends four things only. Palette: IR black and silver surfaces (Night) or flash white and graphite (Flash), with the ironbow heat ramp for attention, IR cyan for settled, crimson for danger. Type: Geist for UI, Archivo expanded for screen titles and big counts, Martian Mono only for data (times, hashes, model recipes, confidence). Density: a desk tool's, 13–15 px text. Signature move: thermal attention plus the trap strip. Every frame carries its data strip; queues, counts and the dashboard map show how much each thing needs a person on the heat ramp, always with its word.

STORY: open the console, see what needs a person (hot) and what is settled (cold), press ⌘K or a queue, decide frames with one key, undo any decision, read why.

FIRST VIEWPORT: a left rail (collapsible, icons + labels: Overview, Review queues with heat counts, Alerts, Identity, Risk, Pipeline, Reports, Audit), a top bar (reserve select, ⌘K search, theme, the signed-in person), and the work area. The Review screen: a horizontal filmstrip queue on top, the frame large at left with its boxes and trap strip, a decision panel at right (verdict, reasons, factors, model recipe), and the key bar beneath. Standard web controls throughout (Radix primitives).

FORM: camera-trap night photography and the thermal-imaging scale, held to Operate's four contributions (user-pinned "Cinematic night-vision"; seed key: none, user-pinned).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Motion grammar (Motion / Framer Motion)
Layout animations for panels and lists, shared-element frame transitions from filmstrip to stage, a short heat cool-down when a decision settles a frame (amber → cyan, with the word changing at once), count roll. 140/240/420 ms, exponential ease-out. Reduced motion: instant states.
