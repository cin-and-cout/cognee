from fastapi.testclient import TestClient

from app.main import app


def test_dashboard_root():
    """
    Verifies that the root path renders the dashboard HTML template successfully.
    """
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    assert "Claim Consistency Tracker" in response.text
    assert "Live Speech Transcript" in response.text
    assert "delay-slider" in response.text


def test_static_files():
    """
    Verifies that the static files (CSS and JS) are successfully served.
    """
    client = TestClient(app)

    # Check CSS
    css_response = client.get("/static/style.css")
    assert css_response.status_code == 200
    assert "Outfit" in css_response.text

    # Check JS
    js_response = client.get("/static/main.js")
    assert js_response.status_code == 200
    assert "totalSentences" in js_response.text
