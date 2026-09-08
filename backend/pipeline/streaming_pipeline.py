"""
pipeline/streaming_pipeline.py
---------------------------------
Responsibility: Real-Time / Chunked Streaming Audio Pipeline.

Simulates near-real-time voice clone detection, speaker verification,
transcription, and intent extraction over ingested audio chunks (e.g. from
WebRTC, WebSocket, or audio input stream).

IMPORTANT ARCHITECTURAL NOTICE:
    This streaming pipeline processes supplied audio chunks/frames. It does NOT
    claim or attempt direct interception of arbitrary cellular phone-call audio,
    which is restricted by modern mobile OS security and telephony sandboxing.
    In production environments, this pipeline operates as a backend service
    ingesting audio streams provided via WebRTC or WebSocket adapters.

Key Capabilities:
    1. Single Model Load: Models reside in memory via InferencePipeline and
       are reused across all streaming sessions and chunks.
    2. Bounded Rolling Buffer: Retains at most 4.0s (64,000 samples @ 16 kHz)
       of recent audio for DeepfakeCNN and ECAPA-TDNN receptive fields.
    3. Silero VAD Gating: Chunks with no speech early-exit without invoking
       heavier downstream models.
    4. Dual Temporal Smoothing: Exposes both raw chunk scores and Exponential
       Moving Average (EMA) smoothed scores.
    5. Fast Alert Escalation: If raw synthetic probability exceeds a critical
       threshold (default >= 0.85), an immediate alert is raised without
       smoothing lag.
    6. Performance Telemetry: Tracks per-chunk stage timings, total latency,
       and Real-Time Factor (RTF = latency / chunk_duration).
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from datetime import datetime, timezone
import math
from pathlib import Path
import threading
import time
from typing import Any, Dict, List, Literal, Optional, Tuple, Union

import numpy as np
import torch

from backend.audio.decoder import load_audio
from backend.audio.preprocessing import (
    TARGET_SAMPLE_RATE,
    _to_mono,
    normalize_waveform,
    validate_waveform,
)
from backend.audio.vad import SileroVAD, VADResult
from backend.intent.intent_detector import IntentDetector, IntentResult
from backend.models.deepfake_v2 import DeepfakeV2Detector, DeepfakeV2Result
from backend.models.speaker_enrollment import SpeakerEnrollmentService
from backend.models.speaker_repository import BaseSpeakerRepository
from backend.models.speaker_verifier import SpeakerResult, SpeakerVerifier
from backend.models.whisper_asr import ASRResult, WhisperASR
from backend.pipeline.inference_pipeline import (
    InferencePipeline,
    get_default_pipeline,
)
from backend.schemas.inference_result import (
    AudioMeta,
    DeepfakeResult,
    InferenceResult,
    SpeakerResult as SchemaSpeakerResult,
    TranscriptionResult,
    VADResult as SchemaVADResult,
    IntentResult as SchemaIntentResult,
)
from backend.utils.config import PipelineConfig
from backend.utils.logger import get_logger

log = get_logger(__name__)


# ---------------------------------------------------------------------------
# Configuration Dataclass
# ---------------------------------------------------------------------------

@dataclass
class StreamingConfig:
    """
    Configuration for streaming chunk ingestion and temporal smoothing.
    """
    chunk_duration_ms: int = 1000
    chunk_overlap_ms: int = 0
    max_buffer_duration_sec: float = 4.0
    smoothing_window: int = 5
    fast_alert_threshold: float = 0.85
    smoothing_alpha: float = 0.4
    speaker_threshold: float = 0.70
    target_sample_rate: int = TARGET_SAMPLE_RATE

    @classmethod
    def from_pipeline_config(cls, cfg: PipelineConfig) -> "StreamingConfig":
        """Instantiate StreamingConfig from a global PipelineConfig."""
        return cls(
            chunk_duration_ms=cfg.streaming_chunk_duration_ms,
            chunk_overlap_ms=cfg.streaming_chunk_overlap_ms,
            max_buffer_duration_sec=cfg.streaming_max_buffer_duration_sec,
            smoothing_window=cfg.streaming_smoothing_window,
            fast_alert_threshold=cfg.streaming_fast_alert_threshold,
            smoothing_alpha=cfg.streaming_smoothing_alpha,
            speaker_threshold=cfg.speaker_threshold,
            target_sample_rate=cfg.target_sample_rate,
        )


# ---------------------------------------------------------------------------
# Result and Summary Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class StreamingInferenceResult(InferenceResult):
    """
    Canonical per-chunk result extending InferenceResult with streaming metrics.
    """
    smoothed_synthetic_probability: Optional[float] = None
    smoothed_speaker_similarity: Optional[float] = None
    real_time_factor: float = 0.0
    is_alert: bool = False
    alert_reason: Optional[str] = None
    chunk_duration_ms: float = 1000.0


@dataclass
class SessionSummary:
    """
    Summary report computed at the end of a streaming call or session.
    """
    session_id: str
    speaker_id: Optional[str] = None
    total_chunks: int = 0
    processed_chunks: int = 0
    total_audio_seconds: float = 0.0
    total_speech_seconds: float = 0.0
    p50_latency_ms: float = 0.0
    p95_latency_ms: float = 0.0
    mean_latency_ms: float = 0.0
    mean_rtf: float = 0.0
    final_verdict: str = "inconclusive"
    alert_triggered: bool = False
    alert_reason: Optional[str] = None
    accumulated_transcript: str = ""
    latest_synthetic_probability: Optional[float] = None
    latest_smoothed_synthetic_probability: Optional[float] = None
    latest_speaker_similarity: Optional[float] = None
    latest_smoothed_speaker_similarity: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        """Serialize summary to a plain dictionary."""
        return dataclasses.asdict(self)


# ---------------------------------------------------------------------------
# Streaming Session State
# ---------------------------------------------------------------------------

class StreamingSession:
    """
    Maintains state for a single active streaming session.

    Enforces strictly bounded audio buffering (max 4.0s @ 16 kHz = 64,000 samples)
    to prevent memory growth during long-running streaming calls.
    """

    def __init__(
        self,
        session_id: str,
        speaker_id: Optional[str] = None,
        reference_embedding: Optional[np.ndarray] = None,
        config: Optional[StreamingConfig] = None,
    ) -> None:
        self.session_id = session_id
        self.speaker_id = speaker_id
        self.reference_embedding = reference_embedding
        self.config = config or StreamingConfig()

        self.max_buffer_samples = int(
            self.config.max_buffer_duration_sec * self.config.target_sample_rate
        )

        # Bounded audio rolling buffer: float32 1D numpy array
        self.audio_buffer: np.ndarray = np.empty(0, dtype=np.float32)

        # Session metrics and history
        self.created_at = time.time()
        self.total_chunks = 0
        self.processed_chunks = 0
        self.total_audio_seconds = 0.0
        self.total_speech_seconds = 0.0

        # Smoothing history
        self.raw_synthetic_probs: List[float] = []
        self.smoothed_synthetic_probs: List[float] = []
        self.raw_speaker_sims: List[float] = []
        self.smoothed_speaker_sims: List[float] = []

        # Performance telemetry
        self.chunk_latencies_ms: List[float] = []
        self.chunk_rtfs: List[float] = []

        # Dialogue and security state
        self.accumulated_transcript_segments: List[str] = []
        self.last_verdict: str = "inconclusive"
        self.alert_triggered: bool = False
        self.alert_reason: Optional[str] = None
        self.is_active: bool = True

        self._lock = threading.Lock()

    def append_audio(self, chunk_waveform: np.ndarray) -> None:
        """
        Append new audio samples and maintain strictly bounded buffer length.

        Parameters
        ----------
        chunk_waveform : np.ndarray
            Float32 1D array of 16kHz mono audio.
        """
        with self._lock:
            if chunk_waveform.ndim > 1:
                chunk_waveform = np.squeeze(chunk_waveform)
            if chunk_waveform.size == 0:
                return

            if self.audio_buffer.size == 0:
                self.audio_buffer = chunk_waveform.astype(np.float32)
            else:
                self.audio_buffer = np.concatenate(
                    [self.audio_buffer, chunk_waveform.astype(np.float32)]
                )

            # Strictly enforce bounded rolling buffer
            if self.audio_buffer.size > self.max_buffer_samples:
                self.audio_buffer = self.audio_buffer[-self.max_buffer_samples:]

    def get_audio_buffer(self) -> np.ndarray:
        """Get a copy of the current bounded rolling buffer."""
        with self._lock:
            return self.audio_buffer.copy()

    def update_scores(
        self,
        raw_synthetic_prob: Optional[float],
        raw_speaker_sim: Optional[float],
        latency_ms: float,
        chunk_duration_ms: float,
    ) -> Tuple[Optional[float], Optional[float], float, bool, Optional[str]]:
        """
        Apply temporal smoothing (EMA), check fast alert thresholds, and record telemetry.

        Returns
        -------
        Tuple of:
          - smoothed_synthetic_prob
          - smoothed_speaker_sim
          - rtf
          - is_alert
          - alert_reason
        """
        with self._lock:
            self.total_chunks += 1
            self.processed_chunks += 1
            self.total_audio_seconds += chunk_duration_ms / 1000.0

            # Compute RTF: processing_time / audio_duration
            duration_sec = max(chunk_duration_ms / 1000.0, 1e-6)
            rtf = (latency_ms / 1000.0) / duration_sec
            self.chunk_latencies_ms.append(latency_ms)
            self.chunk_rtfs.append(rtf)

            alpha = self.config.smoothing_alpha
            fast_threshold = self.config.fast_alert_threshold

            # ── 1. Synthetic Probability Smoothing & Fast Alert ───────────
            smoothed_synth: Optional[float] = None
            is_alert = False
            alert_reason = None

            if raw_synthetic_prob is not None:
                self.raw_synthetic_probs.append(raw_synthetic_prob)

                # Check fast alert escalation first
                if raw_synthetic_prob >= fast_threshold:
                    is_alert = True
                    alert_reason = (
                        f"CRITICAL: High confidence synthetic voice detected "
                        f"(prob={raw_synthetic_prob:.3f} >= {fast_threshold:.2f})"
                    )
                    self.alert_triggered = True
                    self.alert_reason = alert_reason
                    # Fast-forward smoothed value directly to raw probability to eliminate lag
                    smoothed_synth = raw_synthetic_prob
                else:
                    # Exponential Moving Average (EMA)
                    if not self.smoothed_synthetic_probs:
                        smoothed_synth = raw_synthetic_prob
                    else:
                        prev = self.smoothed_synthetic_probs[-1]
                        smoothed_synth = float(alpha * raw_synthetic_prob + (1.0 - alpha) * prev)

                self.smoothed_synthetic_probs.append(smoothed_synth)
            elif self.smoothed_synthetic_probs:
                # Carry forward previous smoothed value during silence
                smoothed_synth = self.smoothed_synthetic_probs[-1]

            # ── 2. Speaker Similarity Smoothing ───────────────────────────
            smoothed_sim: Optional[float] = None
            if raw_speaker_sim is not None:
                self.raw_speaker_sims.append(raw_speaker_sim)
                if not self.smoothed_speaker_sims:
                    smoothed_sim = raw_speaker_sim
                else:
                    prev = self.smoothed_speaker_sims[-1]
                    smoothed_sim = float(alpha * raw_speaker_sim + (1.0 - alpha) * prev)
                self.smoothed_speaker_sims.append(smoothed_sim)
            elif self.smoothed_speaker_sims:
                smoothed_sim = self.smoothed_speaker_sims[-1]

            # Retain existing session-level alert if previously triggered
            if self.alert_triggered:
                is_alert = True
                if alert_reason is None:
                    alert_reason = self.alert_reason

            return smoothed_synth, smoothed_sim, rtf, is_alert, alert_reason

    def append_transcript(self, text: str) -> str:
        """Append transcribed text chunk and return full accumulated transcript."""
        with self._lock:
            cleaned = text.strip()
            if cleaned:
                self.accumulated_transcript_segments.append(cleaned)
            return " ".join(self.accumulated_transcript_segments)

    def append_incremental_transcript(self, current_window_text: str) -> str:
        """
        Extract newly recognized words from rolling audio window text and append
        to the session's accumulated transcript.

        Returns
        -------
        str
            The new incremental chunk text (or empty string if no new speech).
        """
        import re

        with self._lock:
            cur_raw = current_window_text.strip()
            if not cur_raw:
                return ""

            existing_full = " ".join(self.accumulated_transcript_segments).strip()
            if not existing_full:
                self.accumulated_transcript_segments.append(cur_raw)
                return cur_raw

            ex_words = [re.sub(r"[^\w]", "", w).lower() for w in existing_full.split() if re.sub(r"[^\w]", "", w)]
            cur_tokens = cur_raw.split()
            cur_words = [re.sub(r"[^\w]", "", w).lower() for w in cur_tokens if re.sub(r"[^\w]", "", w)]

            # 1. Direct suffix-to-prefix overlap
            max_k = 0
            for k in range(min(len(cur_words), len(ex_words)), 0, -1):
                if ex_words[-k:] == cur_words[:k]:
                    max_k = k
                    break

            if max_k > 0:
                new_tokens = cur_tokens[max_k:]
                new_chunk = " ".join(new_tokens).strip()
            else:
                # 2. Look for best matching n-gram (length >= 2) of cur_words in the trailing words of existing
                tail_ex = ex_words[-8:] if len(ex_words) >= 8 else ex_words
                best_match_cur_idx = 0
                for n in range(min(4, len(cur_words)), 1, -1):
                    found = False
                    for i in range(len(cur_words) - n + 1):
                        gram = cur_words[i : i + n]
                        for j in range(len(tail_ex) - n + 1):
                            if tail_ex[j : j + n] == gram:
                                best_match_cur_idx = i + n
                                found = True
                                break
                        if found:
                            break
                    if found:
                        break

                if best_match_cur_idx > 0:
                    new_tokens = cur_tokens[best_match_cur_idx:]
                    new_chunk = " ".join(new_tokens).strip()
                else:
                    cur_str = " ".join(cur_words)
                    ex_str = " ".join(ex_words)
                    if cur_str and cur_str in ex_str:
                        new_chunk = ""
                    else:
                        # 3. Fuzzy overlap: check if current window words are almost entirely (>= 75%)
                        # within the trailing words of the existing transcript to avoid duplicate re-emits
                        tail_set = set(tail_ex)
                        matching_count = sum(1 for w in cur_words if w in tail_set)
                        overlap_ratio = matching_count / max(len(cur_words), 1)
                        if overlap_ratio >= 0.75 and len(cur_words) <= len(tail_ex) + 1:
                            new_chunk = ""
                        else:
                            new_chunk = cur_raw

            if new_chunk:
                self.accumulated_transcript_segments.append(new_chunk)
            return new_chunk

    def get_accumulated_transcript(self) -> str:
        """Return the accumulated transcript string so far."""
        with self._lock:
            return " ".join(self.accumulated_transcript_segments)

    def get_summary(self) -> SessionSummary:
        """Generate final SessionSummary statistics."""
        with self._lock:
            latencies = self.chunk_latencies_ms
            if latencies:
                mean_lat = float(np.mean(latencies))
                p50_lat = float(np.percentile(latencies, 50))
                p95_lat = float(np.percentile(latencies, 95))
            else:
                mean_lat = p50_lat = p95_lat = 0.0

            rtfs = self.chunk_rtfs
            mean_rtf = float(np.mean(rtfs)) if rtfs else 0.0

            latest_raw_synth = self.raw_synthetic_probs[-1] if self.raw_synthetic_probs else None
            latest_smooth_synth = self.smoothed_synthetic_probs[-1] if self.smoothed_synthetic_probs else None
            latest_raw_sim = self.raw_speaker_sims[-1] if self.raw_speaker_sims else None
            latest_smooth_sim = self.smoothed_speaker_sims[-1] if self.smoothed_speaker_sims else None

            return SessionSummary(
                session_id=self.session_id,
                speaker_id=self.speaker_id,
                total_chunks=self.total_chunks,
                processed_chunks=self.processed_chunks,
                total_audio_seconds=self.total_audio_seconds,
                total_speech_seconds=self.total_speech_seconds,
                p50_latency_ms=p50_lat,
                p95_latency_ms=p95_lat,
                mean_latency_ms=mean_lat,
                mean_rtf=mean_rtf,
                final_verdict=self.last_verdict,
                alert_triggered=self.alert_triggered,
                alert_reason=self.alert_reason,
                accumulated_transcript=" ".join(self.accumulated_transcript_segments),
                latest_synthetic_probability=latest_raw_synth,
                latest_smoothed_synthetic_probability=latest_smooth_synth,
                latest_speaker_similarity=latest_raw_sim,
                latest_smoothed_speaker_similarity=latest_smooth_sim,
            )


# ---------------------------------------------------------------------------
# Streaming Audio Pipeline Manager
# ---------------------------------------------------------------------------

class StreamingAudioPipeline:
    """
    High-level orchestrator for streaming chunk ingestion.

    Holds a single shared InferencePipeline instance and manages isolated
    StreamingSessions in a thread-safe dictionary.
    """

    def __init__(
        self,
        pipeline: Optional[InferencePipeline] = None,
        config: Optional[StreamingConfig] = None,
    ) -> None:
        """
        Initialize the streaming pipeline.

        Parameters
        ----------
        pipeline : InferencePipeline | None
            Underlying unified pipeline holding initialized models.
            If None, the default global singleton is used.
        config : StreamingConfig | None
            Streaming configuration parameters.
        """
        self.pipeline = pipeline or get_default_pipeline()
        self.config = config or StreamingConfig()
        self._sessions: Dict[str, StreamingSession] = {}
        self._sessions_lock = threading.Lock()
        log.info(
            "StreamingAudioPipeline initialized (chunk=%dms, max_buf=%.1fs, alert_thresh=%.2f)",
            self.config.chunk_duration_ms,
            self.config.max_buffer_duration_sec,
            self.config.fast_alert_threshold,
        )

    def start_session(
        self,
        session_id: str,
        speaker_id: Optional[str] = None,
        reference_embedding: Optional[np.ndarray] = None,
    ) -> StreamingSession:
        """
        Initialize or reset an active streaming session.

        If a speaker_id is supplied without an explicit embedding, the reference
        embedding is pre-fetched and cached in the session for the call duration.
        """
        with self._sessions_lock:
            # Pre-fetch reference embedding if speaker_id given
            ref_emb = reference_embedding
            if ref_emb is None and speaker_id is not None:
                ref_emb = self.pipeline.speaker_service.get_reference_embedding(speaker_id)
                if ref_emb is None:
                    log.warning(
                        "[StreamingPipeline] Speaker '%s' requested but not enrolled in repository.",
                        speaker_id,
                    )

            session = StreamingSession(
                session_id=session_id,
                speaker_id=speaker_id,
                reference_embedding=ref_emb,
                config=self.config,
            )
            self._sessions[session_id] = session
            log.info(
                "[StreamingPipeline] Started session '%s' (speaker='%s', ref_emb=%s)",
                session_id,
                speaker_id,
                "cached" if ref_emb is not None else "None",
            )
            return session

    def get_session(self, session_id: str) -> Optional[StreamingSession]:
        """Retrieve an active session by ID."""
        with self._sessions_lock:
            return self._sessions.get(session_id)

    def end_session(self, session_id: str) -> SessionSummary:
        """
        End a streaming session and return its summary report.
        """
        with self._sessions_lock:
            session = self._sessions.pop(session_id, None)

        if session is None:
            log.warning("[StreamingPipeline] end_session: session '%s' not found.", session_id)
            return SessionSummary(session_id=session_id)

        session.is_active = False
        summary = session.get_summary()
        log.info(
            "[StreamingPipeline] Ended session '%s' | Chunks=%d | Audio=%.1fs | Speech=%.1fs | "
            "Verdict='%s' | Alert=%s | MeanRTF=%.3f | P95Lat=%.1fms",
            session_id,
            summary.total_chunks,
            summary.total_audio_seconds,
            summary.total_speech_seconds,
            summary.final_verdict,
            summary.alert_triggered,
            summary.mean_rtf,
            summary.p95_latency_ms,
        )
        return summary

    def reset_session(self, session_id: str) -> StreamingSession:
        """Clear audio buffer and scoring history for a session while preserving speaker context."""
        with self._sessions_lock:
            old = self._sessions.get(session_id)
            speaker_id = old.speaker_id if old else None
            ref_emb = old.reference_embedding if old else None
            return self.start_session(session_id, speaker_id=speaker_id, reference_embedding=ref_emb)

    def _decode_chunk(
        self,
        chunk_input: Union[str, Path, bytes, np.ndarray, torch.Tensor],
    ) -> Tuple[np.ndarray, AudioMeta]:
        """
        Standardize raw chunk input to 16kHz mono float32 numpy array.
        """
        if isinstance(chunk_input, (str, Path)):
            wav_raw, sr = load_audio(chunk_input, target_sr=TARGET_SAMPLE_RATE)
            if isinstance(wav_raw, torch.Tensor):
                wav_np = wav_raw.detach().cpu().float().numpy()
            else:
                wav_np = np.asarray(wav_raw, dtype=np.float32)
            if wav_np.ndim > 1:
                wav_np = np.squeeze(wav_np)
            meta = AudioMeta(
                file_path=str(chunk_input),
                duration_seconds=float(len(wav_np) / TARGET_SAMPLE_RATE),
                sample_rate=TARGET_SAMPLE_RATE,
                channels=1,
            )
            return wav_np, meta

        if isinstance(chunk_input, bytes):
            import io
            wav_raw, sr = load_audio(io.BytesIO(chunk_input), target_sr=TARGET_SAMPLE_RATE)
            if isinstance(wav_raw, torch.Tensor):
                wav_np = wav_raw.detach().cpu().float().numpy()
            else:
                wav_np = np.asarray(wav_raw, dtype=np.float32)
            if wav_np.ndim > 1:
                wav_np = np.squeeze(wav_np)
            meta = AudioMeta(
                file_path="<bytes>",
                duration_seconds=float(len(wav_np) / TARGET_SAMPLE_RATE),
                sample_rate=TARGET_SAMPLE_RATE,
                channels=1,
            )
            return wav_np, meta

        if isinstance(chunk_input, torch.Tensor):
            t = chunk_input.detach().cpu().float()
            if t.ndim == 2:
                t = t.mean(dim=0)
            elif t.ndim > 2:
                t = t.squeeze()
            wav_np = t.numpy()

            meta = AudioMeta(
                file_path="<tensor>",
                duration_seconds=float(len(wav_np) / TARGET_SAMPLE_RATE),
                sample_rate=TARGET_SAMPLE_RATE,
                channels=1,
            )
            return wav_np, meta

        if isinstance(chunk_input, np.ndarray):
            arr = chunk_input.astype(np.float32)
            if arr.ndim == 2:
                arr = arr.mean(axis=0)
            elif arr.ndim > 2:
                arr = np.squeeze(arr)
            meta = AudioMeta(
                file_path="<ndarray>",
                duration_seconds=float(len(arr) / TARGET_SAMPLE_RATE),
                sample_rate=TARGET_SAMPLE_RATE,
                channels=1,
            )
            return arr, meta

        raise TypeError(f"Unsupported audio input type: {type(chunk_input)}")

    def process_chunk(
        self,
        session_id: str,
        chunk_input: Union[str, Path, bytes, np.ndarray, torch.Tensor],
        chunk_id: Optional[Union[str, int]] = None,
        chunk_duration_ms: Optional[float] = None,
    ) -> StreamingInferenceResult:
        """
        Process a single streaming chunk for an active session.

        Execution steps:
          1. Decode & normalize incoming chunk.
          2. Check Silero VAD early gating on chunk.
          3. If silence: early-exit (bypass Deepfake, ECAPA, Whisper).
          4. If speech: append to bounded rolling buffer (max 4.0s).
          5. Run DeepfakeCNN and ECAPA-TDNN over bounded rolling buffer.
          6. Run faster-whisper on current chunk speech.
          7. Run IntentDetector on accumulated dialogue.
          8. Apply dual temporal smoothing & fast alert escalation.
          9. Record telemetry (latency, RTF).

        Returns
        -------
        StreamingInferenceResult
        """
        t_start = time.perf_counter()
        timings: Dict[str, float] = {}

        # ── 1. Retrieve or auto-create session ──────────────────────────────
        session = self.get_session(session_id)
        if session is None:
            session = self.start_session(session_id)

        chunk_idx = str(chunk_id if chunk_id is not None else session.total_chunks)

        # ── 2. Decode & standardize chunk waveform ──────────────────────────
        t0 = time.perf_counter()
        try:
            chunk_waveform, audio_meta = self._decode_chunk(chunk_input)
            chunk_waveform = np.clip(chunk_waveform, -1.0, 1.0).astype(np.float32)
        except Exception as exc:

            total_elapsed = (time.perf_counter() - t_start) * 1000.0
            log.error("[StreamingPipeline] Audio decoding failed: %s", exc)
            return StreamingInferenceResult(
                session_id=session_id,
                chunk_id=chunk_idx,
                request_id=f"{session_id}_{chunk_idx}",
                timestamp=datetime.now(timezone.utc).isoformat(),
                speech_detected=False,
                synthetic_probability=None,
                speaker_similarity=None,
                speaker_match=None,
                transcript="",
                intent="UNKNOWN",
                intent_confidence=0.0,
                verdict="inconclusive",
                processing_time_ms=total_elapsed,
                real_time_factor=0.0,
                chunk_duration_ms=chunk_duration_ms or 1000.0,
                error=str(exc),
            )
        timings["audio_decode_ms"] = (time.perf_counter() - t0) * 1000.0

        if chunk_duration_ms is None:
            chunk_duration_ms = (len(chunk_waveform) / TARGET_SAMPLE_RATE) * 1000.0

        # Append incoming chunk to bounded rolling buffer (maintains continuous rolling audio context)
        session.append_audio(chunk_waveform)


        # ── 3. Silero VAD Early Gating on Chunk ──────────────────────────────
        t0 = time.perf_counter()
        vad_res: VADResult = self.pipeline.vad.detect(chunk_waveform)
        timings["vad_ms"] = (time.perf_counter() - t0) * 1000.0

        schema_vad = SchemaVADResult(
            speech_detected=vad_res.speech_detected,
            speech_ratio=vad_res.speech_ratio,
            num_segments=len(vad_res.speech_segments),
            total_speech_seconds=vad_res.total_speech_sec,
            speech_probability=vad_res.speech_probability,
        )

        # Early exit on silence (bypasses Deepfake, ECAPA-TDNN, Whisper)
        if not vad_res.speech_detected or vad_res.speech_ratio <= 0.0 or len(chunk_waveform) == 0:
            total_elapsed = (time.perf_counter() - t_start) * 1000.0
            timings["total_pipeline_ms"] = total_elapsed

            (
                sm_synth,
                sm_sim,
                rtf,
                is_alert,
                alert_reason,
            ) = session.update_scores(
                raw_synthetic_prob=None,
                raw_speaker_sim=None,
                latency_ms=total_elapsed,
                chunk_duration_ms=chunk_duration_ms,
            )

            log.debug(
                "[StreamingPipeline] Chunk %s:%s is silence (VAD ratio=%.2f). Early exiting in %.1f ms.",
                session_id,
                chunk_idx,
                vad_res.speech_ratio,
                total_elapsed,
            )

            return StreamingInferenceResult(
                session_id=session_id,
                chunk_id=chunk_idx,
                request_id=f"{session_id}_{chunk_idx}",
                timestamp=datetime.now(timezone.utc).isoformat(),
                speech_detected=False,
                synthetic_probability=None,
                smoothed_synthetic_probability=sm_synth,
                speaker_similarity=None,
                smoothed_speaker_similarity=sm_sim,
                speaker_match=None,
                transcript="",
                intent="UNKNOWN",
                intent_confidence=0.0,
                audio_meta=audio_meta,
                vad=schema_vad,
                deepfake=None,
                speaker=None,
                transcription=None,
                intent_details=None,
                verdict="inconclusive",
                processing_time_ms=total_elapsed,
                stage_timings_ms=timings,
                real_time_factor=rtf,
                is_alert=is_alert,
                alert_reason=alert_reason,
                chunk_duration_ms=chunk_duration_ms,
            )

        # ── 4. Speech detected: update speech duration & get rolling buffer ───
        session.total_speech_seconds += vad_res.total_speech_sec
        rolling_buffer = session.get_audio_buffer()


        # ── 5. Deepfake Detection over Bounded Rolling Buffer ────────────────
        t0 = time.perf_counter()
        df_res: DeepfakeV2Result = self.pipeline.deepfake_detector.detect(rolling_buffer)
        timings["deepfake_ms"] = (time.perf_counter() - t0) * 1000.0

        raw_synthetic_prob = float(df_res.synthetic_probability)
        schema_df = DeepfakeResult(
            synthetic_probability=raw_synthetic_prob,
            is_synthetic=df_res.is_synthetic,
            model_name=df_res.model_name,
            score=raw_synthetic_prob,
            label="cloned" if df_res.is_synthetic else "genuine",
        )

        # ── 6. ECAPA-TDNN Speaker Verification ──────────────────────────────
        t0 = time.perf_counter()
        raw_speaker_sim: Optional[float] = None
        speaker_match: Optional[bool] = None
        schema_spk: Optional[SchemaSpeakerResult] = None

        active_ref_emb = session.reference_embedding
        if active_ref_emb is None and session.speaker_id is not None:
            active_ref_emb = self.pipeline.speaker_service.get_reference_embedding(session.speaker_id)
            session.reference_embedding = active_ref_emb

        if active_ref_emb is not None:
            spk_res: SpeakerResult = self.pipeline.speaker_verifier.verify_speaker(
                rolling_buffer, active_ref_emb
            )
            raw_speaker_sim = float(spk_res.speaker_similarity)
            speaker_match = bool(spk_res.speaker_match)
            schema_spk = SchemaSpeakerResult(
                embedding_dim=spk_res.embedding_dim,
                speaker_similarity=raw_speaker_sim,
                speaker_match=speaker_match,
                cosine_score=raw_speaker_sim,
                same_speaker=speaker_match,
            )
        timings["speaker_verifier_ms"] = (time.perf_counter() - t0) * 1000.0

        # ── 7. faster-whisper Speech-to-Text on Rolling Audio Context ───────────────
        t0 = time.perf_counter()
        # Use rolling audio buffer (up to 3.0s = 48,000 samples) so Whisper has full acoustic context
        # without cutting phonemes at 1.0s boundaries
        rolling_buf = session.get_audio_buffer()
        if len(rolling_buf) > 48000:
            asr_input = rolling_buf[-48000:]
        elif len(rolling_buf) >= len(chunk_waveform):
            asr_input = rolling_buf
        else:
            asr_input = chunk_waveform

        asr_res: ASRResult = self.pipeline.whisper_asr.transcribe(asr_input, vad_filter=False)
        timings["whisper_asr_ms"] = (time.perf_counter() - t0) * 1000.0

        raw_asr_text = asr_res.transcript.strip()
        chunk_text = session.append_incremental_transcript(raw_asr_text)
        accumulated_text = session.get_accumulated_transcript()

        schema_asr = TranscriptionResult(
            text=chunk_text,
            language=asr_res.detected_language,
            language_probability=asr_res.language_probability,
            num_segments=len(asr_res.segments),
        )

        # ── 8. Intent Detection on Accumulated Transcript ───────────────────
        t0 = time.perf_counter()
        if accumulated_text:
            intent_res: IntentResult = self.pipeline.intent_detector.detect(accumulated_text)
            intent_str = intent_res.intent
            intent_conf = intent_res.intent_confidence
            matched_ind = intent_res.matched_indicators
        else:
            intent_str = "UNKNOWN"
            intent_conf = 0.0
            matched_ind = []
        timings["intent_detector_ms"] = (time.perf_counter() - t0) * 1000.0

        schema_intent = SchemaIntentResult(
            intent=intent_str,
            confidence=intent_conf,
            keywords_matched=matched_ind,
        )

        # ── 9. Telemetry & Temporal Smoothing Updates ───────────────────────
        total_elapsed = (time.perf_counter() - t_start) * 1000.0
        timings["total_pipeline_ms"] = total_elapsed

        (
            sm_synth,
            sm_sim,
            rtf,
            is_alert,
            alert_reason,
        ) = session.update_scores(
            raw_synthetic_prob=raw_synthetic_prob,
            raw_speaker_sim=raw_speaker_sim,
            latency_ms=total_elapsed,
            chunk_duration_ms=chunk_duration_ms,
        )

        # ── 10. Multi-Factor Verdict Synthesis ──────────────────────────────
        # Security Hierarchy:
        # 1. Fast Alert Escalation (raw synth >= fast_threshold) -> 'cloned'
        # 2. High Smoothed Synthetic Prob (smoothed >= deepfake_threshold) -> 'cloned'
        # 3. Speaker Mismatch (smoothed_sim < threshold) -> 'imposter'
        # 4. Speaker Match (smoothed_sim >= threshold and not cloned) -> 'genuine'
        # 5. No speaker enrollment -> 'inconclusive'
        deepfake_thresh = getattr(self.pipeline.deepfake_detector, "default_threshold", 0.5)


        effective_synth = sm_synth if sm_synth is not None else raw_synthetic_prob
        is_synthetic_verdict = is_alert or (effective_synth >= deepfake_thresh)

        if is_synthetic_verdict:
            verdict: Literal["genuine", "cloned", "imposter", "inconclusive"] = "cloned"
        elif active_ref_emb is not None:
            spk_thresh = self.config.speaker_threshold
            effective_sim = sm_sim if sm_sim is not None else raw_speaker_sim
            if speaker_match is True or (effective_sim is not None and effective_sim >= spk_thresh):
                verdict = "genuine"
            elif speaker_match is False or (effective_sim is not None and effective_sim < spk_thresh):
                verdict = "imposter"
            else:
                verdict = "inconclusive"
        else:
            verdict = "inconclusive"


        session.last_verdict = verdict

        log.info(
            "[StreamingPipeline] Chunk %s:%s | Verdict='%s' | Alert=%s | RawSynth=%.3f "
            "| SmoothSynth=%.3f | RawSim=%s | SmoothSim=%s | Latency=%.1fms | RTF=%.3f",
            session_id,
            chunk_idx,
            verdict,
            is_alert,
            raw_synthetic_prob,
            sm_synth if sm_synth is not None else 0.0,
            f"{raw_speaker_sim:.3f}" if raw_speaker_sim is not None else "None",
            f"{sm_sim:.3f}" if sm_sim is not None else "None",
            total_elapsed,
            rtf,
        )

        return StreamingInferenceResult(
            session_id=session_id,
            chunk_id=chunk_idx,
            request_id=f"{session_id}_{chunk_idx}",
            timestamp=datetime.now(timezone.utc).isoformat(),
            speech_detected=True,
            synthetic_probability=raw_synthetic_prob,
            smoothed_synthetic_probability=sm_synth,
            speaker_similarity=raw_speaker_sim,
            smoothed_speaker_similarity=sm_sim,
            speaker_match=speaker_match,
            transcript=chunk_text,
            intent=intent_str,
            intent_confidence=intent_conf,
            audio_meta=audio_meta,
            vad=schema_vad,
            deepfake=schema_df,
            speaker=schema_spk,
            transcription=schema_asr,
            intent_details=schema_intent,
            verdict=verdict,
            processing_time_ms=total_elapsed,
            stage_timings_ms=timings,
            real_time_factor=rtf,
            is_alert=is_alert,
            alert_reason=alert_reason,
            chunk_duration_ms=chunk_duration_ms,
        )
