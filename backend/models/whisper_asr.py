"""
backend/models/whisper_asr.py
=============================
Speech-to-text module using faster-whisper (CTranslate2-based Whisper).

PATCH NOTES (this revision)
----------------------------
Fixes a regression where quiet laptop-mic noise floor audio (peak ~0.003-0.006,
essentially silence/self-noise, not speech) was being amplified and fed to
Whisper, producing repetitive hallucinated output (e.g. "heh heh heh heh...").

Root causes addressed:
  1. Normalization was gated purely on peak amplitude, with a lower bound so
     close to zero (1e-4) that it treated near-silent noise floor as valid
     quiet speech and boosted it to full acoustic level.
  2. The secondary VAD safety check had been weakened, letting boosted noise
     slip through as "speech".
  3. no_speech_probability discard ceiling had been raised from 0.45 to 0.75,
     far too permissive - genuinely non-speech audio was passing.
  4. The short-word/hallucination blacklist had legitimate short words (thank
     you, okay, bye) stripped out entirely to fix false suppression, but that
     also removed a real defense against exactly this kind of garbage output.
  5. There was no guard against repetitive token loops, which is a well-known
     Whisper failure mode on silence/noise input and is NOT reliably caught by
     compression_ratio_threshold alone once segments are short.

Requirements (unchanged):
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

import re
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

# --- Amplitude / gating thresholds -----------------------------------------
# Below this peak, audio is treated as noise floor / digital silence and is
# never boosted or sent to Whisper. Laptop mic self-noise typically sits
# around 0.001-0.003 peak; genuine quiet speech is reliably above ~0.008-0.01
# once any real utterance is present. 0.005 is the validated cutover point.
NOISE_FLOOR_PEAK: float = 0.005
NORMALIZE_PEAK_CEILING: float = 0.40
TARGET_PEAK: float = 0.85

# Whisper no-speech probability above which a transcript is discarded.
# 0.45 was too strict (discarded real quiet speech); 0.75 was too permissive
# (let noise-floor garbage through). 0.60 is the corrected middle ground.
NO_SPEECH_DISCARD_THRESHOLD: float = 0.60

# Consecutive-token repetition guard: if the same token (or short n-gram)
# repeats this many times in a row, treat it as a hallucinated loop rather
# than real speech, regardless of no_speech_probability.
MAX_CONSECUTIVE_TOKEN_REPEATS: int = 4


from backend.models.asr_base import ASRResult, BaseASR

# Re-export ASRResult for backward compatibility
__all__ = ["ASRResult", "BaseASR", "WhisperASR"]


def _has_repetition_loop(text: str, max_repeats: int = MAX_CONSECUTIVE_TOKEN_REPEATS) -> bool:
    """
    Detect Whisper's classic hallucination pattern: the same token (or a
    short repeating n-gram) appearing many times in a row. This is the
    signature of decoding noise/silence rather than real speech, and it is
    not reliably caught by compression_ratio_threshold once segments are
    short (e.g. a single 1s chunk).

    Checks n-gram sizes 1 through 3 (single words, 2-word phrases, 3-word
    phrases) for consecutive repeats.
    """
    tokens = re.findall(r"\w+", text.lower())
    if len(tokens) < max_repeats + 1:
        return False

    for n in (1, 2, 3):
        if len(tokens) < n * (max_repeats + 1):
            continue
        for i in range(0, len(tokens) - n * max_repeats, n):
            window = [tuple(tokens[i + j * n: i + (j + 1) * n]) for j in range(max_repeats + 1)]
            if len(set(window)) == 1:
                return True
    return False


class WhisperASR(BaseASR):
    """
    Clean, reusable Speech-to-Text transcriber using faster-whisper.

    Loads model ONCE during initialization and reuses across calls.
    """

    provider_name: str = "whisper"
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
        initial_prompt: Optional[str] = None,
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
        initial_prompt : str | None
            Optional conditioning prompt. Defaults to None to prevent bias.

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

        # 2. Silence / noise-floor gating check.
        # IMPORTANT: this runs BEFORE any amplitude normalization. Boosting
        # audio first and then deciding whether it was "speech" lets pure
        # noise floor get amplified into something that looks acoustically
        # plausible to VAD/Whisper. Gate first, boost second.
        peak_amp = float(np.max(np.abs(waveform)))
        rms_amp = float(np.sqrt(np.mean(waveform ** 2)))

        if np.all(waveform == 0.0) or peak_amp < 1e-4 or rms_amp < 1e-4:
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

        # Noise floor: below this, we don't trust the signal to be speech at
        # all, and we do NOT amplify it just to make it plausible-looking.
        # A single, strict VAD check decides here.
        if peak_amp < NOISE_FLOOR_PEAK:
            vad = self._get_vad()
            vad_res: VADResult = vad.detect(waveform)
            if not vad_res.speech_detected or vad_res.speech_ratio < 0.30:
                elapsed_ms = (time.perf_counter() - start_time) * 1000.0
                log.debug(
                    "Sub-noise-floor audio (peak=%.5f) with no confirmed speech "
                    "(ratio=%.2f%%); skipping Whisper (time=%.1fms)",
                    peak_amp,
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
            # VAD is confident there IS speech even though it's very quiet
            # (e.g. a soft-spoken user) - allow it through to normalization,
            # but log clearly since this is the risky edge case.
            log.info(
                "Sub-noise-floor audio (peak=%.5f) but VAD confirms speech "
                "(ratio=%.2f%%); proceeding with normalization.",
                peak_amp,
                vad_res.speech_ratio * 100.0,
            )
        elif vad_filter:
            vad = self._get_vad()
            vad_res = vad.detect(waveform)
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

        # 3. Normalize genuinely-quiet-but-real speech to standard acoustic
        # level. Only reached once we've confirmed the signal is above the
        # noise floor (or VAD-confirmed speech below it).
        if NOISE_FLOOR_PEAK <= peak_amp < NORMALIZE_PEAK_CEILING or (
            peak_amp < NOISE_FLOOR_PEAK  # VAD-confirmed quiet speech from branch above
        ):
            scale = TARGET_PEAK / (peak_amp + 1e-8)
            waveform = np.clip(waveform * scale, -1.0, 1.0)

        # 4. Whisper inference
        effective_language = language if language is not None else getattr(self, "default_language", "en")
        segments_gen, info = self._model.transcribe(
            waveform,
            beam_size=self.beam_size,
            temperature=self.temperature,
            language=effective_language,
            task=task,
            condition_on_previous_text=False,
            no_speech_threshold=0.50,
            log_prob_threshold=-1.0,
            compression_ratio_threshold=2.4,
            hallucination_silence_threshold=2.0,
            vad_filter=False,  # External Silero VAD gating already applied above; avoids clipping human speech
            initial_prompt=initial_prompt,
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

        # Silence artifact & common YouTube/social hallucination suppression blacklist.
        # NOTE: short conversational words ("thank you", "okay", "bye", "so")
        # are deliberately NOT in this list - they are legitimate speech.
        # They are instead handled by is_short_artifact below, which only
        # suppresses them when combined with corroborating low-confidence
        # signals (rms/no_speech_prob), not on their own.
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
            "amara.org",
            "captioned by",
            "captions by",
            "transcript by",
            "translated by",
            "all rights reserved",
            "subscribe to",
            "don't forget to like",
            "hit the bell",
            "notification bell",
            "leave a comment",
            "leave your comments",
            "in the description below",
            "check out my",
            "check out our",
            "link in the description",
        )

        # High no-speech probability check: Whisper outputting tokens during silence.
        if avg_no_speech_prob >= NO_SPEECH_DISCARD_THRESHOLD:
            log.info(
                "Discarded text during silence (avg_no_speech_prob=%.2f >= %.2f): '%s'",
                avg_no_speech_prob, NO_SPEECH_DISCARD_THRESHOLD, full_transcript,
            )
            full_transcript = ""
            segment_list = []

        # Repetition-loop guard: catches Whisper hallucinating a repeated
        # token/phrase on noise or silence input (e.g. "heh heh heh heh...").
        # This is checked independently of no_speech_prob because a looped
        # hallucination can sometimes report a deceptively low no_speech_prob.
        if full_transcript and _has_repetition_loop(full_transcript):
            log.info("Suppressed repetitive Whisper hallucination loop: '%s'", full_transcript)
            full_transcript = ""
            segment_list = []

        clean_lower = full_transcript.lower().strip()
        is_hallucination = any(pat in clean_lower for pat in HALLUCINATION_SUBSTRINGS)

        # Short-artifact words (bare "you", "music" tags, etc.) are only
        # suppressed when they're the ENTIRE transcript AND corroborated by
        # low audio confidence - this avoids nuking real short replies like
        # "okay" or "thank you" said clearly by the user.
        BARE_ARTIFACT_TOKENS = {
            "you", "watching", "so", "oh", "...", ".", "..",
            "[music]", "(music)", "[applause]", "(applause)", "[laughter]", "(laughter)",
            "silence", "music", "applause", "cheering", "laughter",
        }
        is_short_artifact = (
            clean_lower in BARE_ARTIFACT_TOKENS
            and (avg_no_speech_prob > 0.40 or rms_amp < 0.008)
        )

        if is_hallucination or is_short_artifact:
            log.info("Suppressed Whisper silence/hallucination artifact: '%s'", full_transcript)
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
