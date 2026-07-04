import hashlib
import json
import logging
from typing import Literal

from pydantic import BaseModel

from cognee.infrastructure.llm.LLMGateway import LLMGateway

logger = logging.getLogger(__name__)


class SpeakerResolution(BaseModel):
    name: str
    confidence: Literal["high", "medium", "low"]
    matched_politician: bool
    all_speakers: list[str]


class SpeakerResolutionResponse(BaseModel):
    primary_speaker: str
    all_speakers: list[str]
    confidence: Literal["high", "medium", "low"]


# In-memory cache keyed by sha256 of title + description
_speaker_cache: dict[str, SpeakerResolution] = {}


async def resolve_speaker_from_metadata(
    title: str, description: str, existing_politicians: list[str] = None
) -> SpeakerResolution:
    """
    Calls the LLM with the video title + description to identify the primary speaker.
    Caches results to avoid redundant LLM calls.
    """
    if existing_politicians is None:
        existing_politicians = []

    text_to_hash = f"{title}|{description}"
    cache_key = hashlib.sha256(text_to_hash.encode("utf-8")).hexdigest()

    if cache_key in _speaker_cache:
        logger.info(f"Speaker cache hit for '{title}' (Key: {cache_key})")
        logger.debug(f"Cached resolution: {_speaker_cache[cache_key]}")
        return _speaker_cache[cache_key]

    logger.info(f"Resolving speaker via LLM for video: '{title}'")
    logger.debug(f"Description snippet: {description[:100]}...")

    prompt = f"""Given a YouTube video titled "{title}" with description "{description}",
identify the primary speaker(s). 

Return a JSON object with:
  - primary_speaker: string (full name, or "Unknown Speaker" if none can be determined)
  - all_speakers: string[] (all identifiable speakers, empty if none)
  - confidence: "high" | "medium" | "low" (high for solo speeches, medium for debates, low if unsure)

Example output:
{{
  "primary_speaker": "Joe Biden",
  "all_speakers": ["Joe Biden"],
  "confidence": "high"
}}
"""

    try:
        llm_client = LLMGateway()
        logger.info("Calling LLM Gateway for speaker resolution...")
        logger.debug(f"Speaker prompt sent to LLM:\n{prompt}")
        
        response = await llm_client.acreate_structured_output(
            text_input=prompt,
            system_prompt="You are an expert at extracting speaker names from video metadata. Always output valid JSON matching the requested structure.",
            response_model=SpeakerResolutionResponse,
        )

        logger.info("Successfully received structured output from LLM for speaker resolution.")
        logger.debug(f"Raw LLM parsed response: {response.model_dump()}")

        confidence = response.confidence
        if confidence not in ["high", "medium", "low"]:
            confidence = "low"

        matched_politician = response.primary_speaker in existing_politicians

        resolution = SpeakerResolution(
            name=response.primary_speaker,
            confidence=confidence,
            matched_politician=matched_politician,
            all_speakers=response.all_speakers,
        )

        logger.info(f"Speaker resolved to: '{resolution.name}' (Confidence: {resolution.confidence})")
        logger.debug(f"Matched against existing politician pool: {resolution.matched_politician}")

        _speaker_cache[cache_key] = resolution
        return resolution

    except Exception as e:
        error_msg = str(e)
        exception_name = e.__class__.__name__
        if any(keyword in error_msg for keyword in ["InstructorRetryException", "RateLimitError", "RESOURCE_EXHAUSTED", "429"]) or "InstructorRetryException" in exception_name:
            logger.warning(f"LLM rate limit or quota exhausted during speaker resolution. Defaulting to 'Unknown Speaker'. ({exception_name})")
        else:
            logger.exception("Error resolving speaker from LLM")
        return SpeakerResolution(name="Unknown Speaker", confidence="low", matched_politician=False, all_speakers=[])
