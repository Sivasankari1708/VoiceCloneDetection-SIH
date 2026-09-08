"""
tests/test_streaming_pipeline.py
---------------------------------
Unit tests for the StreamingAudioPipeline, StreamingSession, and temporal smoothing logic.
"""

from pathlib import Path
import numpy as np
import pytest
import torch

from backend.pipeline.streaming_pipeline import (
    SessionSummary,
    StreamingAudioPipeline,
    StreamingConfig,
    StreamingInferenceResult,
    StreamingSession,
)
from backend.schemas.inference_result import InferenceResult


# ─────────────────────────────────────────────────────────────────────────────
# StreamingSession Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_streaming_session_initialization():
    session = StreamingSession(session_id="test_sess_01")
    assert session.session_id == "test_sess_01"
    assert session.speaker_id is None
    assert session.reference_embedding is None
    assert session.total_chunks == 0
    assert session.audio_buffer.size == 0
    assert session.max_buffer_samples == 64000  # 4.0s * 16000
    assert session.is_active is True
    assert session.alert_triggered is False


def test_streaming_session_bounded_buffer():
    """Verify that audio_buffer strictly caps at 4.0s (64,000 samples)."""
    session = StreamingSession(session_id="test_sess_buf")
    chunk_1s = np.ones(16000, dtype=np.float32)

    # Append 1s -> 16000
    session.append_audio(chunk_1s)
    assert len(session.audio_buffer) == 16000

    # Append 3 more seconds -> 64000
    for _ in range(3):
        session.append_audio(chunk_1s)
    assert len(session.audio_buffer) == 64000

    # Append 2 more seconds -> still capped at exactly 64000 (rolling window)
    for _ in range(2):
        session.append_audio(chunk_1s * 2.0)
    assert len(session.audio_buffer) == 64000
    # Last samples should be the newest audio (2.0)
    assert session.audio_buffer[-1] == 2.0


def test_streaming_session_temporal_smoothing():
    """Verify EMA smoothing: S_t = alpha * X_t + (1 - alpha) * S_{t-1}."""
    config = StreamingConfig(smoothing_alpha=0.4, fast_alert_threshold=0.90)
    session = StreamingSession(session_id="test_sess_ema", config=config)

    # Chunk 1: raw = 0.20 -> smoothed = 0.20
    sm_synth, sm_sim, rtf, alert, _ = session.update_scores(
        raw_synthetic_prob=0.20,
        raw_speaker_sim=0.80,
        latency_ms=100.0,
        chunk_duration_ms=1000.0,
    )
    assert sm_synth == pytest.approx(0.20)
    assert sm_sim == pytest.approx(0.80)
    assert rtf == pytest.approx(0.10)
    assert alert is False

    # Chunk 2: raw = 0.50 -> smoothed = 0.4 * 0.50 + 0.6 * 0.20 = 0.20 + 0.12 = 0.32
    sm_synth, sm_sim, rtf, alert, _ = session.update_scores(
        raw_synthetic_prob=0.50,
        raw_speaker_sim=0.70,
        latency_ms=200.0,
        chunk_duration_ms=1000.0,
    )
    assert sm_synth == pytest.approx(0.32)
    # Speaker sim: 0.4 * 0.70 + 0.6 * 0.80 = 0.28 + 0.48 = 0.76
    assert sm_sim == pytest.approx(0.76)
    assert rtf == pytest.approx(0.20)
    assert alert is False


def test_streaming_session_fast_alert_escalation():
    """Verify that raw synthetic probability >= fast_alert_threshold raises immediate alert."""
    config = StreamingConfig(smoothing_alpha=0.4, fast_alert_threshold=0.85)
    session = StreamingSession(session_id="test_sess_alert", config=config)

    # Chunk 1: low synth
    session.update_scores(0.10, 0.90, 100.0, 1000.0)
    assert session.alert_triggered is False

    # Chunk 2: high synth >= 0.85 -> immediate alert!
    sm_synth, _, _, alert, reason = session.update_scores(0.92, 0.40, 150.0, 1000.0)
    assert alert is True
    assert session.alert_triggered is True
    assert reason is not None
    assert "CRITICAL" in reason
    # Fast alert bypasses smoothing lag
    assert sm_synth == pytest.approx(0.92)


def test_streaming_session_transcript_accumulation():
    session = StreamingSession(session_id="test_sess_trans")
    t1 = session.append_transcript("Hello world")
    assert t1 == "Hello world"

    t2 = session.append_transcript("this is a test")
    assert t2 == "Hello world this is a test"
    assert session.get_accumulated_transcript() == "Hello world this is a test"


