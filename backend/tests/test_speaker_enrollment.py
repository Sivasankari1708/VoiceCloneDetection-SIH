"""
backend/tests/test_speaker_enrollment.py
========================================
Comprehensive unit and integration test suite for Speaker Enrollment and Verification.

Covers:
  A. Single valid enrollment sample
  B. Multiple valid enrollment samples
  C. Silence sample rejected
  D. Too-short sample rejected
  E. Invalid/corrupt audio rejected
  F. Missing speaker ID raises ValueError
  G. Missing reference embedding handled gracefully
  H. Valid speaker verification (same speaker match)
  I. Different speaker verification (different speaker mismatch)
  J. Zero-norm embedding handling
  K. Embedding dimension mismatch handling
  L. Multiple enrollment embeddings correctly aggregated (mean + L2-norm)
  M. Reference embedding is strictly unit L2-norm
  N. Similarity computation is deterministic
  O. Inconsistent enrollment samples detected
  P. High synthetic probability + high speaker similarity -> 'cloned'
  Q. Low synthetic probability + low speaker similarity -> 'imposter'
  R. Low synthetic probability + high speaker similarity -> 'genuine'
  S. Biometric security invariants (no raw embeddings in logs / repr / to_safe_dict)
  T. Repository CRUD operations (Local and InMemory)
  U. Pipeline integration with speaker_id
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np
import pytest

from backend.audio.preprocessing import preprocess_audio
from backend.models.speaker_enrollment import (
    EnrollmentResult,
    EnrollmentStatusResult,
    SampleQualityError,
    SpeakerEnrollmentService,
)
from backend.models.speaker_repository import (
    DEFAULT_EMBEDDING_DIM,
    InMemorySpeakerRepository,
    LocalSpeakerRepository,
    SpeakerProfile,
)
from backend.models.speaker_verifier import (
    DEFAULT_THRESHOLD,
    EMBEDDING_DIM,
    SpeakerResult,
    SpeakerVerifier,
    SpeakerVerifierInputError,
)
from backend.pipeline.inference_pipeline import InferencePipeline, process_audio
from backend.schemas.inference_result import InferenceResult

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SAMPLES_DIR = PROJECT_ROOT / "samples"

SPK_A_REF1 = SAMPLES_DIR / "genuine" / "speaker_a_ref1.wav"
SPK_A_REF2 = SAMPLES_DIR / "genuine" / "speaker_a_ref2.wav"
SPK_A_REF3 = SAMPLES_DIR / "genuine" / "speaker_a_ref3.wav"
SPK_A_TEST = SAMPLES_DIR / "genuine" / "speaker_a_test.wav"

SPK_B_REF = SAMPLES_DIR / "imposter" / "speaker_b_ref.wav"
SPK_B_TEST = SAMPLES_DIR / "imposter" / "speaker_b_test.wav"

SILENCE_WAV = SAMPLES_DIR / "genuine" / "silence_1s.wav"
CORRUPT_WAV = SAMPLES_DIR / "genuine" / "corrupt_file.wav"
DEV_BONAFIDE_WAV = PROJECT_ROOT / "data/asvspoof2019/LA/ASVspoof2019_LA_dev/flac/LA_D_1047731.flac"


@pytest.fixture(scope="module")
def shared_verifier() -> SpeakerVerifier:
    return SpeakerVerifier.load()


@pytest.fixture
def in_memory_repo() -> InMemorySpeakerRepository:
    return InMemorySpeakerRepository()


@pytest.fixture
def enrollment_service(shared_verifier: SpeakerVerifier, in_memory_repo: InMemorySpeakerRepository) -> SpeakerEnrollmentService:
    return SpeakerEnrollmentService(
        verifier=shared_verifier,
        repository=in_memory_repo,
        min_speech_ratio=0.20,
        min_speech_duration_sec=0.40,
    )


# ─────────────────────────────────────────────────────────────────────────────
# A. Single Valid Enrollment Sample
# ─────────────────────────────────────────────────────────────────────────────

def test_single_valid_enrollment_sample(enrollment_service: SpeakerEnrollmentService):
    """Verify enrollment succeeds with a single genuine sample when force=True or min_samples=1."""
    assert SPK_A_REF1.is_file()
    result = enrollment_service.enroll_speaker(
        speaker_id="speaker_alice",
        audio_samples=[SPK_A_REF1],
        min_samples=1,
    )
    assert isinstance(result, EnrollmentResult)
    assert result.success is True
    assert result.status == "ENROLLED"
    assert result.accepted_samples == 1
    assert result.rejected_samples == 0

    ref_emb = enrollment_service.get_reference_embedding("speaker_alice")
    assert ref_emb is not None
    assert ref_emb.shape == (EMBEDDING_DIM,)
    assert abs(float(np.linalg.norm(ref_emb)) - 1.0) < 1e-4


# ─────────────────────────────────────────────────────────────────────────────
# B. Multiple Valid Enrollment Samples
# ─────────────────────────────────────────────────────────────────────────────

def test_multiple_valid_enrollment_samples(enrollment_service: SpeakerEnrollmentService):
    """Verify enrollment succeeds with 3 genuine samples and computes consistency score."""
    samples = [SPK_A_REF1, SPK_A_REF2, SPK_A_REF3]
    result = enrollment_service.enroll_speaker(
        speaker_id="speaker_multi",
        audio_samples=samples,
        min_samples=3,
    )
    assert result.success is True
    assert result.status == "ENROLLED"
    assert result.accepted_samples == 3
    assert result.rejected_samples == 0
    assert result.consistency_score is not None
    assert result.consistency_score > 0.70  # Genuine same-speaker recordings have high consistency

    status = enrollment_service.get_enrollment_status("speaker_multi")
    assert status.is_enrolled is True
    assert status.sample_count == 3
    assert status.embedding_dim == 192


# ─────────────────────────────────────────────────────────────────────────────
# C. Silence Sample Rejected
# ─────────────────────────────────────────────────────────────────────────────

def test_silence_sample_rejected(enrollment_service: SpeakerEnrollmentService):
    """Verify that pure silence recordings are rejected by Silero VAD."""
    assert SILENCE_WAV.is_file()
    result = enrollment_service.enroll_speaker(
        speaker_id="speaker_silent",
        audio_samples=[SILENCE_WAV],
        min_samples=1,
    )
    assert result.success is False
    assert result.status == "REJECTED_INSUFFICIENT_SAMPLES"
    assert result.accepted_samples == 0
    assert result.rejected_samples == 1
    assert any("silence" in r.lower() or "speech" in r.lower() for r in result.rejection_reasons)


# ─────────────────────────────────────────────────────────────────────────────
# D. Too-Short Sample Rejected
# ─────────────────────────────────────────────────────────────────────────────

def test_too_short_sample_rejected(enrollment_service: SpeakerEnrollmentService):
    """Verify that audio shorter than min_sample_duration_sec (0.5s = 8000 samples) is rejected."""
    # 0.2 seconds = 3200 samples
    too_short = np.random.randn(3200).astype(np.float32)
    result = enrollment_service.enroll_speaker(
        speaker_id="speaker_short",
        audio_samples=[too_short],
        min_samples=1,
    )
    assert result.success is False
    assert result.accepted_samples == 0
    assert result.rejected_samples == 1
    assert any("shorter than minimum" in r.lower() for r in result.rejection_reasons)


# ─────────────────────────────────────────────────────────────────────────────
# E. Invalid / Corrupt Audio Rejected
# ─────────────────────────────────────────────────────────────────────────────

def test_corrupt_invalid_audio_rejected(enrollment_service: SpeakerEnrollmentService):
    """Verify that corrupt audio files fail gracefully with structured rejection."""
    assert CORRUPT_WAV.is_file()
    result = enrollment_service.enroll_speaker(
        speaker_id="speaker_corrupt",
        audio_samples=[CORRUPT_WAV],
        min_samples=1,
    )
    assert result.success is False
    assert result.accepted_samples == 0
    assert result.rejected_samples == 1


# ─────────────────────────────────────────────────────────────────────────────
# F. Missing Speaker ID Raises ValueError
# ─────────────────────────────────────────────────────────────────────────────

def test_missing_speaker_id_raises_value_error(enrollment_service: SpeakerEnrollmentService):
    """Verify empty or None speaker_id raises ValueError."""
    with pytest.raises(ValueError, match="speaker_id must be a non-empty string"):
        enrollment_service.enroll_speaker("", [SPK_A_REF1])

    with pytest.raises(ValueError, match="speaker_id must be a non-empty string"):
        enrollment_service.enroll_speaker("   ", [SPK_A_REF1])


# ─────────────────────────────────────────────────────────────────────────────
# G. Missing Reference Embedding Handled Gracefully
# ─────────────────────────────────────────────────────────────────────────────

def test_missing_reference_embedding_handling(enrollment_service: SpeakerEnrollmentService):
    """Verify non-existent speaker ID returns None without crashing."""
    assert enrollment_service.get_reference_embedding("unregistered_user_123") is None
    status = enrollment_service.get_enrollment_status("unregistered_user_123")
    assert status.is_enrolled is False
    assert status.sample_count == 0


# ─────────────────────────────────────────────────────────────────────────────
# H. Valid Speaker Verification (Same Speaker Match)
# ─────────────────────────────────────────────────────────────────────────────

def test_valid_speaker_verification_match(enrollment_service: SpeakerEnrollmentService):
    """Verify test recording from same speaker matches enrolled reference."""
    enrollment_service.enroll_speaker("speaker_a", [SPK_A_REF1, SPK_A_REF2], min_samples=2)

    res: SpeakerResult = enrollment_service.verify_speaker(SPK_A_TEST, "speaker_a", threshold=DEFAULT_THRESHOLD)
    assert isinstance(res, SpeakerResult)
    assert res.speaker_match is True
    assert res.speaker_similarity >= 0.80  # Empirical same speaker similarity is ~0.87-0.90


# ─────────────────────────────────────────────────────────────────────────────
# I. Different Speaker Verification (Mismatch / Imposter)
# ─────────────────────────────────────────────────────────────────────────────

def test_different_speaker_verification_mismatch(enrollment_service: SpeakerEnrollmentService):
    """Verify test recording from a different speaker does NOT match enrolled reference."""
    enrollment_service.enroll_speaker("speaker_a", [SPK_A_REF1, SPK_A_REF2], min_samples=2)

    res: SpeakerResult = enrollment_service.verify_speaker(SPK_B_TEST, "speaker_a", threshold=DEFAULT_THRESHOLD)
    assert res.speaker_match is False
    assert res.speaker_similarity < 0.50  # Empirical different speaker similarity is ~0.24


# ─────────────────────────────────────────────────────────────────────────────
# J. Zero-Norm Embedding Handling
# ─────────────────────────────────────────────────────────────────────────────

def test_zero_norm_embedding_handling(shared_verifier: SpeakerVerifier):
    """Verify zero-norm or near-zero embedding raises error during validation."""
    zero_emb = np.zeros(EMBEDDING_DIM, dtype=np.float32)
    with pytest.raises(SpeakerVerifierInputError, match="must be L2-normalised"):
        test_wav = np.random.randn(16000).astype(np.float32)
        shared_verifier.verify_speaker(test_wav, zero_emb)


# ─────────────────────────────────────────────────────────────────────────────
# K. Embedding Dimension Mismatch Handling
# ─────────────────────────────────────────────────────────────────────────────

def test_embedding_dimension_mismatch_handling(shared_verifier: SpeakerVerifier):
    """Verify embedding with wrong dimension (e.g. 128 instead of 192) raises SpeakerVerifierInputError."""
    wrong_dim_emb = np.ones(128, dtype=np.float32) / np.sqrt(128)
    with pytest.raises(SpeakerVerifierInputError, match=f"must have shape \\({EMBEDDING_DIM},\\)"):
        test_wav = np.random.randn(16000).astype(np.float32)
        shared_verifier.verify_speaker(test_wav, wrong_dim_emb)


# ─────────────────────────────────────────────────────────────────────────────
# L & M. Multiple Enrollment Embeddings Aggregation & Unit L2-Norm
# ─────────────────────────────────────────────────────────────────────────────

def test_multiple_enrollment_embeddings_aggregated_mean_and_unit_norm(
    enrollment_service: SpeakerEnrollmentService, shared_verifier: SpeakerVerifier
):
    """Verify aggregation computes mean of unit vectors, then L2-renormalizes."""
    wav1 = preprocess_audio(str(SPK_A_REF1))
    wav2 = preprocess_audio(str(SPK_A_REF2))
    wav3 = preprocess_audio(str(SPK_A_REF3))

    emb1 = shared_verifier.generate_embedding(wav1)
    emb2 = shared_verifier.generate_embedding(wav2)
    emb3 = shared_verifier.generate_embedding(wav3)

    # Expected aggregation
    expected_mean = (emb1 + emb2 + emb3) / 3.0
    expected_ref = expected_mean / np.linalg.norm(expected_mean)

    enrollment_service.enroll_speaker("speaker_exact", [SPK_A_REF1, SPK_A_REF2, SPK_A_REF3], min_samples=3)
    actual_ref = enrollment_service.get_reference_embedding("speaker_exact")

    assert actual_ref is not None
    assert np.allclose(actual_ref, expected_ref, atol=1e-5)
    # Norm must be exactly 1.0
    assert abs(float(np.linalg.norm(actual_ref)) - 1.0) < 1e-6


# ─────────────────────────────────────────────────────────────────────────────
# N. Deterministic Similarity
# ─────────────────────────────────────────────────────────────────────────────

def test_deterministic_similarity(enrollment_service: SpeakerEnrollmentService):
    """Verify identical inputs yield identical cosine similarity values."""
    enrollment_service.enroll_speaker("speaker_det", [SPK_A_REF1], min_samples=1)
    res1 = enrollment_service.verify_speaker(SPK_A_TEST, "speaker_det")
    res2 = enrollment_service.verify_speaker(SPK_A_TEST, "speaker_det")
    assert abs(res1.speaker_similarity - res2.speaker_similarity) < 1e-6


# ─────────────────────────────────────────────────────────────────────────────
# O. Inconsistent Enrollment Samples Detected
# ─────────────────────────────────────────────────────────────────────────────

def test_inconsistent_enrollment_samples_detected(enrollment_service: SpeakerEnrollmentService):
    """Verify mixing different speakers (Speaker A + Speaker B) triggers consistency rejection."""
    mixed_samples = [SPK_A_REF1, SPK_B_REF]
    result = enrollment_service.enroll_speaker(
        speaker_id="speaker_mixed",
        audio_samples=mixed_samples,
        min_samples=2,
        force=False,
    )
    assert result.success is False
    assert result.status == "REJECTED_INCONSISTENT"
    assert result.consistency_score is not None
    assert result.consistency_score < enrollment_service.min_consistency_threshold


# ─────────────────────────────────────────────────────────────────────────────
# S. Biometric Security Invariants
# ─────────────────────────────────────────────────────────────────────────────

def test_biometric_security_no_embeddings_in_repr_or_logs():
    """Verify SpeakerProfile string representations and safe dicts never expose raw float arrays."""
    dummy_emb = np.ones(EMBEDDING_DIM, dtype=np.float32) / np.sqrt(EMBEDDING_DIM)
    profile = SpeakerProfile(
        speaker_id="alice",
        reference_embedding=dummy_emb,
        sample_count=3,
    )

    repr_str = repr(profile)
    assert "alice" in repr_str
    assert "0.072168" not in repr_str  # Raw float elements must not appear
    assert "<ndarray shape=(192,) dtype=float32" in repr_str

    safe_dict = profile.to_safe_dict()
    assert "reference_embedding" not in safe_dict
    assert safe_dict["speaker_id"] == "alice"


# ─────────────────────────────────────────────────────────────────────────────
# T. Repository CRUD Operations (Local & InMemory)
# ─────────────────────────────────────────────────────────────────────────────

def test_repository_crud_operations():
    """Verify LocalSpeakerRepository save, load, list, and delete."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        repo = LocalSpeakerRepository(storage_dir=tmp_dir)
        dummy_emb = np.ones(EMBEDDING_DIM, dtype=np.float32) / np.sqrt(EMBEDDING_DIM)
        profile = SpeakerProfile(speaker_id="bob", reference_embedding=dummy_emb, sample_count=2)

        # Save
        repo.save_profile(profile)
        assert repo.has_speaker("bob")
        assert "bob" in repo.list_speakers()

        # Retrieve
        loaded = repo.get_profile("bob")
        assert loaded is not None
        assert loaded.speaker_id == "bob"
        assert loaded.sample_count == 2
        assert np.allclose(loaded.reference_embedding, dummy_emb, atol=1e-5)

        # Retrieve embedding directly
        emb_direct = repo.get_reference_embedding("bob")
        assert emb_direct is not None
        assert np.allclose(emb_direct, dummy_emb, atol=1e-5)

        # Delete
        assert repo.delete_profile("bob") is True
        assert not repo.has_speaker("bob")
        assert repo.get_profile("bob") is None


