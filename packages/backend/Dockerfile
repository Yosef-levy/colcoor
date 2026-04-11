# Multi-stage production image: Colcoor extension API (FastAPI + Gunicorn + Uvicorn workers).
# Build context: packages/backend (see docker-compose.prod.yml).

FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" VIRTUAL_ENV=/opt/venv

COPY pyproject.toml ./
COPY colcoor_backend ./colcoor_backend
RUN pip install --upgrade pip setuptools wheel \
    && pip install --no-cache-dir .

# --- runtime ---
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    COLCOOR_ENV=production \
    PATH="/opt/venv/bin:$PATH" \
    VIRTUAL_ENV=/opt/venv \
    WEB_CONCURRENCY=2 \
    COLCOOR_LOG_LEVEL=INFO

RUN groupadd --gid 10001 colcoor \
    && useradd --uid 10001 --gid colcoor --shell /usr/sbin/nologin --create-home --home-dir /var/lib/colcoor colcoor

COPY --from=builder /opt/venv /opt/venv

WORKDIR /app
COPY alembic.ini ./
COPY alembic ./alembic
RUN chown -R colcoor:colcoor /app

USER colcoor

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import os, urllib.request; p=os.environ.get('PORT', '8000'); urllib.request.urlopen(f'http://127.0.0.1:{p}/health', timeout=4)" || exit 1

# Apply DB migrations then start API (DATABASE_URL must use +asyncpg for the app; Alembic uses +psycopg via env.py).
CMD ["sh", "-c", "alembic upgrade head && exec gunicorn colcoor_backend.main:app -k uvicorn.workers.UvicornWorker -w \"${WEB_CONCURRENCY:-2}\" -b \"0.0.0.0:${PORT:-8000}\" --timeout 120 --graceful-timeout 30 --keep-alive 5 --access-logfile - --error-logfile -"]
