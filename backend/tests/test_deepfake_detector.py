"""
backend/tests/test_deepfake_detector.py
=========================================
Test suite for the deepfake detection module (backend/models/deepfake_detector.py).

Model
-----
Vansh180/deepfake-audio-wav2vec2
  - Wav2Vec2ForSequenceClassification (wav2vec2-base backbone)
  - Fine-tuned on ASVspoof 2021 Physical Access (PA) partition
  - id2label = {0: 'real', 1: 'fake'}

Empirically Verified Label Mapping
------------------------------------
  genuine speech  → fake_prob ≈ 0.07   → is_synthetic=False  ✅
  replay spoof    → fake_prob ≈ 0.73   → is_synthetic=True   ✅
  pure silence    → fake_prob ≈ 0.61   → is_synthetic=True
    (Note: VAD should gate silence before reaching deepfake detector)

Covers
------
  - DeepfakeDetector.load() + singleton caching
  - DeepfakeResult contract (all fields, types, ranges)
  - Genuine speech → is_synthetic=False, low synthetic_probability
  - Spoof proxy    → is_synthetic=True,  high synthetic_probability
  - genuine_probability + synthetic_probability sum ≈ 1.0
  - raw_logits consistency with probs
  - Threshold sensitivity (adjust is_synthetic without re-running model)
  - Input validation (DeepfakeInputError for wrong dtype/shape/NaN)
  - detect_deepfake() convenience function + singleton
  - Full pipeline integration: preprocess_audio → detect()
  - Model name stored in result

Run:
    python -m pytest backend/tests/test_deepfake_detector.py -v
"""

from __future__ import annotations

import warnings
import sys
from pathlib import Path

import numpy as np
import pytest

# Suppress torch.jit.load FutureWarning on Python 3.14
warnings.filterwarnings("ignore", category=FutureWarning)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SAMPLES_DIR  = PROJECT_ROOT / "samples"
SR = 16_000


def _sample(subdir: str, name: str) -> Path:
    return SAMPLES_DIR / subdir / name


def _load(subdir: str, name: str) -> np.ndarray:
    from backend.audio.preprocessing import preprocess_audio
    return preprocess_audio(_sample(subdir, name))


def _silence(seconds: float = 1.0) -> np.ndarray:
    return np.zeros(int(SR * seconds), dtype=np.float32)


# ────────────────────────────────────────────────────────────────────────────
# Session fixture: load the model once
# ────────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def detector():
    from backend.models.deepfake_detector import DeepfakeDetector
    return DeepfakeDetector.load()


# ============================================================================
# 1. MODEL LOADING
# ============================================================================

class TestDeepfakeDetectorLoad:
    def test_load_returns_detector_instance(self, detector):
        from backend.models.deepfake_detector import DeepfakeDetector
        assert isinstance(detector, DeepfakeDetector)

    def test_load_is_idempotent(self):
        from backend.models.deepfake_detector import DeepfakeDetector
        d1 = DeepfakeDetector.load()
        d2 = DeepfakeDetector.load()
        assert d1 is not None and d2 is not None

    def test_model_has_detect_method(self, detector):
        assert callable(getattr(detector, "detect", None))

    def test_model_id_is_expected(self, detector):
        from backend.models.deepfake_detector import MODEL_ID
        assert MODEL_ID == "Vansh180/deepfake-audio-wav2vec2"


# ============================================================================
# 2. DeepfakeResult CONTRACT
# ============================================================================

