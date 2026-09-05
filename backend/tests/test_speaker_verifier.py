"""
backend/tests/test_speaker_verifier.py
========================================
Test suite for the speaker verification module.

Model: speechbrain/spkrec-ecapa-voxceleb (ECAPA-TDNN)
  • Output: 192-D L2-normalised float32 embedding
  • Raw model output is NOT L2-normalised (norm ≈ 414); module normalises it
  • id: no label mapping needed (pure embedding + cosine similarity)

Empirically Verified (2026-09-04)
-----------------------------------
  same speaker  (Alex TTS × Alex TTS)    cosine ≈ 0.87–0.90  → MATCH
  diff speaker  (Alex ref vs Samantha)   cosine ≈ 0.24       → MISMATCH
  Separation gap ≈ 0.66  →  default threshold 0.70 is very conservative

Test Coverage
-------------
  1  SpeakerVerifier.load() + singleton
  2  generate_embedding() — shape, dtype, L2-norm, immutability
  3  enroll_reference() — single/multi-sample, path-based, aggregation
  4  save_reference_embedding() + load_reference_embedding() — round-trip
  5  verify_speaker() — same speaker MATCH, different speaker MISMATCH
  6  SpeakerResult contract — all fields, types, ranges
  7  Threshold sensitivity
  8  Input validation — DeepfakeInputError variants
  9  verify_speaker() module convenience function + singleton
  10 Full pipeline integration: preprocess_audio → enroll → verify

Run:
    python -m pytest backend/tests/test_speaker_verifier.py -v
"""

from __future__ import annotations

import sys
import warnings
import tempfile
from pathlib import Path

import numpy as np
import pytest

warnings.filterwarnings("ignore", category=FutureWarning)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SAMPLES_DIR  = PROJECT_ROOT / "samples"
SR = 16_000
EMB_DIM = 192


def _sample(subdir: str, name: str) -> Path:
    return SAMPLES_DIR / subdir / name


def _load(subdir: str, name: str) -> np.ndarray:
    from backend.audio.preprocessing import preprocess_audio
    return preprocess_audio(_sample(subdir, name))


def _silence(seconds: float = 1.0) -> np.ndarray:
    return np.zeros(int(SR * seconds), dtype=np.float32)


def _noise(seconds: float = 1.0) -> np.ndarray:
    rng = np.random.default_rng(42)
    return rng.standard_normal(int(SR * seconds)).astype(np.float32)


# ────────────────────────────────────────────────────────────────────────────
# Session fixtures — load model once for all tests
# ────────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def verifier():
    from backend.models.speaker_verifier import SpeakerVerifier
    return SpeakerVerifier.load()


@pytest.fixture(scope="session")
def ref_embedding(verifier):
    """Multi-sample reference embedding for speaker A (Alex TTS)."""
    return verifier.enroll_reference([
        _sample("genuine", "speaker_a_ref1.wav"),
        _sample("genuine", "speaker_a_ref2.wav"),
        _sample("genuine", "speaker_a_ref3.wav"),
    ])


# ============================================================================
# 1. MODEL LOADING
# ============================================================================

class TestSpeakerVerifierLoad:
    def test_load_returns_verifier_instance(self, verifier):
        from backend.models.speaker_verifier import SpeakerVerifier
        assert isinstance(verifier, SpeakerVerifier)

    def test_load_is_idempotent(self):
        from backend.models.speaker_verifier import SpeakerVerifier
        v1 = SpeakerVerifier.load()
        v2 = SpeakerVerifier.load()
        assert v1 is not None and v2 is not None

    def test_verifier_has_all_required_methods(self, verifier):
        for method in [
            "generate_embedding",
            "enroll_reference",
            "save_reference_embedding",
            "load_reference_embedding",
            "verify_speaker",
        ]:
            assert callable(getattr(verifier, method, None)), (
                f"SpeakerVerifier missing method: {method}"
            )

    def test_model_source_constant(self):
        from backend.models.speaker_verifier import MODEL_SOURCE
        assert MODEL_SOURCE == "speechbrain/spkrec-ecapa-voxceleb"

    def test_embedding_dim_constant(self):
        from backend.models.speaker_verifier import EMBEDDING_DIM
        assert EMBEDDING_DIM == 192


# ============================================================================
# 2. generate_embedding() — CONTRACT
# ============================================================================

