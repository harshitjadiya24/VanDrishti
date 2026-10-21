# 0009 — Sign-in with server-side sessions, roles with reserve scope, one-server deployment, verified backups

- **Status:** accepted
- **Date:** 2026-10-21

## Context
Until Phase 7, the console trusted a name the reviewer typed, and writes were open in dev.
The architecture image needs a system rangers, biologists and officials can use, with
privacy for people in frames and for tiger locations. The developer chose argon2-cffi,
server-side sessions, and a one-server Docker Compose deployment.

## Decisions
1. **Argon2id** (argon2-cffi 25.1.0, MIT; default cost t=3, 64 MiB, p=4).
   - Policy: at least 12 characters, and not containing the username.
   - Unknown usernames do the same hashing work and get the same message.
2. **Server-side sessions in Postgres.**
   - The cookie is HttpOnly, SameSite=Strict, and Secure in prod; only a SHA-256 of the
     token is stored.
   - CSRF token on writes. Sign-out, deactivation and role or password changes take effect
     at once.
   - Why not JWTs: revocation would need a deny-list, and they are easier to steal through
     XSS.
3. **Four roles, least privilege.**
   - The full audit trail and exact coordinates are admin-only.
   - Rangers review people/vehicle frames and act on alerts, but do not label species or
     identities.
   - Viewers read only.
4. **Reserve scope everywhere.**
   - Query parameters are checked, and items addressed by id are traced to their reserve.
   - Out-of-scope items answer 404, so their existence is not confirmed.
5. **Privacy by role.**
   - Non-admins get coordinates rounded to 0.1°, and EXIF without GPS.
   - Views of frames with people are restricted and audited.
6. **Actions are signed by the session, not the request body.** Old "reviewer"/"person"
   fields are ignored.
7. **In-process rate limits** for sign-in and `/v1`, which is exact with the one API
   worker. Use Redis if the API ever runs several processes.
8. **One-server Compose.**
   - Caddy provides automatic HTTPS, security headers and the static console.
   - The API image has no PyTorch, runs as a non-root user with a read-only filesystem and
     no capabilities.
   - Migrations run in a one-shot service before the API starts.
   - The image store is a host directory, so backups can read it.
9. **Backups that are proven.**
   - A nightly `pg_dump` plus a hard-linked store copy and a manifest.
   - Each backup is restored into a throwaway database, where the audit hash chain and every
     original's checksum are verified.
   - A real restore stays a deliberate manual procedure: it replaces live data.
10. **Production guard.** The API refuses to start in prod with unsafe settings instead of
    warning about them.

## Consequences
- Every API test now signs in (`tests/helpers.sign_in_as`). The real cookie flow is tested in
  `tests/integration/test_auth.py`.
- **No admin web page for users yet:** users and keys are managed with the CLI. A web page
  can come later.
- **Not done here:** single sign-on (the departments' identity providers), two-factor sign-in,
  and off-site backup copies.
  - Off-site copies are an operations step in the runbook (rsync to another machine).
  - Single sign-on and two-factor sign-in should be added before wide use.