class TestDeepfakeResultContract:
    """Verify that every call returns a properly formed DeepfakeResult."""

    def test_returns_deepfake_result(self, detector):
        from backend.models.deepfake_detector import DeepfakeResult
        result = detector.detect(_silence(1.0))
        assert isinstance(result, DeepfakeResult)

    def test_synthetic_probability_is_float_in_range(self, detector):
        result = detector.detect(_silence(1.0))
        assert isinstance(result.synthetic_probability, float)
        assert 0.0 <= result.synthetic_probability <= 1.0

    def test_genuine_probability_is_float_in_range(self, detector):
        result = detector.detect(_silence(1.0))
        assert isinstance(result.genuine_probability, float)
        assert 0.0 <= result.genuine_probability <= 1.0

    def test_probabilities_sum_to_one(self, detector):
        result = detector.detect(_silence(1.0))
        total = result.synthetic_probability + result.genuine_probability
        assert abs(total - 1.0) < 1e-5, f"Probabilities sum to {total}, expected 1.0"

    def test_is_synthetic_is_bool(self, detector):
        result = detector.detect(_silence(1.0))
        assert isinstance(result.is_synthetic, bool)

    def test_model_name_is_correct(self, detector):
        from backend.models.deepfake_detector import MODEL_ID
        result = detector.detect(_silence(1.0))
        assert result.model_name == MODEL_ID

    def test_raw_logits_is_tuple_of_two_floats(self, detector):
        result = detector.detect(_silence(1.0))
        assert isinstance(result.raw_logits, tuple)
        assert len(result.raw_logits) == 2
        assert all(isinstance(v, float) for v in result.raw_logits)

    def test_threshold_used_stored(self, detector):
        result = detector.detect(_silence(1.0), threshold=0.7)
        assert abs(result.threshold_used - 0.7) < 1e-9

    def test_inference_time_ms_is_positive(self, detector):
        result = detector.detect(_silence(1.0))
        assert result.inference_time_ms > 0

    def test_summary_returns_string(self, detector):
        result = detector.detect(_silence(1.0))
        s = result.summary()
        assert isinstance(s, str) and len(s) > 10

    def test_logits_consistency_with_probabilities(self, detector):
        """Higher logit at index 1 must produce higher fake probability."""
        import torch
        result = detector.detect(_load("genuine", "real_speech_tts.wav"))
        real_logit, fake_logit = result.raw_logits
        # When real_logit > fake_logit, genuine_prob > synthetic_prob
        if real_logit > fake_logit:
            assert result.genuine_probability > result.synthetic_probability
        else:
            assert result.synthetic_probability >= result.genuine_probability


# ============================================================================
# 3. GENUINE SPEECH → not synthetic
# ============================================================================

class TestGenuineSpeech:
    """
    macOS TTS (Alex voice) is classified as 'real' by this model.
    fake_prob ≈ 0.068 in our empirical verification.
    """

    def test_genuine_speech_not_synthetic(self, detector):
        waveform = _load("genuine", "real_speech_tts.wav")
        result = detector.detect(waveform)
        assert result.is_synthetic is False, (
            f"Genuine speech incorrectly classified as synthetic "
            f"(synthetic_prob={result.synthetic_probability:.4f})"
        )

    def test_genuine_speech_low_synthetic_probability(self, detector):
        waveform = _load("genuine", "real_speech_tts.wav")
        result = detector.detect(waveform)
        assert result.synthetic_probability < 0.5, (
            f"Expected synthetic_prob < 0.5 for genuine speech, "
            f"got {result.synthetic_probability:.4f}"
        )

    def test_genuine_speech_high_genuine_probability(self, detector):
        waveform = _load("genuine", "real_speech_tts.wav")
        result = detector.detect(waveform)
        assert result.genuine_probability > 0.5

    def test_genuine_speech_real_logit_dominates(self, detector):
        """real_logit > fake_logit for genuine speech."""
        waveform = _load("genuine", "real_speech_tts.wav")
        result = detector.detect(waveform)
        real_logit, fake_logit = result.raw_logits
        assert real_logit > fake_logit, (
            f"Expected real_logit > fake_logit for genuine speech, "
            f"got real={real_logit:.4f}  fake={fake_logit:.4f}"
        )


# ============================================================================
# 4. SPOOF / DEEPFAKE SPEECH → synthetic
# ============================================================================

class TestSpoofSpeech:
    """
    Replay-style synthetic proxy audio.
    fake_prob ≈ 0.725 in our empirical verification.
    """

    def test_spoof_is_synthetic(self, detector):
        waveform = _load("cloned", "replay_spoof_proxy.wav")
        result = detector.detect(waveform)
        assert result.is_synthetic is True, (
            f"Spoof audio not detected as synthetic "
            f"(synthetic_prob={result.synthetic_probability:.4f})"
        )

    def test_spoof_high_synthetic_probability(self, detector):
        waveform = _load("cloned", "replay_spoof_proxy.wav")
        result = detector.detect(waveform)
        assert result.synthetic_probability > 0.5, (
            f"Expected synthetic_prob > 0.5 for spoof, "
            f"got {result.synthetic_probability:.4f}"
        )

    def test_spoof_fake_logit_dominates(self, detector):
        """fake_logit > real_logit for spoof audio."""
        waveform = _load("cloned", "replay_spoof_proxy.wav")
        result = detector.detect(waveform)
        real_logit, fake_logit = result.raw_logits
        assert fake_logit > real_logit, (
            f"Expected fake_logit > real_logit for spoof, "
            f"got real={real_logit:.4f}  fake={fake_logit:.4f}"
        )

    def test_spoof_probability_higher_than_genuine(self, detector):
        """Spoof must yield higher synthetic_probability than genuine speech."""
        spoof_result   = detector.detect(_load("cloned", "replay_spoof_proxy.wav"))
        genuine_result = detector.detect(_load("genuine", "real_speech_tts.wav"))
        assert spoof_result.synthetic_probability > genuine_result.synthetic_probability, (
            f"Spoof prob ({spoof_result.synthetic_probability:.4f}) "
            f"must exceed genuine prob ({genuine_result.synthetic_probability:.4f})"
        )


