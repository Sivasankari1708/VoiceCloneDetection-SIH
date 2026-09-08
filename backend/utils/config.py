"""
utils/config.py
----------------
Responsibility: Load pipeline configuration from environment variables or a
                YAML/JSON config file. Centralises all tuneable knobs.

Usage:
    from backend.utils.config import PipelineConfig
    cfg = PipelineConfig.from_env()

NOT FULLY IMPLEMENTED — defaults work; env-variable loading is a stub.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass
class PipelineConfig:
    """
    Central configuration for the AI+Audio pipeline.
    All fields have sensible CPU-compatible defaults.
    """

    # --- Audio preprocessing ---
    target_sample_rate: int = 16000

    # --- Silero VAD ---
    vad_threshold: float = 0.5
    vad_min_speech_ms: int = 250
    vad_min_silence_ms: int = 100

    # --- Deepfake detection ---
    deepfake_model: str = "rawnet2"          # or "aasist", "wav2vec2", "deepfake_cnn"
    deepfake_threshold: float = 0.5          # genuine if score >= threshold
    deepfake_checkpoint_path: str | None = "checkpoints/deepfake_v2_asvspoof2019_la.pt"  # path to trained DeepfakeCNN checkpoint

    # --- Speaker verification & enrollment ---
    speaker_model: str = "speechbrain/spkrec-ecapa-voxceleb"
    speaker_threshold: float = 0.70          # cosine similarity threshold (calibrated: same≈0.90, diff≈0.24)
    speaker_enrollment_min_samples: int = 3  # minimum samples required for robust enrollment
    speaker_storage_dir: str = "data/enrolled_speakers"  # directory for profile & embedding storage

    # --- Transcription ---
    asr_provider: str = "whisper"            # "whisper" | "google"
    asr_language: str = "en-IN"              # BCP-47 language code (e.g. "en-IN", "en-US", "hi-IN")
    whisper_model_size: str = "base"         # tiny | base | small | medium
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    whisper_language: str | None = None      # None = auto-detect

    # --- Intent detection ---
    intent_confidence_min: float = 0.1       # minimum keyword hit ratio

    # --- Streaming / Chunked audio ---
    streaming_chunk_duration_ms: int = 1000
    streaming_chunk_overlap_ms: int = 0
    streaming_max_buffer_duration_sec: float = 4.0
    streaming_smoothing_window: int = 5
    streaming_fast_alert_threshold: float = 0.85
    streaming_smoothing_alpha: float = 0.4

    # --- Misc ---
    log_level: str = "DEBUG"

    @classmethod
    def from_env(cls) -> "PipelineConfig":
        """
        Create a PipelineConfig populated from environment variables.

        Environment variable names follow UPPER_SNAKE pattern, e.g.:
          ASR_PROVIDER, ASR_LANGUAGE, TARGET_SAMPLE_RATE, VAD_THRESHOLD, ...

        Falls back to field defaults when an env var is absent.
        """
        return cls(
            asr_provider=os.getenv("ASR_PROVIDER", "whisper").lower().strip(),
            asr_language=os.getenv("ASR_LANGUAGE", "en-IN").strip(),
            target_sample_rate=int(os.getenv("TARGET_SAMPLE_RATE", "16000")),
            vad_threshold=float(os.getenv("VAD_THRESHOLD", "0.5")),
            deepfake_checkpoint_path=os.getenv(
                "DEEPFAKE_CHECKPOINT_PATH", "checkpoints/deepfake_v2_asvspoof2019_la.pt"
            ),
            speaker_threshold=float(os.getenv("SPEAKER_SIMILARITY_THRESHOLD", "0.70")),
            speaker_enrollment_min_samples=int(os.getenv("SPEAKER_ENROLLMENT_MIN_SAMPLES", "3")),
            speaker_storage_dir=os.getenv("SPEAKER_STORAGE_DIR", "data/enrolled_speakers"),
            whisper_model_size=os.getenv("WHISPER_MODEL_SIZE", "base"),
            whisper_device=os.getenv("WHISPER_DEVICE", "cpu"),
            streaming_chunk_duration_ms=int(os.getenv("STREAMING_CHUNK_DURATION_MS", "1000")),
            streaming_chunk_overlap_ms=int(os.getenv("STREAMING_CHUNK_OVERLAP_MS", "0")),
            streaming_max_buffer_duration_sec=float(os.getenv("STREAMING_MAX_BUFFER_DURATION_SEC", "4.0")),
            streaming_smoothing_window=int(os.getenv("STREAMING_SMOOTHING_WINDOW", "5")),
            streaming_fast_alert_threshold=float(os.getenv("STREAMING_FAST_ALERT_THRESHOLD", "0.85")),
            streaming_smoothing_alpha=float(os.getenv("STREAMING_SMOOTHING_ALPHA", "0.4")),
            log_level=os.getenv("LOG_LEVEL", "DEBUG"),
        )


