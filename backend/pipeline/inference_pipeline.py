"""
backend/pipeline/inference_pipeline.py
======================================
Unified AI + Audio Inference Pipeline for VoiceCloneDetection-SIH.

Orchestration Flow:
-------------------
audio_input
    ↓
decode_audio()
    ↓
resample_to_16khz_mono()
    ↓
Silero VAD
    ↓
if no speech:
    return InferenceResult (early exit without downstream inference)
    ↓
 ┌──────────────┬──────────────┬──────────────┐
 │              │              │
 ▼              ▼              ▼
Deepfake v2   ECAPA          Whisper
 │              │              │
 ▼              ▼              ▼
synthetic     similarity     transcript
probability
 │              │              │
 └──────────────┴──────────────┘
                    ↓
               IntentDetector
                    ↓
             InferenceResult
"""

from __future__ import annotations

import io
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Union

import numpy as np
import torch

from backend.audio.decoder import load_audio
from backend.audio.preprocessing import (
    TARGET_SAMPLE_RATE,
    _to_mono,
    normalize_waveform,
    preprocess_audio,
    validate_waveform,
)
from backend.audio.vad import SileroVAD, VADResult
from backend.intent.intent_detector import IntentDetector, IntentResult
from backend.models.deepfake_v2 import DeepfakeV2Detector, DeepfakeV2Result
from backend.models.speaker_enrollment import SpeakerEnrollmentService
from backend.models.speaker_repository import BaseSpeakerRepository
from backend.models.speaker_verifier import SpeakerResult, SpeakerVerifier
from backend.models.whisper_asr import ASRResult, WhisperASR
from backend.schemas.inference_result import (
    AudioMeta,
    DeepfakeResult,
    InferenceResult,
    SpeakerResult as SchemaSpeakerResult,
    TranscriptionResult,
    VADResult as SchemaVADResult,
    IntentResult as SchemaIntentResult,
)
from backend.utils.logger import get_logger

log = get_logger(__name__)


