import hashlib
import logging
from collections import deque
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.orchestrator import process_incoming_sentence

logger = logging.getLogger(__name__)

router = APIRouter()

# Defensive filter constants
MIN_SENTENCE_WORDS = 4
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

    # Per-connection deduplication window
    recent_hashes: deque[str] = deque(maxlen=DEDUP_WINDOW_SIZE)

    try:
        while True:
            # Wait for incoming text or json from client (e.g., {"sentence": "..."})
            data = await websocket.receive_json()
            sentence = data.get("sentence", "").strip()
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

            # Process the incoming live sentence
            report = await process_incoming_sentence(
                text=sentence,
                politician_name="Governor Alexis Vance",
                claim_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                politician_party="Progressive Coalition",
            )

            payload = {
                "text": sentence,
                "timestamp": (datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")),
                "report": report,
            }
            await websocket.send_json(payload)

    except WebSocketDisconnect:
        # Client disconnected cleanly
        pass
    except Exception as e:
        try:
            await websocket.send_json({"error": f"Internal server error: {str(e)}"})
            await websocket.close()
        except Exception:
            pass

