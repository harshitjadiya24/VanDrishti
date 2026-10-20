"""FastAPI application factory."""

from __future__ import annotations

from fastapi import FastAPI

from vandrishti import __version__
from vandrishti.api.routes import dashboard, health, identity, images, registry, review, risk
from vandrishti.core.config import get_settings
from vandrishti.core.logging import configure_logging


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level, json_output=settings.log_json)
    app = FastAPI(
        title="VanDrishti API",
        version=__version__,
        description="Camera-trap monitoring for Indian tiger reserves. AI proposes; people decide.",
    )
    app.include_router(health.router)
    app.include_router(registry.router)
    app.include_router(images.router)
    app.include_router(review.router)
    app.include_router(risk.router)
    app.include_router(dashboard.router)
    app.include_router(identity.router)
    return app


app = create_app()