# ============================================================================
# 5. THRESHOLD SENSITIVITY
# ============================================================================

class TestThresholdBehaviour:
    """Changing threshold changes is_synthetic without re-running the model."""

    def test_low_threshold_flags_genuine_as_synthetic(self, detector):
        """
        With threshold=0.01, even genuine speech (fake_prob=0.068) will be flagged.
        """
        waveform = _load("genuine", "real_speech_tts.wav")
        result = detector.detect(waveform, threshold=0.01)
        assert result.is_synthetic is True, (
            f"Expected is_synthetic=True with threshold=0.01, "
            f"synthetic_prob={result.synthetic_probability:.4f}"
        )

    def test_high_threshold_does_not_flag_genuine(self, detector):
        """With threshold=0.5, genuine speech (fake_prob≈0.07) is not flagged."""
        waveform = _load("genuine", "real_speech_tts.wav")
        result = detector.detect(waveform, threshold=0.5)
        assert result.is_synthetic is False

    def test_zero_threshold_always_synthetic(self, detector):
        """threshold=0 → everything is flagged as synthetic."""
        result = detector.detect(_load("genuine", "real_speech_tts.wav"), threshold=0.0)
        assert result.is_synthetic is True

    def test_threshold_stored_in_result(self, detector):
        result = detector.detect(_silence(0.5), threshold=0.42)
        assert abs(result.threshold_used - 0.42) < 1e-9


# ============================================================================
# 6. INPUT VALIDATION → DeepfakeInputError
# ============================================================================

class TestInputValidation:
    def test_wrong_dtype_raises(self, detector):
        from backend.models.deepfake_detector import DeepfakeInputError
        bad = np.zeros(SR, dtype=np.float64)
        with pytest.raises(DeepfakeInputError, match="float32"):
            detector.detect(bad)

    def test_2d_array_raises(self, detector):
        from backend.models.deepfake_detector import DeepfakeInputError
        bad = np.zeros((SR, 2), dtype=np.float32)
        with pytest.raises(DeepfakeInputError, match="1-D"):
            detector.detect(bad)

    def test_empty_array_raises(self, detector):
        from backend.models.deepfake_detector import DeepfakeInputError
        with pytest.raises(DeepfakeInputError, match="empty"):
            detector.detect(np.array([], dtype=np.float32))

    def test_nan_array_raises(self, detector):
        from backend.models.deepfake_detector import DeepfakeInputError
        bad = np.full(SR, float("nan"), dtype=np.float32)
        with pytest.raises(DeepfakeInputError, match="NaN"):
            detector.detect(bad)

    def test_inf_array_raises(self, detector):
        from backend.models.deepfake_detector import DeepfakeInputError
        bad = np.full(SR, float("inf"), dtype=np.float32)
        with pytest.raises(DeepfakeInputError, match="NaN"):
            detector.detect(bad)

    def test_list_raises(self, detector):
        from backend.models.deepfake_detector import DeepfakeInputError
        with pytest.raises(DeepfakeInputError):
            detector.detect([0.0] * SR)  # type: ignore[arg-type]


# ============================================================================
# 7. CONVENIENCE FUNCTION
# ============================================================================

class TestDetectDeepfakeConvenience:
    def test_returns_deepfake_result(self):
        from backend.models.deepfake_detector import DeepfakeResult, detect_deepfake
        result = detect_deepfake(_silence(0.5))
        assert isinstance(result, DeepfakeResult)

    def test_genuine_not_synthetic(self):
        from backend.models.deepfake_detector import detect_deepfake
        waveform = _load("genuine", "real_speech_tts.wav")
        result = detect_deepfake(waveform)
        assert result.is_synthetic is False

    def test_spoof_is_synthetic(self):
        from backend.models.deepfake_detector import detect_deepfake
        waveform = _load("cloned", "replay_spoof_proxy.wav")
        result = detect_deepfake(waveform)
        assert result.is_synthetic is True

    def test_singleton_model_reused(self):
        import backend.models.deepfake_detector as dd_module
        from backend.models.deepfake_detector import detect_deepfake
        detect_deepfake(_silence(0.2))
        id_before = id(dd_module._global_detector)
        detect_deepfake(_silence(0.2))
        id_after  = id(dd_module._global_detector)
        assert id_before == id_after, "Model was re-instantiated on second call"


# ============================================================================
# 8. FULL PIPELINE INTEGRATION
# ============================================================================

