import logging
import asyncio
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
    try:
        model = os.getenv("LLM_MODEL", "gemini/gemini-3.5-flash")
        while True:
            key = await llm_key_pool.next_key()
            try:
                # We use litellm/instructor directly so we can inject the key per-call.
                return await _aclient.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": text_input},
                    ],
                    response_model=response_model,
                    api_key=key,
                    max_retries=0, # Let our key pool loop handle the retries
                )
            except Exception as e:
                error_msg = str(e)
                exception_name = e.__class__.__name__
                llm_key_pool.mark_rate_limited(key)
                remaining = llm_key_pool.available_count()
                key_preview = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else "***"
                logger.warning(
                    f"[llm] ⚡ Key {key_preview} marked rate-limited/unusable due to error ({exception_name}). "
                    f"Switching ({remaining} keys remaining)"
                )
                continue
    except AllKeysExhaustedError:
        logger.error(
            "[llm] ❌ All API keys exhausted. Pipeline stalled — "
            "add more keys or wait for cooldown."
        )
        raise
