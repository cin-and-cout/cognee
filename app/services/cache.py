import asyncio
import json
import os
import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

CACHE_FILE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "data",
    "demo_cache.json",
)

_cache: Dict[str, Any] = {}


def load_cache():
    """
    Loads cached verdicts from data/demo_cache.json.
    """
    global _cache
    if os.path.exists(CACHE_FILE_PATH):
        try:
            with open(CACHE_FILE_PATH, "r", encoding="utf-8") as f:
                raw_data = json.load(f)
                # Normalize keys to lowercase, stripped text
                _cache = {k.strip().lower(): v for k, v in raw_data.items()}
            logger.info("Cache file loaded", extra={"file_path": CACHE_FILE_PATH, "entry_count": len(_cache)})
        except Exception as e:
            logger.warning("Cache file parse error", extra={"error": str(e)})
            _cache = {}
    else:
        logger.info("Cache file missing - starting empty", extra={"file_path": CACHE_FILE_PATH})
        _cache = {}


def get_cached_verdict(text: str) -> Optional[Dict[str, Any]]:
    """
    Returns the cached report/verdict for a sentence if it exists.
    """
    if not _cache:
        load_cache()
    key = text.strip().lower()
    res = _cache.get(key)
    key_preview = key[:60] + "..." if len(key) > 60 else key
    if res:
        logger.debug("Cache hit", extra={"key_preview": key_preview})
    else:
        logger.debug("Cache miss", extra={"key_preview": key_preview})
    return res


def _write_cache_to_disk() -> None:
    """Synchronous helper that persists the current in-memory cache to disk.
    Called via run_in_executor so it never blocks the event loop."""
    try:
        os.makedirs(os.path.dirname(CACHE_FILE_PATH), exist_ok=True)
        with open(CACHE_FILE_PATH, "w", encoding="utf-8") as f:
            json.dump(_cache, f, indent=4)
        logger.debug("Cache file save succeeded", extra={"file_path": CACHE_FILE_PATH, "entry_count": len(_cache)})
    except Exception as e:
        logger.warning("Cache file save failed", extra={"error": str(e)})


def set_cached_verdict(text: str, report: Dict[str, Any]):
    """
    Stores a report/verdict in the cache.
    The in-memory dict is updated immediately; disk persistence is deferred
    to a thread-pool executor so it does not block the event loop.
    """
    key = text.strip().lower()
    _cache[key] = report
    key_preview = key[:60] + "..." if len(key) > 60 else key
    logger.debug("Cache write", extra={"key_preview": key_preview, "cache_size": len(_cache)})

    try:
        loop = asyncio.get_running_loop()
        loop.run_in_executor(None, _write_cache_to_disk)
    except RuntimeError:
        # No running event loop (e.g. in a test) — fall back to synchronous write
        _write_cache_to_disk()
