import hashlib
import logging
import time as _time
from collections import deque
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.orchestrator import process_incoming_sentence
from app.services.coreference import SpeechContext

logger = logging.getLogger(__name__)

router = APIRouter()

# Defensive filter constants
# NOTE: Lowered from 4 to 1 because the client-side Global Word Ledger
# may produce short fragments (1-3 words) after stripping overlap.
# These are legitimate new content, not junk.
MIN_SENTENCE_WORDS = 1
DEDUP_WINDOW_SIZE = 20


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
            t_start = _time.perf_counter()
            
            report = None
            try:
                report = await process_incoming_sentence(
                    text=sentence,
                    politician_name=speaker,
                    claim_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                    politician_party="Progressive Coalition",  # Can be resolved in the future
                    speaker_confidence=speaker_confidence,
                    sentence_history=sentence_history,
                    speech_context=speech_context,
                    sentence_idx=sentence_idx,
                )
            except Exception as e:
                # Do NOT re-raise — that would kill the entire WebSocket connection
                # for all future sentences. Log the error and return a safe error
                # report so the client can update its UI instead of staying in
                # the permanent ⋯ Analysing… state.
                logger.exception("❌ [ws] Error processing sentence: %s", sentence)
                report = {
                    "pipeline_status": "error",
                    "error": str(e),
                }

            elapsed = _time.perf_counter() - t_start

            # ── COMPLETION BANNER ──────────────────────────────────────────
            status = (report or {}).get("pipeline_status", "unknown")
            verdict_label = (report or {}).get("verdict", {}).get("label", "")
            topic = (report or {}).get("new_claim", {}).get("topic", "")

            if status == "no_claim":
                logger.info("✖  [ws] DONE #%d — not a claim  (%.1fs)", sentence_idx, elapsed)
            elif status == "error":
                logger.warning("❌ [ws] DONE #%d — pipeline error  (%.1fs)", sentence_idx, elapsed)
            elif verdict_label:
                emoji = "🚨" if "contradict" in verdict_label.lower() else "✅"
                logger.info(
                    "%s [ws] DONE #%d — %s | topic=%s | status=%s  (%.1fs)",
                    emoji, sentence_idx, verdict_label, topic, status, elapsed,
                )
            else:
                logger.info(
                    "✅ [ws] DONE #%d — status=%s  (%.1fs)",
                    sentence_idx, status, elapsed,
                )
            logger.info("─" * 60)
            # ──────────────────────────────────────────────────────────────

            payload = {
                "logId": log_id,
                "text": sentence,
                "speaker": speaker,
                "speakerConfidence": speaker_confidence,
                "timestamp": (datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")),
                "report": report,
            }
            await websocket.send_json(payload)

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
