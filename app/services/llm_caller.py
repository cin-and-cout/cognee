import logging
import asyncio
import time
from typing import TypeVar, Type

import os
import instructor
import litellm

from app.env_init import llm_key_pool
from app.services.key_pool import AllKeysExhaustedError

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Create a single litellm-based instructor client in JSON mode.
# We will use this client directly and pass `api_key=key` to swap keys per request.
_aclient = instructor.from_litellm(litellm.acompletion, mode=instructor.Mode.JSON)

async def acreate_structured_output_with_rotation(
    text_input: str,
    system_prompt: str,
    response_model: Type[T],
) -> T:
    """
    Wrapper around litellm+instructor that adds multi-key 
    rotation and rate-limit handling.
    """
    attempt = 0
    try:
        model = os.getenv("LLM_MODEL", "gemini/gemini-2.5-flash")
        while True:
            attempt += 1
            key = await llm_key_pool.next_key(wait_for_cooldown=False)
            key_preview = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else "***"
            try:
                logger.info("LLM call started", extra={"model": model, "key_preview": key_preview, "response_model": response_model.__name__, "attempt": attempt})
                start_time = time.time()
                # We use litellm/instructor directly so we can inject the key per-call.
                response = await _aclient.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": text_input},
                    ],
                    response_model=response_model,
                    api_key=key,
                    max_retries=0, # Let our key pool loop handle the retries
                )
                latency_ms = int((time.time() - start_time) * 1000)
                logger.info("LLM call succeeded", extra={"model": model, "latency_ms": latency_ms, "attempt": attempt})
                return response
            except Exception as e:
                error_msg = str(e)
                exception_name = e.__class__.__name__
                RATE_LIMIT_KEYWORDS = [
                    "RateLimitError", "RESOURCE_EXHAUSTED", "429", "rate_limit", "quota",
                    "QuotaExceeded", "503", "overloaded", "ServiceUnavailable",
                    "service_unavailable", "Too Many Requests",
                ]
                
                is_rate_limit = False
                error_msg_lower = error_msg.lower()
                
                # Check for rate limit keywords in the error message
                if any(keyword.lower() in error_msg_lower for keyword in RATE_LIMIT_KEYWORDS):
                    is_rate_limit = True
                
                # Also check the cause if it's an InstructorRetryException
                if not is_rate_limit and hasattr(e, "__cause__") and e.__cause__:
                    cause_msg = str(e.__cause__).lower()
                    if any(keyword.lower() in cause_msg for keyword in RATE_LIMIT_KEYWORDS):
                        is_rate_limit = True
                        error_msg = f"{error_msg} (Cause: {cause_msg})"

                if is_rate_limit:
                    llm_key_pool.mark_rate_limited(key)
                    remaining = llm_key_pool.available_count()
                    logger.warning(
                        f"[llm] ⚡ Key rotated: {key_preview} rate-limited, "
                        f"switching ({remaining} keys remaining)",
                        extra={"key_preview": key_preview, "remaining_keys": remaining, "attempt": attempt, "exception": exception_name}
                    )
                    continue
                
                logger.error(
                    "[llm] ❌ Unrecognised exception — re-raising (not a rate-limit)",
                    extra={"exception": exception_name, "error_msg": error_msg[:200], "attempt": attempt}
                )
                # If it's a different exception, re-raise it
                raise e
    except AllKeysExhaustedError:
        logger.error(
            "[llm] ❌ All API keys exhausted. Pipeline stalled — "
            "add more keys or wait for cooldown.",
            extra={"stalled_at": time.time()}
        )
        raise
