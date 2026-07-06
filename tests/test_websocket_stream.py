from fastapi.testclient import TestClient

from app.main import app


def test_websocket_live_speech_realtime():
    """
    Verifies that the WebSocket endpoint accepts connections, processes
    sent sentences in real-time, and returns structured JSON reports.
    """
    client = TestClient(app)

    with client.websocket_connect("/ws/live-speech") as websocket:
        # Send a test sentence
        test_sentence = "Inflation is currently at 2.4%."
        websocket.send_json({"sentence": test_sentence})

        # Receive processing verdict
        response = websocket.receive_json()
        assert "text" in response
        assert "timestamp" in response
        assert "report" in response
        assert response["text"] == test_sentence


def test_websocket_live_speech_concurrent():
    """
    Verifies that multiple sentences sent in rapid succession are processed
    concurrently and successfully returned without blocking the websocket connection.
    """
    client = TestClient(app)

    with client.websocket_connect("/ws/live-speech") as websocket:
        sentences = [
            ("Sentence A is not a claim.", "id-A"),
            ("Sentence B: Unemployment is down to 4.2%.", "id-B"),
            ("Sentence C: Affordable housing has grown by 1500 units.", "id-C"),
        ]

        # Send all concurrently (back-to-back)
        for sent, log_id in sentences:
            websocket.send_json({
                "sentence": sent,
                "logId": log_id,
            })

        # Receive all responses
        received = []
        for _ in range(len(sentences)):
            response = websocket.receive_json()
            received.append(response)

        assert len(received) == 3

        # Match logIds to prove all messages processed and returned
        received_ids = {resp.get("logId") for resp in received}
        expected_ids = {log_id for _, log_id in sentences}
        assert received_ids == expected_ids