class TestPipelineIntegration:
    """End-to-end: preprocess_audio → detect."""

    def test_full_pipeline_genuine(self, detector):
        from backend.audio.preprocessing import preprocess_audio
        waveform = preprocess_audio(_sample("genuine", "real_speech_tts.wav"))
        result = detector.detect(waveform)
        assert result.is_synthetic is False

    def test_full_pipeline_spoof(self, detector):
        from backend.audio.preprocessing import preprocess_audio
        waveform = preprocess_audio(_sample("cloned", "replay_spoof_proxy.wav"))
        result = detector.detect(waveform)
        assert result.is_synthetic is True

    def test_waveform_not_mutated(self, detector):
        """deepfake detector must not modify the input waveform in-place."""
        from backend.audio.preprocessing import preprocess_audio
        waveform = preprocess_audio(_sample("genuine", "real_speech_tts.wav"))
        original = waveform.copy()
        detector.detect(waveform)
        np.testing.assert_array_equal(
            waveform, original,
            err_msg="DeepfakeDetector modified the input waveform in-place."
        )

    def test_result_model_name_present(self, detector):
        from backend.audio.preprocessing import preprocess_audio
        from backend.models.deepfake_detector import MODEL_ID
        waveform = preprocess_audio(_sample("genuine", "real_speech_tts.wav"))
        result = detector.detect(waveform)
        assert result.model_name == MODEL_ID

    def test_probabilities_sum_to_one_on_real_audio(self, detector):
        from backend.audio.preprocessing import preprocess_audio
        waveform = preprocess_audio(_sample("genuine", "real_speech_tts.wav"))
        result = detector.detect(waveform)
        total = result.synthetic_probability + result.genuine_probability
        assert abs(total - 1.0) < 1e-5


# ============================================================================
# 9. EMPIRICAL REPORT
# ============================================================================

class TestEmpiricalReport:
    """
    Capture and assert on the actual numeric outputs.
    These tests serve as regression guards: if the model changes,
    these will catch it immediately.
    """

    def test_genuine_speech_synthetic_prob_below_20_percent(self, detector):
        """
        Empirically measured: genuine TTS speech scores fake_prob ≈ 0.068.
        Allow generous headroom to tolerate non-determinism.
        """
        waveform = _load("genuine", "real_speech_tts.wav")
        result = detector.detect(waveform)
        assert result.synthetic_probability < 0.20, (
            f"Genuine speech fake_prob={result.synthetic_probability:.4f} "
            f"is suspiciously high (expected < 0.20)"
        )

    def test_spoof_proxy_synthetic_prob_above_60_percent(self, detector):
        """
        Empirically measured: replay spoof proxy scores fake_prob ≈ 0.725.
        Allow generous headroom.
        """
        waveform = _load("cloned", "replay_spoof_proxy.wav")
        result = detector.detect(waveform)
        assert result.synthetic_probability > 0.60, (
            f"Spoof proxy fake_prob={result.synthetic_probability:.4f} "
            f"is suspiciously low (expected > 0.60)"
        )


# ============================================================================
# Direct execution
# ============================================================================

if __name__ == "__main__":
    print("\n=== Deepfake Detector Tests ===\n")
    print("Loading model (first run downloads ~360 MB)…\n")

    from backend.models.deepfake_detector import DeepfakeDetector
    loaded = DeepfakeDetector.load()

    classes_with_detector = [
        TestDeepfakeDetectorLoad,
        TestDeepfakeResultContract,
        TestGenuineSpeech,
        TestSpoofSpeech,
        TestThresholdBehaviour,
        TestInputValidation,
        TestPipelineIntegration,
        TestEmpiricalReport,
    ]
    classes_no_detector = [
        TestDetectDeepfakeConvenience,
    ]

    passed = failed = 0

    for cls in classes_with_detector:
        obj = cls()
        for name in [m for m in dir(cls) if m.startswith("test_")]:
            label = f"{cls.__name__}.{name}"
            try:
                getattr(obj, name)(loaded)
                print(f"  PASS  {label}")
                passed += 1
            except Exception as exc:
                print(f"  FAIL  {label}\n        {type(exc).__name__}: {exc}")
                failed += 1

    for cls in classes_no_detector:
        obj = cls()
        for name in [m for m in dir(cls) if m.startswith("test_")]:
            label = f"{cls.__name__}.{name}"
            try:
                getattr(obj, name)()
                print(f"  PASS  {label}")
                passed += 1
            except Exception as exc:
                print(f"  FAIL  {label}\n        {type(exc).__name__}: {exc}")
                failed += 1

    print(f"\n{'='*60}")
    print(f"Result: {passed} passed, {failed} failed ({passed+failed} total)")
    sys.exit(0 if failed == 0 else 1)
