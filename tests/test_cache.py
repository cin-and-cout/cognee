import json
import os
from unittest.mock import patch

from app.services.cache import (
    get_cached_verdict,
    load_cache,
    set_cached_verdict,
)


def test_cache_miss_initially():
    """
    Verifies that a cache query for a non-existent sentence returns None.
    """
    with patch("app.services.cache.os.path.exists", return_value=False):
        load_cache()
        verdict = get_cached_verdict("This sentence does not exist in cache.")
        assert verdict is None


def test_cache_hit_after_setting(tmp_path):
    """
    Verifies that setting a value in the cache makes it immediately retrievable
    and correctly writes it to the JSON file.
    """
    temp_cache_file = tmp_path / "test_cache.json"

    with (
        patch("app.services.cache.CACHE_FILE_PATH", str(temp_cache_file)),
        patch("app.services.cache.os.path.exists", return_value=True),
    ):
        load_cache()

        sentence = "A test sentence to cache."
        report = {"verdict": {"label": "Consistent"}}

        set_cached_verdict(sentence, report)

        # Retrieve and verify from in-memory cache
        assert get_cached_verdict(sentence) == report

        # Verify it was written to disk
        assert os.path.exists(temp_cache_file)
        with open(temp_cache_file, "r") as f:
            data = json.load(f)
            assert sentence.lower() in data
            assert data[sentence.lower()] == report
