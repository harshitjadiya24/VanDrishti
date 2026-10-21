# VanDrishti runbook

For whoever installs and keeps a VanDrishti server running. Commands run from the repository
root unless they say `backend/`.

## 1. What runs where

| Part | Where | Notes |
|---|---|---|
| `web` (Caddy) | container, ports 80/443 | HTTPS, security headers, serves the console, proxies `/api` |
| `api` | container, private network only | FastAPI, one worker, read-only filesystem, no PyTorch |
| `db` | container, private network only | Postgres 16 + PostGIS; volume `pgdata` |
| image store | host directory `VANDRISHTI_STORE_DIR` | originals (read-only, named by SHA-256) + derived copies |
| model stages | a machine with the `ml` group | detection, species, segmentation, re-ID: batch jobs, one model at a time |

The API never loads a model. Model stages are `vandrishti` commands run where the weights are
(see README). They write to the same database and store.

## 2. First install

1. A Linux server with Docker, a DNS name pointing at it, and ports 80/443 open.
2. Create the secrets file:
   ```bash
   cp deploy/.env.prod.example deploy/.env.prod && chmod 600 deploy/.env.prod
   python3 -c "import secrets; print(secrets.token_urlsafe(32))"   # one per secret
   ```
   Then fill in `VANDRISHTI_DOMAIN`, `VANDRISHTI_DB_PASSWORD`, and optionally the ingest token
   and webhook. The API refuses to start in prod with the default database password, an http
   webhook, a webhook without a secret, or an ingest token shorter than 32 characters.
3. Prepare the store directory: `sudo mkdir -p /srv/vandrishti/store && sudo chown -R 10001:10001 /srv/vandrishti/store`.
4. Start everything. Migrations run first, as the `migrate` service:
   ```bash
   docker compose -f deploy/compose.prod.yml --env-file deploy/.env.prod up -d --build --wait
   ```
5. Create the first administrator. The password is prompted, or piped in on stdin:
   ```bash
   docker compose -f deploy/compose.prod.yml --env-file deploy/.env.prod run --rm api \
     vandrishti user create --username admin --name "Your name" --role admin --by install
   ```
6. Open `https://<domain>` and sign in. Then create reserves and cameras, and one account per
   person (`vandrishti user create … --role reviewer|ranger|viewer --reserve CODE`).

## 3. People and access

| Role | Can |
|---|---|
| admin | everything; users and API keys; exact coordinates; full audit trail |
| reviewer | species, people and identity review; alerts; re-run routing, risk and alerts; exports |
| ranger | people/vehicle review; alerts; mark cameras faulty or stolen |
| viewer | read dashboards, alerts and reports |

- **Reserve scope.** Non-admins see only the reserves on their account, everywhere: lists,
  images, reports and exports.
- **Coordinates.** Non-admins get coordinates rounded to 0.1°, and GPS is removed from EXIF.
- **Frames with people.** They are only for reviewers and rangers, and every view is audited.
- **Leavers:** `vandrishti user update <name> --deactivate --by <admin>`. Their sessions end
  immediately.
- **Forgotten password:** `vandrishti user update <name> --password --by <admin>`.
- **Lockout:** 5 wrong passwords lock the account for 15 minutes. Sign-in is also limited to
  10 attempts a minute per address.
- **Sessions:** a session ends after 12 h idle or 7 days in all. Changing a role, reserves or
  password ends that person's sessions.

Integration keys are separate: see [INTEGRATION.md](INTEGRATION.md).

## 4. Daily jobs (cron on the host)

```cron
# Alerts every 15 minutes (rules + signed webhook)
*/15 * * * *  cd /opt/vandrishti && docker compose -f deploy/compose.prod.yml --env-file deploy/.env.prod exec -T api vandrishti alerts run
# Nightly backup at 02:30, then a restore check of that backup
30 2 * * *    cd /opt/vandrishti && set -a && . deploy/.env.prod && set +a && python3 scripts/backup.py create --compose deploy/compose.prod.yml --store "$VANDRISHTI_STORE_DIR" && python3 scripts/backup.py verify "$(ls -d backups/20* | tail -1)" --compose deploy/compose.prod.yml --in-container
```

Copy `backups/` off the server as well, for example with an `rsync` to another machine
(`rsync -aH` keeps the hard links). A backup that exists only on the same disk is not a backup.

