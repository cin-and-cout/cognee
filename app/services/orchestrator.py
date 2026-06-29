import asyncio
from typing import Any, Dict, Optional

import cognee
from cognee.tasks.storage import add_data_points

from app.schemas import Claim
from app.services.claim_extractor import extract_claim_from_text
from app.services.comparison.nli_classifier import classify_nli_contradiction
from app.services.comparison.numeric_diff import calculate_numeric_diff
from app.services.temporal_search import get_historical_claims


async def process_incoming_sentence(
    text: str,
    politician_name: str,
    claim_date: str,
    politician_party: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Orchestrates the entire claim consistency pipeline for a single speech sentence:
      1. Extracts a structured claim (if present).
      2. Retrieves historical claims on the same topic.
      3. Compares the new claim with the latest historical claim.
      4. Ingests the new claim into the Cognee graph database.
      5. Returns a detailed report of the findings.
    """
    # Check cache first for demo stability and speed
    from app.services.cache import get_cached_verdict, set_cached_verdict

    cached_report = get_cached_verdict(text)
    if cached_report:
        return cached_report

    # 1. Extract claim
    new_claim = await extract_claim_from_text(
        text,
        politician_name,
        claim_date,
        politician_party,
    )
    if not new_claim:
        return None

    # 2. Retrieve historical claims for the topic
    historical_claims = await get_historical_claims(new_claim.topic.name)

    # Filter and find the latest historical claim strictly before the new claim's date
    latest_historical: Optional[Claim] = None
    for claim in historical_claims:
        if claim.claim_date < new_claim.claim_date:
            if not latest_historical or claim.claim_date > latest_historical.claim_date:
                latest_historical = claim

    # 3. Perform comparison if a prior record exists
    if latest_historical:
        if new_claim.is_numeric and latest_historical.is_numeric:
            verdict = calculate_numeric_diff(latest_historical, new_claim)
            verdict["type"] = "numeric"
        else:
            verdict = await classify_nli_contradiction(
                new_claim,
                latest_historical,
            )
            verdict["type"] = "qualitative"
    else:
        verdict = {
            "label": "No prior record",
            "explanation": (
                f"No prior historical claims found for topic '{new_claim.topic.name}'."
            ),
            "type": "none",
        }

    # 4. Ingest the new claim historically in the background to minimize response latency
    async def run_ingestion():
        try:
            await add_data_points([new_claim.politician, new_claim.topic, new_claim])
            await cognee.cognify(temporal_cognify=True)
        except Exception:
            # Silence background errors to prevent API disruption
            pass

    asyncio.create_task(run_ingestion())
    # Yield control to event loop so background task can start executing
    await asyncio.sleep(0.001)

    # 5. Build and return report
    report = {
        "new_claim": {
            "statement": new_claim.statement,
            "claim_date": new_claim.claim_date,
            "is_numeric": new_claim.is_numeric,
            "value": new_claim.value,
            "unit": new_claim.unit,
            "metric": new_claim.metric,
            "topic": new_claim.topic.name,
        },
        "historical_claim": (
            {
                "statement": latest_historical.statement,
                "claim_date": latest_historical.claim_date,
                "is_numeric": latest_historical.is_numeric,
                "value": latest_historical.value,
                "unit": latest_historical.unit,
                "metric": latest_historical.metric,
            }
            if latest_historical
            else None
        ),
        "verdict": verdict,
    }

    # Save to cache
    set_cached_verdict(text, report)

    return report
