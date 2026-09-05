"""
backend/models/speaker_repository.py
====================================
Persistence layer for enrolled speaker biometric profiles.

Security & Privacy Guarantees:
------------------------------
1. Raw enrollment audio is NEVER stored.
2. Embeddings are stored as 192-D float32 numerical arrays with full precision.
3. String representations and summaries redact raw embedding vectors to prevent
   sensitive biometric exposure in logs and debug dumps.
4. Clean abstract repository interface allowing future migration to PostgreSQL / SQL databases.
"""

from __future__ import annotations

import abc
import json
import os
import shutil
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

from backend.utils.logger import get_logger

log = get_logger(__name__)

DEFAULT_EMBEDDING_DIM = 192
_NORM_TOLERANCE = 1e-4


@dataclass
class SpeakerProfile:
    """
    Biometric speaker profile holding the reference embedding and metadata.

    Attributes
    ----------
    speaker_id:
        Unique identifier for the speaker (e.g. user ID, name).
    reference_embedding:
        L2-normalized 192-D float32 embedding vector.
    embedding_dim:
        Dimensionality of the embedding (192 for ECAPA-TDNN).
    sample_count:
        Number of speech samples aggregated to create this profile.
    created_at:
        ISO-8601 UTC timestamp of initial enrollment.
    updated_at:
        ISO-8601 UTC timestamp of last update.
    metadata:
        Optional quality metrics, consistency scores, or client metadata.
    """

    speaker_id: str
    reference_embedding: np.ndarray
    embedding_dim: int = DEFAULT_EMBEDDING_DIM
    sample_count: int = 1
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    updated_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.speaker_id or not isinstance(self.speaker_id, str):
            raise ValueError("speaker_id must be a non-empty string.")

        if not isinstance(self.reference_embedding, np.ndarray):
            raise ValueError(
                f"reference_embedding must be a numpy ndarray, got {type(self.reference_embedding).__name__}."
            )

        if self.reference_embedding.shape != (self.embedding_dim,):
            raise ValueError(
                f"reference_embedding must have shape ({self.embedding_dim},), got {self.reference_embedding.shape}."
            )

        if self.reference_embedding.dtype != np.float32:
            self.reference_embedding = self.reference_embedding.astype(np.float32)

        norm = float(np.linalg.norm(self.reference_embedding))
        if abs(norm - 1.0) > _NORM_TOLERANCE:
            raise ValueError(
                f"reference_embedding must be L2-normalized (norm=1.0), got norm={norm:.6f}."
            )

    def __repr__(self) -> str:
        # Sensitive biometric security: NEVER print raw vector elements
        return (
            f"SpeakerProfile(speaker_id='{self.speaker_id}', "
            f"embedding_dim={self.embedding_dim}, "
            f"sample_count={self.sample_count}, "
            f"reference_embedding=<ndarray shape={self.reference_embedding.shape} "
            f"dtype={self.reference_embedding.dtype} norm={float(np.linalg.norm(self.reference_embedding)):.4f}>, "
            f"created_at='{self.created_at}')"
        )

    def to_safe_dict(self) -> Dict[str, Any]:
        """Convert profile to a public/log-safe dict without raw embedding floats."""
        return {
            "speaker_id": self.speaker_id,
            "embedding_dim": self.embedding_dim,
            "sample_count": self.sample_count,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "metadata": self.metadata,
        }


class BaseSpeakerRepository(abc.ABC):
    """Abstract interface for speaker profile persistence."""

    @abc.abstractmethod
    def save_profile(self, profile: SpeakerProfile) -> None:
        """Persist or update a speaker profile."""

    @abc.abstractmethod
    def get_profile(self, speaker_id: str) -> Optional[SpeakerProfile]:
        """Retrieve full speaker profile by ID."""

    @abc.abstractmethod
    def get_reference_embedding(self, speaker_id: str) -> Optional[np.ndarray]:
        """Retrieve reference embedding vector for a speaker."""

    @abc.abstractmethod
    def delete_profile(self, speaker_id: str) -> bool:
        """Delete speaker profile and reference embedding."""

    @abc.abstractmethod
    def list_speakers(self) -> List[str]:
        """List all enrolled speaker IDs."""

    @abc.abstractmethod
    def has_speaker(self, speaker_id: str) -> bool:
        """Check if speaker profile exists."""


