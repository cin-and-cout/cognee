import asyncio
import logging
import time
from collections import deque
from typing import Any, Dict, Optional

from app.services.coreference import SpeechContext

logger = logging.getLogger(__name__)


def _log_ingestion_result(task: asyncio.Task) -> None:
    """Done-callback for background ingestion tasks. Logs errors without crashing."""
    try:
        exc = task.exception()
        if exc:
            logger.exception(
                "   ❌ Background ingestion task failed",
                exc_info=exc,
            )
        else:
            logger.info("   ✅ Background ingestion task completed successfully")
    except asyncio.CancelledError:
        logger.warning("   ⚠️  Background ingestion task was cancelled")

import cognee
from cognee.tasks.storage import add_data_points

from app.schemas import Claim
from app.services.claim_extractor import extract_claim_from_text
from app.services.comparison.nli_classifier import classify_nli_contradiction
from app.services.comparison.numeric_diff import calculate_numeric_diff
from app.services.temporal_search import get_historical_claims
from app.services.key_pool import AllKeysExhaustedError


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

    # ── STAGE 1: Claim Extraction ──────────────────────────────────────────────
    logger.info("── STAGE 1/4: Claim Extraction ──────────────────────────")
    t1 = time.perf_counter()
    try:
        new_claim = await extract_claim_from_text(
            text,
            politician_name,
            claim_date,
            politician_party,
            sentence_history=sentence_history,
            speech_context=speech_context,
        )
    except AllKeysExhaustedError:
        logger.error("   ❌ Rate limit exhausted — returning rate_limited status")
        return {"pipeline_status": "rate_limited"}

    t1_ms = int((time.perf_counter() - t1) * 1000)

    # Always update context, even if no claim found
    if speech_context is not None:
        speech_context.update(text, sentence_idx)
    if new_claim:
        new_claim.speaker_confidence = speaker_confidence
        new_claim.source_type = "live"

    if not new_claim:
        logger.info("   ✖  No claim extracted  (%dms)", t1_ms)
        report = {"pipeline_status": "no_claim"}
        set_cached_verdict(text, report)
        return report

    logger.info(
        "   ✅ Claim found  topic=%s  numeric=%s%s  (%dms)",
        new_claim.topic.name,
        new_claim.is_numeric,
        f"  value={new_claim.value}{new_claim.unit}" if new_claim.is_numeric and new_claim.value is not None else "",
        t1_ms,
    )
    logger.info('   stmt     : "%s"', new_claim.statement[:120] + ("…" if len(new_claim.statement) > 120 else ""))

    # ── STAGE 2: Historical Lookup ─────────────────────────────────────────────
    logger.info("── STAGE 2/4: Historical Lookup ──────────────────────────")
    t2 = time.perf_counter()
    historical_claims = await get_historical_claims(
        new_claim.topic.name,
        politician_name=new_claim.politician.name,
    )
    t2_ms = int((time.perf_counter() - t2) * 1000)

    # Filter and find the latest historical claim strictly before the new claim's date
    latest_historical: Optional[Claim] = None
    for claim in historical_claims:
        if claim.claim_date < new_claim.claim_date:
            if not latest_historical or claim.claim_date > latest_historical.claim_date:
                latest_historical = claim

    if latest_historical:
        logger.info(
            "   📚 %d prior claim(s) found  latest=%s  (%dms)",
            len(historical_claims), latest_historical.claim_date, t2_ms,
        )
        logger.info('   prior    : "%s"', latest_historical.statement[:120] + ("…" if len(latest_historical.statement) > 120 else ""))
    else:
        logger.info(
            "   📭 No prior claims for topic '%s'  (%dms)",
            new_claim.topic.name, t2_ms,
        )

    # ── STAGE 3: Comparison ────────────────────────────────────────────────────
    logger.info("── STAGE 3/4: Comparison ─────────────────────────────────")
    t3 = time.perf_counter()
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
    t3_ms = int((time.perf_counter() - t3) * 1000)

    label = verdict.get("label", "")
    verdict_emoji = "🚨" if "contradict" in label.lower() else ("✅" if "consistent" in label.lower() else "—")
    logger.info("   %s Verdict: %s  (%dms)", verdict_emoji, label, t3_ms)

    # ── STAGE 4: Ingest ────────────────────────────────────────────────────────
    logger.info("── STAGE 4/4: DB Ingestion ───────────────────────────────")
    # Always persist claims to db (metadata contains speaker_confidence)
    should_persist = True
    claim_snippet = new_claim.statement[:80] + "..." if len(new_claim.statement) > 80 else new_claim.statement

    async def run_ingestion():
        logger.info("add_data_points called", extra={"types": ["Politician", "Topic", "Claim"]})
        start_add = time.time()
        await add_data_points([new_claim.politician, new_claim.topic, new_claim])
        logger.info("add_data_points succeeded", extra={"latency_ms": int((time.time() - start_add)*1000)})

    if should_persist:
        logger.info("   💾 Dispatching background ingestion (non-blocking)...")
        task = asyncio.create_task(run_ingestion())
        task.add_done_callback(_log_ingestion_result)
        pipeline_status = "compared_added" if latest_historical else "added_unverified"
    else:
        logger.info(
            "   ⚠️  Skipping ingestion — speaker_confidence='%s'",
            speaker_confidence,
        )
        pipeline_status = "compared_skipped" if latest_historical else "skipped_unverified"

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

    # Save to cache (only for successful end states)
    if pipeline_status not in ("rate_limited", "ingest_timeout", "ingest_error", "error"):
        set_cached_verdict(text, report)

    return report
