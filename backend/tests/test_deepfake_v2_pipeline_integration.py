"""
backend/tests/test_deepfake_v2_pipeline_integration.py
======================================================
Integration tests for DeepfakeCNN v2 trained checkpoint and audio pipeline.

Validates:
  1. Checkpoint file exists at checkpoints/deepfake_v2_asvspoof2019_la.pt.
  2. Checkpoint loads cleanly into DeepfakeV2Detector.
  3. Checkpoint metadata is valid (epoch, Val EER, ROC-AUC).
  4. Model is not random — achieves high confidence discrimination on real samples.
  5. Inference probabilities are strictly in [0, 1] and sum to 1.
  6. Inference is deterministic (identical outputs for identical inputs).
  7. Stereo audio is automatically handled (downmixed to mono).
  8. Non-16-kHz audio is handled / resampled cleanly.
  9. Short audio (< 4.0s) is automatically padded/tiled.
 10. Invalid/empty audio fails gracefully with ValueError.
 11. process_audio(audio_chunk, session_id) end-to-end integration works.
 12. Missing checkpoint path strictly raises FileNotFoundError (no silent fallback).
"""

from pathlib import Path
import numpy as np
import pytest
import torch

from backend.audio.decoder import load_audio
from backend.models.deepfake_v2.inference import DeepfakeV2Detector, DeepfakeV2Result
from backend.pipeline.inference_pipeline import InferencePipeline, process_audio
from backend.schemas.inference_result import InferenceResult

CHECKPOINT_PATH = Path("checkpoints/deepfake_v2_asvspoof2019_la.pt")
DEV_FLAC_DIR = Path("data/asvspoof2019/LA/ASVspoof2019_LA_dev/flac")
SAMPLE_BONAFIDE = DEV_FLAC_DIR / "LA_D_1047731.flac"
SAMPLE_SPOOF = DEV_FLAC_DIR / "LA_D_1000265.flac"


# 1. Checkpoint existence
def test_checkpoint_exists():
    """Verify that the trained ASVspoof 2019 LA checkpoint file exists and is non-empty."""
    assert CHECKPOINT_PATH.exists(), f"Missing production checkpoint: {CHECKPOINT_PATH}"
    size_mb = CHECKPOINT_PATH.stat().st_size / (1024 * 1024)
    assert size_mb > 5.0, f"Checkpoint size ({size_mb:.2f} MB) is smaller than expected (~6.7 MB)"


# 2. Checkpoint loading
def test_checkpoint_loads():
    """Verify that DeepfakeV2Detector successfully loads the checkpoint."""
    detector = DeepfakeV2Detector(checkpoint_path=str(CHECKPOINT_PATH), device="cpu")
    assert detector.model is not None
    assert not detector.model.training, "Model must be in eval mode"


# 3. Checkpoint metadata verification
def test_checkpoint_metadata_loads():
    """Verify stored checkpoint metadata reflects the audited best model."""
    detector = DeepfakeV2Detector(checkpoint_path=str(CHECKPOINT_PATH), device="cpu")
    assert detector.epoch == 7
    assert detector.model_name == "DeepfakeCNN-v2-ASVspoof2019_LA"
    assert "eer" in detector.metadata or "val_eer" in detector.metadata
    assert detector.val_eer is not None
    assert detector.val_eer < 1.5  # Val EER was 0.975%
    assert detector.val_roc_auc is not None
    assert detector.val_roc_auc > 99.0  # Val ROC-AUC was 99.94%


# 4. Model is not random: high confidence discrimination on real samples
def test_model_is_not_random_on_real_samples():
    """
    Verify model correctly classifies real ASVspoof 2019 LA samples with high confidence,
    confirming it is not an untrained random model.
    """
    if not SAMPLE_BONAFIDE.exists() or not SAMPLE_SPOOF.exists():
        pytest.skip("ASVspoof 2019 LA dev sample files not found locally.")

    detector = DeepfakeV2Detector(checkpoint_path=str(CHECKPOINT_PATH), device="cpu")

    # Bonafide sample
    wav_bona, sr_bona = load_audio(SAMPLE_BONAFIDE)
    res_bona = detector.detect(wav_bona, sample_rate=sr_bona)
    assert res_bona.genuine_probability > 0.85, (
        f"Expected high genuine confidence for bona fide sample, got {res_bona.genuine_probability:.4f}"
    )
    assert not res_bona.is_synthetic

    # Spoof sample
    wav_spoof, sr_spoof = load_audio(SAMPLE_SPOOF)
    res_spoof = detector.detect(wav_spoof, sample_rate=sr_spoof)
    assert res_spoof.synthetic_probability > 0.85, (
        f"Expected high synthetic confidence for spoof sample, got {res_spoof.synthetic_probability:.4f}"
    )
    assert res_spoof.is_synthetic


