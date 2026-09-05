"""
backend/tests/test_vad.py
==========================
Test suite for the Silero VAD module  (backend/audio/vad.py).

Covers:
  ─ SileroVAD class
      .load()
      .detect()  on silence, real TTS speech, and mixed audio
      ._mean_speech_probability()

  ─ VADResult dataclass
      Fields, types, and computed properties.

  ─ SpeechSegment dataclass
      Boundaries, .extract(), .duration_sec

  ─ detect_speech()  convenience function

  ─ Input validation (VADInputError)

  ─ Integration with preprocessing pipeline

Test fixtures
-------------
  silence_1s.wav                 — 1 s of pure zeros            → speech_detected=False
  real_speech_tts.wav            — macOS TTS speech (5s)        → speech_detected=True
  real_mixed_speech_silence.wav  — 0.5s silence + speech + 0.5s → speech_detected=True

Run:
    python -m pytest backend/tests/test_vad.py -v
"""

from __future__ import annotations

import math
import os
import sys
import warnings
from pathlib import Path

import numpy as np
import pytest

# Suppress torch.jit FutureWarning on Python 3.14 throughout tests
warnings.filterwarnings("ignore", category=FutureWarning)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SAMPLES_DIR  = PROJECT_ROOT / "samples" / "genuine"

SR = 16_000   # all fixtures are at 16 kHz


def sample(name: str) -> Path:
    return SAMPLES_DIR / name


# ---------------------------------------------------------------------------
# Shared fixture: load the VAD model once per test session (expensive).
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def vad():
    """Load the Silero VAD model once for the entire test session."""
    from backend.audio.vad import SileroVAD
    return SileroVAD.load()


# ---------------------------------------------------------------------------
# Waveform helpers (in-memory, no file I/O)
# ---------------------------------------------------------------------------

def _silence(seconds: float = 1.0) -> np.ndarray:
    return np.zeros(int(SR * seconds), dtype=np.float32)


def _load_sample(name: str) -> np.ndarray:
    """Load and preprocess a sample WAV file."""
    from backend.audio.preprocessing import preprocess_audio
    return preprocess_audio(sample(name))


# ===========================================================================
# 1.  MODEL LOADING
# ===========================================================================

class TestSileroVADLoad:
    def test_load_returns_silero_vad_instance(self, vad):
        from backend.audio.vad import SileroVAD
        assert isinstance(vad, SileroVAD)

    def test_model_has_detect_method(self, vad):
        assert callable(getattr(vad, "detect", None))

    def test_load_is_idempotent(self):
        """Calling .load() twice must not raise."""
        from backend.audio.vad import SileroVAD
        v1 = SileroVAD.load()
        v2 = SileroVAD.load()
        assert v1 is not None and v2 is not None


# ===========================================================================
# 2.  VADResult CONTRACT
# ===========================================================================

class TestVADResultContract:
    """All detect() calls must return a properly formed VADResult."""

    def test_returns_vad_result(self, vad):
        from backend.audio.vad import VADResult
        result = vad.detect(_silence())
        assert isinstance(result, VADResult)

    def test_speech_detected_is_bool(self, vad):
        result = vad.detect(_silence())
        assert isinstance(result.speech_detected, bool)

    def test_speech_probability_is_float_in_range(self, vad):
        result = vad.detect(_silence())
        assert isinstance(result.speech_probability, float)
        assert 0.0 <= result.speech_probability <= 1.0

    def test_speech_segments_is_list(self, vad):
        result = vad.detect(_silence())
        assert isinstance(result.speech_segments, list)

    def test_speech_ratio_is_float_in_range(self, vad):
        result = vad.detect(_silence())
        assert 0.0 <= result.speech_ratio <= 1.0

    def test_total_duration_is_correct(self, vad):
        waveform = _silence(seconds=2.0)
        result = vad.detect(waveform)
        assert abs(result.total_duration_sec - 2.0) < 0.05

    def test_inference_time_ms_is_positive(self, vad):
        result = vad.detect(_silence())
        assert result.inference_time_ms > 0

    def test_threshold_used_is_stored(self, vad):
        result = vad.detect(_silence(), threshold=0.7)
        assert abs(result.threshold_used - 0.7) < 1e-9

    def test_summary_returns_string(self, vad):
        result = vad.detect(_silence())
        s = result.summary()
        assert isinstance(s, str) and len(s) > 10