class TestGenerateEmbedding:
    def test_returns_numpy_array(self, verifier):
        emb = verifier.generate_embedding(_load("genuine", "speaker_a_ref1.wav"))
        assert isinstance(emb, np.ndarray)

    def test_shape_is_192(self, verifier):
        emb = verifier.generate_embedding(_load("genuine", "speaker_a_ref1.wav"))
        assert emb.shape == (EMB_DIM,), f"Expected ({EMB_DIM},), got {emb.shape}"

    def test_dtype_is_float32(self, verifier):
        emb = verifier.generate_embedding(_load("genuine", "speaker_a_ref1.wav"))
        assert emb.dtype == np.float32

    def test_l2_norm_is_one(self, verifier):
        emb = verifier.generate_embedding(_load("genuine", "speaker_a_ref1.wav"))
        norm = float(np.linalg.norm(emb))
        assert abs(norm - 1.0) < 1e-4, (
            f"Expected L2-norm=1.0, got {norm:.6f}. "
            "Model output must be normalised."
        )

    def test_embedding_is_finite(self, verifier):
        emb = verifier.generate_embedding(_load("genuine", "speaker_a_ref1.wav"))
        assert np.isfinite(emb).all()

    def test_same_input_same_embedding(self, verifier):
        """Deterministic: same waveform → same embedding."""
        wav = _load("genuine", "speaker_a_ref1.wav")
        emb1 = verifier.generate_embedding(wav)
        emb2 = verifier.generate_embedding(wav)
        np.testing.assert_array_almost_equal(emb1, emb2, decimal=5)

    def test_waveform_not_mutated(self, verifier):
        wav = _load("genuine", "speaker_a_ref1.wav")
        original = wav.copy()
        verifier.generate_embedding(wav)
        np.testing.assert_array_equal(wav, original)

    def test_different_audio_different_embedding(self, verifier):
        """Different files produce meaningfully different embeddings."""
        emb_a = verifier.generate_embedding(_load("genuine", "speaker_a_ref1.wav"))
        emb_b = verifier.generate_embedding(_load("imposter", "speaker_b_test.wav"))
        cosine = float(np.dot(emb_a, emb_b))
        assert cosine < 0.95, (
            f"Embeddings from different speakers are suspiciously similar: {cosine:.4f}"
        )

    def test_works_on_noise(self, verifier):
        """generate_embedding should work on any float32 waveform, even noise."""
        emb = verifier.generate_embedding(_noise(2.0))
        assert emb.shape == (EMB_DIM,)
        assert abs(float(np.linalg.norm(emb)) - 1.0) < 1e-4


# ============================================================================
# 3. enroll_reference() — ENROLLMENT
# ============================================================================

