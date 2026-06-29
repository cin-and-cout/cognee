import asyncio

import pytest
from fastapi.testclient import TestClient

from app.main import app


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