def test_streaming_session_summary():
    session = StreamingSession(session_id="test_summary_sess", speaker_id="spk_test")
    session.update_scores(0.20, 0.85, 100.0, 1000.0)
    session.update_scores(0.30, 0.80, 200.0, 1000.0)
    session.update_scores(0.25, 0.82, 300.0, 1000.0)
    session.last_verdict = "genuine"

    summary = session.get_summary()
    assert summary.session_id == "test_summary_sess"
    assert summary.speaker_id == "spk_test"
    assert summary.total_chunks == 3
    assert summary.total_audio_seconds == pytest.approx(3.0)
    assert summary.mean_latency_ms == pytest.approx(200.0)
    assert summary.p50_latency_ms == pytest.approx(200.0)
    assert summary.final_verdict == "genuine"
    assert summary.mean_rtf == pytest.approx(0.20)


# ─────────────────────────────────────────────────────────────────────────────
# StreamingAudioPipeline Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_streaming_pipeline_session_lifecycle():
    pipeline = StreamingAudioPipeline()
    s1 = pipeline.start_session("sess_lifecycle_01", speaker_id="LA_0069")
    assert s1.session_id == "sess_lifecycle_01"

    # Retrieve session
    fetched = pipeline.get_session("sess_lifecycle_01")
    assert fetched is s1

    # End session
    summary = pipeline.end_session("sess_lifecycle_01")
    assert summary.session_id == "sess_lifecycle_01"
    assert pipeline.get_session("sess_lifecycle_01") is None


def test_streaming_pipeline_multi_session_isolation():
    """Verify concurrent sessions maintain separate audio buffers and metrics."""
    pipeline = StreamingAudioPipeline()
    s1 = pipeline.start_session("sess_iso_1", speaker_id="LA_0069")
    s2 = pipeline.start_session("sess_iso_2", speaker_id=None)

    s1.append_audio(np.ones(1000, dtype=np.float32))
    s2.append_audio(np.zeros(2000, dtype=np.float32))

    assert len(s1.get_audio_buffer()) == 1000
    assert len(s2.get_audio_buffer()) == 2000
    assert s1.speaker_id == "LA_0069"
    assert s2.speaker_id is None

    pipeline.end_session("sess_iso_1")
    pipeline.end_session("sess_iso_2")


def test_streaming_pipeline_silence_chunk_early_exit():
    """A 1-second pure silence chunk should early-exit via VAD in milliseconds."""
    pipeline = StreamingAudioPipeline()
    silence_chunk = np.zeros(16000, dtype=np.float32)

    res = pipeline.process_chunk(
        session_id="sess_silence_test",
        chunk_input=silence_chunk,
        chunk_id=1,
        chunk_duration_ms=1000.0,
    )

    assert isinstance(res, StreamingInferenceResult)
    assert res.speech_detected is False
    assert res.synthetic_probability is None
    assert res.speaker_similarity is None
    assert res.transcript == ""
    assert res.verdict == "inconclusive"
    assert res.deepfake is None
    assert res.speaker is None
    assert res.transcription is None
    assert res.real_time_factor >= 0.0
    # Early exit must be extremely fast (< 100ms)
    assert res.processing_time_ms < 100.0

    pipeline.end_session("sess_silence_test")


def test_streaming_pipeline_input_tensor_and_numpy():
    """Pipeline should accept both numpy array and torch.Tensor chunk inputs."""
    pipeline = StreamingAudioPipeline()
    silence_np = np.zeros(8000, dtype=np.float32)
    silence_tensor = torch.zeros((1, 8000), dtype=torch.float32)

    r_np = pipeline.process_chunk("sess_type_test", silence_np, chunk_id=1)
    r_t = pipeline.process_chunk("sess_type_test", silence_tensor, chunk_id=2)

    assert r_np.speech_detected is False
    assert r_t.speech_detected is False
    assert r_np.audio_meta.sample_rate == 16000
    assert r_t.audio_meta.sample_rate == 16000

    pipeline.end_session("sess_type_test")


def test_streaming_session_incremental_transcript_short_phrases():
    """Verify incremental speech accumulation, duplicate suppression, and short phrase handling."""
    session = StreamingSession(session_id="test_short_phrases")

    # Chunk 1: initial sentence
    c1 = session.append_incremental_transcript("Hello, I am testing the VoiceShield system")
    assert c1 == "Hello, I am testing the VoiceShield system"

    # Chunk 2: rolling window overlap
    c2 = session.append_incremental_transcript("testing the VoiceShield system with my real human voice")
    assert c2 == "with my real human voice"

    # Chunk 3: identical repeat in window -> must suppress duplicate
    c3 = session.append_incremental_transcript("with my real human voice")
    assert c3 == ""

    # Chunk 4: short phrases
    c4 = session.append_incremental_transcript("Please verify this call before continuing.")
    assert c4 == "Please verify this call before continuing."

    c5 = session.append_incremental_transcript("thank you")
    assert c5 == "thank you"

    c6 = session.append_incremental_transcript("bye")
    assert c6 == "bye"

    accumulated = session.get_accumulated_transcript()
    assert "Hello, I am testing the VoiceShield system" in accumulated
    assert "with my real human voice" in accumulated
    assert "Please verify this call before continuing." in accumulated
    assert "thank you" in accumulated
    assert "bye" in accumulated