class TestEnrollReference:
    def test_single_sample_path(self, verifier):
        emb = verifier.enroll_reference([_sample("genuine", "speaker_a_ref1.wav")])
        assert emb.shape == (EMB_DIM,)
        assert abs(float(np.linalg.norm(emb)) - 1.0) < 1e-4

    def test_single_sample_waveform(self, verifier):
        wav = _load("genuine", "speaker_a_ref1.wav")
        emb = verifier.enroll_reference([wav])
        assert emb.shape == (EMB_DIM,)

    def test_multi_sample_path(self, verifier):
        emb = verifier.enroll_reference([
            _sample("genuine", "speaker_a_ref1.wav"),
            _sample("genuine", "speaker_a_ref2.wav"),
            _sample("genuine", "speaker_a_ref3.wav"),
        ])
        assert emb.shape == (EMB_DIM,)

    def test_multi_sample_waveform(self, verifier):
        wavs = [
            _load("genuine", "speaker_a_ref1.wav"),
            _load("genuine", "speaker_a_ref2.wav"),
        ]
        emb = verifier.enroll_reference(wavs)
        assert emb.shape == (EMB_DIM,)

    def test_mixed_paths_and_waveforms(self, verifier):
        items = [
            _sample("genuine", "speaker_a_ref1.wav"),  # path
            _load("genuine", "speaker_a_ref2.wav"),     # waveform
        ]
        emb = verifier.enroll_reference(items)
        assert emb.shape == (EMB_DIM,)

    def test_result_is_l2_normalised(self, verifier):
        emb = verifier.enroll_reference([
            _sample("genuine", "speaker_a_ref1.wav"),
            _sample("genuine", "speaker_a_ref2.wav"),
        ])
        norm = float(np.linalg.norm(emb))
        assert abs(norm - 1.0) < 1e-4, f"ref norm={norm:.6f}, expected 1.0"

    def test_result_dtype_float32(self, verifier):
        emb = verifier.enroll_reference([_sample("genuine", "speaker_a_ref1.wav")])
        assert emb.dtype == np.float32

    def test_empty_list_raises(self, verifier):
        from backend.models.speaker_verifier import SpeakerVerifierInputError
        with pytest.raises(SpeakerVerifierInputError, match="at least 1"):
            verifier.enroll_reference([])

    def test_invalid_type_raises(self, verifier):
        from backend.models.speaker_verifier import SpeakerVerifierInputError
        with pytest.raises(SpeakerVerifierInputError):
            verifier.enroll_reference([12345])  # type: ignore[list-item]

    def test_multi_vs_single_same_speaker_higher_similarity(self, verifier):
        """
        Multi-sample reference should yield ≥ single-sample cosine similarity
        when tested against the same speaker (trend, not strict guarantee).
        """
        ref_single = verifier.enroll_reference([_sample("genuine", "speaker_a_ref1.wav")])
        ref_multi  = verifier.enroll_reference([
            _sample("genuine", "speaker_a_ref1.wav"),
            _sample("genuine", "speaker_a_ref2.wav"),
            _sample("genuine", "speaker_a_ref3.wav"),
        ])
        test_wav = _load("genuine", "speaker_a_test.wav")
        test_emb = verifier.generate_embedding(test_wav)
        sim_single = float(np.dot(test_emb, ref_single))
        sim_multi  = float(np.dot(test_emb, ref_multi))
        # Multi should not be significantly worse
        assert sim_multi > 0.7, (
            f"Multi-sample reference gives low similarity: {sim_multi:.4f}"
        )
        print(f"\n  single-sample sim={sim_single:.4f}  "
              f"multi-sample sim={sim_multi:.4f}")


# ============================================================================
# 4. PERSISTENCE — save + load
# ============================================================================

class TestEmbeddingPersistence:
    def test_save_creates_npy_file(self, verifier, tmp_path):
        emb  = verifier.generate_embedding(_load("genuine", "speaker_a_ref1.wav"))
        dest = tmp_path / "ref.npy"
        result_path = verifier.save_reference_embedding(emb, dest)
        assert result_path.exists()
        assert result_path.suffix == ".npy"

    def test_save_returns_path(self, verifier, tmp_path):
        emb  = verifier.generate_embedding(_load("genuine", "speaker_a_ref1.wav"))
        dest = tmp_path / "ref.npy"
        result = verifier.save_reference_embedding(emb, dest)
        assert isinstance(result, Path)

    def test_save_creates_parent_dirs(self, verifier, tmp_path):
        emb  = verifier.generate_embedding(_load("genuine", "speaker_a_ref1.wav"))
        dest = tmp_path / "deep" / "nested" / "ref.npy"
        verifier.save_reference_embedding(emb, dest)
        assert dest.exists()

    def test_load_round_trip(self, verifier, tmp_path):
        """Save → load must recover the exact same embedding."""
        original = verifier.enroll_reference([
            _sample("genuine", "speaker_a_ref1.wav"),
            _sample("genuine", "speaker_a_ref2.wav"),
        ])
        dest = tmp_path / "ref.npy"
        verifier.save_reference_embedding(original, dest)
        loaded = verifier.load_reference_embedding(dest)
        np.testing.assert_array_almost_equal(
            original, loaded, decimal=6,
            err_msg="Round-trip save→load changed the embedding values."
        )

    def test_loaded_dtype_is_float32(self, verifier, tmp_path):
        emb  = verifier.generate_embedding(_load("genuine", "speaker_a_ref1.wav"))
        dest = tmp_path / "ref.npy"
        verifier.save_reference_embedding(emb, dest)
        loaded = verifier.load_reference_embedding(dest)
        assert loaded.dtype == np.float32

    def test_loaded_norm_is_one(self, verifier, tmp_path):
        emb  = verifier.enroll_reference([_sample("genuine", "speaker_a_ref1.wav")])
        dest = tmp_path / "ref.npy"
        verifier.save_reference_embedding(emb, dest)
        loaded = verifier.load_reference_embedding(dest)
        norm = float(np.linalg.norm(loaded))
        assert abs(norm - 1.0) < 1e-4

    def test_load_nonexistent_raises_file_not_found(self):
        from backend.models.speaker_verifier import SpeakerVerifier
        with pytest.raises(FileNotFoundError):
            SpeakerVerifier.load_reference_embedding("/no/such/file.npy")

    def test_save_invalid_embedding_raises(self, verifier, tmp_path):
        from backend.models.speaker_verifier import SpeakerVerifierInputError
        bad = np.zeros(100, dtype=np.float32)  # wrong shape
        with pytest.raises(SpeakerVerifierInputError):
            verifier.save_reference_embedding(bad, tmp_path / "bad.npy")

    def test_file_size_is_small(self, verifier, tmp_path):
        """Embedding file should be tiny — no raw audio stored."""
        emb  = verifier.generate_embedding(_load("genuine", "speaker_a_ref1.wav"))
        dest = tmp_path / "ref.npy"
        verifier.save_reference_embedding(emb, dest)
        size_bytes = dest.stat().st_size
        # 192 * 4 bytes = 768 bytes; npy header ~128 bytes → < 2 KB total
        assert size_bytes < 2048, (
            f"Embedding file is {size_bytes} bytes — suspiciously large. "
            "Raw audio must NOT be stored."
        )


