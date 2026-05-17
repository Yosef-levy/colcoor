import os

import pytest

from colcoor_backend.core.config import get_settings


@pytest.fixture(autouse=True)
def _reset_settings_cache() -> None:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture(scope="module")
def postgres_url() -> str:
    """Postgres URL for integration tests; skipped when unset (CI without a database)."""
    url = os.environ.get("COLCOOR_TEST_DATABASE_URL", "").strip()
    if not url:
        pytest.skip("COLCOOR_TEST_DATABASE_URL not set (postgresql+asyncpg://…)")
    if not url.startswith("postgresql"):
        pytest.fail("use postgresql+asyncpg:// for async SQLAlchemy")
    return url