class InferencePipeline:
    """
    Unified Inference Pipeline.
    Loads and holds all AI models once during initialization and reuses them.
    """

    def __init__(
        self,
        deepfake_detector: Optional[DeepfakeV2Detector] = None,
        speaker_verifier: Optional[SpeakerVerifier] = None,
        whisper_asr: Optional[WhisperASR] = None,
        intent_detector: Optional[IntentDetector] = None,
        vad: Optional[SileroVAD] = None,
        deepfake_checkpoint_path: Optional[Union[str, Path]] = None,
        speaker_service: Optional[SpeakerEnrollmentService] = None,
        speaker_repository: Optional[BaseSpeakerRepository] = None,
    ) -> None:
        log.info("Initializing InferencePipeline models (single load)...")
        t0 = time.perf_counter()

        self.vad = vad or SileroVAD.load()
        self.deepfake_detector = deepfake_detector or DeepfakeV2Detector(
            checkpoint_path=deepfake_checkpoint_path,
            device="cpu",
        )
        self.speaker_verifier = speaker_verifier or SpeakerVerifier.load()
        self.speaker_service = speaker_service or SpeakerEnrollmentService(
            verifier=self.speaker_verifier,
            vad=self.vad,
            repository=speaker_repository,
        )
        self.whisper_asr = whisper_asr or WhisperASR(model_size_or_path="base", device="cpu")
        self.intent_detector = intent_detector or IntentDetector()

        init_ms = (time.perf_counter() - t0) * 1000.0
        log.info("InferencePipeline initialized successfully in %.1f ms", init_ms)

    def _standardize_input(
        self, audio_input: Union[str, Path, bytes, np.ndarray, torch.Tensor]
    ) -> Tuple[np.ndarray, AudioMeta]:
        """
        Convert any supported audio input into a 16 kHz mono float32 waveform.

        Returns
        -------
        Tuple[np.ndarray, AudioMeta]
        """
        if audio_input is None:
            raise ValueError("audio_input cannot be None")

        meta = AudioMeta(sample_rate=TARGET_SAMPLE_RATE, channels=1)

        # 1. Path or file string
        if isinstance(audio_input, (str, Path)):
            path = Path(audio_input)
            meta.file_path = str(path)
            waveform = preprocess_audio(path)
            meta.duration_seconds = float(len(waveform) / TARGET_SAMPLE_RATE)
            return waveform, meta

        # 2. Raw bytes (e.g. streaming audio chunk)
        if isinstance(audio_input, (bytes, bytearray)):
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(audio_input)
                tmp_path = Path(tmp.name)
            try:
                waveform = preprocess_audio(tmp_path)
                meta.file_path = "<raw_bytes>"
                meta.duration_seconds = float(len(waveform) / TARGET_SAMPLE_RATE)
                return waveform, meta
            finally:
                tmp_path.unlink(missing_ok=True)

        # 3. Torch Tensor
        if isinstance(audio_input, torch.Tensor):
            audio_input = audio_input.detach().cpu().numpy()

        # 4. Numpy ndarray
        if isinstance(audio_input, np.ndarray):
            if audio_input.size == 0:
                raise ValueError("audio_input numpy array is empty")

            waveform = _to_mono(audio_input)
            waveform = waveform.astype(np.float32, copy=False)
            waveform = normalize_waveform(waveform)
            validate_waveform(waveform, TARGET_SAMPLE_RATE)

            meta.file_path = "<numpy_waveform>"
            meta.duration_seconds = float(len(waveform) / TARGET_SAMPLE_RATE)
            return waveform, meta

        raise TypeError(f"Unsupported audio input type: {type(audio_input).__name__}")

    def process_audio(
        self,
        audio_input: Union[str, Path, bytes, np.ndarray, torch.Tensor],
        session_id: str,
        chunk_id: Union[str, int] = "0",
        reference_embedding: Optional[np.ndarray] = None,
        speaker_id: Optional[str] = None,
    ) -> InferenceResult:
        """
        Execute full inference pipeline for one audio input.

        Parameters
        ----------
        audio_input : str | Path | bytes | np.ndarray
            Audio source to process.
        session_id : str
            Unique session identifier.
        chunk_id : str | int
            Sequential chunk index or ID.
        reference_embedding : np.ndarray | None
            Pre-enrolled speaker embedding (192-D) for speaker verification.
            If None, speaker verification is gracefully skipped.

        Returns
        -------
        InferenceResult
            Canonical structured result dataclass.
        """
        total_start = time.perf_counter()
        chunk_str = str(chunk_id)
        timings: Dict[str, float] = {}

        log.info("[Pipeline] Starting chunk session='%s' chunk='%s'", session_id, chunk_str)

        # ── Stage 1: Audio Decode & Preprocess ───────────────────────────────
        t_decode_start = time.perf_counter()
        try:
            waveform, audio_meta = self._standardize_input(audio_input)
        except Exception as exc:
            log.error("[Pipeline] Audio preprocessing failed: %s", exc)
            total_elapsed = (time.perf_counter() - total_start) * 1000.0
            return InferenceResult(
                session_id=session_id,
                chunk_id=chunk_str,
                request_id=f"{session_id}_{chunk_str}",
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
                error=str(exc),
            )

        timings["audio_decode_ms"] = (time.perf_counter() - t_decode_start) * 1000.0

        # ── Stage 2: Silero VAD ───────────────────────────────────────────────
        t_vad_start = time.perf_counter()
        vad_res: VADResult = self.vad.detect(waveform)
        timings["vad_ms"] = (time.perf_counter() - t_vad_start) * 1000.0

        schema_vad = SchemaVADResult(
            speech_detected=vad_res.speech_detected,
            speech_ratio=vad_res.speech_ratio,
            num_segments=len(vad_res.speech_segments),
            total_speech_seconds=vad_res.total_speech_sec,
            speech_probability=vad_res.speech_probability,
        )

        # ── VAD Early Exit: If no speech detected, bypass downstream models ───
        if not vad_res.speech_detected or vad_res.speech_ratio <= 0.0:
            total_elapsed = (time.perf_counter() - total_start) * 1000.0
            log.info(
                "[Pipeline] Silence detected by VAD (speech_ratio=%.2f%%). Bypassing downstream models.",
                vad_res.speech_ratio * 100.0,
            )
            return InferenceResult(
                session_id=session_id,
                chunk_id=chunk_str,
                request_id=f"{session_id}_{chunk_str}",
                timestamp=datetime.now(timezone.utc).isoformat(),
                speech_detected=False,
                synthetic_probability=None,
                speaker_similarity=None,
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
            )

        # ── Stage 3a: Deepfake Detection v2 ──────────────────────────────────
        t_df_start = time.perf_counter()
        df_res: DeepfakeV2Result = self.deepfake_detector.detect(waveform)
        timings["deepfake_ms"] = (time.perf_counter() - t_df_start) * 1000.0

        synthetic_prob = float(df_res.synthetic_probability)
        schema_df = DeepfakeResult(
            synthetic_probability=synthetic_prob,
            is_synthetic=df_res.is_synthetic,
            model_name=df_res.model_name,
            score=synthetic_prob,
            label="cloned" if df_res.is_synthetic else "genuine",
        )

        # ── Stage 3b: ECAPA-TDNN Speaker Verification ────────────────────────
        t_spk_start = time.perf_counter()
        speaker_sim: Optional[float] = None
        speaker_match: Optional[bool] = None
        schema_spk: Optional[SchemaSpeakerResult] = None

        active_ref_emb = reference_embedding
        if active_ref_emb is None and speaker_id is not None:
            active_ref_emb = self.speaker_service.get_reference_embedding(speaker_id)
            if active_ref_emb is None:
                log.warning("[Pipeline] Speaker '%s' requested but not enrolled in repository.", speaker_id)

        if active_ref_emb is not None:
            spk_res: SpeakerResult = self.speaker_verifier.verify_speaker(waveform, active_ref_emb)
            speaker_sim = float(spk_res.speaker_similarity)
            speaker_match = bool(spk_res.speaker_match)
            schema_spk = SchemaSpeakerResult(
                embedding_dim=spk_res.embedding_dim,
                speaker_similarity=speaker_sim,
                speaker_match=speaker_match,
                cosine_score=speaker_sim,
                same_speaker=speaker_match,
            )
        else:
            log.debug("[Pipeline] No reference embedding provided; speaker verification skipped.")

        timings["speaker_verifier_ms"] = (time.perf_counter() - t_spk_start) * 1000.0

        # ── Stage 3c: faster-whisper Speech-to-Text ──────────────────────────
        t_asr_start = time.perf_counter()
        asr_res: ASRResult = self.whisper_asr.transcribe(waveform, vad_filter=True)
        timings["whisper_asr_ms"] = (time.perf_counter() - t_asr_start) * 1000.0

        transcript_text = asr_res.transcript
        schema_asr = TranscriptionResult(
            text=transcript_text,
            language=asr_res.detected_language,
            language_probability=asr_res.language_probability,
            num_segments=len(asr_res.segments),
        )

        # ── Stage 4: IntentDetector ──────────────────────────────────────────
        t_intent_start = time.perf_counter()
        if transcript_text:
            intent_res: IntentResult = self.intent_detector.detect(transcript_text)
            intent_str = intent_res.intent
            intent_conf = intent_res.intent_confidence
            matched_ind = intent_res.matched_indicators
        else:
            intent_str = "UNKNOWN"
            intent_conf = 0.0
            matched_ind = []

        timings["intent_detector_ms"] = (time.perf_counter() - t_intent_start) * 1000.0

        schema_intent = SchemaIntentResult(
            intent=intent_str,
            confidence=intent_conf,
            keywords_matched=matched_ind,
        )

        # ── Stage 5: Verdict Synthesis ────────────────────────────────────────
        # Decision logic:
        # 1. If high synthetic probability -> 'cloned'
        # 2. If reference speaker provided and mismatch -> 'imposter'
        # 3. If reference speaker provided and match and not synthetic -> 'genuine'
        # 4. If no reference speaker provided -> 'inconclusive'
        if df_res.is_synthetic:
            verdict = "cloned"
        elif speaker_match is False:
            verdict = "imposter"
        elif speaker_match is True:
            verdict = "genuine"
        else:
            verdict = "inconclusive"

        total_elapsed = (time.perf_counter() - total_start) * 1000.0
        timings["total_pipeline_ms"] = total_elapsed

        log.info(
            "[Pipeline] Finished session='%s' chunk='%s' in %.1f ms | verdict='%s' | "
            "synthetic_prob=%.3f | spk_match=%s (sim=%s) | intent='%s' | text='%s'",
            session_id,
            chunk_str,
            total_elapsed,
            verdict,
            synthetic_prob,
            speaker_match,
            f"{speaker_sim:.3f}" if speaker_sim is not None else "None",
            intent_str,
            transcript_text[:40] + ("..." if len(transcript_text) > 40 else ""),
        )

        return InferenceResult(
            session_id=session_id,
            chunk_id=chunk_str,
            request_id=f"{session_id}_{chunk_str}",
            timestamp=datetime.now(timezone.utc).isoformat(),
            speech_detected=True,
            synthetic_probability=synthetic_prob,
            speaker_similarity=speaker_sim,
            speaker_match=speaker_match,
            transcript=transcript_text,
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
        )