## 5. Backups

`scripts/backup.py create` writes `backups/<UTC stamp>/` containing:
- `db.dump` (`pg_dump -Fc`);
- `store/`: files unchanged since the previous backup are hard links to it;
- `manifest.json`: checksums, schema revision, audit count and last hash, file counts.

It keeps the last 14 by default (`--keep`).

`scripts/backup.py verify <dir>` restores the dump into a throwaway database
(`vandrishti_restore_check`) and then checks:
- the schema revision and audit trail against the manifest;
- that the audit hash chain still verifies;
- that every original's SHA-256 matches its name.

It then drops the throwaway database. A non-zero exit means "do not trust this backup".

Measured on the development data (2026-10-21):

| Step | Data | Time |
|---|---|---|
| First backup | 1.3 MB dump + 1,353 files (266 MB) | 4.4 s |
| Second backup | all 1,353 files hard-linked; 259 MB on disk for both backups | 1.3 s |
| Restore check | all 552 originals | 2.5 s |

A copy with one altered byte was reported as not matching its name.

## 6. Restoring for real

This replaces live data, so do it deliberately, with the API stopped.

1. Run `python3 scripts/backup.py verify backups/<stamp> --compose deploy/compose.prod.yml --in-container` first.
2. Stop the API: `docker compose -f deploy/compose.prod.yml --env-file deploy/.env.prod stop api web`.
3. Restore the database into a new name, then swap names:
   ```bash
   docker compose -f deploy/compose.prod.yml exec -T db createdb -U vandrishti vandrishti_restored
   docker compose -f deploy/compose.prod.yml exec -T db pg_restore -U vandrishti -d vandrishti_restored --no-owner < backups/<stamp>/db.dump
   docker compose -f deploy/compose.prod.yml exec -T db psql -U vandrishti -d postgres \
     -c 'ALTER DATABASE vandrishti RENAME TO vandrishti_before_restore' \
     -c 'ALTER DATABASE vandrishti_restored RENAME TO vandrishti'
   ```
4. Restore the store: `rsync -a backups/<stamp>/store/ "$VANDRISHTI_STORE_DIR"/`. Files are
   only added; content-addressed originals never conflict.
5. Start again (`up -d --wait`). Sign in, and run `vandrishti audit verify`.
6. Keep `vandrishti_before_restore` until you are sure, then drop it.

## 7. Upgrades

1. Back up and verify (section 5).
2. `git pull`, then `docker compose -f deploy/compose.prod.yml --env-file deploy/.env.prod up -d --build --wait`.
   The `migrate` service applies new migrations before the API starts. Migrations are tested
   downgrade/upgrade in CI.
3. If it fails: restore (section 6) and run the previous version.

## 8. When something is wrong

| Symptom | Look at |
|---|---|
| API will not start: "refusing to start in prod" | the listed settings in `deploy/.env.prod` |
| 401 everywhere after an upgrade | sessions are server-side; sign in again |
| "too many sign-in attempts" | wait a minute; check the audit trail for `login_failed` floods |
| a person cannot see a reserve | `vandrishti user list`: their reserves |
| webhook alerts not arriving | `alert_delivery` rows (`failed`, `gave_up`, `last_error`) |
| silent-camera alerts for every camera | cards not collected yet, or clocks wrong (time sources) |
| disk filling | `df -h`; old `backups/`; Docker's build cache (`docker builder prune`) |

Logs are JSON on stdout: `docker compose -f deploy/compose.prod.yml logs -f api web`.
`GET /health` is liveness and `GET /health/ready` checks the database.

## 9. Security notes

- The only open endpoints are `/health`, `/health/ready`, `/version` and `/auth/login`. `/v1`
  needs an integration key. Uploads need a signed-in user with RUN permission or the ingest token.
- There is no API browser (`/docs`) in production.
- Caddy sets HSTS, a same-origin Content-Security-Policy, `X-Frame-Options: DENY` and
  no-referrer.
- The API container runs as uid 10001, with a read-only root filesystem and all capabilities
  dropped.
- Original images are never served over HTTP. Display copies of frames with people are blurred.
- The audit trail is append-only (database triggers) and hash-chained. Verify it with
  `vandrishti audit verify`.
