import asyncio
import logging
from collections import deque
from typing import Any, Dict, Optional

from app.services.coreference import SpeechContext

logger = logging.getLogger(__name__)

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
    speaker_confidence: str = "low",
    sentence_history: Optional[deque] = None,
    speech_context: Optional[SpeechContext] = None,
    sentence_idx: int = 0,
) -> Dict[str, Any]:
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
        logger.info("⚡ [orchestrator] Cache HIT for sentence")
        return cached_report
    logger.info("⏳ [orchestrator] Cache MISS, starting pipeline")

    # 1. Extract claim
    new_claim = await extract_claim_from_text(
        text,
        politician_name,
        claim_date,
        politician_party,
        sentence_history=sentence_history,
        speech_context=speech_context,
    )
    
    # Always update context, even if no claim found
    if speech_context is not None:
        speech_context.update(text, sentence_idx)
    if new_claim:
        new_claim.speaker_confidence = speaker_confidence
        new_claim.source_type = "live"

    if not new_claim:
        logger.info("🤷 [orchestrator] No claim extracted from sentence")
        report = {"pipeline_status": "no_claim"}
        set_cached_verdict(text, report)
        return report
    logger.info("🎯 [orchestrator] Claim extracted: topic='%s', is_numeric=%s", new_claim.topic.name, new_claim.is_numeric)

    # 2. Retrieve historical claims for the topic
    historical_claims = await get_historical_claims(
        new_claim.topic.name,
        politician_name=new_claim.politician.name,
    )

    if not historical_claims:
        # Fallback to checking general myths or other speakers
        historical_claims = await get_historical_claims(
            new_claim.topic.name,
            politician_name="Common Myths",
        )

    # Filter and find the latest historical claim strictly before the new claim's date
    # and matching the same concept keyword (e.g. carrots vs carrots) to avoid mismatched cross-concept NLI
    def get_concept(stmt: str) -> Optional[str]:
        stmt_lower = stmt.lower()
        if "shark" in stmt_lower:
            return "shark"
        if "chicken" in stmt_lower:
            return "chicken"
        if "sleepwalk" in stmt_lower:
            return "sleepwalk"
        if "spider" in stmt_lower:
            return "spider"
        if "owl" in stmt_lower:
            return "owl"
        if "lightning" in stmt_lower:
            return "lightning"
        if "plank" in stmt_lower:
            return "plank"
        if "chameleon" in stmt_lower:
            return "chameleon"
        if "jellyfish" in stmt_lower:
            return "jellyfish"
        if "carrot" in stmt_lower:
            return "carrot"
        if "breakfast" in stmt_lower:
            return "breakfast"
        if "camel" in stmt_lower or "hump" in stmt_lower:
            return "camel"
        if "sense" in stmt_lower:
            return "sense"
        if "blood" in stmt_lower or "vein" in stmt_lower:
            return "blood"
        if "heat" in stmt_lower or "head" in stmt_lower:
            return "heat"
        return None

    new_concept = get_concept(new_claim.statement)
    latest_historical: Optional[Claim] = None
    
    for claim in historical_claims:
        if claim.claim_date < new_claim.claim_date:
            if new_concept and get_concept(claim.statement) == new_concept:
                if not latest_historical or claim.claim_date > latest_historical.claim_date:
                    latest_historical = claim

    if latest_historical:
        logger.info("📚 [orchestrator] Found matching historical claim on same concept: '%s' vs '%s'", new_claim.statement, latest_historical.statement)
    else:
        logger.info("📚 [orchestrator] No matching historical claim found on same concept for '%s'", new_claim.statement)

    # 3. Perform comparison if a prior record exists
    if latest_historical:
        if new_claim.is_numeric and latest_historical.is_numeric:
            verdict_diff = calculate_numeric_diff(latest_historical, new_claim)
            is_consistent = verdict_diff["is_consistent"]
            label = "Consistent with prior statements" if is_consistent else f"Contradicts statement from {latest_historical.claim_date}"
            verdict = {
                "label": label,
                "explanation": verdict_diff["verdict"],
                "is_consistent": is_consistent,
                "absolute_drift": verdict_diff["absolute_drift"],
                "percentage_variance": verdict_diff["percentage_variance"],
                "type": "numeric"
            }
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
    should_persist = speaker_confidence in ("high", "medium")

    async def run_ingestion():
        try:
            await add_data_points([new_claim.politician, new_claim.topic, new_claim])
            await cognee.add("historical_claims", dataset_name="default_dataset")
            await cognee.cognify(temporal_cognify=True)
        except Exception:
            logger.exception("Background claim ingestion failed — data point was NOT persisted to the graph")

    if should_persist:
        asyncio.create_task(run_ingestion())
        logger.info("💾 [orchestrator] Queued claim ingestion (speaker_confidence=%s)", speaker_confidence)
        pipeline_status = "compared_added" if latest_historical else "added_unverified"
    else:
        logger.info("⚠️ [orchestrator] Skipping ingestion — speaker_confidence='%s' (Unknown Speaker)", speaker_confidence)
        pipeline_status = "compared_skipped" if latest_historical else "skipped_unverified"
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
        "pipeline_status": pipeline_status,
    }

    # Save to cache
    set_cached_verdict(text, report)

    return report
