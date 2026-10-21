# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Wildlife biologists and analysts**, at a reserve's research station, at a desk. Their job:
  - work through review queues of camera-trap frames, often many hundreds in a sitting;
  - correct species labels, decide tiger identities, read the dashboards.
- **Forest rangers**, in the field, on phones and in daylight. Their job: act on alerts
  (poaching risk, unusual activity, camera failure), review frames with people or vehicles
  in them, and mark cameras faulty or stolen.
- **Officials** (field directors, forest-department staff). They read dashboards and periodic
  reports (PDF/Excel), and judge whether the system can be trusted.
- **Public visitors** to the story site:
  - forest-department decision makers, who want outcomes first;
  - technical and portfolio readers (engineers, recruiters, judges), who want the
    engineering in depth.

## Product Purpose
Tiger reserves collect huge numbers of camera-trap images. VanDrishti:
- ingests them;
- drops bad and empty frames;
- finds animals, people and vehicles, and names species;
- explains every decision;
- routes each frame by confidence (auto-accept, human review, uncertain);
- lets people review and correct;
- scores poaching risk;
- proposes individual tiger identities.

It turns all of this into dashboards, alerts, reports and integrations for forest
departments. Success means people spend their time only on frames that need a person, and
everything a person decides is recorded and can be undone.

## Positioning
**AI proposes; people decide.** Every model output is a proposal with its reasons.
Consequential calls are never auto-confirmed: people or vehicles in a frame, a new tiger,
a low-margin identity. Every action is in a hash-chained, append-only audit trail. It was
built to run on modest hardware (an 8 GB laptop), with pretrained models only.

## Operating Context
- **The workflow, and the order in which the story is told:**
  1. Camera traps (infrared and day; ID, time, GPS).
  2. Ingestion (watched folder, SD-card dump, or authenticated upload).
  3. Immutable original archive (content-addressed by SHA-256).
  4. Preprocessing.
  5. The AI pipeline:
     - quality gate;
     - MegaDetector V6;
     - SpeciesNet;
     - OpenCLIP check;
     - SAM 2 outline;
     - decision engine with habitat and time-of-day priors;
     - explanation.
  6. People/vehicle presence and poaching risk (LOW/MEDIUM/HIGH).
  7. Confidence routing: ≥ 0.9 auto with spot checks, 0.6–0.9 review, < 0.6 uncertain;
     people and vehicles always go to a person.
  8. Human review, feedback and audit.
  9. Central database with embeddings.
  10. Analytics:
      - overview, map, camera analytics, trends;
      - tiger re-identification.
  11. Outcomes: alerts, reports, Camtrap DP export, integration API.
- **Roles:** admin, reviewer, ranger and viewer, each limited to their reserves.
- **The console** is used for long review sessions on desktop, with keyboard shortcuts.
- **Rangers** use phones outdoors.
- **Camera-trap imagery** is often night infrared (greyscale) or harsh daylight.

## Capabilities and Constraints
- **Built and working:** every stage above, plus sign-in with roles and reserve scope,
  alerts with a signed webhook, PDF/Excel reports, Camtrap DP 1.0.2, the `/v1` integration
  API, and backups with verified restores.
- **Privacy:**
  - people are blurred whole-body;
  - no face detection or recognition, ever;
  - originals are never served;
  - non-admins see coordinates rounded to 0.1°;
  - views of frames with people are audited.
- **No third-party requests from the UI:** self-hosted fonts, no map tiles, no analytics,
  no CDNs. The public story site makes no API calls.
- **Honesty:**
  - only measured numbers, with their caveats (`docs/EVALUATION.md`);
  - illustrative data labelled synthetic;
  - movement between cameras is inferred, never drawn as observed;
  - risk levels are triage, not predictions;
  - re-ID results are proposals, not identities;
  - no Indian field validation has happened yet, and nothing may imply it has.
- **Existing behaviour to keep:** the keyboard review shortcuts (Y/C/N/F/S/P/1–3/J/K/M/U)
  and every API contract.
- **Stack:** React 19 + TypeScript + Vite + Tailwind 4; TanStack Query; React Router.

## Brand Commitments
- **Name:** VanDrishti (वनदृष्टि, "forest sight"). The Devanagari form may appear alongside
  the Latin one.
- **Everything else is open:** marks, colours, type.
- **State colours must never be the only cue:** every state also carries a word.

## Evidence on Hand
- **Measured results** in `docs/EVALUATION.md`, all with caveats:
  - detector precision and recall on a LILA sample;
  - species routing outcomes;
  - re-ID on ATRW, where MegaDescriptor was likely trained, so the numbers are optimistic;
  - backup and restore timings.
- **Models, licences and decisions:** `docs/MODELS.md` and `docs/DECISIONS/0001–0009`.
- **Architecture:** `docs/ARCHITECTURE.md`.
- **Demo data:** sample reserves LILA-TEST (US datasets, a few frames with people,
  blurred) and ATRW-DEMO (zoo footage of Amur tigers). Neither is Indian field data.
- **Absent, and never to be invented:** customers, deployments, testimonials, user counts,
  accuracy on Indian reserves, and population estimates.

## Product Principles
1. People decide consequential things; the interface makes the human decision the centre,
   not an afterthought.
2. Show the reason with every answer: "why this decision?" is always one step away.
3. Privacy and honesty are visible features, not footnotes.
4. Time is the scarce resource: show only what needs a person, and make each decision fast
   and undoable.
5. Works on modest hardware and poor field connectivity.

## Accessibility & Inclusion
- **Language:** English now, built ready for Hindi (Devanagari) translations: type that
  covers Devanagari, and layouts that tolerate longer strings.
- **Field use:** readable in outdoor daylight on phones.
- **Long sessions:** fully keyboard-driven review.
- **Standards:** WCAG 2.2 AA contrast; every state carries a word as well as a colour; full
  reduced-motion support.
