"""
backend/tests/test_whisper_asr.py
=================================
Unit test suite for the faster-whisper ASR module (backend/models/whisper_asr.py).

Verifies:
  1. Pretrained model loaded ONCE during initialization and reused.
  2. Configurable model size (tiny, base, etc.) with development default.
  3. Structured ASRResult with all required fields:
     - transcript
     - detected_language
     - language_probability
     - processing_time_ms
     - no_speech_probability
  4. Robust handling of edge cases:
     - empty audio
     - very short audio (<0.1s)
     - pure digital silence
     - silent speech audio
     - invalid inputs (dtype, dimension, sample rate)
  5. Deterministic transcription (temp=0.0)
  6. macOS CPU execution and MPS request fallback
  7. Real speech samples in samples/genuine/
"""

from __future__ import annotations

import logging
import time
from pathlib import Path

import numpy as np
import pytest

from backend.audio.preprocessing import preprocess_audio
from backend.models.whisper_asr import ASRResult, WhisperASR
from backend.utils.config import PipelineConfig

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SAMPLES_DIR = PROJECT_ROOT / "samples"
SR = 16_000


@pytest.fixture(scope="session")
def whisper_model() -> WhisperASR:
    """Load WhisperASR model once for the entire test session."""
    return WhisperASR(model_size_or_path="tiny", device="cpu", compute_type="int8")


# ─────────────────────────────────────────────────────────────────────────────
# 1. Model Loading & Lifecycle
# ─────────────────────────────────────────────────────────────────────────────

def test_model_loaded_once_and_reused(whisper_model: WhisperASR):
    """Whisper must be loaded ONCE and reused across calls without reload."""
    asr1 = WhisperASR(model_size_or_path="tiny", device="cpu", compute_type="int8")
    asr2 = WhisperASR(model_size_or_path="tiny", device="cpu", compute_type="int8")

    # Both instances must point to the identical CTranslate2 model in memory
    assert asr1.model is asr2.model
    assert whisper_model.model is asr1.model
    assert asr1.device == "cpu"
    assert asr1.model_loading_time_ms >= 0


def test_configurable_model_size_with_pipeline_config():
    """Verify WhisperASR respects PipelineConfig."""
    cfg = PipelineConfig(whisper_model_size="tiny", whisper_device="cpu", whisper_compute_type="int8")
    asr = WhisperASR(config=cfg)
    assert asr.model_size == "tiny"
    assert asr.device == "cpu"


def test_mps_device_fallback():
    """Requesting 'mps' device must fall back to CPU cleanly without breaking."""
    asr_mps = WhisperASR(model_size_or_path="tiny", device="mps", compute_type="int8")
    assert asr_mps.device == "cpu"


# ─────────────────────────────────────────────────────────────────────────────
# 2. Real Speech Audio Transcription
# ─────────────────────────────────────────────────────────────────────────────

def test_transcribe_genuine_speech_sample(whisper_model: WhisperASR):
    """
    Test with real speech from samples/genuine/speaker_a_test.wav.
    Verify transcript is meaningful and all fields are present.
    """
    audio_path = SAMPLES_DIR / "genuine" / "speaker_a_test.wav"
    assert audio_path.is_file(), f"Sample missing: {audio_path}"

    wav = preprocess_audio(audio_path)
    assert isinstance(wav, np.ndarray)
    assert wav.dtype == np.float32

    res = whisper_model.transcribe(wav)

    assert isinstance(res, ASRResult)
    assert len(res.transcript) > 0
    assert res.detected_language == "en"
    assert res.language_probability is not None and res.language_probability > 0.70
    assert res.processing_time_ms > 0
    assert res.no_speech_probability is not None and res.no_speech_probability < 0.20
    assert res.device == "cpu"

    lower = res.transcript.lower()
    assert any(k in lower for k in ["verify", "audio", "speaker", "reference", "belongs"])


def test_transcribe_tts_speech_sample(whisper_model: WhisperASR):
    """
    Test with another real speech sample from samples/genuine/real_speech_tts.wav.
    """
    audio_path = SAMPLES_DIR / "genuine" / "real_speech_tts.wav"
    assert audio_path.is_file(), f"Sample missing: {audio_path}"

    wav = preprocess_audio(audio_path)
    res = whisper_model.transcribe(wav)

    assert len(res.transcript) > 0
    assert res.detected_language == "en"
    assert "voice" in res.transcript.lower() or "speech" in res.transcript.lower()


# ─────────────────────────────────────────────────────────────────────────────
# 3. Edge Cases: Empty, Very Short, Silence, No Speech
# ─────────────────────────────────────────────────────────────────────────────

