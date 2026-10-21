"""Run the API: `uv run vandrishti-api`.

Locally it listens on 127.0.0.1:8000 (docs at /docs). In the container it listens on all
interfaces of the private compose network behind Caddy, trusts Caddy's forwarded client
address (so sign-in rate limits see the real client), and runs one worker: the rate limiters
and the session cache are per process.
"""

from __future__ import annotations

import uvicorn

from vandrishti.core.config import get_settings


def main() -> None:
    s = get_settings()
    uvicorn.run(
        "vandrishti.api.app:app",
        host=s.api_host,
        port=s.api_port,
        reload=False,
        workers=1,
        proxy_headers=True,
        forwarded_allow_ips=s.forwarded_allow_ips,
        server_header=False,
    )


if __name__ == "__main__":
    main()
