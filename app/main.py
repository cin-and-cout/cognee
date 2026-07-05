import app.env_init  # noqa: F401
from contextlib import asynccontextmanager
from fastapi import FastAPI
import logging
import os

from app.logging_config import setup_logging
setup_logging()
logger = logging.getLogger(__name__)
logger.info("Application starting", extra={"version": "1.0.0", "log_level": os.getenv("LOG_LEVEL", "INFO")})

from app.api.websocket import router as ws_router
from app.api.speaker import router as speaker_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Cognee's logging_utils.py calls root_logger.handlers.clear() on first
    # import, wiping our RotatingFileHandler. Force-import it here then
    # immediately re-run setup_logging() so our file handler is the last one
    # registered and survives for the duration of the process.
    import cognee  # noqa: F401 — triggers cognee's logging setup
    setup_logging()
    logger.info("Logging reclaimed after cognee import — file handler active", extra={"version": "1.0.0"})
    yield


app = FastAPI(
    title="Claim Consistency Tracker API",
    description="Real-time speech self-consistency tracking using Cognee temporal graph memory.",
    version="1.0.0",
    lifespan=lifespan,
)

# Register API routes
app.include_router(ws_router)
app.include_router(speaker_router)


@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "Claim Consistency Tracker API is running.",
    }
