# 0005 — Confidence routing, human review with undo, feedback, hash-chained audit, first console

- **Status:** accepted
- **Date:** 2026-10-20

## Decisions
1. **Routing thresholds from the image:** ≥ 0.90 auto-accept, 0.60–0.90 review, < 0.60
   uncertain; people/vehicles always to a person; quality failures to quality review. They
   are configuration (`RoutingConfig`), and the bands are checked by people through spot
   checks (5% of auto-accepts) and blank samples (10% of "no object").
2. **Deterministic draws** (SHA-256 of image hash + purpose): reproducible, and nobody can
   re-roll a spot check away by re-running routing.
3. **Reviews are append-only feedback:** model said / person said, poaching flag, severity,
   notes; undo marks a review undone and reopens the route; nothing is overwritten.
4. **Allowed actions per route**, enforced by the API.
5. **Audit trail now, not later:** hash-chained events with database triggers against edits.
   Login and roles come in Phase 8; until then reviewers name themselves and writes need the
   ingest token (or env=dev on 127.0.0.1).
6. **Console stack:** React 19, TypeScript 6.0 (not the brand-new 7), Vite 8, Tailwind 4,
   TanStack Query, React Router; every package pinned to its newest release at least 14
   days old; oxlint and Vitest.
7. **Times in the reserve's zone** everywhere in the console (camera clocks are local).

## Consequences
- The confidence bands' real accuracy in a reserve is now measurable from its own reviews
  (`GET /feedback/stats`).
- Anyone who can reach the API can name themselves anything until Phase 8; the API stays on
  127.0.0.1 until then.
