"""
backend/platform/services/ai_adapter.py
=======================================
AI Integration Adapter wrapping Member 1's frozen AI components.

Strict Invariants:
  - ZERO changes to Member 1 AI code.
  - Reuses StreamingAudioPipeline, InferencePipeline, and RiskEngine directly.
  - Single model load in memory.
  - Normalizes audio chunk inputs (PCM bytes, Base64, WAV) before dispatch.
"""
from __future__ import annotations

import base64
import io
from pathlib import Path
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np

from backend.pipeline.inference_pipeline import InferencePipeline, get_default_pipeline
from backend.pipeline.risk_engine import RiskDecision, RiskEngine
from backend.pipeline.streaming_pipeline import (
    SessionSummary,
    StreamingAudioPipeline,
    StreamingConfig,
    StreamingInferenceResult,
    StreamingSession,
)
from backend.platform.db.speaker_repo_adapter import DatabaseSpeakerRepository
from backend.schemas.inference_result import InferenceResult
from backend.utils.logger import get_logger

log = get_logger(__name__)


@dataclass
class ProcessedChunkTelemetry:
    """Standardized DTO produced by the AI adapter for the Security Orchestrator."""
    session_id: str
    chunk_id: int
    timestamp: str
    speech_detected: bool
    raw_synthetic_prob: Optional[float]
    smoothed_synthetic_prob: Optional[float]
    raw_speaker_sim: Optional[float]
    smoothed_speaker_sim: Optional[float]
    speaker_match: Optional[bool]
    identity_status: str  # "MATCHED", "MISMATCHED", "UNENROLLED", "INCONCLUSIVE"
    transcript: str
    accumulated_transcript: str
    intent: str
    intent_confidence: float
    context_signals: List[str]
    verdict: str  # genuine, cloned, imposter, inconclusive
    is_alert: bool
    alert_reason: Optional[str]
    latency_ms: float
    real_time_factor: float
    stage_timings_ms: Dict[str, float]
    risk_decision: RiskDecision


