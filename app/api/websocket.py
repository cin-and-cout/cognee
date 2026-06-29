from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.orchestrator import process_incoming_sentence

router = APIRouter()


@router.websocket("/ws/live-speech")
async def websocket_live_speech(websocket: WebSocket):
    """
    FastAPI WebSocket endpoint that accepts live sentences from a client,
    processes them through the claim consistency engine, and returns the verdict.
    """
    await websocket.accept()

    try:
        while True:
            # Wait for incoming text or json from client (e.g., {"sentence": "..."})
            data = await websocket.receive_json()
            sentence = data.get("sentence", "").strip()
            if not sentence:
                continue

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
