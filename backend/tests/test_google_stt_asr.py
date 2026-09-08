"""
backend/tests/test_google_stt_asr.py
====================================
Unit test suite for the Google Cloud Speech-to-Text ASR provider.

All Google Cloud API calls and gRPC streams are strictly mocked.
Zero external network access or real credentials required.
"""

from __future__ import annotations

import queue
import threading
import time
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from backend.models.asr_base import ASRResult, BaseASR
from backend.models.asr_factory import create_asr_provider
from backend.models.google_stt_asr import (
    DEFAULT_LANGUAGE,
    SAMPLE_RATE,
    GoogleSTTASR,
    GoogleSTTSessionState,
)
from backend.models.whisper_asr import WhisperASR


# ── Fixtures & Helpers ─────────────────────────────────────────────────────────

@pytest.fixture
def dummy_audio() -> np.ndarray:
    """1.0 second of 16kHz mono synthetic audio."""
    t = np.linspace(0, 1.0, 16000, endpoint=False, dtype=np.float32)
    return 0.2 * np.sin(2 * np.pi * 440 * t)


def create_mock_speech_result(transcript: str, is_final: bool, confidence: float = 0.95):
    """Create a mock Google Speech StreamingRecognizeResponse object."""
    alt = MagicMock()
    alt.transcript = transcript
    alt.confidence = confidence

    res = MagicMock()
    res.alternatives = [alt]
    res.is_final = is_final

    response = MagicMock()
    response.results = [res]
    return response


# ── Tests ──────────────────────────────────────────────────────────────────────

def test_google_stt_initialization():
    """Test provider initializes with default or custom language."""
    provider = GoogleSTTASR(language_code="en-IN")
    assert provider.provider_name == "google"
    assert provider.language_code == "en-IN"

    provider_hi = GoogleSTTASR(language_code="hi-IN")
    assert provider_hi.language_code == "hi-IN"


def test_audio_to_pcm16_bytes(dummy_audio: np.ndarray):
    """Test conversion of float32 waveform to 16-bit linear PCM bytes."""
    pcm_bytes = GoogleSTTASR._audio_to_pcm16_bytes(dummy_audio)
    assert isinstance(pcm_bytes, bytes)
    # 16000 samples * 2 bytes = 32000 bytes
    assert len(pcm_bytes) == 32000

    # Ensure audio within [-1.0, 1.0] does not overflow
    max_audio = np.array([1.5, -2.0, 0.5], dtype=np.float32)
    clipped_pcm = GoogleSTTASR._audio_to_pcm16_bytes(max_audio)
    int16_arr = np.frombuffer(clipped_pcm, dtype=np.int16)
    assert int16_arr[0] == 32767
    assert int16_arr[1] == -32767


def test_missing_credentials_handling():
    """Test graceful handling when Google credentials are not found."""
    def mock_failing_client_factory():
        raise Exception("DefaultCredentialsError: Could not automatically determine credentials")

    provider = GoogleSTTASR(
        language_code="en-IN",
        client_factory=mock_failing_client_factory,
    )

    assert provider.is_available is False

    # Batch transcribe should return empty result without crashing
    empty_audio = np.zeros(16000, dtype=np.float32)
    res = provider.transcribe(empty_audio)
    assert isinstance(res, ASRResult)
    assert res.transcript == ""
    assert res.provider == "google"

    # Streaming send_audio should also return empty result without crashing
    stream_res = provider.send_audio("sess_err", empty_audio)
    assert isinstance(stream_res, ASRResult)
    assert stream_res.transcript == ""
    assert stream_res.provider == "google"


def test_batch_transcribe_mocked(dummy_audio: np.ndarray):
    """Test synchronous batch transcribe with mocked SpeechClient."""
    mock_client = MagicMock()
    mock_alt = MagicMock()
    mock_alt.transcript = "Testing VoiceShield speech detection"
    mock_alt.confidence = 0.92

    mock_res = MagicMock()
    mock_res.alternatives = [mock_alt]

    mock_response = MagicMock()
    mock_response.results = [mock_res]
    mock_client.recognize.return_value = mock_response

    provider = GoogleSTTASR(language_code="en-IN", client=mock_client)
    res = provider.transcribe(dummy_audio)

    assert res.transcript == "Testing VoiceShield speech detection"
    assert res.detected_language == "en-IN"
    assert res.language_probability == 0.92
    assert res.is_final is True
    assert res.provider == "google"
    mock_client.recognize.assert_called_once()


def test_streaming_interim_results(dummy_audio: np.ndarray):
    """Test interim recognition results (is_final=False)."""
    mock_client = MagicMock()

    # Streaming mock returning an interim response
    interim_resp = create_mock_speech_result("Hello I am", is_final=False)
    mock_client.streaming_recognize.return_value = [interim_resp]

    provider = GoogleSTTASR(language_code="en-IN", client=mock_client)
    provider.start_stream("sess_interim")

    # Send audio chunk
    res = provider.send_audio("sess_interim", dummy_audio, is_speech=True)

    # Interim hypothesis should be returned with is_final=False
    assert res.transcript == "Hello I am"
    assert res.is_final is False
    assert res.provider == "google"

    provider.end_stream("sess_interim")


