import app.env_init  # noqa: F401
import asyncio

import pytest
from fastapi.testclient import TestClient

import app.services.cache as cache_module
from app.main import app


@pytest.fixture(scope="session", autouse=True)
def isolate_cache(tmp_path_factory):
    """
    Redirects the cache module's file path to a temporary directory for the
    entire test session so tests never read from or write to data/demo_cache.json.
    """
    tmp_cache = tmp_path_factory.mktemp("cache") / "test_demo_cache.json"
    original = cache_module.CACHE_FILE_PATH
    cache_module.CACHE_FILE_PATH = str(tmp_cache)
    cache_module._cache = {}  # Reset in-memory cache too
    yield
    cache_module.CACHE_FILE_PATH = original


@pytest.fixture(scope="session")
def event_loop():
    """
    Creates an instance of the default asyncio event loop for the test session.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def test_client():
    """
    Provides a Starlette/FastAPI TestClient for API endpoints.
    """
    with TestClient(app) as client:
        yield client