# 5. Probabilities strictly bounded in [0, 1]
def test_inference_returns_probability_in_range():
    """Verify synthetic and genuine probabilities are always in [0, 1] and sum to 1.0."""
    detector = DeepfakeV2Detector(checkpoint_path=str(CHECKPOINT_PATH), device="cpu")
    # Test with varying lengths
    for num_samples in [8000, 16000, 32000, 64000, 96000]:
        wav = np.sin(np.linspace(0, 100 * np.pi, num_samples)).astype(np.float32)
        res = detector.detect(wav)
        assert 0.0 <= res.synthetic_probability <= 1.0
        assert 0.0 <= res.genuine_probability <= 1.0
        assert abs((res.synthetic_probability + res.genuine_probability) - 1.0) < 1e-5


# 6. Deterministic inference
def test_deterministic_inference():
    """Verify that identical input waveforms produce identical probabilities."""
    detector = DeepfakeV2Detector(checkpoint_path=str(CHECKPOINT_PATH), device="cpu")
    wav = np.random.RandomState(42).randn(32000).astype(np.float32)
    res1 = detector.detect(wav)
    res2 = detector.detect(wav)
    assert abs(res1.synthetic_probability - res2.synthetic_probability) < 1e-6
    assert abs(res1.genuine_probability - res2.genuine_probability) < 1e-6


# 7. Stereo audio handling
def test_stereo_audio_handling():
    """Verify 2-channel stereo audio is automatically downmixed to mono."""
    detector = DeepfakeV2Detector(checkpoint_path=str(CHECKPOINT_PATH), device="cpu")
    stereo_wav = np.random.randn(2, 32000).astype(np.float32)
    res = detector.detect(stereo_wav, auto_mono=True)
    assert isinstance(res, DeepfakeV2Result)
    assert 0.0 <= res.synthetic_probability <= 1.0


# 8. Non-16kHz resampling
def test_non_16khz_audio_resampling():
    """Verify audio at 44.1 kHz is resampled to 16 kHz without error."""
    detector = DeepfakeV2Detector(checkpoint_path=str(CHECKPOINT_PATH), device="cpu")
    # 2 seconds at 44100 Hz
    wav_44k = np.random.randn(88200).astype(np.float32)
    res = detector.detect(wav_44k, sample_rate=44100, auto_resample=True)
    assert isinstance(res, DeepfakeV2Result)
    assert 0.0 <= res.synthetic_probability <= 1.0


# 9. Short audio tiling
def test_short_audio_tiled():
    """Verify audio shorter than 4.0s (e.g. 0.5s = 8000 samples) is tiled and processed."""
    detector = DeepfakeV2Detector(checkpoint_path=str(CHECKPOINT_PATH), device="cpu")
    short_wav = np.random.randn(8000).astype(np.float32)
    res = detector.detect(short_wav)
    assert isinstance(res, DeepfakeV2Result)
    assert 0.0 <= res.synthetic_probability <= 1.0


# 10. Invalid/empty audio fails gracefully
def test_invalid_empty_audio_fails_gracefully():
    """Verify empty or zero-length audio raises ValueError and None raises ValueError."""
    detector = DeepfakeV2Detector(checkpoint_path=str(CHECKPOINT_PATH), device="cpu")
    with pytest.raises(ValueError, match="Waveform cannot be empty"):
        detector.detect(np.array([], dtype=np.float32))

    with pytest.raises(ValueError, match="Waveform cannot be None"):
        detector.detect(None)


# 11. Full pipeline process_audio integration
def test_process_audio_full_pipeline():
    """
    Verify process_audio(audio_chunk, session_id) integration with 2 positional arguments,
    using the trained DeepfakeCNN v2 checkpoint.
    """
    # Create speech-like audio (at least 1s of tone/noise to trigger VAD)
    duration_sec = 2.0
    sr = 16000
    t = np.linspace(0, duration_sec, int(sr * duration_sec), endpoint=False)
    # Fundamental voice frequency around 200 Hz with harmonics
    voice_like = 0.5 * np.sin(2 * np.pi * 200 * t) + 0.3 * np.sin(2 * np.pi * 400 * t)
    audio_chunk = voice_like.astype(np.float32)

    session_id = "test-session-integration-001"
    result = process_audio(audio_chunk, session_id)

    assert isinstance(result, InferenceResult)
    assert result.session_id == session_id
    assert result.chunk_id == "0"
    assert result.error is None
    # Check that synthetic_probability is populated if speech was detected
    if result.speech_detected:
        assert result.synthetic_probability is not None
        assert 0.0 <= result.synthetic_probability <= 1.0
        assert result.deepfake is not None
        assert result.deepfake.model_name == "DeepfakeCNN-v2-ASVspoof2019_LA"


# 12. Missing checkpoint raises FileNotFoundError
def test_missing_checkpoint_raises_file_not_found():
    """Verify that a non-existent checkpoint path strictly raises FileNotFoundError."""
    non_existent = "checkpoints/non_existent_model_checkpoint.pt"
    with pytest.raises(FileNotFoundError, match="Deepfake checkpoint not found"):
        DeepfakeV2Detector(checkpoint_path=non_existent, allow_uninitialized=False)
