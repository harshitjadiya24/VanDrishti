"""FastAPI application factory."""

from __future__ import annotations

from fastapi import Depends, FastAPI

from vandrishti import __version__
from vandrishti.api.deps import authenticated
from vandrishti.api.routes import (
    auth,
    dashboard,
    health,
    identity,
    images,
    outcomes,
    registry,
    review,
    risk,
    v1,
)
from vandrishti.core.config import get_settings
from vandrishti.core.logging import configure_logging


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level, json_output=settings.log_json)
    if problems := settings.production_problems():
        raise RuntimeError("refusing to start in prod: " + "; ".join(problems))
    app = FastAPI(
        title="VanDrishti API",
        version=__version__,
        description="Camera-trap monitoring for Indian tiger reserves. AI proposes; people decide.",
        # No public API browser in production: the schema is in the repository.
        docs_url=None if settings.env == "prod" else "/docs",
        redoc_url=None,
        openapi_url=None if settings.env == "prod" else "/openapi.json",
    )
    # Open: health, version, sign-in. /v1 uses integration keys; uploads accept the ingest
    # token too. Everything else needs a signed-in user (and CSRF on writes).
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(v1.router)
    app.include_router(images.upload_router)
    signed_in = [Depends(authenticated)]
    for r in (registry, images, review, risk, dashboard, identity, outcomes):
        app.include_router(r.router, dependencies=signed_in)
    return app


app = create_app()
