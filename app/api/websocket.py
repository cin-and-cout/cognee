import hashlib
import logging
import time as _time
import asyncio
from collections import deque
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.orchestrator import process_incoming_sentence
from app.services.coreference import SpeechContext
from app.services.key_pool import AllKeysExhaustedError
from app.env_init import llm_key_pool

logger = logging.getLogger(__name__)

router = APIRouter()

# Defensive filter constants
# NOTE: Lowered from 4 to 1 because the client-side Global Word Ledger
# may produce short fragments (1-3 words) after stripping overlap.
# These are legitimate new content, not junk.
MIN_SENTENCE_WORDS = 1
DEDUP_WINDOW_SIZE = 20

# Maximum number of sentences processed concurrently.
# Limits parallel LLM calls to avoid rate-limit storms.
MAX_CONCURRENT_PIPELINES = 3


@router.websocket("/ws/live-speech")
async def websocket_live_speech(websocket: WebSocket):
    """
    FastAPI WebSocket endpoint that accepts live sentences from a client,
    processes them through the claim consistency engine, and returns the verdict.

    Includes defensive filters:
      - Rejects sentences shorter than MIN_SENTENCE_WORDS (fragments).
      - Deduplicates against a rolling window of recent sentence hashes.
    """
    await websocket.accept()
    client = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
    logger.info("WebSocket connection opened", extra={"client": client})

    # Per-connection deduplication window
    recent_hashes: deque[str] = deque(maxlen=DEDUP_WINDOW_SIZE)
    
    # Per-connection coreference state
    sentence_history: deque[str] = deque(maxlen=5)
    speech_context = SpeechContext()
    sentence_idx = 0

    try:
        while True:
            # Wait for incoming text or json from client (e.g., {"sentence": "..."})
            data = await websocket.receive_json()
            sentence = data.get("sentence", "").strip()
            speaker = data.get("speaker", "Unknown Speaker")
            speaker_confidence = data.get("speakerConfidence", "low")
            log_id = data.get("logId")
            if not sentence:
                continue

            # --- Defensive filter: minimum word count ---
            word_count = len(sentence.split())
            if word_count < MIN_SENTENCE_WORDS:
                logger.debug(
                    "Rejected short sentence (%d words): %s", word_count, sentence
                )
                continue

            # --- Defensive filter: deduplication ---
            sentence_hash = hashlib.md5(
                sentence.lower().encode("utf-8")
            ).hexdigest()
            if sentence_hash in recent_hashes:
                logger.debug("Rejected duplicate sentence: %s", sentence)
                continue
            recent_hashes.append(sentence_hash)

            sentence_idx += 1

            # ── SENTENCE ARRIVAL BANNER ────────────────────────────────────
            logger.info("─" * 60)
            logger.info(
                "📥 [ws] SENTENCE #%d  (%d words)",
                sentence_idx, word_count,
            )
            logger.info('   text    : "%s"', sentence[:120] + ("…" if len(sentence) > 120 else ""))
            logger.info("   speaker : %s  (confidence: %s)", speaker, speaker_confidence)
            # ──────────────────────────────────────────────────────────────

            sentence_history.append(sentence)

            # Capture values for the closure (they change each loop iteration)
            _sentence = sentence
            _speaker = speaker
            _speaker_confidence = speaker_confidence
            _log_id = log_id
            _sentence_idx = sentence_idx

            pipeline_sem = getattr(websocket, "_pipeline_sem", None)
            if pipeline_sem is None:
                pipeline_sem = asyncio.Semaphore(MAX_CONCURRENT_PIPELINES)
                websocket._pipeline_sem = pipeline_sem  # attach to connection

            send_lock = getattr(websocket, "_send_lock", None)
            if send_lock is None:
                send_lock = asyncio.Lock()
                websocket._send_lock = send_lock  # attach to connection

            async def _run_pipeline(
                sem: asyncio.Semaphore,
                lock: asyncio.Lock,
                ws: WebSocket,
                sent: str,
                spk: str,
                spk_conf: str,
                lid: str,
                s_idx: int,
                s_history: deque,
                s_context: SpeechContext,
            ):
                """Process one sentence and send the result back over the WebSocket."""
                async with sem:
                    t_start = _time.perf_counter()
                    report = None
                    try:
                        report = await process_incoming_sentence(
                            text=sent,
                            politician_name=spk,
                            claim_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                            politician_party="Progressive Coalition",
                            speaker_confidence=spk_conf,
                            sentence_history=s_history,
                            speech_context=s_context,
                            sentence_idx=s_idx,
                        )
                    except AllKeysExhaustedError as e:
                        logger.warning("❌ [ws] LLM rate limit: All keys in cooldown. %s", str(e))
                        cooldowns = llm_key_pool.cooldown_status()
                        shortest_cooldown = min(cooldowns.values()) if cooldowns else 60.0
                        report = {
                            "pipeline_status": "rate_limited",
                            "error": "All LLM API keys are currently on cooldown. Please wait.",
                            "cooldown_remaining": round(shortest_cooldown),
                        }
                    except Exception as e:
                        logger.exception("❌ [ws] Error processing sentence: %s", sent)
                        report = {
                            "pipeline_status": "error",
                            "error": str(e),
                        }

                    elapsed = _time.perf_counter() - t_start

                    # ── COMPLETION BANNER ──────────────────────────────────
                    status = (report or {}).get("pipeline_status", "unknown")
                    verdict_label = (report or {}).get("verdict", {}).get("label", "")
                    topic = (report or {}).get("new_claim", {}).get("topic", "")

                    if status == "no_claim":
                        logger.info("✖  [ws] DONE #%d — not a claim  (%.1fs)", s_idx, elapsed)
                    elif status == "error":
                        logger.warning("❌ [ws] DONE #%d — pipeline error  (%.1fs)", s_idx, elapsed)
                    elif verdict_label:
                        emoji = "🚨" if "contradict" in verdict_label.lower() else "✅"
                        logger.info(
                            "%s [ws] DONE #%d — %s | topic=%s | status=%s  (%.1fs)",
                            emoji, s_idx, verdict_label, topic, status, elapsed,
                        )
                    else:
                        logger.info(
                            "✅ [ws] DONE #%d — status=%s  (%.1fs)",
                            s_idx, status, elapsed,
                        )
                    logger.info("─" * 60)
                    # ──────────────────────────────────────────────────────

                    payload = {
                        "logId": lid,
                        "text": sent,
                        "speaker": spk,
                        "speakerConfidence": spk_conf,
                        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                        "report": report,
                    }
                    try:
                        async with lock:
                            await ws.send_json(payload)
                    except Exception:
                        logger.warning("⚠️  [ws] Could not send result for #%d (client disconnected?)", s_idx)

            # Fire off the pipeline without awaiting — the loop immediately
            # goes back to receive_json() to accept the next sentence.
            asyncio.create_task(
                _run_pipeline(
                    pipeline_sem, send_lock, websocket,
                    _sentence, _speaker, _speaker_confidence, _log_id,
                    _sentence_idx, sentence_history, speech_context,
                )
            )


    except WebSocketDisconnect:
        # Client disconnected cleanly
        logger.info(
            "WebSocket connection closed (clean)",
            extra={"client": client, "total_sentences": sentence_idx},
        )
    except Exception as e:
        logger.error(
            "WebSocket connection closed (error)",
            extra={"client": client, "exception": str(e), "total_sentences": sentence_idx},
        )
        logger.exception("❌ [ws] Uncaught websocket error:")
        try:
            error_payload = {
                "error": f"Internal server error: {str(e)}",
                "report": {
                    "pipeline_status": "error",
                    "error": str(e),
                }
            }
            # Safely check if variables exist in locals and attach them
            local_vars = locals()
            if "sentence" in local_vars:
                error_payload["text"] = local_vars["sentence"]
            if "log_id" in local_vars:
                error_payload["logId"] = local_vars["log_id"]
            if "speaker" in local_vars:
                error_payload["speaker"] = local_vars["speaker"]
            if "speaker_confidence" in local_vars:
                error_payload["speakerConfidence"] = local_vars["speaker_confidence"]
            
            await websocket.send_json(error_payload)
            await websocket.close()
        except Exception:
            pass