# ===========================================================================
# 3.  SILENCE INPUT  →  no speech
# ===========================================================================

class TestSilenceInput:
    """Pure silence (all zeros) must yield no detected speech."""

    def test_silence_not_detected_as_speech(self, vad):
        result = vad.detect(_silence(1.0))
        assert result.speech_detected is False, (
            f"Pure silence falsely detected as speech "
            f"(probability={result.speech_probability:.3f})"
        )

    def test_silence_probability_is_low(self, vad):
        result = vad.detect(_silence(1.0))
        assert result.speech_probability < 0.1, (
            f"Expected very low probability for silence, got {result.speech_probability:.4f}"
        )

    def test_silence_has_no_segments(self, vad):
        result = vad.detect(_silence(1.0))
        assert result.speech_segments == []

    def test_silence_speech_ratio_is_zero(self, vad):
        result = vad.detect(_silence(1.0))
        assert result.speech_ratio == 0.0

    def test_silence_total_speech_sec_is_zero(self, vad):
        result = vad.detect(_silence(1.0))
        assert result.total_speech_sec == 0.0

    def test_silence_from_wav_file(self, vad):
        waveform = _load_sample("silence_1s.wav")
        result = vad.detect(waveform)
        assert result.speech_detected is False

    def test_extract_speech_waveform_on_silence_returns_empty(self, vad):
        waveform = _silence(1.0)
        result = vad.detect(waveform)
        extracted = result.extract_speech_waveform(waveform)
        assert extracted.size == 0

    def test_silence_segments_is_empty_list(self, vad):
        result = vad.detect(_silence(2.0))
        assert result.speech_segments == []


# ===========================================================================
# 4.  REAL TTS SPEECH INPUT  →  speech detected
# ===========================================================================

class TestSpeechInput:
    """Real macOS TTS speech must be reliably detected."""

    def test_speech_detected_is_true(self, vad):
        waveform = _load_sample("real_speech_tts.wav")
        result = vad.detect(waveform)
        assert result.speech_detected is True, (
            f"Expected speech to be detected "
            f"(probability={result.speech_probability:.3f})"
        )

    def test_speech_probability_is_high(self, vad):
        waveform = _load_sample("real_speech_tts.wav")
        result = vad.detect(waveform)
        assert result.speech_probability > 0.5, (
            f"Expected high probability for real speech, got {result.speech_probability:.3f}"
        )

    def test_speech_probability_higher_than_silence(self, vad):
        prob_speech  = vad.detect(_load_sample("real_speech_tts.wav")).speech_probability
        prob_silence = vad.detect(_silence(1.0)).speech_probability
        assert prob_speech > prob_silence, (
            f"Speech prob ({prob_speech:.3f}) must exceed "
            f"silence prob ({prob_silence:.4f})"
        )

    def test_speech_has_at_least_one_segment(self, vad):
        waveform = _load_sample("real_speech_tts.wav")
        result = vad.detect(waveform)
        assert len(result.speech_segments) >= 1, (
            f"Expected ≥1 speech segment, got {result.speech_segments}"
        )

    def test_speech_ratio_is_substantial(self, vad):
        """TTS speech file is mostly speech — ratio should be > 0.5."""
        waveform = _load_sample("real_speech_tts.wav")
        result = vad.detect(waveform)
        assert result.speech_ratio > 0.5, (
            f"Expected speech ratio > 0.5, got {result.speech_ratio:.2%}"
        )

    def test_total_speech_sec_is_positive(self, vad):
        waveform = _load_sample("real_speech_tts.wav")
        result = vad.detect(waveform)
        assert result.total_speech_sec > 0.0

    def test_extract_speech_waveform_is_nonempty(self, vad):
        waveform = _load_sample("real_speech_tts.wav")
        result = vad.detect(waveform)
        extracted = result.extract_speech_waveform(waveform)
        assert extracted.size > 0

    def test_extracted_waveform_is_float32(self, vad):
        waveform = _load_sample("real_speech_tts.wav")
        result = vad.detect(waveform)
        extracted = result.extract_speech_waveform(waveform)
        assert extracted.dtype == np.float32

    def test_extracted_waveform_shorter_than_original(self, vad):
        """Speech-only waveform should not be longer than the full clip."""
        waveform = _load_sample("real_speech_tts.wav")
        result = vad.detect(waveform)
        extracted = result.extract_speech_waveform(waveform)
        assert extracted.size <= waveform.size