class AIAdapter:
    """
    Adapter bridging platform calls & WebSocket audio frames to Member 1's AI engine.
    Maintains a singleton StreamingAudioPipeline loaded once in memory.
    """

    _instance: Optional["AIAdapter"] = None
    _init_lock = threading.Lock()

    def __init__(self) -> None:
        log.info("[AIAdapter] Initializing AI adapter wrapping Member 1 pipelines...")
        self.speaker_repo = DatabaseSpeakerRepository()
        self.risk_engine = RiskEngine()

        # Connect our database speaker repository to the unified pipeline
        self.pipeline: InferencePipeline = get_default_pipeline()
        self.pipeline.speaker_service.repository = self.speaker_repo

        # Initialize streaming pipeline with 1-second chunks and default thresholds
        self.streaming_config = StreamingConfig(
            chunk_duration_ms=1000,
            max_buffer_duration_sec=4.0,
            fast_alert_threshold=0.85,
            smoothing_alpha=0.4,
            speaker_threshold=0.70,
        )
        self.streaming_pipeline = StreamingAudioPipeline(
            pipeline=self.pipeline,
            config=self.streaming_config,
        )
        log.info("[AIAdapter] Member 1 models and streaming pipeline initialized successfully.")

    @classmethod
    def get_instance(cls) -> "AIAdapter":
        """Thread-safe singleton accessor."""
        if cls._instance is None:
            with cls._init_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def start_session(self, session_id: str, claimed_speaker_id: Optional[str] = None) -> StreamingSession:
        """Initialize an isolated streaming session with optional speaker enrollment context."""
        ref_emb = None
        if claimed_speaker_id:
            ref_emb = self.speaker_repo.get_reference_embedding(claimed_speaker_id)
            if ref_emb is None:
                log.warning("[AIAdapter] Claimed speaker '%s' has no biometric enrollment.", claimed_speaker_id)

        session = self.streaming_pipeline.start_session(
            session_id=session_id,
            speaker_id=claimed_speaker_id,
            reference_embedding=ref_emb,
        )
        return session

    def get_session(self, session_id: str) -> Optional[StreamingSession]:
        """Retrieve active streaming session."""
        return self.streaming_pipeline.get_session(session_id)

    def end_session(self, session_id: str) -> SessionSummary:
        """End streaming session and compute final summary."""
        return self.streaming_pipeline.end_session(session_id)

    def decode_input_audio(self, raw_data: Union[bytes, str, np.ndarray]) -> np.ndarray:
        """
        Normalize incoming audio into 16 kHz mono float32 numpy array.

        Supports:
          - Base64 string
          - Raw 16-bit PCM binary (e.g. 16000 samples = 32000 bytes)
          - Encoded container bytes (WAV, FLAC, OGG, WebM)
          - NumPy array
        """
        if isinstance(raw_data, str):
            # Check if base64 encoded
            try:
                raw_bytes = base64.b64decode(raw_data)
                return self.decode_input_audio(raw_bytes)
            except Exception:
                raise ValueError("Invalid string audio input: expected valid base64 payload.")

        if isinstance(raw_data, bytes):
            # 1. Try direct in-memory decode via soundfile (WAV, FLAC, OGG)
            try:
                import soundfile as sf
                wav_arr, sr = sf.read(io.BytesIO(raw_data), dtype="float32")
                if wav_arr.ndim > 1:
                    wav_arr = wav_arr.mean(axis=1)
                if sr != 16000:
                    import librosa
                    wav_arr = librosa.resample(wav_arr, orig_sr=sr, target_sr=16000)
                return np.clip(wav_arr, -1.0, 1.0)
            except Exception:
                pass

            # 2. Check if raw 16-bit PCM integer samples @ 16kHz
            if len(raw_data) % 2 == 0:
                try:
                    int16_arr = np.frombuffer(raw_data, dtype=np.int16)
                    float_arr = int16_arr.astype(np.float32) / 32768.0
                    return np.clip(float_arr, -1.0, 1.0)
                except Exception:
                    pass

            # 3. Write to temporary file and pass valid Path to Member 1's _decode_chunk
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(raw_data)
                tmp_path = Path(tmp.name)
            try:
                wav_np, _ = self.streaming_pipeline._decode_chunk(tmp_path)
                return wav_np
            finally:
                tmp_path.unlink(missing_ok=True)

        if isinstance(raw_data, np.ndarray):
            arr = raw_data.astype(np.float32)
            if arr.ndim > 1:
                arr = arr.mean(axis=0)
            return np.clip(arr, -1.0, 1.0)

        raise TypeError(f"Unsupported audio input type: {type(raw_data)}")

    def process_chunk(
        self,
        session_id: str,
        chunk_data: Union[bytes, str, np.ndarray],
        chunk_id: int,
        claimed_speaker_id: Optional[str] = None,
    ) -> ProcessedChunkTelemetry:
        """
        Process an incoming streaming audio chunk through Member 1's pipeline.

        Returns
        -------
        ProcessedChunkTelemetry
        """
        # Ensure session exists and has speaker context
        session = self.get_session(session_id)
        if session is None:
            session = self.start_session(session_id, claimed_speaker_id=claimed_speaker_id)
        elif claimed_speaker_id and session.speaker_id != claimed_speaker_id:
            ref_emb = self.speaker_repo.get_reference_embedding(claimed_speaker_id)
            session.speaker_id = claimed_speaker_id
            session.reference_embedding = ref_emb

        # Decode & normalize chunk
        waveform = self.decode_input_audio(chunk_data)

        # Call Member 1's StreamingAudioPipeline
        result: StreamingInferenceResult = self.streaming_pipeline.process_chunk(
            session_id=session_id,
            chunk_input=waveform,
            chunk_id=chunk_id,
        )

        # Determine biometric identity status
        if session.reference_embedding is None:
            identity_status = "UNENROLLED"
        elif result.speaker_match is True:
            identity_status = "MATCHED"
        elif result.speaker_match is False:
            identity_status = "MISMATCHED"
        else:
            identity_status = "INCONCLUSIVE"

        # Extract context signals / matched keywords
        context_signals = []
        if result.intent_details and result.intent_details.keywords_matched:
            context_signals.extend(result.intent_details.keywords_matched)

        # Evaluate risk using Member 1's RiskEngine
        # Use smoothed values when available for temporal stability
        effective_synth = (
            result.smoothed_synthetic_probability
            if result.smoothed_synthetic_probability is not None
            else result.synthetic_probability
        )
        effective_sim = (
            result.smoothed_speaker_similarity
            if result.smoothed_speaker_similarity is not None
            else result.speaker_similarity
        )

        risk_decision: RiskDecision = self.risk_engine.evaluate(
            speaker_similarity=effective_sim,
            speaker_match=result.speaker_match,
            synthetic_probability=effective_synth,
            intent=result.intent,
            intent_confidence=result.intent_confidence,
        )

        # Get accumulated transcript from session
        accumulated_text = " ".join(session.accumulated_transcript_segments)

        log.info(
            "[ML] Chunk #%s | Speech=%s | Verdict=%s | SynthProb=%.3f | Transcript='%s' | Intent=%s (conf=%.2f)",
            chunk_id,
            result.speech_detected,
            result.verdict,
            effective_synth or 0.0,
            result.transcript or "",
            result.intent,
            result.intent_confidence,
        )

        return ProcessedChunkTelemetry(
            session_id=session_id,
            chunk_id=chunk_id,
            timestamp=result.timestamp,
            speech_detected=result.speech_detected,
            raw_synthetic_prob=result.synthetic_probability,
            smoothed_synthetic_prob=result.smoothed_synthetic_probability,
            raw_speaker_sim=result.speaker_similarity,
            smoothed_speaker_sim=result.smoothed_speaker_similarity,
            speaker_match=result.speaker_match,
            identity_status=identity_status,
            transcript=result.transcript,
            accumulated_transcript=accumulated_text,
            intent=result.intent,
            intent_confidence=result.intent_confidence,
            context_signals=context_signals,
            verdict=result.verdict,
            is_alert=result.is_alert,
            alert_reason=result.alert_reason,
            latency_ms=result.processing_time_ms,
            real_time_factor=result.real_time_factor,
            stage_timings_ms=result.stage_timings_ms,
            risk_decision=risk_decision,
        )

    def analyze_batch_file(
        self,
        file_path_or_bytes: Union[str, bytes],
        claimed_speaker_id: Optional[str] = None,
    ) -> Tuple[InferenceResult, RiskDecision]:
        """Execute one-off batch audio analysis via Member 1's InferencePipeline."""
        ref_emb = None
        if claimed_speaker_id:
            ref_emb = self.speaker_repo.get_reference_embedding(claimed_speaker_id)

        result: InferenceResult = self.pipeline.run(
            audio_input=file_path_or_bytes,
            reference_embedding=ref_emb,
        )

        risk_decision = self.risk_engine.evaluate(
            speaker_similarity=result.speaker_similarity,
            speaker_match=result.speaker_match,
            synthetic_probability=result.synthetic_probability,
            intent=result.intent,
            intent_confidence=result.intent_confidence,
        )

        return result, risk_decision