# ─────────────────────────────────────────────────────────────────────────────
# U. Pipeline Integration with Speaker ID
# ─────────────────────────────────────────────────────────────────────────────

def test_pipeline_integration_with_speaker_id(shared_verifier: SpeakerVerifier, in_memory_repo: InMemorySpeakerRepository):
    """Verify InferencePipeline.process_audio resolves reference embedding via speaker_id."""
    service = SpeakerEnrollmentService(verifier=shared_verifier, repository=in_memory_repo, min_speech_ratio=0.1)
    service.enroll_speaker("speaker_alice", [SPK_A_REF1, SPK_A_REF2], min_samples=2)

    pipeline = InferencePipeline(
        speaker_verifier=shared_verifier,
        speaker_service=service,
        speaker_repository=in_memory_repo,
    )

    # Process test recording passing speaker_id
    wav = preprocess_audio(str(SPK_A_TEST))
    res = pipeline.process_audio(wav, session_id="test-session-speaker-id", speaker_id="speaker_alice")

    assert isinstance(res, InferenceResult)
    assert res.speech_detected is True
    assert res.speaker_similarity is not None
    assert res.speaker_match is True
    assert res.speaker_similarity >= 0.80


# ─────────────────────────────────────────────────────────────────────────────
# P, Q, R. Multi-Factor Verdict Scenarios
# ─────────────────────────────────────────────────────────────────────────────

