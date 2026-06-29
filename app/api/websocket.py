import asyncio
import os
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

# Path to the live speech demo file relative to this file's location
SPEECH_FILE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "data",
    "live_speech_demo.txt",
)

@router.websocket("/ws/live-speech")
async def websocket_live_speech(websocket: WebSocket, delay: float = 2.5):
    """
    FastAPI WebSocket endpoint that streams speech lines sequentially.
    Accepts a configurable delay (seconds) via query parameters.
    """
    await websocket.accept()

    if not os.path.exists(SPEECH_FILE_PATH):
        await websocket.send_json({
            "error": f"Transcript file not found at: {SPEECH_FILE_PATH}",
        })
        await websocket.close()
        return

    try:
        # Read all non-empty lines from the speech file
        with open(SPEECH_FILE_PATH, "r") as f:
            lines = [line.strip() for line in f if line.strip()]

        for index, line in enumerate(lines):
            payload = {
                "sentence_index": index,
                "text": line,
                "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            }
            await websocket.send_json(payload)
            await asyncio.sleep(delay)

        # Signal completion to client
        await websocket.send_json({"status": "completed"})
        await websocket.close()

    except WebSocketDisconnect:
        # Client disconnected early, exit cleanly
        pass
    except Exception as e:
        # Handle unexpected exceptions, attempting to alert client
        try:
            await websocket.send_json({"error": f"Internal server error: {str(e)}"})
            await websocket.close()
        except Exception:
            pass
