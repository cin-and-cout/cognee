from unittest.mock import AsyncMock, patch

import pytest

from app.schemas import Claim, Politician, Topic
from app.services.comparison.nli_classifier import (
    NLIVerdictModel,
    classify_nli_contradiction,
)


@pytest.mark.asyncio
async def test_nli_classifier_no_historical():
    """
    Verifies that calling classify_nli_contradiction with no historical claim
    instantly returns 'No prior record' without invoking the LLM.
    """
    politician = Politician(name="Governor Vance")
    topic = Topic(name="Transit")

    new_claim = Claim(
        statement="We will freeze transit fares for the next two years.",
        politician=politician,
        topic=topic,
        claim_date="2026-06-29",
    )

    verdict = await classify_nli_contradiction(new_claim, None)
    assert verdict["label"] == "No prior record"
    assert "No prior historical claims" in verdict["explanation"]


@pytest.mark.asyncio
@patch(
    "app.services.comparison.nli_classifier.LLMGateway.acreate_structured_output",
    new_callable=AsyncMock,
)
async def test_nli_classifier_consistent(mock_gateway):
    """
    Verifies that consistent claims return the 'Consistent with prior statements' label.
    """
    politician = Politician(name="Governor Vance")
    topic = Topic(name="Transit")

    historical_claim = Claim(
        statement="We plan to freeze transit fares.",
        politician=politician,
        topic=topic,
        claim_date="2025-06-15",
    )

    new_claim = Claim(
        statement="As promised, transit fares remain frozen today.",
        politician=politician,
        topic=topic,
        claim_date="2026-06-29",
    )

    mock_gateway.return_value = NLIVerdictModel(
        label="Consistent with prior statements",
        explanation="The new statement confirms the fare freeze announced in 2025.",
    )

    verdict = await classify_nli_contradiction(new_claim, historical_claim)
    assert verdict["label"] == "Consistent with prior statements"
    assert "confirms the fare freeze" in verdict["explanation"]
    mock_gateway.assert_called_once()


@pytest.mark.asyncio
@patch(
    "app.services.comparison.nli_classifier.LLMGateway.acreate_structured_output",
    new_callable=AsyncMock,
)
async def test_nli_classifier_contradiction(mock_gateway):
    """
    Verifies that contradictory claims return the 'Contradicts statement from [date]' label.
    """
    politician = Politician(name="Governor Vance")
    topic = Topic(name="Transit")

    historical_claim = Claim(
        statement="We plan to freeze transit fares.",
        politician=politician,
        topic=topic,
        claim_date="2025-06-15",
    )

    new_claim = Claim(
        statement="Transit fares must rise by 15% starting next month.",
        politician=politician,
        topic=topic,
        claim_date="2026-06-29",
    )

    mock_gateway.return_value = NLIVerdictModel(
        label="Contradicts statement from 2025-06-15",
        explanation="Increasing fares by 15% violates the previous commitment to freeze them.",
    )

    verdict = await classify_nli_contradiction(new_claim, historical_claim)
    assert verdict["label"] == "Contradicts statement from 2025-06-15"
    assert "violates the previous commitment" in verdict["explanation"]
    mock_gateway.assert_called_once()