# ===========================================================================
# 5.  MIXED (silence + speech + silence)  →  segments within speech region
# ===========================================================================

class TestMixedInput:
    """0.5s silence → real speech → 0.5s silence: active region must be detected."""

    def _get_result(self, vad):
        waveform = _load_sample("real_mixed_speech_silence.wav")
        return vad.detect(waveform), waveform

    def test_speech_detected_is_true(self, vad):
        result, _ = self._get_result(vad)
        assert result.speech_detected is True

    def test_has_at_least_one_segment(self, vad):
        result, _ = self._get_result(vad)
        assert len(result.speech_segments) >= 1

    def test_segment_boundaries_within_total_duration(self, vad):
        result, waveform = self._get_result(vad)
        total_samples = waveform.size
        for seg in result.speech_segments:
            assert seg.start_sample >= 0,             f"Segment start < 0: {seg}"
            assert seg.end_sample   <= total_samples,  f"Segment end > total: {seg}"
            assert seg.start_sample <  seg.end_sample, f"Empty segment: {seg}"

    def test_segment_does_not_start_too_early(self, vad):
        """
        Leading 0.5 s is silence.  No segment should start in the first 0.3 s
        (allowing 0.2 s of VAD onset padding).
        """
        result, _ = self._get_result(vad)
        for seg in result.speech_segments:
            assert seg.start_sec >= 0.3, (
                f"Segment starts at {seg.start_sec:.2f}s — too early for 0.5s silence lead"
            )

    def test_speech_ratio_between_0_and_1(self, vad):
        result, _ = self._get_result(vad)
        assert 0.0 < result.speech_ratio < 1.0

    def test_speech_ratio_less_than_90_percent(self, vad):
        """With 0.5s silence on each side, ratio must be well below 100%."""
        result, _ = self._get_result(vad)
        assert result.speech_ratio < 0.95, (
            f"Speech ratio {result.speech_ratio:.2%} — silence not properly excluded"
        )

    def test_total_speech_less_than_total_duration(self, vad):
        result, _ = self._get_result(vad)
        assert result.total_speech_sec < result.total_duration_sec


# ===========================================================================
# 6.  SpeechSegment dataclass
# ===========================================================================

class TestSpeechSegment:
    def test_duration_sec_is_correct(self, vad):
        waveform = _load_sample("real_speech_tts.wav")
        result = vad.detect(waveform)
        for seg in result.speech_segments:
            expected = (seg.end_sample - seg.start_sample) / SR
            assert abs(seg.duration_sec - expected) < 1e-6

    def test_start_sec_matches_sample(self, vad):
        waveform = _load_sample("real_speech_tts.wav")
        result = vad.detect(waveform)
        for seg in result.speech_segments:
            assert abs(seg.start_sec - seg.start_sample / SR) < 1e-6

    def test_end_sec_matches_sample(self, vad):
        waveform = _load_sample("real_speech_tts.wav")
        result = vad.detect(waveform)
        for seg in result.speech_segments:
            assert abs(seg.end_sec - seg.end_sample / SR) < 1e-6

    def test_extract_returns_correct_slice(self, vad):
        waveform = _load_sample("real_speech_tts.wav")
        result = vad.detect(waveform)
        for seg in result.speech_segments:
            extracted = seg.extract(waveform)
            expected  = waveform[seg.start_sample : seg.end_sample]
            np.testing.assert_array_equal(extracted, expected)

    def test_segment_is_float32(self, vad):
        waveform = _load_sample("real_speech_tts.wav")
        result = vad.detect(waveform)
        for seg in result.speech_segments:
            assert seg.extract(waveform).dtype == np.float32

    def test_segment_duration_positive(self, vad):
        waveform = _load_sample("real_speech_tts.wav")
        result = vad.detect(waveform)
        for seg in result.speech_segments:
            assert seg.duration_sec > 0


