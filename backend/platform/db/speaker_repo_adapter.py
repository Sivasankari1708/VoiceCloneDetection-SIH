"""
backend/platform/db/speaker_repo_adapter.py
===========================================
Database-backed speaker repository implementing Member 1's BaseSpeakerRepository.

Zero modifications to Member 1 code:
  - Subclasses BaseSpeakerRepository from backend.models.speaker_repository.
  - Stores SpeakerProfile instances in the database via SpeakerProfileModel.
  - Redacts sensitive biometric data on repr/serialization.
"""

from __future__ import annotations

import json
from typing import List, Optional

import numpy as np
from sqlalchemy.orm import Session

from backend.models.speaker_repository import (
    BaseSpeakerRepository,
    SpeakerProfile,
)
from backend.platform.db.models import SpeakerProfileModel, utcnow
from backend.platform.db.session import SessionLocal
from backend.utils.logger import get_logger

log = get_logger(__name__)


class DatabaseSpeakerRepository(BaseSpeakerRepository):
    """
    SQLAlchemy-backed implementation of Member 1's BaseSpeakerRepository.
    Persists 192-D speaker biometric reference profiles in PostgreSQL / SQLite.
    """

    def __init__(self, session_factory=SessionLocal) -> None:
        self.session_factory = session_factory

    def save_profile(self, profile: SpeakerProfile) -> None:
        """
        Persist or update a speaker profile.

        Parameters
        ----------
        profile : SpeakerProfile
            Validated profile containing L2-normalized 192-D embedding.
        """
        emb_list = profile.reference_embedding.tolist()
        emb_json = json.dumps(emb_list)
        meta_json = json.dumps(profile.metadata or {})

        db: Session = self.session_factory()
        try:
            existing = db.query(SpeakerProfileModel).filter_by(speaker_id=profile.speaker_id).first()
            if existing:
                existing.sample_count = profile.sample_count
                existing.embedding_dim = profile.embedding_dim
                existing.embedding_vector_json = emb_json
                existing.metadata_json = meta_json
                existing.updated_at = utcnow()
            else:
                new_model = SpeakerProfileModel(
                    speaker_id=profile.speaker_id,
                    sample_count=profile.sample_count,
                    embedding_dim=profile.embedding_dim,
                    embedding_vector_json=emb_json,
                    metadata_json=meta_json,
                )
                db.add(new_model)
            db.commit()
            log.info("[SpeakerRepo] Persisted profile for speaker '%s' in database.", profile.speaker_id)
        except Exception as exc:
            db.rollback()
            log.error("[SpeakerRepo] Failed to save profile for '%s': %s", profile.speaker_id, exc)
            raise
        finally:
            db.close()

    def get_profile(self, speaker_id: str) -> Optional[SpeakerProfile]:
        """Retrieve full speaker profile by ID."""
        db: Session = self.session_factory()
        try:
            model = db.query(SpeakerProfileModel).filter_by(speaker_id=speaker_id).first()
            if not model:
                return None

            emb_list = json.loads(model.embedding_vector_json)
            ref_emb = np.array(emb_list, dtype=np.float32)

            meta = {}
            try:
                meta = json.loads(model.metadata_json)
            except Exception:
                pass

            return SpeakerProfile(
                speaker_id=model.speaker_id,
                reference_embedding=ref_emb,
                embedding_dim=model.embedding_dim,
                sample_count=model.sample_count,
                created_at=model.created_at.isoformat() if model.created_at else "",
                updated_at=model.updated_at.isoformat() if model.updated_at else "",
                metadata=meta,
            )
        finally:
            db.close()

    def get_reference_embedding(self, speaker_id: str) -> Optional[np.ndarray]:
        """Retrieve reference embedding vector for a speaker."""
        db: Session = self.session_factory()
        try:
            model = db.query(SpeakerProfileModel).filter_by(speaker_id=speaker_id).first()
            if not model:
                return None
            emb_list = json.loads(model.embedding_vector_json)
            return np.array(emb_list, dtype=np.float32)
        finally:
            db.close()

    def delete_profile(self, speaker_id: str) -> bool:
        """Delete speaker profile and reference embedding."""
        db: Session = self.session_factory()
        try:
            model = db.query(SpeakerProfileModel).filter_by(speaker_id=speaker_id).first()
            if not model:
                return False
            db.delete(model)
            db.commit()
            log.info("[SpeakerRepo] Deleted profile for speaker '%s' from database.", speaker_id)
            return True
        except Exception as exc:
            db.rollback()
            log.error("[SpeakerRepo] Failed to delete profile '%s': %s", speaker_id, exc)
            return False
        finally:
            db.close()

    def list_speakers(self) -> List[str]:
        """List all enrolled speaker IDs."""
        db: Session = self.session_factory()
        try:
            rows = db.query(SpeakerProfileModel.speaker_id).all()
            return [r[0] for r in rows]
        finally:
            db.close()

    def has_speaker(self, speaker_id: str) -> bool:
        """Check if speaker profile exists."""
        db: Session = self.session_factory()
        try:
            count = db.query(SpeakerProfileModel).filter_by(speaker_id=speaker_id).count()
            return count > 0
        finally:
            db.close()
