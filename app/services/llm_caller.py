import logging
import asyncio
from typing import TypeVar, Type

from cognee.infrastructure.llm.LLMGateway import LLMGateway
from app.env_init import llm_key_pool
from app.services.key_pool import AllKeysExhaustedError

logger = logging.getLogger(__name__)

T = TypeVar("T")

async def acreate_structured_output_with_rotation(
    text_input: str,
    system_prompt: str,
    response_model: Type[T],
) -> T:
    """
    Wrapper around LLMGateway.acreate_structured_output that adds multi-key 
    rotation and rate-limit handling.
    """
    try:
        while True:
            key = await llm_key_pool.next_key()
            try:
                # We try passing api_key in kwargs. If the underlying litellm 
                # supports it, this will use the rotated key.
                return await LLMGateway.acreate_structured_output(
                    text_input=text_input,
                    system_prompt=system_prompt,
                    response_model=response_model,
                    api_key=key
                )
            except Exception as e:
                error_msg = str(e)
                exception_name = e.__class__.__name__
                if any(keyword in error_msg for keyword in ["InstructorRetryException", "RateLimitError", "RESOURCE_EXHAUSTED", "429"]) or "InstructorRetryException" in exception_name:
                    llm_key_pool.mark_rate_limited(key)
                    remaining = llm_key_pool.available_count()
                    key_preview = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else "***"
                    logger.warning(
                        f"[llm] ⚡ Key rotated: {key_preview} rate-limited, "
                        f"switching ({remaining} keys remaining)"
                    )
                    continue
                
                # If it's a different exception, re-raise it
                raise e
    except AllKeysExhaustedError:
        logger.error(
            "[llm] ❌ All API keys exhausted. Pipeline stalled — "
            "add more keys or wait for cooldown."
        )
        raise