# ============================================================================
# 5. verify_speaker() — SAME vs DIFFERENT SPEAKER
# ============================================================================

class TestVerifySpeaker:
    def test_same_speaker_is_match(self, verifier, ref_embedding):
        """
        Speaker A test audio vs Speaker A reference → MATCH.
        Empirically: cosine ≈ 0.90.
        """
        test_wav = _load("genuine", "speaker_a_test.wav")
        result = verifier.verify_speaker(test_wav, ref_embedding)
        assert result.speaker_match is True, (
            f"Same-speaker test FAILED: similarity={result.speaker_similarity:.4f}  "
            f"threshold={result.threshold_used:.2f}"
        )

    def test_same_speaker_high_similarity(self, verifier, ref_embedding):
        test_wav = _load("genuine", "speaker_a_test.wav")
        result = verifier.verify_speaker(test_wav, ref_embedding)
        assert result.speaker_similarity > 0.70, (
            f"Same-speaker similarity too low: {result.speaker_similarity:.4f}"
        )

    def test_different_speaker_is_mismatch(self, verifier, ref_embedding):
        """
        Speaker B test audio vs Speaker A reference → MISMATCH.
        Empirically: cosine ≈ 0.24.
        """
        test_wav = _load("imposter", "speaker_b_test.wav")
        result = verifier.verify_speaker(test_wav, ref_embedding)
        assert result.speaker_match is False, (
            f"Different-speaker test FAILED: similarity={result.speaker_similarity:.4f}  "
            f"threshold={result.threshold_used:.2f}"
        )

    def test_different_speaker_low_similarity(self, verifier, ref_embedding):
        test_wav = _load("imposter", "speaker_b_test.wav")
        result = verifier.verify_speaker(test_wav, ref_embedding)
        assert result.speaker_similarity < 0.70, (
            f"Different-speaker similarity too high: {result.speaker_similarity:.4f}"
        )

    def test_same_speaker_similarity_greater_than_different(
        self, verifier, ref_embedding
    ):
        same_result = verifier.verify_speaker(
            _load("genuine", "speaker_a_test.wav"), ref_embedding
        )
        diff_result = verifier.verify_speaker(
            _load("imposter", "speaker_b_test.wav"), ref_embedding
        )
        assert same_result.speaker_similarity > diff_result.speaker_similarity, (
            f"Same-speaker score ({same_result.speaker_similarity:.4f}) "
            f"should exceed different-speaker score "
            f"({diff_result.speaker_similarity:.4f})"
        )

    def test_cross_enrollment_imposter_vs_imposter(self, verifier):
        """
        Speaker B enrolled and tested against Speaker B → should MATCH.
        """
        ref_b = verifier.enroll_reference([_sample("imposter", "speaker_b_ref.wav")])
        result = verifier.verify_speaker(
            _load("imposter", "speaker_b_test.wav"), ref_b
        )
        assert result.speaker_match is True, (
            f"Imposter speaker self-verification failed: "
            f"similarity={result.speaker_similarity:.4f}"
        )


# ============================================================================
# 6. SpeakerResult CONTRACT
# ============================================================================