def test_empty_audio_handling(whisper_model: WhisperASR):
    """Empty numpy array must return empty result with no_speech_probability=1.0."""
    empty = np.array([], dtype=np.float32)
    res = whisper_model.transcribe(empty)

    assert res.transcript == ""
    assert res.detected_language == ""
    assert res.language_probability is None
    assert res.no_speech_probability == 1.0


def test_none_audio_handling(whisper_model: WhisperASR):
    """None input returns empty result safely."""
    res = whisper_model.transcribe(None)  # type: ignore
    assert res.transcript == ""
    assert res.no_speech_probability == 1.0


def test_very_short_audio_handling(whisper_model: WhisperASR):
    """Audio shorter than 0.1s (1600 samples) returns safely without exception."""
    short_wav = np.zeros(1000, dtype=np.float32)
    res = whisper_model.transcribe(short_wav)

    assert res.transcript == ""
    assert res.no_speech_probability == 1.0


def test_pure_digital_silence_handling(whisper_model: WhisperASR):
    """Pure digital silence (all zeros) skips inference quickly."""
    silence = np.zeros(SR * 2, dtype=np.float32)  # 2.0s zeros
    t0 = time.perf_counter()
    res = whisper_model.transcribe(silence)
    elapsed = (time.perf_counter() - t0) * 1000.0

    assert res.transcript == ""
    assert res.no_speech_probability == 1.0
    assert elapsed < 100.0  # Fast early return


def test_speech_silence_vad_gated(whisper_model: WhisperASR):
    """Background room noise without speech handled safely."""
    silence_file = SAMPLES_DIR / "genuine" / "silence_1s.wav"
    if silence_file.is_file():
        wav = preprocess_audio(silence_file)
        res = whisper_model.transcribe(wav, vad_filter=True)
        assert res.transcript == ""
        assert res.no_speech_probability == 1.0


# ─────────────────────────────────────────────────────────────────────────────
# 4. Input Validation & Error Handling
# ─────────────────────────────────────────────────────────────────────────────

def test_invalid_input_type_raises(whisper_model: WhisperASR):
    """Passing invalid object type raises TypeError."""
    with pytest.raises(TypeError, match="Audio input must be a numpy.ndarray"):
        whisper_model.transcribe([0.1, 0.2, 0.3])  # type: ignore


def test_wrong_sample_rate_raises(whisper_model: WhisperASR):
    """Sample rate not equal to 16,000 Hz raises ValueError."""
    wav = np.zeros(16000, dtype=np.float32)
    with pytest.raises(ValueError, match="16,000 Hz"):
        whisper_model.transcribe(wav, sample_rate=8000)


def test_multichannel_waveform_raises(whisper_model: WhisperASR):
    """Multichannel (stereo) array raises ValueError."""
    stereo = np.zeros((2, 16000), dtype=np.float32)
    with pytest.raises(ValueError, match="1-D mono"):
        whisper_model.transcribe(stereo)


def test_float64_auto_conversion(whisper_model: WhisperASR):
    """Float64 numpy waveform is automatically converted to float32."""
    wav64 = np.zeros(16000, dtype=np.float64)
    res = whisper_model.transcribe(wav64)
    assert isinstance(res, ASRResult)


# ─────────────────────────────────────────────────────────────────────────────
# 5. Determinism & Logging Verification
# ─────────────────────────────────────────────────────────────────────────────

def test_determinism(whisper_model: WhisperASR):
    """Repeated calls with same waveform produce identical transcripts."""
    audio_path = SAMPLES_DIR / "genuine" / "speaker_a_test.wav"
    wav = preprocess_audio(audio_path)

    res1 = whisper_model.transcribe(wav)
    res2 = whisper_model.transcribe(wav)

    assert res1.transcript == res2.transcript
    assert res1.detected_language == res2.detected_language
    assert res1.language_probability == res2.language_probability


def test_structured_logging(whisper_model: WhisperASR, caplog):
    """Verify that logging captures model loaded, device, time, and language."""
    caplog.set_level(logging.INFO)
    audio_path = SAMPLES_DIR / "genuine" / "speaker_a_test.wav"
    wav = preprocess_audio(audio_path)

    res = whisper_model.transcribe(wav)
    assert len(res.transcript) > 0

    log_text = caplog.text
    assert "Whisper transcription:" in log_text
    assert "detected_language=" in log_text
    assert "time=" in log_text


def test_summary_method(whisper_model: WhisperASR):
    """ASRResult.summary() outputs formatted string."""
    audio_path = SAMPLES_DIR / "genuine" / "speaker_a_test.wav"
    wav = preprocess_audio(audio_path)
    res = whisper_model.transcribe(wav)

    summary_str = res.summary()
    assert "[ASR]" in summary_str
    assert "lang=en" in summary_str
    assert "time=" in summary_str