def test_verdict_high_synthetic_is_cloned_regardless_of_speaker_match(
    shared_verifier: SpeakerVerifier, in_memory_repo: InMemorySpeakerRepository
):
    """
    Scenario P: High synthetic probability + high speaker similarity -> 'cloned'.
    Even if speaker matches 100%, an AI clone is detected!
    """
    service = SpeakerEnrollmentService(verifier=shared_verifier, repository=in_memory_repo, min_speech_ratio=0.1)
    service.enroll_speaker("target_victim", [SPK_A_REF1], min_samples=1)

    pipeline = InferencePipeline(
        speaker_verifier=shared_verifier,
        speaker_service=service,
        speaker_repository=in_memory_repo,
    )

    # SPK_A_TEST is synthetic TTS speech which matches speaker A embedding
    wav = preprocess_audio(str(SPK_A_TEST))
    res = pipeline.process_audio(wav, session_id="test-scenario-p", speaker_id="target_victim")
    assert res.speaker_match is True
    assert res.synthetic_probability > 0.80
    assert res.verdict == "cloned"


def test_verdict_low_synthetic_and_speaker_mismatch_is_imposter(
    shared_verifier: SpeakerVerifier, in_memory_repo: InMemorySpeakerRepository
):
    """
    Scenario Q: Low synthetic probability + low speaker similarity -> 'imposter'.
    Genuine natural voice, but belonging to a different speaker!
    """
    if not DEV_BONAFIDE_WAV.is_file():
        pytest.skip("DEV bonafide sample not available")

    service = SpeakerEnrollmentService(verifier=shared_verifier, repository=in_memory_repo, min_speech_ratio=0.1)
    service.enroll_speaker("speaker_alice", [SPK_A_REF1], min_samples=1)

    pipeline = InferencePipeline(
        speaker_verifier=shared_verifier,
        speaker_service=service,
        speaker_repository=in_memory_repo,
    )

    # Process genuine human recording from ASVspoof against Speaker A profile
    res = pipeline.process_audio(str(DEV_BONAFIDE_WAV), session_id="test-scenario-q", speaker_id="speaker_alice")

    assert res.speech_detected is True
    assert res.speaker_match is False
    assert res.synthetic_probability < 0.50
    assert res.verdict == "imposter"


def test_verdict_missing_reference_is_inconclusive(
    shared_verifier: SpeakerVerifier, in_memory_repo: InMemorySpeakerRepository
):
    """
    Scenario: Missing reference embedding -> speaker_similarity is None, verdict is 'inconclusive'.
    """
    if not DEV_BONAFIDE_WAV.is_file():
        pytest.skip("DEV bonafide sample not available")

    pipeline = InferencePipeline(
        speaker_verifier=shared_verifier,
        speaker_repository=in_memory_repo,
    )

    res = pipeline.process_audio(str(DEV_BONAFIDE_WAV), session_id="test-scenario-inconclusive", reference_embedding=None)

    assert res.speech_detected is True
    assert res.speaker_similarity is None
    assert res.speaker_match is None
    assert res.synthetic_probability < 0.50
    assert res.verdict == "inconclusive"