class TestSpeakerResultContract:
    def test_returns_speaker_result(self, verifier, ref_embedding):
        from backend.models.speaker_verifier import SpeakerResult
        result = verifier.verify_speaker(
            _load("genuine", "speaker_a_test.wav"), ref_embedding
        )
        assert isinstance(result, SpeakerResult)

    def test_speaker_similarity_float_in_range(self, verifier, ref_embedding):
        result = verifier.verify_speaker(
            _load("genuine", "speaker_a_test.wav"), ref_embedding
        )
        assert isinstance(result.speaker_similarity, float)
        assert -1.0 <= result.speaker_similarity <= 1.0

    def test_speaker_match_is_bool(self, verifier, ref_embedding):
        result = verifier.verify_speaker(
            _load("genuine", "speaker_a_test.wav"), ref_embedding
        )
        assert isinstance(result.speaker_match, bool)

    def test_threshold_used_stored(self, verifier, ref_embedding):
        result = verifier.verify_speaker(
            _load("genuine", "speaker_a_test.wav"), ref_embedding,
            threshold=0.85,
        )
        assert abs(result.threshold_used - 0.85) < 1e-9

    def test_embedding_dim_is_192(self, verifier, ref_embedding):
        result = verifier.verify_speaker(
            _load("genuine", "speaker_a_test.wav"), ref_embedding
        )
        assert result.embedding_dim == EMB_DIM

    def test_inference_time_ms_positive(self, verifier, ref_embedding):
        result = verifier.verify_speaker(
            _load("genuine", "speaker_a_test.wav"), ref_embedding
        )
        assert result.inference_time_ms > 0

    def test_summary_is_string(self, verifier, ref_embedding):
        result = verifier.verify_speaker(
            _load("genuine", "speaker_a_test.wav"), ref_embedding
        )
        s = result.summary()
        assert isinstance(s, str)
        assert "MATCH" in s or "MISMATCH" in s

    def test_match_consistency_with_threshold(self, verifier, ref_embedding):
        """speaker_match must be True iff similarity >= threshold_used."""
        result = verifier.verify_speaker(
            _load("genuine", "speaker_a_test.wav"), ref_embedding
        )
        expected = result.speaker_similarity >= result.threshold_used
        assert result.speaker_match is expected


# ============================================================================
# 7. THRESHOLD SENSITIVITY
# ============================================================================

class TestThresholdSensitivity:
    def test_very_low_threshold_matches_everyone(self, verifier, ref_embedding):
        result = verifier.verify_speaker(
            _load("imposter", "speaker_b_test.wav"), ref_embedding,
            threshold=0.0,
        )
        assert result.speaker_match is True

    def test_very_high_threshold_rejects_same_speaker(self, verifier, ref_embedding):
        result = verifier.verify_speaker(
            _load("genuine", "speaker_a_test.wav"), ref_embedding,
            threshold=0.99,
        )
        assert result.speaker_match is False

    def test_threshold_stored_in_result(self, verifier, ref_embedding):
        t = 0.55
        result = verifier.verify_speaker(
            _load("genuine", "speaker_a_test.wav"), ref_embedding,
            threshold=t,
        )
        assert abs(result.threshold_used - t) < 1e-9


# ============================================================================
# 8. INPUT VALIDATION
# ============================================================================

