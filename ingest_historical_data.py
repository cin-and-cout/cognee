import asyncio
import json
import os

import cognee
from cognee.tasks.storage import add_data_points
from dotenv import load_dotenv

from app.schemas import Claim, Politician, Topic

# Load environment variables (such as OPENAI_API_KEY) from .env
load_dotenv()


async def ingest_data(file_path: str = "data/historical_claims.json"):
    """
    Ingests mock historical claims from a JSON file into Cognee.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Source file not found at: {file_path}")

    print(f"Reading historical dataset from {file_path}...")
    with open(file_path, "r") as f:
        raw_claims = json.load(f)

    # Dictionaries to keep track of unique Politician and Topic nodes
    politicians = {}
    topics = {}

    data_points = []

    for item in raw_claims:
        # 1. Resolve Politician DataPoint
        p_info = item["politician"]
        p_name = p_info["name"]
        if p_name not in politicians:
            politicians[p_name] = Politician(
                name=p_name,
                party=p_info.get("party"),
            )
            data_points.append(politicians[p_name])

        politician_node = politicians[p_name]

        # 2. Resolve Topic DataPoint
        t_name = item["topic"]
        if t_name not in topics:
            topics[t_name] = Topic(name=t_name)
            data_points.append(topics[t_name])

        topic_node = topics[t_name]

        # 3. Create Claim DataPoint
        claim_node = Claim(
            statement=item["statement"],
            politician=politician_node,
            topic=topic_node,
            claim_date=item["claim_date"],
            source_link=item.get("source_link"),
            is_numeric=item.get("is_numeric", False),
            metric=item.get("metric"),
            value=item.get("value"),
            unit=item.get("unit"),
        )

        # Link references
        claim_node.politician = politician_node
        claim_node.topic = topic_node

        data_points.append(claim_node)

    print(f"Adding {len(data_points)} data points to Cognee graph...")
    await add_data_points(data_points)

    print("Running temporal cognify pipeline (graph construction & indexing)...")
    await cognee.cognify(temporal_cognify=True)
    print("Ingestion pipeline finished successfully!")


if __name__ == "__main__":
    asyncio.run(ingest_data())
