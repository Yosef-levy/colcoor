"""Stdout logging for Docker-friendly operation."""

from __future__ import annotations

import json
import logging
import logging.config
import os
import sys
import traceback
from datetime import datetime, timezone
from typing import Any

from colcoor_backend.observability import context as obs_ctx


class JsonLogFormatter(logging.Formatter):
    """One JSON object per line for production log aggregation."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        request_id = obs_ctx.request_id_ctx.get()
        if request_id:
            payload["request_id"] = request_id
        route = obs_ctx.route_ctx.get()
        if route:
            payload["route"] = route
        user_id = obs_ctx.user_id_ctx.get()
        if user_id:
            payload["user_id"] = user_id

        for key in ("request_id", "route", "method", "status", "latency_ms", "user_id"):
            if hasattr(record, key):
                value = getattr(record, key)
                if value is not None:
                    payload[key] = value

        if record.exc_info:
            payload["error"] = "".join(traceback.format_exception(*record.exc_info)).strip()

        return json.dumps(payload, default=str)


def _resolve_log_format(settings_env: str | None) -> str:
    explicit = os.environ.get("COLCOOR_LOG_FORMAT", "").strip().lower()
    if explicit in ("json", "text"):
        return explicit
    if explicit:
        return "text"
    env = (settings_env or os.environ.get("COLCOOR_ENV", "development")).strip().lower()
    if env == "production":
        return "json"
    return "text"


def configure_logging() -> None:
    """Idempotent-ish: reconfigure root + common library loggers to stdout."""
    level_name = os.environ.get("COLCOOR_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    log_format = _resolve_log_format(os.environ.get("COLCOOR_ENV"))

    if log_format == "json":
        formatter_name = "json"
        formatters: dict = {
            "json": {
                "()": "colcoor_backend.logging_config.JsonLogFormatter",
            },
        }
    else:
        formatter_name = "colcoor"
        formatters = {
            "colcoor": {
                "format": "%(asctime)s %(levelname)s [%(name)s] %(message)s",
                "datefmt": "%Y-%m-%dT%H:%M:%S",
            },
        }

    config: dict = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": formatters,
        "handlers": {
            "stdout": {
                "class": "logging.StreamHandler",
                "formatter": formatter_name,
                "stream": "ext://sys.stdout",
            },
        },
        "root": {"level": level, "handlers": ["stdout"]},
        "loggers": {
            "uvicorn": {"level": level, "handlers": ["stdout"], "propagate": False},
            "uvicorn.error": {"level": level, "handlers": ["stdout"], "propagate": False},
            "uvicorn.access": {"level": "WARNING", "handlers": ["stdout"], "propagate": False},
            "gunicorn": {"level": level, "handlers": ["stdout"], "propagate": False},
            "gunicorn.error": {"level": level, "handlers": ["stdout"], "propagate": False},
            "gunicorn.access": {"level": "WARNING", "handlers": ["stdout"], "propagate": False},
            "sqlalchemy.engine": {"level": "WARNING", "handlers": ["stdout"], "propagate": False},
            "colcoor.access": {"level": level, "handlers": ["stdout"], "propagate": False},
        },
    }

    logging.config.dictConfig(config)
    logging.captureWarnings(True)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)  # type: ignore[attr-defined]
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(line_buffering=True)  # type: ignore[attr-defined]
