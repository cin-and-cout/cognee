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