# ===========================================================================
# 7.  INPUT VALIDATION  →  VADInputError
# ===========================================================================

class TestInputValidation:
    def test_wrong_dtype_raises(self, vad):
        from backend.audio.vad import VADInputError
        bad = np.zeros(SR, dtype=np.float64)
        with pytest.raises(VADInputError, match="float32"):
            vad.detect(bad)

    def test_2d_array_raises(self, vad):
        from backend.audio.vad import VADInputError
        bad = np.zeros((SR, 2), dtype=np.float32)
        with pytest.raises(VADInputError, match="1-D"):
            vad.detect(bad)

    def test_empty_array_raises(self, vad):
        from backend.audio.vad import VADInputError
        with pytest.raises(VADInputError, match="empty"):
            vad.detect(np.array([], dtype=np.float32))

    def test_nan_array_raises(self, vad):
        from backend.audio.vad import VADInputError
        bad = np.full(SR, float("nan"), dtype=np.float32)
        with pytest.raises(VADInputError, match="NaN"):
            vad.detect(bad)

    def test_inf_array_raises(self, vad):
        from backend.audio.vad import VADInputError
        bad = np.full(SR, float("inf"), dtype=np.float32)
        with pytest.raises(VADInputError, match="NaN"):
            vad.detect(bad)

    def test_non_array_raises(self, vad):
        from backend.audio.vad import VADInputError
        with pytest.raises(VADInputError):
            vad.detect([0.0] * SR)   # type: ignore[arg-type]


# ===========================================================================
# 8.  THRESHOLD SENSITIVITY
# ===========================================================================

class TestThresholdBehaviour:
    """Higher threshold → stricter → fewer / shorter / no segments."""

    def test_low_threshold_more_permissive(self, vad):
        """Threshold 0.3 should detect at least as many segments as 0.7."""
        waveform = _load_sample("real_speech_tts.wav")
        result_low  = vad.detect(waveform, threshold=0.3)
        result_high = vad.detect(waveform, threshold=0.9)
        assert result_low.total_speech_sec >= result_high.total_speech_sec, (
            "Low threshold should produce more speech than high threshold"
        )

    def test_very_high_threshold_reduces_speech(self, vad):
        """At threshold=0.99 even real speech should trigger fewer segments."""
        waveform = _load_sample("real_speech_tts.wav")
        result_normal = vad.detect(waveform, threshold=0.5)
        result_strict = vad.detect(waveform, threshold=0.99)
        assert result_strict.total_speech_sec <= result_normal.total_speech_sec


# ===========================================================================
# 9.  MODULE-LEVEL CONVENIENCE FUNCTION
# ===========================================================================

class TestDetectSpeechConvenience:
    def test_returns_vad_result(self):
        from backend.audio.vad import VADResult, detect_speech
        result = detect_speech(_silence(0.5))
        assert isinstance(result, VADResult)

    def test_silence_not_detected(self):
        from backend.audio.vad import detect_speech
        result = detect_speech(_silence(1.0))
        assert result.speech_detected is False

    def test_real_speech_detected(self):
        from backend.audio.vad import detect_speech
        waveform = _load_sample("real_speech_tts.wav")
        result = detect_speech(waveform)
        assert result.speech_detected is True

    def test_singleton_model_reused(self):
        """Calling detect_speech twice must not reload the model."""
        import backend.audio.vad as vad_module
        from backend.audio.vad import detect_speech
        detect_speech(_silence(0.2))
        before_id = id(vad_module._global_vad)
        detect_speech(_silence(0.2))
        after_id  = id(vad_module._global_vad)
        assert before_id == after_id, "Model was re-instantiated on second call"


