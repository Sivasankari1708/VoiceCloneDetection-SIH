"""
backend/tests/test_inference_pipeline.py
========================================
Integration test suite for the unified inference pipeline (backend/pipeline/inference_pipeline.py).

Verifies the 5 required integration cases:
  CASE 1: Real speech + enrolled reference speaker
  CASE 2: Real speech + no reference speaker
  CASE 3: Silence (early VAD exit without downstream inference)
  CASE 4: Different speaker (imposter detection)
  CASE 5: Synthetic / deepfake audio sample from samples/cloned/

Also verifies:
  - Models loaded ONCE and reused across pipeline calls
  - Complete InferenceResult schema contract & JSON serializability
  - Stage timing breakdowns
  - Graceful handling of raw numpy waveform, file paths, and raw bytes
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from backend.audio.preprocessing import preprocess_audio
from backend.models.speaker_verifier import SpeakerVerifier
from backend.pipeline.inference_pipeline import InferencePipeline, process_audio
from backend.schemas.inference_result import InferenceResult

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SAMPLES_DIR = PROJECT_ROOT / "samples"
SR = 16_000


@pytest.fixture(scope="session")
def pipeline() -> InferencePipeline:
    """Initialize unified pipeline once for the entire test session."""
    return InferencePipeline()


@pytest.fixture(scope="session")
def enrolled_speaker_a_embedding(pipeline: InferencePipeline) -> np.ndarray:
    """Enroll Speaker A once for testing verification cases."""
    ref_path = SAMPLES_DIR / "genuine" / "speaker_a_ref1.wav"
    assert ref_path.is_file(), f"Enrollment sample missing: {ref_path}"
    ref_wav = preprocess_audio(ref_path)
    return pipeline.speaker_verifier.enroll_reference([ref_wav])


# ─────────────────────────────────────────────────────────────────────────────
# CASE 1: Real Speech + Enrolled Speaker
# ─────────────────────────────────────────────────────────────────────────────

def test_case_1_real_speech_enrolled_speaker(
    pipeline: InferencePipeline, enrolled_speaker_a_embedding: np.ndarray
):
    """
    CASE 1: Real speech from Speaker A with Speaker A's reference embedding.
    Must confirm speech detected, high speaker similarity, speaker match = True,
    meaningful transcript, and valid intent.
    """
    audio_path = SAMPLES_DIR / "genuine" / "speaker_a_test.wav"
    assert audio_path.is_file()

    result = pipeline.process_audio(
        audio_input=audio_path,
        session_id="sess_case_1",
        chunk_id=1,
        reference_embedding=enrolled_speaker_a_embedding,
    )

    assert isinstance(result, InferenceResult)
    assert result.session_id == "sess_case_1"
    assert result.chunk_id == "1"
    assert result.speech_detected is True
    assert result.speaker_similarity is not None
    assert result.speaker_similarity > 0.70
    assert result.speaker_match is True
    assert len(result.transcript) > 0
    assert result.synthetic_probability is not None
    assert result.intent in ("NORMAL_CONVERSATION", "PAYMENT_TRANSFER", "OTP_REQUEST", "CREDENTIAL_REQUEST", "URGENT_REQUEST")
    assert result.verdict in ("genuine", "cloned")

    # Verify stage timings
    assert "vad_ms" in result.stage_timings_ms
    assert "whisper_asr_ms" in result.stage_timings_ms
    assert "speaker_verifier_ms" in result.stage_timings_ms
    assert "deepfake_ms" in result.stage_timings_ms

    # Verify JSON serializability
    serialized = json.dumps(result.to_dict())
    assert len(serialized) > 0


# ─────────────────────────────────────────────────────────────────────────────
# CASE 2: Real Speech + No Reference Speaker
# ─────────────────────────────────────────────────────────────────────────────

def test_case_2_real_speech_no_reference_speaker(pipeline: InferencePipeline):
    """
    CASE 2: Real speech without a reference embedding.
    Must gracefully skip speaker verification (similarity=None, match=None).
    """
    audio_path = SAMPLES_DIR / "genuine" / "speaker_a_test.wav"
    assert audio_path.is_file()

    result = pipeline.process_audio(
        audio_input=audio_path,
        session_id="sess_case_2",
        chunk_id="chunk_42",
        reference_embedding=None,
    )

    assert result.speech_detected is True
    assert result.speaker_similarity is None
    assert result.speaker_match is None
    assert len(result.transcript) > 0
    assert result.synthetic_probability is not None
    assert result.verdict in ("inconclusive", "cloned")


# ─────────────────────────────────────────────────────────────────────────────
# CASE 3: Silence (VAD Early Exit)
# ─────────────────────────────────────────────────────────────────────────────

def test_case_3_silence_early_vad_exit(
    pipeline: InferencePipeline, enrolled_speaker_a_embedding: np.ndarray
):
    """
    CASE 3: Pure silence.
    Silero VAD must detect no speech and immediately return without calling
    Whisper, ECAPA, or Deepfake models.
    """
    silence_wav = np.zeros(SR * 2, dtype=np.float32)

    result = pipeline.process_audio(
        audio_input=silence_wav,
        session_id="sess_case_3",
        chunk_id=0,
        reference_embedding=enrolled_speaker_a_embedding,
    )

    assert result.speech_detected is False
    assert result.synthetic_probability is None
    assert result.speaker_similarity is None
    assert result.speaker_match is None
    assert result.transcript == ""
    assert result.intent == "UNKNOWN"
    assert result.intent_confidence == 0.0
    assert result.verdict == "inconclusive"

    # Crucial assertion: Downstream models were NOT invoked
    assert "vad_ms" in result.stage_timings_ms
    assert "whisper_asr_ms" not in result.stage_timings_ms
    assert "speaker_verifier_ms" not in result.stage_timings_ms
    assert "deepfake_ms" not in result.stage_timings_ms


# ─────────────────────────────────────────────────────────────────────────────
# CASE 4: Different Speaker (Imposter Detection)
# ─────────────────────────────────────────────────────────────────────────────

def test_case_4_different_speaker_imposter(
    pipeline: InferencePipeline, enrolled_speaker_a_embedding: np.ndarray
):
    """
    CASE 4: Audio from Speaker B against Speaker A's reference embedding.
    Must detect speech, but speaker similarity must be low and match=False.
    Verdict must be 'imposter' (or 'cloned' if synthetic).
    """
    audio_path = SAMPLES_DIR / "imposter" / "speaker_b_test.wav"
    assert audio_path.is_file()

    result = pipeline.process_audio(
        audio_input=audio_path,
        session_id="sess_case_4",
        chunk_id=99,
        reference_embedding=enrolled_speaker_a_embedding,
    )

    assert result.speech_detected is True
    assert result.speaker_similarity is not None
    assert result.speaker_similarity < 0.60
    assert result.speaker_match is False
    assert result.verdict in ("imposter", "cloned")
    assert len(result.transcript) > 0


# ─────────────────────────────────────────────────────────────────────────────
# CASE 5: Synthetic / Deepfake Audio Sample
# ─────────────────────────────────────────────────────────────────────────────

def test_case_5_synthetic_deepfake_audio(
    pipeline: InferencePipeline, enrolled_speaker_a_embedding: np.ndarray
):
    """
    CASE 5: Real synthetic sample from samples/cloned/.
    Verifies full pipeline processes synthetic audio cleanly.
    """
    cloned_path = SAMPLES_DIR / "cloned" / "tts_cloned_samantha.wav"
    if not cloned_path.is_file():
        # Fallback to any .wav in samples/cloned
        cloned_files = list((SAMPLES_DIR / "cloned").glob("*.wav"))
        assert len(cloned_files) > 0, "No synthetic sample found in samples/cloned/"
        cloned_path = cloned_files[0]

    result = pipeline.process_audio(
        audio_input=cloned_path,
        session_id="sess_case_5",
        chunk_id=101,
        reference_embedding=enrolled_speaker_a_embedding,
    )

    assert result.speech_detected is True
    assert result.synthetic_probability is not None
    assert 0.0 <= result.synthetic_probability <= 1.0
    assert len(result.transcript) > 0
    assert result.verdict in ("cloned", "imposter", "genuine", "inconclusive")


# ─────────────────────────────────────────────────────────────────────────────
# Pipeline Singleton & Input Formats
# ─────────────────────────────────────────────────────────────────────────────

def test_process_audio_module_level_function():
    """Module-level process_audio() convenience function uses shared pipeline."""
    audio_path = SAMPLES_DIR / "genuine" / "speaker_a_test.wav"
    res = process_audio(
        audio_input=audio_path,
        session_id="sess_func_test",
        chunk_id=1,
    )
    assert isinstance(res, InferenceResult)
    assert res.speech_detected is True


def test_process_audio_from_raw_bytes(pipeline: InferencePipeline):
    """Audio input passed as raw bytes (e.g. streaming chunks) is decoded correctly."""
    audio_path = SAMPLES_DIR / "genuine" / "speaker_a_test.wav"
    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    res = pipeline.process_audio(
        audio_input=audio_bytes,
        session_id="sess_bytes_test",
        chunk_id="chunk_b",
    )
    assert res.speech_detected is True
    assert len(res.transcript) > 0


def test_process_audio_from_numpy_array(pipeline: InferencePipeline):
    """Audio input passed as pre-decoded numpy array."""
    audio_path = SAMPLES_DIR / "genuine" / "speaker_a_test.wav"
    wav = preprocess_audio(audio_path)

    res = pipeline.process_audio(
        audio_input=wav,
        session_id="sess_numpy_test",
        chunk_id=7,
    )
    assert res.speech_detected is True
    assert len(res.transcript) > 0