class LocalSpeakerRepository(BaseSpeakerRepository):
    """
    Filesystem-backed speaker repository.

    Layout:
        {storage_dir}/
            {speaker_id}/
                profile.json      <- safe metadata
                embedding.npy     <- 192-D float32 numpy array
    """

    def __init__(self, storage_dir: Union[str, Path] = "data/enrolled_speakers") -> None:
        self.storage_dir = Path(storage_dir).resolve()
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        log.info("LocalSpeakerRepository initialized at %s", self.storage_dir)

    def _speaker_dir(self, speaker_id: str) -> Path:
        # Sanitize speaker_id for directory path safety
        safe_id = "".join(c for c in speaker_id if c.isalnum() or c in ("-", "_", "."))
        if not safe_id:
            raise ValueError(f"Invalid speaker_id: '{speaker_id}'")
        return self.storage_dir / safe_id

    def save_profile(self, profile: SpeakerProfile) -> None:
        spk_dir = self._speaker_dir(profile.speaker_id)
        spk_dir.mkdir(parents=True, exist_ok=True)

        emb_file = spk_dir / "embedding.npy"
        np.save(str(emb_file), profile.reference_embedding)

        meta_file = spk_dir / "profile.json"
        meta_data = {
            "speaker_id": profile.speaker_id,
            "embedding_dim": profile.embedding_dim,
            "sample_count": profile.sample_count,
            "created_at": profile.created_at,
            "updated_at": profile.updated_at,
            "metadata": profile.metadata,
        }
        with open(meta_file, "w", encoding="utf-8") as f:
            json.dump(meta_data, f, indent=2)

        log.info(
            "Saved speaker profile for speaker_id='%s' (samples=%d, dim=%d)",
            profile.speaker_id,
            profile.sample_count,
            profile.embedding_dim,
        )

    def get_profile(self, speaker_id: str) -> Optional[SpeakerProfile]:
        spk_dir = self._speaker_dir(speaker_id)
        meta_file = spk_dir / "profile.json"
        emb_file = spk_dir / "embedding.npy"

        if not meta_file.is_file() or not emb_file.is_file():
            return None

        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                meta_data = json.load(f)

            embedding = np.load(str(emb_file)).astype(np.float32)

            return SpeakerProfile(
                speaker_id=meta_data["speaker_id"],
                reference_embedding=embedding,
                embedding_dim=meta_data.get("embedding_dim", DEFAULT_EMBEDDING_DIM),
                sample_count=meta_data.get("sample_count", 1),
                created_at=meta_data.get("created_at", datetime.now(timezone.utc).isoformat()),
                updated_at=meta_data.get("updated_at", datetime.now(timezone.utc).isoformat()),
                metadata=meta_data.get("metadata", {}),
            )
        except Exception as exc:
            log.error("Failed to load speaker profile for '%s': %s", speaker_id, exc)
            return None

    def get_reference_embedding(self, speaker_id: str) -> Optional[np.ndarray]:
        spk_dir = self._speaker_dir(speaker_id)
        emb_file = spk_dir / "embedding.npy"
        if not emb_file.is_file():
            return None
        try:
            return np.load(str(emb_file)).astype(np.float32)
        except Exception as exc:
            log.error("Failed to load embedding for '%s': %s", speaker_id, exc)
            return None

    def delete_profile(self, speaker_id: str) -> bool:
        spk_dir = self._speaker_dir(speaker_id)
        if spk_dir.is_dir():
            shutil.rmtree(spk_dir)
            log.info("Deleted speaker profile for speaker_id='%s'", speaker_id)
            return True
        return False

    def list_speakers(self) -> List[str]:
        speakers: List[str] = []
        if not self.storage_dir.is_dir():
            return speakers
        for item in self.storage_dir.iterdir():
            if item.is_dir() and (item / "profile.json").is_file() and (item / "embedding.npy").is_file():
                speakers.append(item.name)
        return sorted(speakers)

    def has_speaker(self, speaker_id: str) -> bool:
        spk_dir = self._speaker_dir(speaker_id)
        return (spk_dir / "profile.json").is_file() and (spk_dir / "embedding.npy").is_file()


class InMemorySpeakerRepository(BaseSpeakerRepository):
    """In-memory speaker repository for unit tests and ephemeral operations."""

    def __init__(self) -> None:
        self._profiles: Dict[str, SpeakerProfile] = {}

    def save_profile(self, profile: SpeakerProfile) -> None:
        # Clone embedding to prevent in-place mutations
        cloned_profile = SpeakerProfile(
            speaker_id=profile.speaker_id,
            reference_embedding=profile.reference_embedding.copy(),
            embedding_dim=profile.embedding_dim,
            sample_count=profile.sample_count,
            created_at=profile.created_at,
            updated_at=profile.updated_at,
            metadata=dict(profile.metadata),
        )
        self._profiles[profile.speaker_id] = cloned_profile

    def get_profile(self, speaker_id: str) -> Optional[SpeakerProfile]:
        return self._profiles.get(speaker_id)

    def get_reference_embedding(self, speaker_id: str) -> Optional[np.ndarray]:
        profile = self._profiles.get(speaker_id)
        if profile is not None:
            return profile.reference_embedding.copy()
        return None

    def delete_profile(self, speaker_id: str) -> bool:
        return self._profiles.pop(speaker_id, None) is not None

    def list_speakers(self) -> List[str]:
        return sorted(list(self._profiles.keys()))

    def has_speaker(self, speaker_id: str) -> bool:
        return speaker_id in self._profiles
