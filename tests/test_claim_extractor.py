from unittest.mock import AsyncMock, patch

import pytest

from app.schemas import Claim
from app.services.claim_extractor import ExtractedClaimModel, extract_claim_from_text


@pytest.mark.asyncio
@patch("app.services.claim_extractor.LLMGateway.acreate_structured_output", new_callable=AsyncMock)
async def test_extract_claim_numeric_success(mock_gateway):
    """
    Verifies that a numeric claim is correctly parsed, instantiates all DataPoint
    objects, and maps relationship attributes.
    """
    # Configure mock response for a numeric inflation claim
    mock_gateway.return_value = ExtractedClaimModel(
        has_claim=True,
        topic="Inflation",
        statement="Inflation has now dropped to 2.1% this quarter.",
        is_numeric=True,
        metric="Inflation Rate",
        value=2.1,
        unit="%",
    )

    sentence = "But I am proud to report that inflation has now dropped to 2.1% this quarter."
    claim = await extract_claim_from_text(
        text=sentence,
        politician_name="Governor Alexis Vance",
        claim_date="2026-06-29",
        politician_party="Progressive Coalition",
    )

    assert claim is not None
    assert isinstance(claim, Claim)
    assert claim.statement == "Inflation has now dropped to 2.1% this quarter."
    assert claim.claim_date == "2026-06-29"
    assert claim.is_numeric is True
    assert claim.metric == "Inflation Rate"
    assert claim.value == 2.1
    assert claim.unit == "%"

    # Check linked objects
    assert claim.politician.name == "Governor Alexis Vance"
    assert claim.politician.party == "Progressive Coalition"
    assert claim.topic.name == "Inflation"

    # Verify mock call arguments
    mock_gateway.assert_called_once()
    assert mock_gateway.call_args[1]["text_input"] == sentence


@pytest.mark.asyncio
@patch("app.services.claim_extractor.LLMGateway.acreate_structured_output", new_callable=AsyncMock)
async def test_extract_claim_non_numeric_success(mock_gateway):
    """
    Verifies that a qualitative policy commitment is successfully parsed as a non-numeric claim.
    """
    mock_gateway.return_value = ExtractedClaimModel(
        has_claim=True,
        topic="Public Transit",
        statement="We are completely freezing all transit ticket prices.",
        is_numeric=False,
        metric=None,
        value=None,
        unit=None,
    )

    sentence = (
        "I stand before you today to promise that we are completely "
        "freezing all transit ticket prices."
    )
    claim = await extract_claim_from_text(
        text=sentence,
        politician_name="Governor Alexis Vance",
        claim_date="2026-06-29",
    )

    assert claim is not None
    assert claim.statement == "We are completely freezing all transit ticket prices."
    assert claim.is_numeric is False
    assert claim.topic.name == "Public Transit"
    assert claim.politician.name == "Governor Alexis Vance"


@pytest.mark.asyncio
@patch("app.services.claim_extractor.LLMGateway.acreate_structured_output", new_callable=AsyncMock)
async def test_extract_claim_not_a_claim(mock_gateway):
    """
    Verifies that if the text is not a checkable claim, the service returns None.
    """
    mock_gateway.return_value = ExtractedClaimModel(
        has_claim=False,
        topic=None,
        statement=None,
        is_numeric=None,
        metric=None,
        value=None,
        unit=None,
    )

    sentence = "Good afternoon, everyone, and thank you for joining me today."
    claim = await extract_claim_from_text(
        text=sentence,
        politician_name="Governor Alexis Vance",
        claim_date="2026-06-29",
    )

    assert claim is None
