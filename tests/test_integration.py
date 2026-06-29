from unittest.mock import AsyncMock, patch

import pytest

from app.schemas import Claim, Politician, Topic
from app.services.orchestrator import process_incoming_sentence


@pytest.mark.asyncio
@patch("app.services.orchestrator.extract_claim_from_text", new_callable=AsyncMock)
@patch("app.services.orchestrator.get_historical_claims", new_callable=AsyncMock)
@patch("app.services.orchestrator.calculate_numeric_diff")
@patch("app.services.orchestrator.add_data_points", new_callable=AsyncMock)
@patch("app.services.orchestrator.cognee.cognify", new_callable=AsyncMock)
async def test_orchestrator_numeric_flow(
    mock_cognify,
    mock_add_data_points,
    mock_calc_diff,
    mock_get_hist,
    mock_extract,
):
    """
    Tests that a numeric claim invokes numeric diff and database ingestion.
    """
    politician = Politician(name="Governor Vance")
    topic = Topic(name="Inflation")

    new_claim = Claim(
        statement="Inflation is now at 3.0%.",
        politician=politician,
        topic=topic,
        claim_date="2026-06-29",
        is_numeric=True,
        value=3.0,
        unit="%",
        metric="inflation rate",
    )
    new_claim.politician = politician
    new_claim.topic = topic

    hist_claim = Claim(
        statement="Inflation was 4.0%.",
        politician=politician,
        topic=topic,
        claim_date="2025-06-29",
        is_numeric=True,
        value=4.0,
        unit="%",
        metric="inflation rate",
    )
    hist_claim.politician = politician
    hist_claim.topic = topic

    mock_extract.return_value = new_claim
    mock_get_hist.return_value = [hist_claim]
    mock_calc_diff.return_value = {
        "is_consistent": False,
        "absolute_drift": 1.0,
        "percentage_variance": 25.0,
        "verdict": "Stated figure of 3.0% differs from 4.0% by 25.0%.",
    }

    report = await process_incoming_sentence(
        text="Inflation is now at 3.0%.",
        politician_name="Governor Vance",
        claim_date="2026-06-29",
    )

    assert report is not None
    assert report["new_claim"]["statement"] == "Inflation is now at 3.0%."
    assert report["historical_claim"]["statement"] == "Inflation was 4.0%."
    assert report["verdict"]["is_consistent"] is False
    assert report["verdict"]["type"] == "numeric"

    mock_extract.assert_called_once()
    mock_get_hist.assert_called_once_with("Inflation")
    mock_calc_diff.assert_called_once_with(hist_claim, new_claim)
    mock_add_data_points.assert_called_once()
    mock_cognify.assert_called_once()


@pytest.mark.asyncio
@patch("app.services.orchestrator.extract_claim_from_text", new_callable=AsyncMock)
@patch("app.services.orchestrator.get_historical_claims", new_callable=AsyncMock)
@patch("app.services.orchestrator.classify_nli_contradiction", new_callable=AsyncMock)
@patch("app.services.orchestrator.add_data_points", new_callable=AsyncMock)
@patch("app.services.orchestrator.cognee.cognify", new_callable=AsyncMock)
async def test_orchestrator_qualitative_flow(
    mock_cognify,
    mock_add_data_points,
    mock_nli,
    mock_get_hist,
    mock_extract,
):
    """
    Tests that a qualitative claim invokes qualitative NLI comparison and ingestion.
    """
    politician = Politician(name="Governor Vance")
    topic = Topic(name="Transit")

    new_claim = Claim(
        statement="Passenger fares are frozen.",
        politician=politician,
        topic=topic,
        claim_date="2026-06-29",
        is_numeric=False,
    )
    new_claim.politician = politician
    new_claim.topic = topic

    hist_claim = Claim(
        statement="We plan to freeze passenger fares.",
        politician=politician,
        topic=topic,
        claim_date="2025-06-29",
        is_numeric=False,
    )
    hist_claim.politician = politician
    hist_claim.topic = topic

    mock_extract.return_value = new_claim
    mock_get_hist.return_value = [hist_claim]
    mock_nli.return_value = {
        "label": "Consistent with prior statements",
        "explanation": "Consistent with transit fare freeze.",
    }

    report = await process_incoming_sentence(
        text="Passenger fares are frozen.",
        politician_name="Governor Vance",
        claim_date="2026-06-29",
    )

    assert report is not None
    assert report["new_claim"]["statement"] == "Passenger fares are frozen."
    assert report["historical_claim"]["statement"] == ("We plan to freeze passenger fares.")
    assert report["verdict"]["label"] == "Consistent with prior statements"
    assert report["verdict"]["type"] == "qualitative"

    mock_extract.assert_called_once()
    mock_get_hist.assert_called_once_with("Transit")
    mock_nli.assert_called_once_with(new_claim, hist_claim)
    mock_add_data_points.assert_called_once()
    mock_cognify.assert_called_once()
