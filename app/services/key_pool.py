import asyncio
import time
import logging
from typing import Dict, List

logger = logging.getLogger(__name__)

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
        logger.info("Key pool initialized", extra={"keys_loaded": len(keys)})

    async def next_key(self, wait_for_cooldown: bool = True) -> str:
        if not self._keys:
            logger.error("All keys exhausted", extra={"total_keys": 0, "cooldowns": {}})
            raise AllKeysExhaustedError("No keys provided to the pool.")
            
        async with self._lock:
            now = time.time()
            start_index = self._index
            
            while True:
                key = self._keys[self._index]
                self._index = (self._index + 1) % len(self._keys)
                
                cooldown_time = self._cooldowns.get(key, 0)
                if now - cooldown_time >= self._cooldown_duration:
                    if cooldown_time > 0:
                        key_preview = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else "***"
                        logger.info("Key cooldown expired", extra={"key_preview": key_preview})
                        self._cooldowns[key] = 0
                        
                    key_preview = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else "***"
                    available = self._available_count_unlocked(now)
                    logger.debug("Key selected for call", extra={"key_preview": key_preview, "index": (self._index - 1) % len(self._keys), "available_count": available})
                    return key
                    
                if self._index == start_index:
                    if wait_for_cooldown:
                        status = self._cooldown_status_unlocked(now)
                        if status:
                            shortest = min(status.values())
                            logger.warning(
                                "All keys exhausted. Waiting for shortest cooldown",
                                extra={"wait_seconds": round(shortest, 1), "cooldowns": status}
                            )
                            pass  # Handled below outside the lock
                        else:
                            raise AllKeysExhaustedError("All keys exhausted and no cooldowns available.")
                    else:
                        logger.error("All keys exhausted", extra={"total_keys": len(self._keys), "cooldowns": self._cooldown_status_unlocked(now)})
                        raise AllKeysExhaustedError("All keys are currently exhausted and on cooldown.")
                    break  # Break to handle wait outside the lock

        if wait_for_cooldown and self._index == start_index:
            # Heartbeat sleep: log every second so the server console is never silent
            # during a rate-limit cooldown, making it easy to tell the server is alive.
            wait_total = shortest + 0.5
            elapsed = 0.0
            TICK = 1.0  # seconds between heartbeat log lines
            logger.warning(
                "[key_pool] ⏳ Cooling down — sleeping %.1fs before retrying LLM calls",
                wait_total,
            )
            while elapsed < wait_total:
                tick = min(TICK, wait_total - elapsed)
                await asyncio.sleep(tick)
                elapsed += tick
                remaining = max(0.0, wait_total - elapsed)
                if remaining > 0:
                    logger.warning(
                        "[key_pool] ⏳ Still cooling down — %.1fs remaining",
                        remaining,
                    )
            logger.info("[key_pool] ✅ Cooldown complete — retrying key pool")
            # Retry with full rotation enabled so we pick the first available key
            return await self.next_key(wait_for_cooldown=True)

    def mark_rate_limited(self, key: str):
        self._cooldowns[key] = time.time()
        key_preview = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else "***"
        available = self.available_count()
        logger.warning("Key placed on cooldown", extra={"key_preview": key_preview, "available_count": available, "cooldown_seconds": self._cooldown_duration})

    def _available_count_unlocked(self, now: float) -> int:
        return sum(
            1 for key in self._keys 
            if now - self._cooldowns.get(key, 0) >= self._cooldown_duration
        )

    def available_count(self) -> int:
        return self._available_count_unlocked(time.time())

    def _cooldown_status_unlocked(self, now: float) -> Dict[str, float]:
        status = {}
        for key in self._keys:
            cooldown_time = self._cooldowns.get(key, 0)
            remaining = max(0.0, self._cooldown_duration - (now - cooldown_time))
            key_preview = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else "***"
            status[key_preview] = remaining
        return status

    def cooldown_status(self) -> Dict[str, float]:
        return self._cooldown_status_unlocked(time.time())
