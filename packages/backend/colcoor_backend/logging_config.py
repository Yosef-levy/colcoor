"""Stdout logging for Docker-friendly operation.

NDJSON on stdout is the log aggregation contract. HTTP access lines come from
``colcoor.access`` (RequestContextMiddleware). Domain events should use
``colcoor_backend.errors.logging_utils.log_event()`` in later observability work.
"""

from __future__ import annotations

import json
import logging
import logging.config
import os
import sys
import traceback
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from colcoor_backend.observability import context as obs_ctx
from colcoor_backend.observability.log_schema import (
    JSON_FIELD_ORDER,
    RECORD_EXTRA_KEYS,
    SERVICE_NAME,
)
from colcoor_backend.observability.redaction import (
    MAX_STRING_LEN,
    redact_string,
    redact_traceback,
    redact_value,
)

if TYPE_CHECKING:
    from colcoor_backend.core.config import Settings

_log_env: str = "development"


def set_log_env(env: str) -> None:
    """Set deployment env label on JSON logs (called from configure_logging)."""
    global _log_env
    _log_env = (env or "development").strip() or "development"


def get_log_env() -> str:
    return _log_env


class JsonLogFormatter(logging.Formatter):
    """One JSON object per line for production log aggregation."""

    def format(self, record: logging.LogRecord) -> str:
        values: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "service": SERVICE_NAME,
            "env": get_log_env(),
            "logger": record.name,
            "message": redact_string(record.getMessage()),
        }

        instance_id = os.environ.get("COLCOOR_INSTANCE_ID", "").strip()
        if instance_id:
            values["instance_id"] = instance_id

        if rid := obs_ctx.request_id_ctx.get():
            values.setdefault("request_id", rid)
        if route := obs_ctx.route_ctx.get():
            values.setdefault("route", route)
        if uid := obs_ctx.user_id_ctx.get():
            values.setdefault("user_id", uid)

        for key in RECORD_EXTRA_KEYS:
            if hasattr(record, key):
                value = getattr(record, key)
                if value is not None:
                    values[key] = redact_value(value, key=key)

        if record.exc_info:
            tb = "".join(traceback.format_exception(*record.exc_info)).strip()
            values["error"] = redact_traceback(tb)

        payload: dict[str, Any] = {}
        for key in JSON_FIELD_ORDER:
            if key in values:
                payload[key] = values[key]

        return json.dumps(payload, default=_json_default)


def _json_default(obj: object) -> str:
    return redact_string(str(obj)[:MAX_STRING_LEN])


class RedactingTextFormatter(logging.Formatter):
    """Dev/text logs: redact the final formatted line."""

    def format(self, record: logging.LogRecord) -> str:
        return redact_string(super().format(record))


def configure_logging(settings: Settings | None = None) -> None:
    """Reconfigure root and library loggers to stdout (idempotent per worker)."""
    from colcoor_backend.core.config import get_settings

    settings = settings or get_settings()
    set_log_env(settings.env)
    level_name = os.environ.get("COLCOOR_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    log_format = settings.resolved_log_format()

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
                "()": "colcoor_backend.logging_config.RedactingTextFormatter",
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

    # Canonical HTTP access is colcoor.access; never emit Uvicorn CLF lines.
    logging.getLogger("uvicorn.access").disabled = True

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)  # type: ignore[attr-defined]
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(line_buffering=True)  # type: ignore[attr-defined]

    explicit = settings.log_format.strip().lower()
    if explicit and explicit not in ("json", "text"):
        logging.getLogger(__name__).warning(
            "Invalid COLCOOR_LOG_FORMAT=%r; using %s",
            explicit,
            log_format,
        )
