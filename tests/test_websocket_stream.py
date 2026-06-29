from fastapi.testclient import TestClient

from app.main import app


def test_websocket_live_speech_stream():
    """
    Verifies that the WebSocket endpoint accepts connections, streams
    all speech lines in order, contains the required JSON properties,
    and returns a completed status at the end.
    """
    client = TestClient(app)

    # Use a very small delay to speed up tests
    with client.websocket_connect("/ws/live-speech?delay=0.001") as websocket:
        first_message = websocket.receive_json()
        assert "sentence_index" in first_message
        assert "text" in first_message
        assert "timestamp" in first_message
        assert first_message["sentence_index"] == 0
        assert first_message["text"] == (
            "Good afternoon, everyone, and thank you for joining me today."
        )

        # Loop to consume all remaining lines until the completion signal
        lines_count = 1
        while True:
            message = websocket.receive_json()
            if "status" in message and message["status"] == "completed":
                break
            assert "text" in message
            assert "sentence_index" in message
            assert "timestamp" in message
            lines_count += 1

        # The demo file data/live_speech_demo.txt has exactly 25 lines
        assert lines_count == 25

def test_websocket_missing_file(tmp_path, monkeypatch):
    """
    Verifies that if the speech transcript file does not exist, the WebSocket
    sends an error message and closes the connection.
    """
    # Temporarily override the file path to a non-existent path
    non_existent_path = str(tmp_path / "missing_speech.txt")
    monkeypatch.setattr("app.api.websocket.SPEECH_FILE_PATH", non_existent_path)

    client = TestClient(app)
    with client.websocket_connect("/ws/live-speech") as websocket:
        message = websocket.receive_json()
        assert "error" in message
        assert "missing_speech.txt" in message["error"]