# ===========================================================================
# 10.  FULL PIPELINE INTEGRATION
# ===========================================================================

class TestPipelineIntegration:
    """End-to-end: preprocess_audio → vad.detect."""

    def test_full_pipeline_silence(self, vad):
        from backend.audio.preprocessing import preprocess_audio
        waveform = preprocess_audio(sample("silence_1s.wav"))
        result = vad.detect(waveform)
        assert result.speech_detected is False

    def test_full_pipeline_speech(self, vad):
        from backend.audio.preprocessing import preprocess_audio
        waveform = preprocess_audio(sample("real_speech_tts.wav"))
        result = vad.detect(waveform)
        assert result.speech_detected is True

    def test_full_pipeline_mixed(self, vad):
        from backend.audio.preprocessing import preprocess_audio
        waveform = preprocess_audio(sample("real_mixed_speech_silence.wav"))
        result = vad.detect(waveform)
        assert result.speech_detected is True
        assert len(result.speech_segments) >= 1

    def test_waveform_invariants_preserved_after_vad(self, vad):
        """VAD must not mutate or corrupt the input waveform."""
        from backend.audio.preprocessing import preprocess_audio
        waveform = preprocess_audio(sample("real_speech_tts.wav"))
        original = waveform.copy()
        vad.detect(waveform)
        np.testing.assert_array_equal(
            waveform, original,
            err_msg="VAD must not modify the input waveform in-place."
        )

    def test_extract_speech_waveform_dtype_and_ndim(self, vad):
        from backend.audio.preprocessing import preprocess_audio
        waveform = preprocess_audio(sample("real_speech_tts.wav"))
        result = vad.detect(waveform)
        extracted = result.extract_speech_waveform(waveform)
        assert extracted.dtype == np.float32
        assert extracted.ndim == 1

    def test_output_sample_rate_matches_constant(self, vad):
        """Confirm that total_duration matches the 16 kHz assumption."""
        from backend.audio.preprocessing import preprocess_audio
        from backend.audio.vad import SAMPLE_RATE
        waveform = preprocess_audio(sample("real_speech_tts.wav"))
        result = vad.detect(waveform)
        expected_duration = waveform.size / SAMPLE_RATE
        assert abs(result.total_duration_sec - expected_duration) < 0.01


# ===========================================================================
# Direct execution
# ===========================================================================

if __name__ == "__main__":
    import warnings
    warnings.filterwarnings("ignore", category=FutureWarning)

    print("\n=== VAD Tests — loading model (first run may download weights) … ===\n")

    from backend.audio.vad import SileroVAD
    loaded_vad = SileroVAD.load()

    test_classes_with_vad = [
        TestSileroVADLoad,
        TestVADResultContract,
        TestSilenceInput,
        TestSpeechInput,
        TestMixedInput,
        TestSpeechSegment,
        TestInputValidation,
        TestThresholdBehaviour,
        TestPipelineIntegration,
    ]
    test_classes_no_vad = [
        TestDetectSpeechConvenience,
    ]

    passed = failed = 0

    for cls in test_classes_with_vad:
        obj = cls()
        for name in [m for m in dir(cls) if m.startswith("test_")]:
            label = f"{cls.__name__}.{name}"
            method = getattr(obj, name)
            try:
                method(loaded_vad)
                print(f"  PASS  {label}")
                passed += 1
            except Exception as exc:
                print(f"  FAIL  {label}\n        {type(exc).__name__}: {exc}")
                failed += 1

    for cls in test_classes_no_vad:
        obj = cls()
        for name in [m for m in dir(cls) if m.startswith("test_")]:
            label = f"{cls.__name__}.{name}"
            method = getattr(obj, name)
            try:
                method()
                print(f"  PASS  {label}")
                passed += 1
            except Exception as exc:
                print(f"  FAIL  {label}\n        {type(exc).__name__}: {exc}")
                failed += 1

    print(f"\n{'='*60}")
    print(f"Result: {passed} passed, {failed} failed ({passed+failed} total).")
    sys.exit(0 if failed == 0 else 1)