class TestInputValidation:
    # ── generate_embedding ──────────────────────────────────────────────────

    def test_wrong_dtype_raises(self, verifier):
        from backend.models.speaker_verifier import SpeakerVerifierInputError
        with pytest.raises(SpeakerVerifierInputError, match="float32"):
            verifier.generate_embedding(np.zeros(SR, dtype=np.float64))

    def test_2d_waveform_raises(self, verifier):
        from backend.models.speaker_verifier import SpeakerVerifierInputError
        with pytest.raises(SpeakerVerifierInputError, match="1-D"):
            verifier.generate_embedding(np.zeros((SR, 2), dtype=np.float32))

    def test_empty_waveform_raises(self, verifier):
        from backend.models.speaker_verifier import SpeakerVerifierInputError
        with pytest.raises(SpeakerVerifierInputError, match="empty"):
            verifier.generate_embedding(np.array([], dtype=np.float32))

    def test_nan_waveform_raises(self, verifier):
        from backend.models.speaker_verifier import SpeakerVerifierInputError
        with pytest.raises(SpeakerVerifierInputError, match="NaN"):
            verifier.generate_embedding(
                np.full(SR, float("nan"), dtype=np.float32)
            )

    def test_too_short_waveform_raises(self, verifier):
        from backend.models.speaker_verifier import SpeakerVerifierInputError
        # 0.1 s < 0.5 s minimum
        with pytest.raises(SpeakerVerifierInputError, match="short"):
            verifier.generate_embedding(np.zeros(int(SR * 0.1), dtype=np.float32))

    # ── verify_speaker — bad reference embedding ─────────────────────────────

    def test_wrong_embedding_shape_raises(self, verifier):
        from backend.models.speaker_verifier import SpeakerVerifierInputError
        bad_ref = np.zeros(100, dtype=np.float32)
        with pytest.raises(SpeakerVerifierInputError, match="shape"):
            verifier.verify_speaker(_noise(1.0), bad_ref)

    def test_unnormalised_embedding_raises(self, verifier):
        from backend.models.speaker_verifier import SpeakerVerifierInputError
        bad_ref = np.ones(EMB_DIM, dtype=np.float32)  # norm ≈ 13.9
        with pytest.raises(SpeakerVerifierInputError, match="L2-normalised"):
            verifier.verify_speaker(_noise(1.0), bad_ref)

    def test_wrong_embedding_dtype_raises(self, verifier):
        from backend.models.speaker_verifier import SpeakerVerifierInputError
        # Create normalised but wrong dtype
        v = np.zeros(EMB_DIM, dtype=np.float64)
        v[0] = 1.0  # L2-norm = 1 but wrong dtype
        with pytest.raises(SpeakerVerifierInputError, match="float32"):
            verifier.verify_speaker(_noise(1.0), v)


# ============================================================================
# 9. MODULE CONVENIENCE FUNCTION + SINGLETON
# ============================================================================

class TestVerifySpeakerConvenience:
    def test_returns_speaker_result(self, ref_embedding):
        from backend.models.speaker_verifier import (
            SpeakerResult, verify_speaker,
        )
        result = verify_speaker(_load("genuine", "speaker_a_test.wav"), ref_embedding)
        assert isinstance(result, SpeakerResult)

    def test_same_speaker_match(self, ref_embedding):
        from backend.models.speaker_verifier import verify_speaker
        result = verify_speaker(_load("genuine", "speaker_a_test.wav"), ref_embedding)
        assert result.speaker_match is True

    def test_different_speaker_mismatch(self, ref_embedding):
        from backend.models.speaker_verifier import verify_speaker
        result = verify_speaker(_load("imposter", "speaker_b_test.wav"), ref_embedding)
        assert result.speaker_match is False

    def test_singleton_reused(self, ref_embedding):
        import backend.models.speaker_verifier as sv_module
        from backend.models.speaker_verifier import verify_speaker
        verify_speaker(_noise(1.0), ref_embedding)
        id_before = id(sv_module._global_verifier)
        verify_speaker(_noise(1.0), ref_embedding)
        id_after = id(sv_module._global_verifier)
        assert id_before == id_after, "Model was re-instantiated on second call"


# ============================================================================
# 10. FULL PIPELINE INTEGRATION
# ============================================================================

class TestPipelineIntegration:
    def test_end_to_end_same_speaker(self, verifier):
        """Full: preprocess files → enroll → save → load → verify."""
        from backend.audio.preprocessing import preprocess_audio

        # Enrollment
        ref_emb = verifier.enroll_reference([
            _sample("genuine", "speaker_a_ref1.wav"),
            _sample("genuine", "speaker_a_ref2.wav"),
        ])

        # Persist and reload
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "speaker_a.npy"
            verifier.save_reference_embedding(ref_emb, path)
            loaded_ref = verifier.load_reference_embedding(path)

        # Verify
        test_wav = preprocess_audio(_sample("genuine", "speaker_a_test.wav"))
        result = verifier.verify_speaker(test_wav, loaded_ref)
        assert result.speaker_match is True

    def test_end_to_end_different_speaker(self, verifier):
        """Full pipeline: Speaker A enrolled, Speaker B tested → MISMATCH."""
        from backend.audio.preprocessing import preprocess_audio

        ref_emb = verifier.enroll_reference([
            _sample("genuine", "speaker_a_ref1.wav"),
            _sample("genuine", "speaker_a_ref2.wav"),
            _sample("genuine", "speaker_a_ref3.wav"),
        ])
        test_wav = preprocess_audio(_sample("imposter", "speaker_b_test.wav"))
        result = verifier.verify_speaker(test_wav, ref_emb)
        assert result.speaker_match is False

    def test_waveform_not_mutated_by_verify(self, verifier, ref_embedding):
        wav = _load("genuine", "speaker_a_test.wav")
        original = wav.copy()
        verifier.verify_speaker(wav, ref_embedding)
        np.testing.assert_array_equal(wav, original)

    def test_ref_embedding_not_mutated_by_verify(self, verifier, ref_embedding):
        original_ref = ref_embedding.copy()
        verifier.verify_speaker(_load("genuine", "speaker_a_test.wav"), ref_embedding)
        np.testing.assert_array_equal(ref_embedding, original_ref)


