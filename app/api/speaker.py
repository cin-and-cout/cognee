import logging
from fastapi import APIRouter
from pydantic import BaseModel

from app.services.speaker_resolver import SpeakerResolution, resolve_speaker_from_metadata

logger = logging.getLogger(__name__)
router = APIRouter()

class SpeakerMetadataRequest(BaseModel):
    title: str
    description: str

@router.post("/api/resolve-speaker", response_model=SpeakerResolution)
async def resolve_speaker(body: SpeakerMetadataRequest) -> SpeakerResolution:
    """
    Accepts a YouTube video title and description, and returns the primary speaker
    by querying the LLM. Results are cached in-memory.
    """
    title_snippet = body.title[:60] + "..." if len(body.title) > 60 else body.title
    logger.info("POST /api/resolve-speaker received", extra={"title_snippet": title_snippet})
    
    result = await resolve_speaker_from_metadata(
        title=body.title,
        description=body.description,
        existing_politicians=[]
    )
    
    logger.info("Speaker resolution returned", extra={"resolved_name": result.name, "confidence": result.confidence, "matched_politician": result.matched_politician})
    return result