# ─────────────────────────────────────────────────────────────────────────────
# Module-level singleton and process_audio API
# ─────────────────────────────────────────────────────────────────────────────

_DEFAULT_PIPELINE: Optional[InferencePipeline] = None


def get_default_pipeline() -> InferencePipeline:
    global _DEFAULT_PIPELINE

    if _DEFAULT_PIPELINE is None:
        from backend.platform.db.speaker_repo_adapter import (
            DatabaseSpeakerRepository
        )

        _DEFAULT_PIPELINE = InferencePipeline(
            speaker_repository=DatabaseSpeakerRepository()
        )

    return _DEFAULT_PIPELINE


def process_audio(
    audio_input: Union[str, Path, bytes, np.ndarray, torch.Tensor],
    session_id: str,
    chunk_id: Union[str, int] = "0",
    reference_embedding: Optional[np.ndarray] = None,
    pipeline: Optional[InferencePipeline] = None,
    speaker_id: Optional[str] = None,
) -> InferenceResult:
    """
    Module-level function to process an audio chunk through the unified pipeline.

    Parameters
    ----------
    audio_input : str | Path | bytes | np.ndarray
        Audio waveform or path or raw bytes.
    session_id : str
        Session tracking ID.
    chunk_id : str | int
        Audio chunk number or identifier.
    reference_embedding : np.ndarray | None
        Optional enrolled speaker embedding.
    pipeline : InferencePipeline | None
        Optional specific pipeline instance. Defaults to shared singleton.
    speaker_id : str | None
        Optional enrolled speaker ID to lookup reference embedding automatically.

    Returns
    -------
    InferenceResult
    """
    pipe = pipeline or get_default_pipeline()
    return pipe.process_audio(
        audio_input=audio_input,
        session_id=session_id,
        chunk_id=chunk_id,
        reference_embedding=reference_embedding,
        speaker_id=speaker_id,
    )
