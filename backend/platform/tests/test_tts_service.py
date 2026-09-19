"""
backend/platform/tests/test_tts_service.py
==========================================
Unit tests for the Google Cloud Text-to-Speech Warning Module and REST endpoints.
"""

import pytest
from fastapi.testclient import TestClient

from backend.platform.server.app import app
from backend.platform.services.warning_tts_service import (
    LANGUAGE_CATALOG,
    WarningTTSService,
    normalize_language_code,
)


@pytest.fixture
def client():
    return TestClient(app)


def test_language_catalog_coverage():
    """Verify all 8 required Indian languages are present with full configuration."""
    expected_languages = [
        "en-IN",  # English
        "ta-IN",  # Tamil
        "hi-IN",  # Hindi
        "te-IN",  # Telugu
        "ml-IN",  # Malayalam
        "kn-IN",  # Kannada
        "bn-IN",  # Bengali
        "mr-IN",  # Marathi
    ]
    for lang in expected_languages:
        assert lang in LANGUAGE_CATALOG, f"Language {lang} missing from LANGUAGE_CATALOG"
        cfg = LANGUAGE_CATALOG[lang]
        assert cfg.code == lang
        assert cfg.name
        assert cfg.native_name
        assert cfg.preferred_voice
        assert len(cfg.critical_warning) > 20
        assert len(cfg.credential_warning) > 20
        assert len(cfg.high_risk_warning) > 20


def test_language_code_normalization():
    """Verify normalization of language codes and human names."""
    assert normalize_language_code("Tamil") == "ta-IN"
    assert normalize_language_code("tamil") == "ta-IN"
    assert normalize_language_code("ta") == "ta-IN"
    assert normalize_language_code("Hindi") == "hi-IN"
    assert normalize_language_code("English") == "en-IN"
    assert normalize_language_code("Telugu") == "te-IN"
    assert normalize_language_code("Malayalam") == "ml-IN"
    assert normalize_language_code("Kannada") == "kn-IN"
    assert normalize_language_code("Bengali") == "bn-IN"
    assert normalize_language_code("Marathi") == "mr-IN"
    # Unknown fallback
    assert normalize_language_code("unknown_xyz") == "en-IN"


def test_tts_service_synthesis():
    """Test synthesis returns valid audio base64, bytes, and metadata."""
    service = WarningTTSService.get_instance()
    for code in ["ta-IN", "hi-IN", "en-IN"]:
        res = service.synthesize_warning(language_code=code, event_type="CRITICAL")
        assert res["success"] is not False
        assert "audio_base64" in res
        assert len(res["audio_base64"]) > 100
        assert res["language_code"] == code
        assert len(res["text"]) > 10


def test_api_languages_endpoint(client):
    """Test GET /api/tts/languages returns 8 languages."""
    response = client.get("/api/tts/languages")
    assert response.status_code == 200
    langs = response.json()
    assert len(langs) == 8
    codes = [item["code"] for item in langs]
    assert "ta-IN" in codes
    assert "hi-IN" in codes
    assert "en-IN" in codes
    assert "te-IN" in codes
    assert "ml-IN" in codes
    assert "kn-IN" in codes
    assert "bn-IN" in codes
    assert "mr-IN" in codes


def test_api_generate_endpoint(client):
    """Test POST /api/tts/generate with Tamil and Hindi."""
    # Tamil
    res_ta = client.post(
        "/api/tts/generate",
        json={"language_code": "ta-IN", "event_type": "CRITICAL"},
    )
    assert res_ta.status_code == 200
    data_ta = res_ta.json()
    assert data_ta["success"] is True
    assert data_ta["language_code"] == "ta-IN"
    assert "பாதுகாப்பு" in data_ta["text"]
    assert len(data_ta["audio_base64"]) > 0

    # Hindi
    res_hi = client.post(
        "/api/tts/generate",
        json={"language_code": "hi-IN", "event_type": "CREDENTIAL_EXPOSURE"},
    )
    assert res_hi.status_code == 200
    data_hi = res_hi.json()
    assert data_hi["success"] is True
    assert data_hi["language_code"] == "hi-IN"
    assert "चेतावनी" in data_hi["text"]


def test_api_audio_stream_endpoint(client):
    """Test GET /api/tts/audio streams audio bytes with correct headers."""
    res = client.get("/api/tts/audio?lang=ta-IN&event=CRITICAL")
    assert res.status_code == 200
    assert len(res.content) > 100
    assert "audio/" in res.headers["content-type"]
    assert res.headers.get("X-Language-Code") == "ta-IN"


def test_language_change_updates_spoken_text_across_all_8_languages(client):
    """
    Test that changing the target user's language actually changes the spoken
    warning language text and voice code, not just UI labels.
    """
    service = WarningTTSService.get_instance()
    seen_scripts = set()
    all_languages = ["ta-IN", "hi-IN", "en-IN", "te-IN", "ml-IN", "kn-IN", "bn-IN", "mr-IN"]

    for code in all_languages:
        # Critical script
        crit_text = service.get_warning_text(code, "CRITICAL")
        assert crit_text
        assert crit_text not in seen_scripts, f"Language {code} returned duplicate script!"
        seen_scripts.add(crit_text)

        # Credential exposure script
        cred_text = service.get_warning_text(code, "CREDENTIAL_EXPOSURE")
        assert cred_text
        assert cred_text != crit_text, f"Language {code} credential script equals critical script!"

        # High risk script
        high_text = service.get_warning_text(code, "HIGH")
        assert high_text
        assert high_text != crit_text

        # Test API endpoint returns corresponding text and voice
        response = client.post("/api/tts/generate", json={"language_code": code, "event_type": "CRITICAL"})
        assert response.status_code == 200
        payload = response.json()
        assert payload["language_code"] == code
        assert payload["text"] == crit_text
        assert len(payload["audio_base64"]) > 0

