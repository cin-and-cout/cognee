import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from app.services.speaker_resolver import resolve_speaker_from_metadata, _speaker_cache, SpeakerResolutionResponse

@pytest.fixture(autouse=True)
def clear_cache():
    # Clear the in-memory cache before each test
    _speaker_cache.clear()

@pytest.mark.asyncio
@patch("app.services.speaker_resolver.LLMGateway")
async def test_resolve_speaker_solo(mock_llm_gateway):
    mock_llm = MagicMock()
    mock_llm.acreate_structured_output = AsyncMock()
    mock_llm_gateway.return_value = mock_llm
    
    # Mocking Pydantic response
    mock_llm.acreate_structured_output.return_value = SpeakerResolutionResponse(
        primary_speaker="Joe Biden",
        all_speakers=["Joe Biden"],
        confidence="high"
    )

    resolution = await resolve_speaker_from_metadata("State of the Union", "Joe Biden speaks")
    
    assert resolution.name == "Joe Biden"
    assert resolution.confidence == "high"
    assert resolution.all_speakers == ["Joe Biden"]

@pytest.mark.asyncio
@patch("app.services.speaker_resolver.LLMGateway")
async def test_resolve_speaker_debate(mock_llm_gateway):
    mock_llm = MagicMock()
    mock_llm.acreate_structured_output = AsyncMock()
    mock_llm_gateway.return_value = mock_llm
    
    # Mocking Pydantic response
    mock_llm.acreate_structured_output.return_value = SpeakerResolutionResponse(
        primary_speaker="Donald Trump",
        all_speakers=["Donald Trump", "Kamala Harris", "Moderator"],
        confidence="medium"
    )

    resolution = await resolve_speaker_from_metadata("Presidential Debate", "Trump vs Harris")
    
    assert resolution.name == "Donald Trump"
    assert resolution.confidence == "medium"
    assert set(resolution.all_speakers) == {"Donald Trump", "Kamala Harris", "Moderator"}

@pytest.mark.asyncio
@patch("app.services.speaker_resolver.LLMGateway")
async def test_resolve_speaker_unknown(mock_llm_gateway):
    mock_llm = MagicMock()
    mock_llm.acreate_structured_output = AsyncMock()
    mock_llm_gateway.return_value = mock_llm
    
    mock_llm.acreate_structured_output.return_value = SpeakerResolutionResponse(
        primary_speaker="Unknown Speaker",
        all_speakers=[],
        confidence="low"
    )

    resolution = await resolve_speaker_from_metadata("Funny Cat Compilation", "Meow")
    
    assert resolution.name == "Unknown Speaker"
    assert resolution.confidence == "low"
    assert resolution.all_speakers == []

@pytest.mark.asyncio
@patch("app.services.speaker_resolver.LLMGateway")
async def test_speaker_caching(mock_llm_gateway):
    mock_llm = MagicMock()
    mock_llm.acreate_structured_output = AsyncMock()
    mock_llm_gateway.return_value = mock_llm
    
    mock_llm.acreate_structured_output.return_value = SpeakerResolutionResponse(
        primary_speaker="Cached Speaker",
        all_speakers=["Cached Speaker"],
        confidence="high"
    )

    # First call should hit the mocked LLM
    res1 = await resolve_speaker_from_metadata("Title 1", "Desc 1")
    assert mock_llm.acreate_structured_output.call_count == 1
    assert res1.name == "Cached Speaker"

    # Second call with the same inputs should hit the cache
    res2 = await resolve_speaker_from_metadata("Title 1", "Desc 1")
    assert mock_llm.acreate_structured_output.call_count == 1 # Still 1!
    assert res2.name == "Cached Speaker"
