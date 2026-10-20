# 0006 — Presence events and an explained, rule-based poaching-risk level

- **Status:** accepted
- **Date:** 2026-10-21

## Context
Section 6 of the architecture image asks for people and vehicle detection with counts and
vehicle type, activity-pattern analysis (history, spikes, time of day, frequent visits) and a
poaching risk score from anomalies, presence and location sensitivity, as LOW/MEDIUM/HIGH.
There are no labelled poaching outcomes to fit or validate a model against.

## Decisions
1. **One event per burst and camera**; counts are the most seen in any one frame (estimates).
2. **Night from the real sun** (sunrise equation, no new dependency) when the camera's
   location is known; otherwise 19:00-06:00 local, and the reason says which.
3. **Rule-based points with reasons**, not a fitted model: every point can be read and
   argued with. Levels at 4 and 8. Spikes use a Poisson tail against the camera's own 28-day
   history, so a busy road camera does not alarm on its usual traffic.
4. **People outrank the score:** false alarm dismisses; a poaching mark is always HIGH;
   severity sets a minimum.
5. **Unreliable times disable time-based signals.** A first run gave HIGH to an event whose
   "time" was a file date (ENA24 has no capture times); that is now impossible.
6. **Vehicle type is a labelled guess** from OpenCLIP, shown only at >= 0.6 and never
   scored: on 32 Caltech "car" events it said car 10 times and bus/tractor/motorcycle 12.
7. **No face detection.** People are blurred whole-body (ADR 0003); counts come from boxes.

## Consequences
- The levels are a triage order. They must be checked against real enforcement outcomes
  before anyone treats them as probabilities; the weights are configuration (`RiskConfig`).
