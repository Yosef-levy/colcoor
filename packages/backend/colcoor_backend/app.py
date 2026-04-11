from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import create_async_engine

from colcoor_backend.api.router import api_router
from colcoor_backend.core.config import get_settings
from colcoor_backend.core.readiness import ping_database
from colcoor_backend.core.validation import validate_cors_origins_non_wildcard, validate_production_settings
from colcoor_backend.logging_config import configure_logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    settings = get_settings()
    validate_production_settings(settings)

    if settings.database_url:
        app.state.db_engine = create_async_engine(
            settings.database_url,
            pool_pre_ping=True,
            pool_size=2,
            max_overflow=0,
        )
        logger.info("async database engine created for readiness checks")
    else:
        app.state.db_engine = None

    logger.info(
        "startup complete env=%s database_configured=%s cors_origins=%s",
        settings.env,
        bool(settings.database_url),
        len(settings.cors_origin_list()),
    )

    yield

    engine = getattr(app.state, "db_engine", None)
    if engine is not None:
        await engine.dispose()
        logger.info("async database engine disposed")


def create_app() -> FastAPI:
    settings = get_settings()
    validate_cors_origins_non_wildcard(settings)

    application = FastAPI(
        title="Colcoor Extension API",
        version="0.1.0",
        description="Extension-dedicated backend: event graph, tree, side chat, auth. "
        "No main-thread LLM; no transcript assembly over HTTP (see docs/).",
        lifespan=lifespan,
    )

    @application.get("/health", include_in_schema=False)
    def root_health() -> dict[str, str]:
        """Liveness: process up (no external dependencies)."""
        return {"status": "ok"}

    @application.get("/ready", include_in_schema=False)
    async def root_ready(request: Request) -> dict[str, str]:
        """Readiness: database reachable when DATABASE_URL is configured."""
        settings = get_settings()
        engine = getattr(request.app.state, "db_engine", None)
        if engine is None:
            if settings.is_production():
                raise HTTPException(
                    status_code=503,
                    detail="database engine not configured",
                )
            return {"status": "ready", "database": "not_configured"}

        try:
            await ping_database(engine)
        except Exception:
            logger.exception("readiness: database ping failed")
            raise HTTPException(status_code=503, detail="database not ready") from None

        return {"status": "ready", "database": "ok"}

    origins = settings.cors_origin_list()
    if origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type", "Accept", "Cache-Control"],
        )

    application.include_router(api_router, prefix="/api/v1")
    return application
