import asyncio
import time
from unittest.mock import patch
import pytest

from app.services.key_pool import LLMKeyPool, AllKeysExhaustedError

@pytest.fixture
def keys():
    return ["key1", "key2", "key3"]

@pytest.mark.asyncio
async def test_round_robin(keys):
    pool = LLMKeyPool(keys)
    assert await pool.next_key() == "key1"
    assert await pool.next_key() == "key2"
    assert await pool.next_key() == "key3"
    # Wraps around
    assert await pool.next_key() == "key1"

@pytest.mark.asyncio
async def test_rate_limited_key_skipped(keys):
    pool = LLMKeyPool(keys)
    assert await pool.next_key() == "key1"
    pool.mark_rate_limited("key2")
    # key2 is skipped
    assert await pool.next_key() == "key3"
    assert await pool.next_key() == "key1"

@pytest.mark.asyncio
async def test_all_keys_exhausted(keys):
    pool = LLMKeyPool(keys)
    pool.mark_rate_limited("key1")
    pool.mark_rate_limited("key2")
    pool.mark_rate_limited("key3")
    
    with pytest.raises(AllKeysExhaustedError):
        await pool.next_key(wait_for_cooldown=False)

@pytest.mark.asyncio
@patch("app.services.key_pool.time.time")
async def test_key_recovers_after_cooldown(mock_time, keys):
    pool = LLMKeyPool(keys, cooldown_duration=60)
    
    # Time starts at 100
    mock_time.return_value = 100.0
    
    # key1 is used, then rate limited at time 100
    assert await pool.next_key() == "key1"
    pool.mark_rate_limited("key1")
    
    # at time 101, key1 is still in cooldown
    mock_time.return_value = 101.0
    assert await pool.next_key() == "key2"
    
    # jump to time 161 (61 seconds passed, key1 is recovered)
    mock_time.return_value = 161.0
    assert await pool.next_key() == "key3"
    # key1 is available again
    assert await pool.next_key() == "key1"
