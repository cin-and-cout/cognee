from fastapi import APIRouter
from pydantic import BaseModel

from app.services.speaker_resolver import SpeakerResolution, resolve_speaker_from_metadata

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
    # For now, we don't query existing_politicians from the database, but we could.
    return await resolve_speaker_from_metadata(
        title=body.title,
        description=body.description,
        existing_politicians=[]
    )
