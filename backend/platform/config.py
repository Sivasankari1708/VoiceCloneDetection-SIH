"""
backend/platform/config.py
==========================
Platform configuration loader for Member 2 Backend / Security Orchestration.
Loads configuration from environment variables with sensible defaults.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List


@dataclass
class PlatformConfig:
    """Central configuration for the Backend Platform and Security Orchestrator."""

    # Server settings
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    cors_origins: List[str] = field(
        default_factory=lambda: ["*"]
    )

    # Database settings
    # Supports PostgreSQL (e.g. postgresql://user:pass@localhost:5432/vcd_db)
    # with automatic SQLite fallback for zero-dependency local testing.
    database_url: str = "sqlite:///./voice_clone_detection.db"
    db_echo: bool = False

    # Authentication & Security
    jwt_secret: str = "sih_voice_clone_detection_secret_key_2026_super_secure"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 480  # 8 hours

    # Audio ingestion parameters
    target_sample_rate: int = 16000
    default_chunk_duration_ms: int = 1000
    max_chunk_payload_bytes: int = 1024 * 1024 * 4  # 4 MB max chunk payload

    # Security policy threshold defaults
    risk_score_high_threshold: float = 65.0
    risk_score_critical_threshold: float = 85.0
    fast_alert_synthetic_threshold: float = 0.85
    clone_deepfake_threshold: float = 0.50
    speaker_similarity_threshold: float = 0.70

    # Persistence
    speaker_storage_dir: str = "data/enrolled_speakers"

    @classmethod
    def from_env(cls) -> "PlatformConfig":
        """Build configuration from environment variables."""
        db_url = os.getenv("DATABASE_URL", "sqlite:///./voice_clone_detection.db")
        # Handle Heroku/Render postgres:// prefix if present
        if db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql://", 1)

        cors_str = os.getenv("CORS_ORIGINS", "*")
        origins = [orig.strip() for orig in cors_str.split(",") if orig.strip()]

        return cls(
            host=os.getenv("HOST", "0.0.0.0"),
            port=int(os.getenv("PORT", "8000")),
            debug=os.getenv("DEBUG", "false").lower() in ("1", "true", "yes"),
            cors_origins=origins or ["*"],
            database_url=db_url,
            db_echo=os.getenv("DB_ECHO", "false").lower() in ("1", "true", "yes"),
            jwt_secret=os.getenv("JWT_SECRET", "sih_voice_clone_detection_secret_key_2026_super_secure"),
            jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
            access_token_expire_minutes=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480")),
            target_sample_rate=int(os.getenv("TARGET_SAMPLE_RATE", "16000")),
            default_chunk_duration_ms=int(os.getenv("DEFAULT_CHUNK_DURATION_MS", "1000")),
            max_chunk_payload_bytes=int(os.getenv("MAX_CHUNK_PAYLOAD_BYTES", str(1024 * 1024 * 4))),
            risk_score_high_threshold=float(os.getenv("RISK_SCORE_HIGH_THRESHOLD", "65.0")),
            risk_score_critical_threshold=float(os.getenv("RISK_SCORE_CRITICAL_THRESHOLD", "85.0")),
            fast_alert_synthetic_threshold=float(os.getenv("FAST_ALERT_SYNTHETIC_THRESHOLD", "0.85")),
            clone_deepfake_threshold=float(os.getenv("CLONE_DEEPFAKE_THRESHOLD", "0.50")),
            speaker_similarity_threshold=float(os.getenv("SPEAKER_SIMILARITY_THRESHOLD", "0.70")),
            speaker_storage_dir=os.getenv("SPEAKER_STORAGE_DIR", "data/enrolled_speakers"),
        )


# Global singleton instance
platform_config = PlatformConfig.from_env()
