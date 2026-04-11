"""Stdout logging for Docker-friendly operation (no extra dependencies)."""

from __future__ import annotations

import logging
import logging.config
import os
import sys


def configure_logging() -> None:
    """Idempotent-ish: reconfigure root + common library loggers to stdout."""
    level_name = os.environ.get("COLCOOR_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    config: dict = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "colcoor": {
                "format": "%(asctime)s %(levelname)s [%(name)s] %(message)s",
                "datefmt": "%Y-%m-%dT%H:%M:%S",
            },
        },
        "handlers": {
            "stdout": {
                "class": "logging.StreamHandler",
                "formatter": "colcoor",
                "stream": "ext://sys.stdout",
            },
        },
        "root": {"level": level, "handlers": ["stdout"]},
        "loggers": {
            "uvicorn": {"level": level, "handlers": ["stdout"], "propagate": False},
            "uvicorn.error": {"level": level, "handlers": ["stdout"], "propagate": False},
            "uvicorn.access": {"level": level, "handlers": ["stdout"], "propagate": False},
            "gunicorn": {"level": level, "handlers": ["stdout"], "propagate": False},
            "gunicorn.error": {"level": level, "handlers": ["stdout"], "propagate": False},
            "gunicorn.access": {"level": level, "handlers": ["stdout"], "propagate": False},
            "sqlalchemy.engine": {"level": "WARNING", "handlers": ["stdout"], "propagate": False},
        },
    }

    logging.config.dictConfig(config)
    logging.captureWarnings(True)

    # Ensure stdout is line-buffered when attached to a TTY-less container.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)  # type: ignore[attr-defined]
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(line_buffering=True)  # type: ignore[attr-defined]
