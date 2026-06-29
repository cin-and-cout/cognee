from unittest.mock import AsyncMock, patch

import pytest

from app.schemas import Claim, Politician, Topic
from ingest_historical_data import ingest_data


@pytest.mark.asyncio
@patch("ingest_historical_data.add_data_points", new_callable=AsyncMock)
@patch("ingest_historical_data.cognee.cognify", new_callable=AsyncMock)
async def test_ingest_historical_data_success(mock_cognify, mock_add_data_points):
    """
    Verifies that ingest_data correctly reads the JSON file, parses the records into
    custom Pydantic DataPoint models, links relationships, and triggers the cognify pipeline.
    """
    # Run the ingestion script pointing to our mock dataset
    await ingest_data("data/historical_claims.json")

    # 1. Verify add_data_points was called
    mock_add_data_points.assert_called_once()

    # Extract data points passed to add_data_points
    called_args = mock_add_data_points.call_args[0][0]

    # We should have politicians, topics, and claims in the list
    politicians = [dp for dp in called_args if isinstance(dp, Politician)]
    topics = [dp for dp in called_args if isinstance(dp, Topic)]
    claims = [dp for dp in called_args if isinstance(dp, Claim)]

    # Verify we extracted Alexis Vance
    assert len(politicians) == 1
    assert politicians[0].name == "Governor Alexis Vance"
    assert politicians[0].party == "Progressive Coalition"

    # Verify topics were instantiated
    assert len(topics) > 0
    topic_names = {t.name for t in topics}
    assert "Inflation" in topic_names
    assert "Unemployment" in topic_names

    # Verify claims were instantiated and linked
    assert len(claims) == 59
    first_claim = claims[0]
    assert isinstance(first_claim.politician, Politician)
    assert isinstance(first_claim.topic, Topic)
    assert first_claim.politician.name == "Governor Alexis Vance"

    # 2. Verify cognify was called with temporal_cognify=True
    mock_cognify.assert_called_once_with(temporal_cognify=True)

@pytest.mark.asyncio
async def test_ingest_data_missing_file():
    """
    Verifies that ingest_data raises FileNotFoundError if the JSON path does not exist.
    """
    with pytest.raises(FileNotFoundError):
        await ingest_data("data/non_existent_file.json")
