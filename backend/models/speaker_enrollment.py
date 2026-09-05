"""
backend/models/speaker_enrollment.py
====================================
Speaker Enrollment Service using SpeechBrain ECAPA-TDNN and Silero VAD.

Responsibilities:
-----------------
1. Validate audio inputs: decode, convert to 16 kHz mono float32.
2. Filter through Silero VAD: reject silent or low-speech samples with clear structured reasons.
3. Extract 192-D L2-normalized ECAPA-TDNN embeddings.
4. Calculate pairwise consistency across multi-sample enrollments.
5. Aggregate multiple embeddings via normalized mean + L2 re-normalization:
       R = normalize(mean(E_1, E_2, ..., E_N))
6. Securely persist reference profiles in BaseSpeakerRepository (never storing raw audio).
7. Expose safe public methods for enrollment, verification, status inspection, and deletion.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np

from backend.audio.decoder import load_audio
from backend.audio.preprocessing import TARGET_SAMPLE_RATE, normalize_waveform
from backend.audio.vad import SileroVAD, VADResult
from backend.models.speaker_repository import (
    BaseSpeakerRepository,
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
from backend.utils.logger import get_logger

log = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Configurable Default Knobs
# ─────────────────────────────────────────────────────────────────────────────

DEFAULT_MIN_ENROLLMENT_SAMPLES: int = 3
DEFAULT_MIN_SPEECH_RATIO: float = 0.25         # at least 25% active speech
DEFAULT_MIN_SPEECH_DURATION_SEC: float = 0.50  # at least 0.5s of speech
DEFAULT_MIN_SAMPLE_DURATION_SEC: float = 0.50  # minimum file length
DEFAULT_MIN_CONSISTENCY_THRESHOLD: float = 0.50 # minimum pairwise similarity


# ─────────────────────────────────────────────────────────────────────────────
# Enrollment Exceptions
# ─────────────────────────────────────────────────────────────────────────────

class SpeakerEnrollmentError(Exception):
    """Base exception for speaker enrollment failures."""


class SampleQualityError(SpeakerEnrollmentError):
    """Raised when an audio sample fails quality or VAD requirements."""


class InconsistentEnrollmentError(SpeakerEnrollmentError):
    """Raised when enrollment samples exhibit conflicting speaker characteristics."""


# ─────────────────────────────────────────────────────────────────────────────
# Result Dataclasses
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class EnrollmentResult:
    """
    Public structured result of a speaker enrollment attempt.
    Biometric security: NEVER contains raw embedding vectors.
    """

    speaker_id: str
    success: bool
    status: str
    accepted_samples: int
    rejected_samples: int
    rejection_reasons: List[str] = field(default_factory=list)
    consistency_score: Optional[float] = None
    quality_warnings: List[str] = field(default_factory=list)
    created_at: Optional[str] = None
    message: str = ""

    def summary(self) -> str:
        return (
            f"[{self.status}] speaker_id='{self.speaker_id}'  "
            f"accepted={self.accepted_samples}  rejected={self.rejected_samples}  "
            f"consistency={f'{self.consistency_score:.3f}' if self.consistency_score is not None else 'N/A'}"
        )


@dataclass(frozen=True)
class EnrollmentStatusResult:
    """Status metadata for an enrolled speaker profile."""

    speaker_id: str
    is_enrolled: bool
    sample_count: int = 0
    embedding_dim: int = EMBEDDING_DIM
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


# ─────────────────────────────────────────────────────────────────────────────
# Speaker Enrollment Service
# ─────────────────────────────────────────────────────────────────────────────

class SpeakerEnrollmentService:
    """
    Service managing multi-sample speaker enrollment and reference embedding retrieval.
    """

    def __init__(
        self,
        verifier: Optional[SpeakerVerifier] = None,
        vad: Optional[SileroVAD] = None,
        repository: Optional[BaseSpeakerRepository] = None,
        *,
        min_speech_ratio: float = DEFAULT_MIN_SPEECH_RATIO,
        min_speech_duration_sec: float = DEFAULT_MIN_SPEECH_DURATION_SEC,
        min_sample_duration_sec: float = DEFAULT_MIN_SAMPLE_DURATION_SEC,
        min_consistency_threshold: float = DEFAULT_MIN_CONSISTENCY_THRESHOLD,
    ) -> None:
        self.verifier = verifier or SpeakerVerifier.load()
        self.vad = vad or SileroVAD.load()
        self.repository = repository or LocalSpeakerRepository()

        self.min_speech_ratio = float(min_speech_ratio)
        self.min_speech_duration_sec = float(min_speech_duration_sec)
        self.min_sample_duration_sec = float(min_sample_duration_sec)
        self.min_consistency_threshold = float(min_consistency_threshold)

        log.info(
            "SpeakerEnrollmentService initialized (min_ratio=%.2f, min_speech_sec=%.2f, min_consistency=%.2f)",
            self.min_speech_ratio,
            self.min_speech_duration_sec,
            self.min_consistency_threshold,
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Input Standardizer
    # ─────────────────────────────────────────────────────────────────────────

    def _standardize_sample(
        self, audio_input: Union[str, Path, bytes, np.ndarray]
    ) -> np.ndarray:
        """Decode and normalize sample to 16 kHz mono float32."""
        if audio_input is None:
            raise SampleQualityError("Audio input cannot be None.")

        if isinstance(audio_input, (str, Path)):
            path = Path(audio_input)
            if not path.is_file():
                raise SampleQualityError(f"Audio file not found: '{path}'")
            try:
                wav, sr = load_audio(path)
            except Exception as exc:
                raise SampleQualityError(f"Failed to decode audio file '{path.name}': {exc}") from exc
        elif isinstance(audio_input, bytes):
            if len(audio_input) == 0:
                raise SampleQualityError("Audio byte buffer is empty (0 bytes).")
            try:
                wav, sr = load_audio(audio_input)
            except Exception as exc:
                raise SampleQualityError(f"Failed to decode audio bytes: {exc}") from exc
        elif isinstance(audio_input, np.ndarray):
            if audio_input.size == 0:
                raise SampleQualityError("Waveform array is empty (0 samples).")
            if not np.all(np.isfinite(audio_input)):
                raise SampleQualityError("Waveform contains NaN or Inf values.")
            wav = audio_input
            if wav.ndim > 1:
                # Downmix to mono
                wav = np.mean(wav, axis=0)
            wav = wav.astype(np.float32, copy=False)
            sr = TARGET_SAMPLE_RATE
        else:
            raise SampleQualityError(f"Unsupported audio input type: {type(audio_input).__name__}")

        # Ensure peak normalized
        wav = normalize_waveform(wav)
        return wav

    # ─────────────────────────────────────────────────────────────────────────
    # Audio Quality & VAD Validation
    # ─────────────────────────────────────────────────────────────────────────

    def validate_sample_quality(self, waveform: np.ndarray, sample_index: int = 1) -> VADResult:
        """
        Validate duration and speech content using Silero VAD.

        Raises SampleQualityError if sample is silent or lacks sufficient speech.
        """
        duration_sec = len(waveform) / TARGET_SAMPLE_RATE
        if duration_sec < self.min_sample_duration_sec:
            raise SampleQualityError(
                f"Sample {sample_index} duration ({duration_sec:.2f}s) is shorter than minimum required ({self.min_sample_duration_sec:.2f}s)."
            )

        vad_res: VADResult = self.vad.detect(waveform)

        if not vad_res.speech_detected:
            raise SampleQualityError(
                f"Sample {sample_index} rejected: silence or non-speech detected (speech_probability={vad_res.speech_probability:.3f})."
            )

        if vad_res.speech_ratio < self.min_speech_ratio:
            raise SampleQualityError(
                f"Sample {sample_index} rejected: insufficient speech content "
                f"({vad_res.speech_ratio * 100.0:.1f}% speech ratio, minimum required is {self.min_speech_ratio * 100.0:.0f}%)."
            )

        if vad_res.total_speech_sec < self.min_speech_duration_sec:
            raise SampleQualityError(
                f"Sample {sample_index} rejected: total speech duration ({vad_res.total_speech_sec:.2f}s) "
                f"is less than required ({self.min_speech_duration_sec:.2f}s)."
            )

        return vad_res

    # ─────────────────────────────────────────────────────────────────────────
    # Multi-Sample Consistency
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def calculate_consistency(embeddings: List[np.ndarray]) -> Tuple[float, float]:
        """
        Compute mean and minimum pairwise cosine similarities across a set of embeddings.

        Returns
        -------
        (avg_similarity, min_similarity)
        """
        if len(embeddings) < 2:
            return 1.0, 1.0

        pairwise_sims: List[float] = []
        for emb1, emb2 in itertools.combinations(embeddings, 2):
            sim = float(np.dot(emb1, emb2))
            pairwise_sims.append(sim)

        avg_sim = float(np.mean(pairwise_sims))
        min_sim = float(np.min(pairwise_sims))
        return avg_sim, min_sim

    # ─────────────────────────────────────────────────────────────────────────
    # Core Enrollment API
    # ─────────────────────────────────────────────────────────────────────────

    def enroll_speaker(
        self,
        speaker_id: str,
        audio_samples: List[Union[str, Path, bytes, np.ndarray]],
        *,
        min_samples: int = DEFAULT_MIN_ENROLLMENT_SAMPLES,
        force: bool = False,
    ) -> EnrollmentResult:
        """
        Enroll a speaker from one or more genuine audio recordings.

        Parameters
        ----------
        speaker_id : str
            Unique speaker identifier (e.g. username or UUID).
        audio_samples : List[Union[str, Path, bytes, np.ndarray]]
            One or more audio recordings.
        min_samples : int
            Minimum number of valid samples required for enrollment (default 3).
        force : bool
            If True, overrides consistency rejection and allows fewer samples if >= 1 valid.

        Returns
        -------
        EnrollmentResult
            Structured outcome containing status and safe metrics.
        """
        if not speaker_id or not isinstance(speaker_id, str) or not speaker_id.strip():
            raise ValueError("speaker_id must be a non-empty string.")

        speaker_id = speaker_id.strip()

        if not audio_samples or not isinstance(audio_samples, list):
            raise ValueError("audio_samples must be a non-empty list of audio inputs.")

        log.info("Starting enrollment for speaker_id='%s' (%d sample(s) provided)", speaker_id, len(audio_samples))

        accepted_embeddings: List[np.ndarray] = []
        rejection_reasons: List[str] = []
        quality_warnings: List[str] = []

        # 1. Process each sample independently
        for idx, sample in enumerate(audio_samples, start=1):
            try:
                waveform = self._standardize_sample(sample)
                vad_res = self.validate_sample_quality(waveform, sample_index=idx)
                embedding = self.verifier.generate_embedding(waveform)
                accepted_embeddings.append(embedding)
                log.debug(
                    "Sample %d/%d accepted: duration=%.2f s, speech_ratio=%.1f%%",
                    idx,
                    len(audio_samples),
                    len(waveform) / TARGET_SAMPLE_RATE,
                    vad_res.speech_ratio * 100.0,
                )
            except SampleQualityError as exc:
                rejection_reasons.append(str(exc))
                log.warning("Sample %d rejected: %s", idx, exc)
            except Exception as exc:
                err_msg = f"Sample {idx} processing failed: {exc}"
                rejection_reasons.append(err_msg)
                log.warning("%s", err_msg)

        accepted_count = len(accepted_embeddings)
        rejected_count = len(rejection_reasons)

        # 2. Check sample count threshold
        effective_min = 1 if force else min_samples
        if accepted_count < effective_min:
            msg = (
                f"Enrollment rejected: {accepted_count} valid sample(s) accepted, "
                f"minimum required is {effective_min}."
            )
            log.warning("[Enrollment] %s", msg)
            return EnrollmentResult(
                speaker_id=speaker_id,
                success=False,
                status="REJECTED_INSUFFICIENT_SAMPLES",
                accepted_samples=accepted_count,
                rejected_samples=rejected_count,
                rejection_reasons=rejection_reasons,
                consistency_score=None,
                quality_warnings=quality_warnings,
                created_at=None,
                message=msg,
            )

        # 3. Check pairwise consistency if multiple samples are accepted
        avg_consistency, min_consistency = self.calculate_consistency(accepted_embeddings)
        if accepted_count >= 2:
            if avg_consistency < self.min_consistency_threshold and not force:
                msg = (
                    f"Enrollment rejected: Inconsistent voice samples detected "
                    f"(average pairwise similarity {avg_consistency:.3f} < threshold {self.min_consistency_threshold:.2f}). "
                    "Ensure all recordings belong to the exact same speaker."
                )
                log.warning("[Enrollment] %s", msg)
                return EnrollmentResult(
                    speaker_id=speaker_id,
                    success=False,
                    status="REJECTED_INCONSISTENT",
                    accepted_samples=accepted_count,
                    rejected_samples=rejected_count,
                    rejection_reasons=rejection_reasons,
                    consistency_score=avg_consistency,
                    quality_warnings=quality_warnings,
                    created_at=None,
                    message=msg,
                )
            elif avg_consistency < self.min_consistency_threshold:
                quality_warnings.append(
                    f"Low sample consistency ({avg_consistency:.3f}); forced enrollment."
                )

        if accepted_count < 3:
            quality_warnings.append(
                f"Enrolled with {accepted_count} sample(s); 3+ recordings recommended for robust profiles."
            )

        # 4. Aggregation: normalize(mean(E_1, ..., E_N))
        stacked = np.stack(accepted_embeddings, axis=0)  # (N, 192)
        mean_emb = stacked.mean(axis=0)                   # (192,)
        mean_norm = float(np.linalg.norm(mean_emb))

        if mean_norm < 1e-12:
            msg = "Aggregated reference embedding is near-zero. Cannot normalize."
            log.error("[Enrollment] %s", msg)
            return EnrollmentResult(
                speaker_id=speaker_id,
                success=False,
                status="FAILED",
                accepted_samples=accepted_count,
                rejected_samples=rejected_count,
                rejection_reasons=[msg],
                consistency_score=avg_consistency if accepted_count >= 2 else None,
                quality_warnings=quality_warnings,
                created_at=None,
                message=msg,
            )

        reference_embedding = (mean_emb / mean_norm).astype(np.float32)

        # 5. Persist profile
        now_ts = datetime.now(timezone.utc).isoformat()
        profile = SpeakerProfile(
            speaker_id=speaker_id,
            reference_embedding=reference_embedding,
            embedding_dim=EMBEDDING_DIM,
            sample_count=accepted_count,
            created_at=now_ts,
            updated_at=now_ts,
            metadata={
                "consistency_score": float(avg_consistency) if accepted_count >= 2 else 1.0,
                "min_pairwise_similarity": float(min_consistency) if accepted_count >= 2 else 1.0,
                "rejected_count": rejected_count,
                "quality_warnings": quality_warnings,
            },
        )
        self.repository.save_profile(profile)

        log.info(
            "Speaker '%s' enrolled successfully with %d samples (consistency=%.3f)",
            speaker_id,
            accepted_count,
            avg_consistency,
        )

        return EnrollmentResult(
            speaker_id=speaker_id,
            success=True,
            status="ENROLLED",
            accepted_samples=accepted_count,
            rejected_samples=rejected_count,
            rejection_reasons=rejection_reasons,
            consistency_score=float(avg_consistency) if accepted_count >= 2 else 1.0,
            quality_warnings=quality_warnings,
            created_at=profile.created_at,
            message=f"Speaker '{speaker_id}' enrolled successfully with {accepted_count} sample(s).",
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Public Retrieval & Management API
    # ─────────────────────────────────────────────────────────────────────────

    def get_reference_embedding(self, speaker_id: str) -> Optional[np.ndarray]:
        """Retrieve L2-normalized 192-D reference embedding for an enrolled speaker."""
        return self.repository.get_reference_embedding(speaker_id)

    def get_enrollment_status(self, speaker_id: str) -> EnrollmentStatusResult:
        """Inspect enrollment status and safe profile metadata for a speaker."""
        profile = self.repository.get_profile(speaker_id)
        if profile is None:
            return EnrollmentStatusResult(speaker_id=speaker_id, is_enrolled=False)

        return EnrollmentStatusResult(
            speaker_id=profile.speaker_id,
            is_enrolled=True,
            sample_count=profile.sample_count,
            embedding_dim=profile.embedding_dim,
            created_at=profile.created_at,
            updated_at=profile.updated_at,
            metadata=profile.metadata,
        )

    def delete_enrollment(self, speaker_id: str) -> bool:
        """Delete an enrolled speaker's profile and embedding."""
        return self.repository.delete_profile(speaker_id)

    def list_enrolled_speakers(self) -> List[str]:
        """List all enrolled speaker IDs."""
        return self.repository.list_speakers()

    def verify_speaker(
        self,
        audio_input: Union[str, Path, bytes, np.ndarray],
        speaker_id: str,
        *,
        threshold: float = DEFAULT_THRESHOLD,
    ) -> SpeakerResult:
        """
        Verify incoming audio against an enrolled speaker.

        Raises FileNotFoundError if speaker is not enrolled.
        """
        ref_emb = self.get_reference_embedding(speaker_id)
        if ref_emb is None:
            raise FileNotFoundError(f"Speaker '{speaker_id}' is not enrolled in the system.")

        waveform = self._standardize_sample(audio_input)
        return self.verifier.verify_speaker(waveform, ref_emb, threshold=threshold)
