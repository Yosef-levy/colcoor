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
    url = os.environ["COLCOOR_TEST_DATABASE_URL"].strip()
    assert url.startswith("postgresql"), "use postgresql+asyncpg:// for async SQLAlchemy"
    return url
