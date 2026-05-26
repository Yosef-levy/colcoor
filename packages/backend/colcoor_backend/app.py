from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from colcoor_backend.api.router import api_router
from colcoor_backend.core.config import get_settings
from colcoor_backend.core.readiness import (
    ping_database,
    ping_image_storage,
    ping_redis_if_configured,
)
from colcoor_backend.core.validation import (
    validate_cors_origins_non_wildcard,
    validate_license_and_deployment_settings,
    validate_production_settings,
)
from colcoor_backend.errors import register_exception_handlers
import colcoor_backend.db.models  # noqa: F401 — register ORM mappers
from colcoor_backend.db.session import create_engine, create_session_factory
from colcoor_backend.logging_config import configure_logging
from colcoor_backend.observability import metrics_content_type, render_metrics
from colcoor_backend.observability.middleware import RequestContextMiddleware
from colcoor_backend.rate_limit.factory import create_rate_limit_store
from colcoor_backend.rate_limit.middleware import RateLimitMiddleware
from colcoor_backend.services.event_purge import spawn_event_purge_scheduler
from colcoor_backend.services.side_chat_wake.factory import create_side_chat_wake_hub
from colcoor_backend.storage.factory import create_image_blob_storage

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    settings = get_settings()
    validate_license_and_deployment_settings(settings)
    validate_production_settings(settings)

    if settings.database_url:
        engine = create_engine(settings.database_url)
        app.state.db_engine = engine
        app.state.session_factory = create_session_factory(engine)
        logger.info("async database engine and session factory configured")
    else:
        app.state.db_engine = None
        app.state.session_factory = None

    wake_hub = create_side_chat_wake_hub(settings)
    await wake_hub.start()
    app.state.side_chat_wake_hub = wake_hub

    rate_limit_store = create_rate_limit_store(settings)
    if hasattr(rate_limit_store, "start"):
        await rate_limit_store.start()
    app.state.rate_limit_store = rate_limit_store

    image_storage = create_image_blob_storage(settings)
    app.state.image_blob_storage = image_storage

    purge_task: asyncio.Task[None] | None = None
    if app.state.session_factory is not None and settings.event_purge_scheduler_enabled:
        purge_task = spawn_event_purge_scheduler(app.state.session_factory, settings)
        if purge_task is not None:
            logger.info(
                "event purge scheduler enabled (interval=%ss retention=%sh)",
                settings.event_purge_interval_seconds,
                settings.event_soft_delete_retention_hours,
            )

    logger.info(
        "startup complete env=%s deployment_profile=%s license_type=%s max_users=%s "
        "license_key_present=%s database_configured=%s cors_origins=%s metrics=%s",
        settings.env,
        settings.deployment_profile_normalized(),
        settings.license_type_normalized(),
        settings.resolved_license_max_users(),
        settings.license_key_present(),
        bool(settings.database_url),
        len(settings.cors_origin_list()),
        settings.metrics_enabled,
    )

    yield

    await wake_hub.stop()

    rate_limit_store = getattr(app.state, "rate_limit_store", None)
    if rate_limit_store is not None and hasattr(rate_limit_store, "stop"):
        await rate_limit_store.stop()

    if purge_task is not None:
        purge_task.cancel()
        try:
            await purge_task
        except asyncio.CancelledError:
            pass

    engine = getattr(app.state, "db_engine", None)
    if engine is not None:
        await engine.dispose()
        logger.info("async database engine disposed")


def create_app() -> FastAPI:
    settings = get_settings()
    validate_cors_origins_non_wildcard(settings)
    validate_license_and_deployment_settings(settings)

    application = FastAPI(
        title="Colcoor Extension API",
        version="0.1.0",
        description="Extension-dedicated backend: event graph, tree, side chat, auth. "
        "No main-thread LLM; no transcript assembly over HTTP (see docs/).",
        lifespan=lifespan,
    )
    register_exception_handlers(application)

    # Rate limit store is created in lifespan (Redis cluster-wide or in-memory for dev).
    # Starlette wraps last-added middleware on the outside. RequestContext must be
    # outer so 429 responses from RateLimitMiddleware still get X-Request-ID.
    application.add_middleware(RateLimitMiddleware)
    application.add_middleware(RequestContextMiddleware)

    @application.get("/health", include_in_schema=False)
    def root_health() -> dict[str, str]:
        """Liveness: process up (no external dependencies)."""
        return {"status": "ok"}

    @application.get("/ready", include_in_schema=False)
    async def root_ready(request: Request) -> dict[str, str]:
        """Readiness: database, Redis, and image storage when configured."""
        settings = get_settings()
        engine = getattr(request.app.state, "db_engine", None)
        if engine is None:
            if settings.is_production():
                raise HTTPException(
                    status_code=503,
                    detail="database engine not configured",
                )
            db_status = "not_configured"
        else:
            try:
                await ping_database(engine)
            except Exception:
                logger.exception("readiness: database ping failed")
                raise HTTPException(status_code=503, detail="database not ready") from None
            db_status = "ok"

        wake_hub = getattr(request.app.state, "side_chat_wake_hub", None)
        try:
            redis_status = await ping_redis_if_configured(settings, wake_hub)
        except Exception:
            logger.exception("readiness: redis ping failed")
            raise HTTPException(status_code=503, detail="redis not ready") from None

        storage = getattr(request.app.state, "image_blob_storage", None)
        if storage is None:
            if settings.is_production():
                raise HTTPException(
                    status_code=503,
                    detail="image storage not configured",
                )
            storage_status = "not_configured"
        else:
            try:
                storage_status = await ping_image_storage(settings, storage)
            except Exception:
                logger.exception("readiness: image storage ping failed")
                raise HTTPException(status_code=503, detail="image storage not ready") from None

        return {
            "status": "ready",
            "database": db_status,
            "redis": redis_status,
            "storage": storage_status,
        }

    if settings.metrics_enabled:

        @application.get("/metrics", include_in_schema=False)
        async def prometheus_metrics(request: Request) -> Response:
            engine = getattr(request.app.state, "db_engine", None)
            wake_hub = getattr(request.app.state, "side_chat_wake_hub", None)
            if hasattr(wake_hub, "refresh_observability_metrics"):
                wake_hub.refresh_observability_metrics()
            body = render_metrics(engine)
            return Response(content=body, media_type=metrics_content_type())

    origins = settings.cors_origin_list()
    if origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=[
                "Authorization",
                "Content-Type",
                "Accept",
                "Cache-Control",
                "X-Request-ID",
                "Idempotency-Key",
            ],
        )

    application.include_router(api_router, prefix="/api/v1")
    return application
