"""
backend/platform/services/speaker_service.py
============================================
Service managing protected identity speaker enrollment and biometrics.
Wraps Member 1's SpeakerEnrollmentService and DatabaseSpeakerRepository.
"""

from __future__ import annotations

import base64
import io
import tempfile
from pathlib import Path
from typing import List, Optional

import numpy as np
from sqlalchemy.orm import Session

from backend.models.speaker_enrollment import EnrollmentResult, SpeakerEnrollmentService
from backend.platform.db.models import ProtectedIdentity, SpeakerProfileModel
from backend.platform.db.speaker_repo_adapter import DatabaseSpeakerRepository
from backend.platform.schemas.protected_identities import EnrollmentResponseDto
from backend.platform.services.ai_adapter import AIAdapter
from backend.utils.logger import get_logger

log = get_logger(__name__)


class SpeakerService:
    """Orchestrates biometric enrollment and reference profile persistence."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.ai_adapter = AIAdapter.get_instance()
        self.speaker_repo = DatabaseSpeakerRepository()
        self.enrollment_service: SpeakerEnrollmentService = self.ai_adapter.pipeline.speaker_service

    def enroll_identity(
        self,
        protected_identity_id: str,
        audio_samples: List[str],
    ) -> EnrollmentResponseDto:
        """
        Enroll multiple audio samples for a protected executive identity.

        Parameters
        ----------
        protected_identity_id : str
            UUID of ProtectedIdentity record.
        audio_samples : List[str]
            List of Base64 encoded audio strings or local file paths.
        """
        identity = self.db.query(ProtectedIdentity).filter_by(id=protected_identity_id).first()
        if not identity:
            raise ValueError(f"Protected identity '{protected_identity_id}' not found.")

        speaker_id = identity.speaker_id

        # Convert each sample to waveform or temporary file for Member 1 enrollment service
        parsed_samples = []
        temp_files = []

        try:
            for idx, raw_sample in enumerate(audio_samples):
                if isinstance(raw_sample, str) and Path(raw_sample).exists():
                    parsed_samples.append(raw_sample)
                else:
                    # Treat as base64 audio
                    raw_bytes = base64.b64decode(raw_sample)
                    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
                    tmp.write(raw_bytes)
                    tmp.flush()
                    tmp.close()
                    temp_files.append(tmp.name)
                    parsed_samples.append(tmp.name)

            log.info("[SpeakerService] Enrolling %d samples for '%s' (%s)...", len(parsed_samples), identity.full_name, speaker_id)

            # Delegate to Member 1's SpeakerEnrollmentService
            enrollment_result: EnrollmentResult = self.enrollment_service.enroll_speaker(
                speaker_id=speaker_id,
                audio_samples=parsed_samples,
            )

            if enrollment_result.success:
                # Link speaker profile model to protected identity
                profile_model = self.db.query(SpeakerProfileModel).filter_by(speaker_id=speaker_id).first()
                if profile_model:
                    profile_model.protected_identity_id = identity.id
                    self.db.commit()
                log.info("[SpeakerService] Biometric profile successfully enrolled for '%s'.", speaker_id)

            return EnrollmentResponseDto(
                speaker_id=speaker_id,
                success=enrollment_result.success,
                status=enrollment_result.status,
                accepted_samples=enrollment_result.accepted_samples,
                rejected_samples=enrollment_result.rejected_samples,
                rejection_reasons=enrollment_result.rejection_reasons,
                consistency_score=enrollment_result.consistency_score,
                quality_warnings=enrollment_result.quality_warnings,
                message=enrollment_result.message,
            )
        finally:
            # Clean up temporary audio files
            for tmp_path in temp_files:
                try:
                    Path(tmp_path).unlink(missing_ok=True)
                except Exception:
                    pass