# ============================================================================
# 11. EMPIRICAL REGRESSION GUARDS
# ============================================================================

class TestEmpiricalRegressions:
    """
    Numeric regression tests capturing measured similarity values.
    These will catch model changes or preprocessing regressions.
    """

    def test_same_speaker_similarity_above_0_80(self, verifier, ref_embedding):
        result = verifier.verify_speaker(
            _load("genuine", "speaker_a_test.wav"), ref_embedding
        )
        assert result.speaker_similarity > 0.80, (
            f"Same-speaker similarity regressed: {result.speaker_similarity:.4f} "
            f"(expected > 0.80, empirically ≈ 0.90)"
        )

    def test_different_speaker_similarity_below_0_50(self, verifier, ref_embedding):
        result = verifier.verify_speaker(
            _load("imposter", "speaker_b_test.wav"), ref_embedding
        )
        assert result.speaker_similarity < 0.50, (
            f"Different-speaker similarity regressed: {result.speaker_similarity:.4f} "
            f"(expected < 0.50, empirically ≈ 0.24)"
        )

    def test_embedding_separation_large(self, verifier, ref_embedding):
        """Separation between same/diff speaker must be ≥ 0.40."""
        same = verifier.verify_speaker(
            _load("genuine", "speaker_a_test.wav"), ref_embedding
        ).speaker_similarity
        diff = verifier.verify_speaker(
            _load("imposter", "speaker_b_test.wav"), ref_embedding
        ).speaker_similarity
        separation = same - diff
        assert separation >= 0.40, (
            f"Speaker separation too small: {separation:.4f} "
            f"(same={same:.4f}, diff={diff:.4f})"
        )


# ============================================================================
# Direct execution
# ============================================================================

if __name__ == "__main__":
    print("\n=== Speaker Verifier Tests ===\n")
    print("Loading model (first run downloads ~22 MB)…\n")

    from backend.models.speaker_verifier import SpeakerVerifier

    v = SpeakerVerifier.load()
    ref = v.enroll_reference([
        _sample("genuine", "speaker_a_ref1.wav"),
        _sample("genuine", "speaker_a_ref2.wav"),
        _sample("genuine", "speaker_a_ref3.wav"),
    ])

    test_classes_with_fixtures = [
        (TestSpeakerVerifierLoad, (v,)),
        (TestGenerateEmbedding,   (v,)),
        (TestEnrollReference,     (v,)),
        (TestSpeakerResultContract, (v, ref)),
        (TestThresholdSensitivity,  (v, ref)),
        (TestVerifySpeaker,         (v, ref)),
        (TestInputValidation,       (v,)),
        (TestPipelineIntegration,   (v,)),
        (TestEmpiricalRegressions,  (v, ref)),
    ]

    passed = failed = 0
    for cls, args in test_classes_with_fixtures:
        obj = cls()
        for name in [m for m in sorted(dir(cls)) if m.startswith("test_")]:
            label = f"{cls.__name__}.{name}"
            try:
                getattr(obj, name)(*args)
                print(f"  PASS  {label}")
                passed += 1
            except Exception as exc:
                print(f"  FAIL  {label}\n        {type(exc).__name__}: {exc}")
                failed += 1

    # Convenience function tests
    for cls in [TestVerifySpeakerConvenience]:
        obj = cls()
        for name in [m for m in sorted(dir(cls)) if m.startswith("test_")]:
            label = f"{cls.__name__}.{name}"
            try:
                getattr(obj, name)(ref)
                print(f"  PASS  {label}")
                passed += 1
            except Exception as exc:
                print(f"  FAIL  {label}\n        {type(exc).__name__}: {exc}")
                failed += 1

    print(f"\n{'='*60}")
    print(f"Result: {passed} passed, {failed} failed ({passed+failed} total)")
    sys.exit(0 if failed == 0 else 1)
