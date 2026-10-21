# Integrating with VanDrishti

For developers of forest-department systems that read VanDrishti data or receive its alerts.

## API keys
An administrator issues one key per system and reserve:

```bash
uv run vandrishti apikey create --reserve KAN --name state-mis --by "admin name"   # shown once
uv run vandrishti apikey list
uv run vandrishti apikey revoke <prefix> --by "admin name"
```

`--precise` grants exact camera coordinates. Without it, coordinates are rounded to 0.1 degree.
Send the key as `X-API-Key: vd_...` (or `Authorization: Bearer vd_...`). Every read is
recorded in VanDrishti's audit trail, and so are refused keys (prefix only).

Each key may make 120 requests a minute (`VANDRISHTI_API_RATE_PER_MINUTE`). Beyond that the
answer is `429` with `Retry-After: 60`.

## Read endpoints (all `GET`, JSON unless noted)

| Path | What |
|---|---|
| `/v1/summary` | the reserve at a glance (frames, settled species, tiger frames, events, alerts) |
| `/v1/cameras` | camera codes, status, coordinates (rounded unless granted), last frame |
| `/v1/observations?since&until&limit&offset` | settled animal labels per frame, oldest first; `next_offset` pages |
| `/v1/alerts?state&since&limit` | alerts with reasons and their state |
| `/v1/reports?period=daily\|weekly\|monthly&day=YYYY-MM-DD&format=json\|xlsx\|pdf` | a report |
| `/v1/camtrap-dp?sampling_design=…` | a Camtrap DP 1.0.2 zip |

Rules that hold everywhere:
- Labels are settled: a person's review, or a model label confident enough to be
  auto-accepted (`labelled_by` says which).
- People and vehicles are never returned as observations or images.
- `captured_at` is null when the camera clock was not reliable.

## Webhook
VanDrishti POSTs each open alert at or above `VANDRISHTI_ALERT_WEBHOOK_MIN_SEVERITY` to
`VANDRISHTI_ALERT_WEBHOOK_URL`. Headers:

```
X-VanDrishti-Timestamp: 1730000000
X-VanDrishti-Signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>" with the shared secret>
```

Verify before trusting it (Python):

```python
import hashlib, hmac, time

def verify(secret: bytes, timestamp: str, signature: str, body: bytes) -> bool:
    if abs(time.time() - int(timestamp)) > 300:  # reject replays
        return False
    mac = hmac.new(secret, timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, f"sha256={mac}")
```

Answer with any 2xx. Other answers or timeouts are retried on the next run, up to
`VANDRISHTI_ALERT_WEBHOOK_MAX_ATTEMPTS` attempts. Payloads hold camera codes and reasons,
never coordinates or images. An alert is a prompt for a person, not a confirmed finding.
