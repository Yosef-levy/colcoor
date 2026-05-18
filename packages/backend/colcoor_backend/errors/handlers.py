"""FastAPI exception handlers — consistent JSON errors and structured logs."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from colcoor_backend.core.config import Settings, get_settings
from colcoor_backend.errors import codes
from colcoor_backend.errors.infra import classify_exception
from colcoor_backend.errors.logging_utils import log_event, log_unhandled_exception
from colcoor_backend.errors.responses import error_response

logger = logging.getLogger(__name__)


def _detail_to_message(detail: Any) -> str:
    if isinstance(detail, str):
        return detail
    if isinstance(detail, list):
        parts: list[str] = []
        for item in detail:
            if isinstance(item, dict):
                msg = item.get("msg") or item.get("message")
                if isinstance(msg, str) and msg.strip():
                    parts.append(msg.strip())
            elif isinstance(item, str) and item.strip():
                parts.append(item.strip())
        if parts:
            return "; ".join(parts)
        return "Validation failed."
    return "Request failed."


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException | StarletteHTTPException) -> Any:
        message = _detail_to_message(exc.detail)
        code = codes.code_for_http_status(exc.status_code)
        if exc.status_code == 429:
            code = codes.RATE_LIMITED
        log_event(
            logger,
            logging.WARNING if exc.status_code < 500 else logging.ERROR,
            "http_exception",
            message,
            request=request,
            status=exc.status_code,
            error_code=code,
        )
        return error_response(request, status_code=exc.status_code, code=code, message=message)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> Any:
        message = _detail_to_message(exc.errors())
        log_event(
            logger,
            logging.WARNING,
            "validation_error",
            message,
            request=request,
            status=422,
            error_code=codes.VALIDATION_ERROR,
        )
        return error_response(
            request,
            status_code=422,
            code=codes.VALIDATION_ERROR,
            message=message,
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> Any:
        settings = get_settings()
        classified = classify_exception(exc)
        if classified is not None:
            code, message, status_code = classified
            log_event(
                logger,
                logging.ERROR,
                "infrastructure_error",
                message,
                request=request,
                status=status_code,
                error_code=code,
                exc_info=exc,
            )
            return error_response(request, status_code=status_code, code=code, message=message)

        log_unhandled_exception(logger, request, exc)
        if settings.is_production():
            message = "An unexpected error occurred. Try again shortly."
        else:
            message = f"{type(exc).__name__}: {exc}"
        return error_response(
            request,
            status_code=500,
            code=codes.INTERNAL_ERROR,
            message=message,
        )
