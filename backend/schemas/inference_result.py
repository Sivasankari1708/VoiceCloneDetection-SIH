"""
schemas/inference_result.py
----------------------------
Canonical output contract for the VoiceCloneDetection-SIH pipeline.
Every pipeline execution returns an `InferenceResult` object.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional


# ---------------------------------------------------------------------------
# Sub-models
# ---------------------------------------------------------------------------

@dataclass
class AudioMeta:
    """Metadata about the decoded audio."""
    file_path: str = ""
    duration_seconds: float = 0.0
    sample_rate: int = 16000
    channels: int = 1


@dataclass
class VADResult:
    """Output from the Silero VAD stage."""
    speech_detected: bool = False
    speech_ratio: float = 0.0
    num_segments: int = 0
    total_speech_seconds: float = 0.0
    speech_probability: float = 0.0


@dataclass
class DeepfakeResult:
    """Output from the deepfake detection stage."""
    synthetic_probability: float = 0.0
    is_synthetic: bool = False
    model_name: str = ""
    score: float = 0.0
    label: Literal["genuine", "cloned", "unknown"] = "unknown"


@dataclass
class SpeakerResult:
    """Output from the ECAPA-TDNN speaker verification stage."""
    embedding_dim: int = 0
    speaker_similarity: Optional[float] = None
    speaker_match: Optional[bool] = None
    cosine_score: Optional[float] = None
    same_speaker: Optional[bool] = None


@dataclass
class TranscriptionResult:
    """Output from faster-whisper ASR stage."""
    text: str = ""
    language: str = ""
    language_probability: Optional[float] = None
    num_segments: int = 0


@dataclass
class IntentResult:
    """Output from the intent detection stage."""
    intent: str = "UNKNOWN"
    confidence: float = 0.0
    keywords_matched: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Top-level result
# ---------------------------------------------------------------------------

@dataclass
class InferenceResult:
    """
    Standardised output of the full Voice Clone Detection pipeline.

    Required fields:
      - session_id
      - chunk_id
      - timestamp
      - speech_detected
      - synthetic_probability
      - speaker_similarity
      - speaker_match
      - transcript
      - intent
      - intent_confidence
    """
    session_id: str = ""
    chunk_id: str = ""
    request_id: str = ""
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    pipeline_version: str = "0.1.0"

    # Core required flat fields
    speech_detected: bool = False
    synthetic_probability: Optional[float] = None
    speaker_similarity: Optional[float] = None
    speaker_match: Optional[bool] = None
    transcript: str = ""
    intent: str = "UNKNOWN"
    intent_confidence: float = 0.0

    # Structured sub-models
    audio_meta: Optional[AudioMeta] = None
    vad: Optional[VADResult] = None
    deepfake: Optional[DeepfakeResult] = None
    speaker: Optional[SpeakerResult] = None
    transcription: Optional[TranscriptionResult] = None
    intent_details: Optional[IntentResult] = None

    # Overall verdict and metrics
    verdict: Literal["genuine", "cloned", "imposter", "inconclusive"] = "inconclusive"
    processing_time_ms: float = 0.0
    stage_timings_ms: Dict[str, float] = field(default_factory=dict)
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to a plain dict suitable for JSON serialization."""
        return dataclasses.asdict(self)
