import cognee
import pytest
from cognee.tasks.storage import add_data_points

from app.schemas import Claim, Politician, Topic
from app.services.temporal_search import get_historical_claims, get_most_recent_claim


# Mock the embedding engine to prevent external OpenAI API calls during testing
async def mock_embed_text(self, texts):
    return [[0.0] * 3072 for _ in texts]


from cognee.infrastructure.databases.vector.embeddings.LiteLLMEmbeddingEngine import (  # noqa: E402
    LiteLLMEmbeddingEngine,
)

LiteLLMEmbeddingEngine.embed_text = mock_embed_text


@pytest.mark.asyncio
async def test_temporal_search():
    # 1. Prune the database to start fresh
    from cognee.infrastructure.databases.graph.get_graph_engine import get_graph_engine
    from cognee.infrastructure.databases.vector import get_vector_engine

    graph_engine = await get_graph_engine()
    await graph_engine.delete_graph()

    vector_engine = get_vector_engine()
    await vector_engine.prune()

    await cognee.prune.prune_data()
    await cognee.prune.prune_system(metadata=True)

    # 2. Setup mock entities
    politician = Politician(name="Governor Vance", party="Republican")
    topic = Topic(name="Inflation")

    # Three claims on the same topic with different dates
    claim_old = Claim(
        statement="Inflation is at 8% right now.",
        politician=politician,
        topic=topic,
        claim_date="2023-04-10",
        is_numeric=True,
        metric="inflation rate",
        value=8.0,
        unit="%",
    )
    claim_mid = Claim(
        statement="We have cut inflation to 4.5%.",
        politician=politician,
        topic=topic,
        claim_date="2024-06-15",
        is_numeric=True,
        metric="inflation rate",
        value=4.5,
        unit="%",
    )
    claim_new = Claim(
        statement="Inflation is back down to 2.1% under my plan.",
        politician=politician,
        topic=topic,
        claim_date="2025-05-01",
        is_numeric=True,
        metric="inflation rate",
        value=2.1,
        unit="%",
    )

    # Set relations explicitly
    for c in [claim_old, claim_mid, claim_new]:
        c.politician = politician
        c.topic = topic

    # Ingest data points
    await add_data_points([politician, topic, claim_old, claim_mid, claim_new])

    # 3. Query all historical claims for the topic
    claims = await get_historical_claims(topic_name="Inflation")

    assert len(claims) == 3
    # Check date sorting (descending: 2025-05-01 -> 2024-06-15 -> 2023-04-10)
    assert claims[0].claim_date == "2025-05-01"
    assert claims[1].claim_date == "2024-06-15"
    assert claims[2].claim_date == "2023-04-10"

    # Verify politician and topic fields are correctly resolved
    assert claims[0].politician.name == "Governor Vance"
    assert claims[0].topic.name == "Inflation"

    # 4. Query specifically with politician filter
    claims_vance = await get_historical_claims(
        topic_name="inflation", politician_name="Governor Vance",
    )
    assert len(claims_vance) == 3

    # Query with non-existent politician
    claims_other = await get_historical_claims(
        topic_name="inflation", politician_name="Someone Else",
    )
    assert len(claims_other) == 0

    # 5. Query most recent claim
    newest = await get_most_recent_claim(topic_name="Inflation")
    assert newest is not None
    assert newest.claim_date == "2025-05-01"
    assert newest.statement == "Inflation is back down to 2.1% under my plan."

    # Query non-existent topic
    no_claims = await get_historical_claims(topic_name="Education")
    assert len(no_claims) == 0
