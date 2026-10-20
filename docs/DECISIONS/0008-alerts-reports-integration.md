# 0008 — Alerts as prompts, reports on settled data, a standard export and a keyed API

- **Status:** accepted
- **Date:** 2026-10-21

## Context
Section 11 of the architecture image asks for alerts and notifications (tiger sighting,
poaching risk, unusual activity, camera failure), daily/weekly/monthly/custom reports as
PDF/Excel, and integration with forest-department systems. The developer chose openpyxl +
reportlab, a signed webhook as the outbound channel, and a Camtrap DP export.

## Decisions
1. **Alerts are prompts for people.** Rules raise and refresh *open* alerts. Once a person
   acknowledges or resolves an alert, the rules never edit or reopen it. Reopen is how a
   person undoes a resolve. Every action is audited.
2. **Idempotent by subject.** One alert per burst, event, camera-day or camera-week
   (`dedupe_key`), so rerunning the rules is safe. Open alerts whose condition no longer
   holds are resolved by "system" with a note.
3. **Camera failure from evidence we have.**
   - A camera is "silent" when it has no reliably timed frame for N days. This may only mean
     the card was not collected, and the alert says so.
   - A "quality" alert fires when most recent frames fail the quality gate.
   - Cameras a person marked faulty, stolen or inactive are skipped.
4. **Signed webhook, no other channels yet.**
   - HMAC-SHA256 over the timestamp and body, with timestamp and signature headers.
   - https is required outside dev; redirects are not followed.
   - Retries up to a maximum, then "gave up". No new dependency (stdlib urllib).
   - Email or SMS can be bridged by the receiver.
5. **No coordinates in alerts, webhooks or reports.** They name cameras. The integration API
   and Camtrap DP round coordinates to 0.1° unless a key was granted precise locations, or
   the CLI is asked for them.
6. **Reports reuse the dashboard's rules.** Settled labels only; frames, not animals;
   reserve-local calendar days. Frames without reliable times fall in no period, and the
   report says how many there are. "Naive occupancy" is labelled as not an occupancy
   estimate.
7. **openpyxl (MIT) + reportlab (BSD).** Pure Python and about 10 MB, built-in fonts, no
   network access. WeasyPrint would need system libraries.
8. **Camtrap DP 1.0.2** (TDWG, MIT-licensed schemas cached in `tests/fixtures`).
   - One deployment per camera.
   - People and vehicle frames are never exported, and reviewer names are not exported.
   - Frames still waiting for a person are "unclassified".
   - The sampling design must be stated by the caller, because VanDrishti does not record it.
9. **Keyed, read-only `/v1` API.**
   - One reserve per key; only a SHA-256 of the key is stored.
   - Every read is audited; refused attempts are not.
   - It is separate from the console API, which gets logins and roles in Phase 8.

## Consequences
- Alerts on historical uploads (SD cards collected weeks later) arrive late by nature. Their
  `occurred_at` is the capture time, while `created_at` is when the rules ran.
- The console API is still protected only by the dev-only write token. Phase 8 must add
  logins, roles, rate limits on `/v1`, auditing of refused key attempts, and masking of
  coordinates in console views.
- Offline Camtrap DP validation stubs the remote Frictionless and GeoJSON schemas. A full
  online check (frictionless or GBIF's validator) should run before publishing a real dataset.
