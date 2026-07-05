import asyncio
import time
from typing import Dict, List

class AllKeysExhaustedError(Exception):
    """Raised when all LLM API keys are currently in cooldown."""
    pass

class LLMKeyPool:
    def __init__(self, keys: List[str], cooldown_duration: int = 60):
        self._keys = keys
        self._index = 0
        self._cooldowns: Dict[str, float] = {}
        self._cooldown_duration = cooldown_duration
        self._lock = asyncio.Lock()

    async def next_key(self) -> str:
        if not self._keys:
            raise AllKeysExhaustedError("No keys provided to the pool.")
            
        async with self._lock:
            now = time.time()
            start_index = self._index
            
            while True:
                key = self._keys[self._index]
                self._index = (self._index + 1) % len(self._keys)
                
                cooldown_time = self._cooldowns.get(key, 0)
                if now - cooldown_time >= self._cooldown_duration:
                    return key
                    
                if self._index == start_index:
                    raise AllKeysExhaustedError("All keys are currently exhausted and on cooldown.")

    def mark_rate_limited(self, key: str):
        self._cooldowns[key] = time.time()

    def available_count(self) -> int:
        now = time.time()
        return sum(
            1 for key in self._keys 
            if now - self._cooldowns.get(key, 0) >= self._cooldown_duration
        )

    def cooldown_status(self) -> Dict[str, float]:
        now = time.time()
        status = {}
        for key in self._keys:
            cooldown_time = self._cooldowns.get(key, 0)
            remaining = max(0.0, self._cooldown_duration - (now - cooldown_time))
            key_preview = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else "***"
            status[key_preview] = remaining
        return status