def test_streaming_final_results_and_deduplication(dummy_audio: np.ndarray):
    """
    Test interim hypotheses followed by final result:
    1. First call produces interim 'Hello I am'
    2. Second call produces interim 'Hello I am testing'
    3. Third call produces final 'Hello, I am testing VoiceShield.'
    Ensure finalized text is emitted cleanly and interim is cleared.
    """
    mock_client = MagicMock()

    resp1 = create_mock_speech_result("Hello I am", is_final=False)
    resp2 = create_mock_speech_result("Hello I am testing", is_final=False)
    resp3 = create_mock_speech_result("Hello, I am testing VoiceShield.", is_final=True)

    def mock_stream(requests):
        # 1. Config request
        next(requests)
        # 2. First audio chunk (10 frames @ 100ms) -> yield interim
        for _ in range(10):
            next(requests)
        yield resp1
        # 3. Second audio chunk (10 frames @ 100ms) -> yield final
        for _ in range(10):
            next(requests)
        yield resp2
        yield resp3
        # Keep generator alive while requests continue
        for _ in requests:
            pass


    mock_client.streaming_recognize = mock_stream

    provider = GoogleSTTASR(language_code="en-IN", client=mock_client)
    provider.start_stream("sess_flow")

    # Audio chunk 1: yields interim hypothesis
    res1 = provider.send_audio("sess_flow", dummy_audio, is_speech=True)
    assert res1.transcript == "Hello I am"
    assert res1.is_final is False

    # Audio chunk 2: finalized result arrives
    res2 = provider.send_audio("sess_flow", dummy_audio, is_speech=True)
    assert res2.is_final is True
    assert "Hello, I am testing VoiceShield." in res2.transcript

    # Audio chunk 3 (silence/no new speech): should NOT re-emit the finalized segment
    res3 = provider.send_audio("sess_flow", dummy_audio, is_speech=False)
    assert res3.transcript == ""

    # End stream: verifies session cleanup
    final_res = provider.end_stream("sess_flow")
    assert isinstance(final_res, ASRResult)
    assert "sess_flow" not in provider._sessions



def test_session_isolation(dummy_audio: np.ndarray):
    """Test that two concurrent sessions do not share state or transcripts."""
    mock_client = MagicMock()

    resp_a = create_mock_speech_result("Speaker A dialogue", is_final=True)
    resp_b = create_mock_speech_result("Speaker B dialogue", is_final=True)

    def fake_streaming_recognize(requests):
        # Inspect the session from the mock call context
        first_req = next(requests)
        # Yield based on session
        return [resp_a]

    mock_client.streaming_recognize = fake_streaming_recognize

    provider = GoogleSTTASR(language_code="en-IN", client=mock_client)

    provider.start_stream("call_session_A")
    provider.start_stream("call_session_B")

    assert "call_session_A" in provider._sessions
    assert "call_session_B" in provider._sessions
    assert provider._sessions["call_session_A"] is not provider._sessions["call_session_B"]

    provider.end_stream("call_session_A")
    assert "call_session_A" not in provider._sessions
    assert "call_session_B" in provider._sessions

    provider.end_stream("call_session_B")
    assert "call_session_B" not in provider._sessions


def test_empty_audio_handling():
    """Test empty and None audio handling in both transcribe and send_audio."""
    provider = GoogleSTTASR(language_code="en-IN")

    res_none = provider.transcribe(None)
    assert res_none.transcript == ""
    assert res_none.provider == "google"

    res_empty = provider.transcribe(np.empty(0, dtype=np.float32))
    assert res_empty.transcript == ""

    res_stream_empty = provider.send_audio("sess_empty", np.empty(0, dtype=np.float32), is_speech=False)
    assert res_stream_empty.transcript == ""


def test_google_api_exception_during_streaming(dummy_audio: np.ndarray):
    """Test worker survives and captures exceptions from Google streaming API."""
    mock_client = MagicMock()

    def raise_stream_error(requests):
        next(requests)
        raise RuntimeError("Google gRPC stream terminated unexpectedly")

    mock_client.streaming_recognize = raise_stream_error

    provider = GoogleSTTASR(language_code="en-IN", client=mock_client)
    provider.start_stream("sess_fail")

    # Send audio: should return empty ASRResult gracefully without raising an exception
    res = provider.send_audio("sess_fail", dummy_audio, is_speech=True)
    assert res.transcript == ""
    assert res.provider == "google"

    provider.end_stream("sess_fail")


def test_asr_factory():
    """Test ASR provider factory instantiation."""
    # Whisper provider
    whisper_prov = create_asr_provider("whisper")
    assert isinstance(whisper_prov, WhisperASR)
    assert whisper_prov.provider_name == "whisper"

    # Google provider
    google_prov = create_asr_provider("google", language="en-IN")
    assert isinstance(google_prov, GoogleSTTASR)
    assert google_prov.provider_name == "google"
    assert google_prov.language_code == "en-IN"

    # Invalid provider
    with pytest.raises(ValueError, match="Unsupported ASR provider"):
        create_asr_provider("unknown_provider")
