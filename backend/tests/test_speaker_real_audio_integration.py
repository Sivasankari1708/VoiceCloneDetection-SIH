"""
backend/tests/test_speaker_real_audio_integration.py
====================================================
End-to-end real audio integration test using official ASVspoof 2019 LA dev audio.

Validates:
  1. Enrollment of genuine speaker LA_0069 using 3 authentic bona fide recordings.
  2. Verification of same-speaker genuine recording (LA_D_1293230.flac):
     -> High similarity, speaker match, low synthetic probability -> 'genuine' verdict.
  3. Verification of different-speaker genuine recording (LA_0070 - LA_D_1090286.flac):
     -> Low similarity, speaker mismatch, low synthetic probability -> 'imposter' verdict.
  4. Verification of spoofed recording (LA_D_1000265.flac):
     -> High synthetic probability -> 'cloned' verdict.

NOTE: This is an integration sanity test against real audio, NOT a benchmark evaluation.
Official evaluation datasets remain completely untouched.
"""

from pathlib import Path
import pytest

from backend.models.speaker_enrollment import SpeakerEnrollmentService
from backend.models.speaker_repository import InMemorySpeakerRepository
from backend.models.speaker_verifier import SpeakerVerifier
from backend.pipeline.inference_pipeline import InferencePipeline

DEV_FLAC_DIR = Path("data/asvspoof2019/LA/ASVspoof2019_LA_dev/flac")

# Speaker LA_0069 genuine files
SPK_69_ENROLL_1 = DEV_FLAC_DIR / "LA_D_1047731.flac"
SPK_69_ENROLL_2 = DEV_FLAC_DIR / "LA_D_1105538.flac"
SPK_69_ENROLL_3 = DEV_FLAC_DIR / "LA_D_1125976.flac"
SPK_69_TEST_GENUINE = DEV_FLAC_DIR / "LA_D_1403371.flac"

# Speaker LA_0070 genuine file (imposter)
SPK_70_TEST_IMPOSTER = DEV_FLAC_DIR / "LA_D_1090286.flac"

# Spoofed file
SPOOF_TEST = DEV_FLAC_DIR / "LA_D_1000265.flac"


@pytest.fixture(scope="module")
def check_real_audio_exists():
    for f in (SPK_69_ENROLL_1, SPK_69_ENROLL_2, SPK_69_ENROLL_3, SPK_69_TEST_GENUINE, SPK_70_TEST_IMPOSTER, SPOOF_TEST):
        if not f.is_file():
            pytest.skip(f"Real audio file missing: {f}")


def test_real_audio_enrollment_and_verification(check_real_audio_exists):
    """Enroll authentic speaker LA_0069 and test same-speaker, imposter, and spoof."""
    verifier = SpeakerVerifier.load()
    repo = InMemorySpeakerRepository()
    enroll_service = SpeakerEnrollmentService(verifier=verifier, repository=repo)

    # 1. Enroll LA_0069 with 3 real bona fide recordings
    enroll_result = enroll_service.enroll_speaker(
        speaker_id="LA_0069",
        audio_samples=[SPK_69_ENROLL_1, SPK_69_ENROLL_2, SPK_69_ENROLL_3],
        min_samples=3,
    )
    assert enroll_result.success is True
    assert enroll_result.status == "ENROLLED"
    assert enroll_result.accepted_samples == 3
    assert enroll_result.rejected_samples == 0
    assert enroll_result.consistency_score is not None
    assert enroll_result.consistency_score > 0.50  # Intra-speaker consistency for natural recordings

    pipeline = InferencePipeline(
        speaker_verifier=verifier,
        speaker_service=enroll_service,
        speaker_repository=repo,
    )

    # 2. Test same-speaker genuine recording
    res_same = pipeline.process_audio(
        audio_input=SPK_69_TEST_GENUINE,
        session_id="real-session-same-spk",
        speaker_id="LA_0069",
    )
    assert res_same.speech_detected is True
    assert res_same.speaker_similarity is not None
    assert res_same.speaker_similarity >= 0.70, f"Expected similarity >= 0.70, got {res_same.speaker_similarity}"
    assert res_same.speaker_match is True
    assert res_same.synthetic_probability < 0.50
    assert res_same.verdict == "genuine"

    # 3. Test different-speaker genuine recording (imposter)
    res_diff = pipeline.process_audio(
        audio_input=SPK_70_TEST_IMPOSTER,
        session_id="real-session-diff-spk",
        speaker_id="LA_0069",
    )
    assert res_diff.speech_detected is True
    assert res_diff.speaker_similarity is not None
    assert res_diff.speaker_similarity < 0.60, f"Expected imposter similarity < 0.60, got {res_diff.speaker_similarity}"
    assert res_diff.speaker_match is False
    assert res_diff.synthetic_probability < 0.50
    assert res_diff.verdict == "imposter"

    # 4. Test spoofed / cloned recording
    res_spoof = pipeline.process_audio(
        audio_input=SPOOF_TEST,
        session_id="real-session-spoof",
        speaker_id="LA_0069",
    )
    assert res_spoof.speech_detected is True
    assert res_spoof.synthetic_probability > 0.80
    assert res_spoof.verdict == "cloned"
