"""
backend/models/whisper_asr.py
=============================
Speech-to-text module using faster-whisper (CTranslate2-based Whisper).

Requirements:
  - Official faster-whisper package
  - Pretrained Whisper models ("tiny", "base", "small", etc.)
  - Model loaded ONCE during initialization and reused (no reload per chunk)
  - Input: numpy waveform, mono, float32, 16 kHz
  - Output: structured ASRResult containing:
      transcript, detected_language, language_probability,
      processing_time_ms, no_speech_probability
  - Safe handling of empty audio, very short audio (<0.1s), silence,
    no speech, and invalid input
  - macOS CPU compatibility with int8 quantization
  - Graceful handling of requested "mps" device falling back to CPU
  - Structured logging for model loaded, device, transcription time,
    and detected language
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, ClassVar, Dict, List, Optional, Tuple, Union

import numpy as np
import torch
from faster_whisper import WhisperModel

from backend.audio.preprocessing import preprocess_audio
from backend.audio.vad import SileroVAD, VADResult
from backend.utils.config import PipelineConfig
from backend.utils.logger import get_logger

log = get_logger(__name__)

SAMPLE_RATE: int = 16_000
MIN_AUDIO_SAMPLES: int = 1_600  # 0.1 seconds at 16 kHz
DEFAULT_MODEL_SIZE: str = "base"


@dataclass(frozen=True)
class ASRResult:
    """
    Structured output from the Whisper speech-to-text stage.

    Attributes
    ----------
    transcript : str
        Recognized speech text. Empty string if silent or no speech.
    detected_language : str
        ISO language code detected by Whisper (e.g., 'en', 'es').
    language_probability : float | None
        Confidence score for detected language [0.0, 1.0].
    processing_time_ms : float
        Elapsed transcription time in milliseconds.
    no_speech_probability : float | None
        Probability that the audio contains no speech [0.0, 1.0].
    segments : List[Dict[str, Any]]
        List of segment metadata dicts (start, end, text, avg_logprob).
    model_name : str
        Identifier of the active Whisper model.
    device : str
        Execution device ('cpu' or 'cuda').
    """
    transcript: str
    detected_language: str
    language_probability: Optional[float]
    processing_time_ms: float
    no_speech_probability: Optional[float] = None
    segments: List[Dict[str, Any]] = field(default_factory=list)
    model_name: str = f"faster-whisper-{DEFAULT_MODEL_SIZE}"
    device: str = "cpu"

    def summary(self) -> str:
        lang_info = f"lang={self.detected_language or 'none'}"
        if self.language_probability is not None:
            lang_info += f" ({self.language_probability:.1%})"
        no_speech_info = ""
        if self.no_speech_probability is not None:
            no_speech_info = f" | no_speech_prob={self.no_speech_probability:.2f}"
        preview = self.transcript if len(self.transcript) <= 60 else self.transcript[:57] + "..."
        return f"[ASR] '{preview}' | {lang_info}{no_speech_info} | time={self.processing_time_ms:.1f}ms"


class WhisperASR:
    """
    Clean, reusable Speech-to-Text transcriber using faster-whisper.

    Loads model ONCE during initialization and reuses across calls.
    """

    _model_cache: ClassVar[Dict[Tuple[str, str, str], Tuple[WhisperModel, float]]] = {}
    _vad_instance: Optional[SileroVAD] = None

    def __init__(
        self,
        model_size_or_path: Optional[str] = None,
        device: Optional[str] = None,
        compute_type: Optional[str] = None,
        config: Optional[PipelineConfig] = None,
        download_root: Optional[Union[str, Path]] = None,
        beam_size: int = 5,
        temperature: float = 0.0,
    ) -> None:
        """
        Initialize Whisper ASR.

        Parameters
        ----------
        model_size_or_path : str | None
            Whisper model size ('tiny', 'base', 'small', 'medium') or local path.
            Defaults to config.whisper_model_size or 'tiny' (development laptop default).
        device : str | None
            Device ('cpu', 'cuda', 'mps', or 'auto').
            Note: CTranslate2 operates on CPU or CUDA. If 'mps' is passed,
            it logs an informative message and falls back to CPU cleanly.
        compute_type : str | None
            Quantization type ('int8', 'float32', 'int8_float32').
        config : PipelineConfig | None
            Optional central pipeline configuration object.
        download_root : str | Path | None
            Custom directory to cache model files.
        beam_size : int
            Beam search size (default: 5).
        temperature : float
            Sampling temperature (default: 0.0 for deterministic decoding).
        """
        # Determine model size
        if model_size_or_path is not None:
            self.model_size = model_size_or_path
        elif config is not None and getattr(config, "whisper_model_size", None):
            self.model_size = config.whisper_model_size
        else:
            self.model_size = DEFAULT_MODEL_SIZE

        # Determine requested device
        req_dev = device or (config.whisper_device if config else "cpu")
        resolved_device = req_dev.lower()

        if resolved_device == "mps":
            log.info(
                "CTranslate2 does not support Apple Silicon MPS device for Whisper; "
                "using optimized CPU execution without breaking application."
            )
            resolved_device = "cpu"
        elif resolved_device == "auto":
            resolved_device = "cuda" if torch.cuda.is_available() else "cpu"
        elif resolved_device not in ("cpu", "cuda"):
            log.warning("Unrecognized device '%s'; defaulting to 'cpu'.", req_dev)
            resolved_device = "cpu"

        self.device = resolved_device
        self.compute_type = compute_type or (config.whisper_compute_type if config else "int8")
        self.download_root = str(download_root) if download_root else None
        self.beam_size = beam_size
        self.temperature = temperature
        self.default_language = (
            config.whisper_language if config and getattr(config, "whisper_language", None) else "en"
        )

        self.cache_key = (self.model_size, self.device, self.compute_type)

        # Load model ONCE and cache
        load_start = time.perf_counter()
        if self.cache_key not in self._model_cache:
            log.info(
                "Loading faster-whisper model '%s' on device='%s' (compute_type='%s')...",
                self.model_size,
                self.device,
                self.compute_type,
            )
            model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=self.compute_type,
                download_root=self.download_root,
            )
            load_elapsed_ms = (time.perf_counter() - load_start) * 1000.0
            self._model_cache[self.cache_key] = (model, load_elapsed_ms)
            log.info(
                "Model loaded successfully: model='%s' device='%s' in %.1f ms",
                self.model_size,
                self.device,
                load_elapsed_ms,
            )
        else:
            model, load_elapsed_ms = self._model_cache[self.cache_key]
            log.debug("Reusing cached faster-whisper model '%s' on %s", self.model_size, self.device)

        self._model = model
        self.model_loading_time_ms = load_elapsed_ms

    @property
    def model(self) -> WhisperModel:
        return self._model

    def _get_vad(self) -> SileroVAD:
        if self._vad_instance is None:
            self._vad_instance = SileroVAD.load()
        return self._vad_instance

    def _validate_input_waveform(
        self, audio: Union[np.ndarray, torch.Tensor, str, Path]
    ) -> Optional[np.ndarray]:
        """
        Validate and standardize input waveform.

        Requirements:
          - numpy ndarray
          - mono (1-D)
          - float32
          - 16 kHz

        Returns
        -------
        np.ndarray | None
            1-D mono float32 array, or None if audio is empty.
        """
        if audio is None:
            return None

        # Accept file paths for convenience while maintaining strict internal validation
        if isinstance(audio, (str, Path)):
            audio = preprocess_audio(audio)

        if isinstance(audio, torch.Tensor):
            audio = audio.detach().cpu().numpy()

        if not isinstance(audio, np.ndarray):
            raise TypeError(
                f"Audio input must be a numpy.ndarray, got {type(audio).__name__}"
            )

        if audio.size == 0:
            return None

        # Check mono
        if audio.ndim != 1:
            if audio.ndim == 2 and (audio.shape[0] == 1 or audio.shape[1] == 1):
                audio = audio.flatten()
            else:
                raise ValueError(
                    f"Audio must be 1-D mono waveform, got shape {audio.shape}"
                )

        # Check float32
        if audio.dtype != np.float32:
            if np.issubdtype(audio.dtype, np.floating):
                audio = audio.astype(np.float32)
            else:
                raise TypeError(
                    f"Audio dtype must be float32, got {audio.dtype}"
                )

        return audio

    def transcribe(
        self,
        audio: Union[np.ndarray, torch.Tensor, str, Path],
        sample_rate: int = SAMPLE_RATE,
        vad_filter: bool = True,
        language: Optional[str] = None,
        task: str = "transcribe",
    ) -> ASRResult:
        """
        Transcribe audio waveform to text.

        Parameters
        ----------
        audio : np.ndarray
            Standardized 16,000 Hz mono float32 numpy waveform.
        sample_rate : int
            Audio sample rate (must be 16,000 Hz).
        vad_filter : bool
            If True, gates with Silero VAD to skip Whisper on silence.
        language : str | None
            Optional language code (e.g. 'en'). If None, auto-detected.
        task : str
            'transcribe' or 'translate'.

        Returns
        -------
        ASRResult
            Structured result with transcript, language, probabilities, and timing.
        """
        if sample_rate != SAMPLE_RATE:
            raise ValueError(f"WhisperASR requires 16,000 Hz audio, got {sample_rate} Hz")

        start_time = time.perf_counter()

        # 1. Input validation
        waveform = self._validate_input_waveform(audio)

        # Handle empty audio
        if waveform is None or len(waveform) == 0:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            log.debug("Empty audio received; returning empty ASRResult (time=%.1fms)", elapsed_ms)
            return ASRResult(
                transcript="",
                detected_language="",
                language_probability=None,
                processing_time_ms=elapsed_ms,
                no_speech_probability=1.0,
                model_name=f"faster-whisper-{self.model_size}",
                device=self.device,
            )

        # Handle very short audio (<0.1s / 1600 samples)
        if len(waveform) < MIN_AUDIO_SAMPLES:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            log.debug(
                "Audio too short (%d samples < %d); skipping Whisper (time=%.1fms)",
                len(waveform),
                MIN_AUDIO_SAMPLES,
                elapsed_ms,
            )
            return ASRResult(
                transcript="",
                detected_language=language or "",
                language_probability=None,
                processing_time_ms=elapsed_ms,
                no_speech_probability=1.0,
                model_name=f"faster-whisper-{self.model_size}",
                device=self.device,
            )

        # 2. Silence / VAD gating check
        # Check if waveform is pure digital silence (all zeros)
        if np.all(waveform == 0.0) or np.max(np.abs(waveform)) < 1e-5:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            log.debug("Audio is digital silence; skipping Whisper inference (time=%.1fms)", elapsed_ms)
            return ASRResult(
                transcript="",
                detected_language="",
                language_probability=None,
                processing_time_ms=elapsed_ms,
                no_speech_probability=1.0,
                model_name=f"faster-whisper-{self.model_size}",
                device=self.device,
            )

        if vad_filter:
            vad = self._get_vad()
            vad_res: VADResult = vad.detect(waveform)
            if not vad_res.speech_detected or vad_res.speech_ratio <= 0.0:
                elapsed_ms = (time.perf_counter() - start_time) * 1000.0
                log.debug(
                    "VAD indicates no speech (prob=%.3f, ratio=%.2f%%); skipping Whisper (time=%.1fms)",
                    vad_res.speech_probability,
                    vad_res.speech_ratio * 100.0,
                    elapsed_ms,
                )
                return ASRResult(
                    transcript="",
                    detected_language="",
                    language_probability=None,
                    processing_time_ms=elapsed_ms,
                    no_speech_probability=1.0,
                    model_name=f"faster-whisper-{self.model_size}",
                    device=self.device,
                )

        # 3. Whisper inference
        effective_language = language if language is not None else getattr(self, "default_language", "en")
        segments_gen, info = self._model.transcribe(
            waveform,
            beam_size=self.beam_size,
            temperature=self.temperature,
            language=effective_language,
            task=task,
            condition_on_previous_text=False,
            no_speech_threshold=0.6,
            log_prob_threshold=-1.0,
            compression_ratio_threshold=2.4,
            hallucination_silence_threshold=2.0,
            vad_filter=True,
            initial_prompt="OTP, verification code, KYC, bank account, transfer, security, password." if effective_language == "en" else None,
        )

        segment_list: List[Dict[str, Any]] = []
        text_parts: List[str] = []
        no_speech_probs: List[float] = []

        for seg in segments_gen:
            text = seg.text.strip()
            if text:
                text_parts.append(text)
                segment_list.append({
                    "start": seg.start,
                    "end": seg.end,
                    "text": text,
                    "avg_logprob": seg.avg_logprob,
                    "no_speech_prob": seg.no_speech_prob,
                })
            no_speech_probs.append(seg.no_speech_prob)

        full_transcript = " ".join(text_parts).strip()
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0

        avg_no_speech_prob = (
            float(np.mean(no_speech_probs)) if no_speech_probs else (1.0 if not full_transcript else 0.0)
        )

        # Silence artifact & common YouTube/social hallucination suppression
        HALLUCINATION_SUBSTRINGS = (
            "watching this video",
            "next video",
            "thanks for watching",
            "thank you for watching",
            "thank you so much for watching",
            "see you in the next",
            "see you next time",
            "subtitles by",
            "like and subscribe",
            "please subscribe",
            "now you know",
            "english business voice phone call",
            "english business phone call",
            "i'll see you in the next video",
            "i don't know if this is fun",
            "this is so weird",
            "i have recently sent a year off",
            "i've been involved with her",
        )
        clean_lower = full_transcript.lower().strip()
        is_hallucination = any(pat in clean_lower for pat in HALLUCINATION_SUBSTRINGS)
        is_short_courtesy = clean_lower in {
            "thank you.", "thank you very much.", "thanks for watching.", "thanks for watching!",
            "see you in the next video.", "subtitles by", "bye-bye.", "bye!",
            "thank you", "thanks.", "watching", "see you next time.", "now you know.",
            "now you know", "i noticed.", "i noticed",
        }
        if is_hallucination or (is_short_courtesy and (avg_no_speech_prob > 0.25 or len(waveform) <= 16000)):
            log.info("Suppressed Whisper hallucination: '%s'", full_transcript)
            full_transcript = ""
            segment_list = []

        # Structured logging as requested
        log.info(
            "Whisper transcription: time=%.1f ms | detected_language='%s' (p=%.2f) | "
            "no_speech_prob=%.2f | text='%s'",
            elapsed_ms,
            info.language,
            info.language_probability or 0.0,
            avg_no_speech_prob,
            full_transcript[:50] + ("..." if len(full_transcript) > 50 else ""),
        )

        return ASRResult(
            transcript=full_transcript,
            detected_language=info.language,
            language_probability=info.language_probability,
            processing_time_ms=elapsed_ms,
            no_speech_probability=avg_no_speech_prob,
            segments=segment_list,
            model_name=f"faster-whisper-{self.model_size}",
            device=self.device,
        )
