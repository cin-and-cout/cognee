import json
import os
import sys
from typing import Any, Dict, Optional

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
        except Exception:
            _cache = {}
    else:
        _cache = {}


def get_cached_verdict(text: str) -> Optional[Dict[str, Any]]:
    """
    Returns the cached report/verdict for a sentence if it exists.
    """
    if not _cache:
        load_cache()
    key = text.strip().lower()
    return _cache.get(key)


def set_cached_verdict(text: str, report: Dict[str, Any]):
    """
    Stores a report/verdict in the cache and saves it to data/demo_cache.json.
    """
    key = text.strip().lower()
    _cache[key] = report

    # Avoid overwriting the production cache when running tests
    if "pytest" in sys.modules:
        return

    try:
        os.makedirs(os.path.dirname(CACHE_FILE_PATH), exist_ok=True)
        # We save the cache back with the normalized keys
        with open(CACHE_FILE_PATH, "w", encoding="utf-8") as f:
            json.dump(_cache, f, indent=4)
    except Exception:
        pass
