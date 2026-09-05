"""
tests/test_streaming_real_audio.py
-----------------------------------
Integration tests running the real-time chunked streaming pipeline
over actual ASVspoof 2019 LA audio files.

Covers:
  - Genuine speaker streaming (LA_0069 with test utterance LA_D_1403371.flac)
  - Imposter speaker streaming (LA_0070 test utterance against LA_0069)
  - Cloned audio streaming with Fast Alert (spoof utterance LA_D_1000265.flac)
  - Unenrolled speaker stream (inconclusive verdict)
  - RTF benchmark validation (processing faster than real-time)
"""

from pathlib import Path
import numpy as np
import pytest
import torch

from backend.audio.decoder import load_audio
from backend.pipeline.streaming_pipeline import (
    StreamingAudioPipeline,
    StreamingConfig,
)

DEV_FLAC_DIR = Path("data/asvspoof2019/LA/ASVspoof2019_LA_dev/flac")
ENROLL_1 = DEV_FLAC_DIR / "LA_D_1047731.flac"
ENROLL_2 = DEV_FLAC_DIR / "LA_D_1105538.flac"
ENROLL_3 = DEV_FLAC_DIR / "LA_D_1125976.flac"
GENUINE_FILE = DEV_FLAC_DIR / "LA_D_1403371.flac"   # LA_0069 bona fide
IMPOSTER_FILE = DEV_FLAC_DIR / "LA_D_1090286.flac"  # LA_0070 bona fide
SPOOF_FILE = DEV_FLAC_DIR / "LA_D_1000265.flac"     # spoof attack


@pytest.fixture(scope="module")
def streaming_pipeline():
    """Module-scoped pipeline sharing single model initialization."""
    pipeline = StreamingAudioPipeline()
    # Enroll LA_0069 for integration tests
    if ENROLL_1.exists() and ENROLL_2.exists() and ENROLL_3.exists():
        pipeline.pipeline.speaker_service.enroll_speaker(
            speaker_id="LA_0069",
            audio_samples=[ENROLL_1, ENROLL_2, ENROLL_3],
            min_samples=3,
        )
    return pipeline



def _chunk_waveform(file_path: Path, chunk_ms: int = 1000):
    wav_raw, sr = load_audio(str(file_path), target_sr=16000)
    if isinstance(wav_raw, torch.Tensor):
        waveform = wav_raw.detach().cpu().float().numpy()
    else:
        waveform = np.asarray(wav_raw, dtype=np.float32)
    if waveform.ndim > 1:
        waveform = np.squeeze(waveform)
    chunk_samples = int(16000 * (chunk_ms / 1000.0))
    chunks = []
    for i in range(0, len(waveform), chunk_samples):
        chunk = waveform[i: i + chunk_samples]
        if len(chunk) >= 160:  # ignore negligible trailing sliver (< 10ms)
            chunks.append(chunk)
    return chunks




def test_streaming_real_genuine_speaker(streaming_pipeline):
    """Stream genuine speaker chunks and verify verdict='genuine' and RTF < 1.0."""
    if not GENUINE_FILE.exists():
        pytest.skip(f"Audio file {GENUINE_FILE} not found.")

    session_id = "real_stream_genuine"
    chunks = _chunk_waveform(GENUINE_FILE, chunk_ms=1000)
    streaming_pipeline.start_session(session_id, speaker_id="LA_0069")

    results = []
    for idx, chunk in enumerate(chunks):
        res = streaming_pipeline.process_chunk(
            session_id=session_id,
            chunk_input=chunk,
            chunk_id=idx + 1,
            chunk_duration_ms=1000.0,
        )
        results.append(res)

    summary = streaming_pipeline.end_session(session_id)

    assert summary.total_chunks == len(chunks)
    assert summary.total_audio_seconds >= 3.0
    assert summary.total_speech_seconds > 0.0
    # Final verdict should be genuine
    assert summary.final_verdict == "genuine"
    assert summary.alert_triggered is False
    # Low synthetic probability (raw < 0.10, smoothed < 0.30)
    assert summary.latest_synthetic_probability < 0.10
    assert summary.latest_smoothed_synthetic_probability < 0.30
    # High speaker match (raw similarity >= 0.70)
    assert summary.latest_speaker_similarity >= 0.70
    # Real-Time Factor should be well under 1.0 (faster than real time)
    assert summary.mean_rtf < 1.0



def test_streaming_real_imposter_speaker(streaming_pipeline):
    """Stream imposter speech chunks against LA_0069 and verify verdict='imposter'."""
    if not IMPOSTER_FILE.exists():
        pytest.skip(f"Audio file {IMPOSTER_FILE} not found.")

    session_id = "real_stream_imposter"
    chunks = _chunk_waveform(IMPOSTER_FILE, chunk_ms=1000)
    streaming_pipeline.start_session(session_id, speaker_id="LA_0069")

    for idx, chunk in enumerate(chunks):
        streaming_pipeline.process_chunk(
            session_id=session_id,
            chunk_input=chunk,
            chunk_id=idx + 1,
            chunk_duration_ms=1000.0,
        )

    summary = streaming_pipeline.end_session(session_id)

    assert summary.total_chunks == len(chunks)
    # Imposter should be recognized by low speaker similarity (< 0.70)
    assert summary.latest_smoothed_speaker_similarity < 0.70
    assert summary.final_verdict == "imposter"
    assert summary.alert_triggered is False


def test_streaming_real_cloned_audio_fast_alert(streaming_pipeline):
    """Stream spoof speech and verify fast alert escalation and verdict='cloned'."""
    if not SPOOF_FILE.exists():
        pytest.skip(f"Audio file {SPOOF_FILE} not found.")

    session_id = "real_stream_clone"
    chunks = _chunk_waveform(SPOOF_FILE, chunk_ms=1000)
    streaming_pipeline.start_session(session_id, speaker_id="LA_0069")

    alert_seen = False
    for idx, chunk in enumerate(chunks):
        res = streaming_pipeline.process_chunk(
            session_id=session_id,
            chunk_input=chunk,
            chunk_id=idx + 1,
            chunk_duration_ms=1000.0,
        )
        if res.is_alert:
            alert_seen = True

    summary = streaming_pipeline.end_session(session_id)

    assert alert_seen is True
    assert summary.alert_triggered is True
    assert summary.final_verdict == "cloned"
    assert summary.latest_smoothed_synthetic_probability >= 0.85


def test_streaming_real_unenrolled_speaker(streaming_pipeline):
    """Stream audio without an enrolled speaker profile -> inconclusive verdict."""
    if not GENUINE_FILE.exists():
        pytest.skip(f"Audio file {GENUINE_FILE} not found.")

    session_id = "real_stream_unenrolled"
    chunks = _chunk_waveform(GENUINE_FILE, chunk_ms=1000)
    streaming_pipeline.start_session(session_id, speaker_id=None)

    for idx, chunk in enumerate(chunks):
        streaming_pipeline.process_chunk(
            session_id=session_id,
            chunk_input=chunk,
            chunk_id=idx + 1,
            chunk_duration_ms=1000.0,
        )

    summary = streaming_pipeline.end_session(session_id)

    assert summary.final_verdict == "inconclusive"
    assert summary.latest_speaker_similarity is None
