from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from colcoor_backend.api.router import api_router
from colcoor_backend.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title="Colcoor Extension API",
        version="0.1.0",
        description="Extension-dedicated backend: event graph, tree, side chat, auth. "
        "No main-thread LLM; no transcript assembly over HTTP (see docs/).",
    )

    origins = settings.cors_origin_list()
    if origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    application.include_router(api_router, prefix="/api/v1")
    return application
