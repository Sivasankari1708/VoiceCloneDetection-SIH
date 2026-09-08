"""
backend/models/asr_base.py
==========================
Common interface and data contracts for ASR (Automatic Speech Recognition)
providers in VoiceShield.

Supports:
  - faster-whisper (local CPU int8 inference)
  - Google Cloud Speech-to-Text (bidirectional gRPC streaming)
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
import numpy as np


@dataclass(frozen=True)
class ASRResult:
    """
    Structured output from any speech-to-text stage in VoiceShield.

    Attributes
    ----------
    transcript : str
        Recognized speech text. Empty string if silent, no speech, or pending interim.
    detected_language : str
        Language code (e.g. 'en', 'en-IN', 'hi-IN').
    language_probability : float | None
        Confidence score for detected language [0.0, 1.0].
    processing_time_ms : float
        Elapsed transcription time in milliseconds.
    no_speech_probability : float | None
        Probability that the audio contains no speech [0.0, 1.0].
    segments : List[Dict[str, Any]]
        List of segment metadata dicts (start, end, text, avg_logprob).
    model_name : str
        Identifier of the active model (e.g. 'faster-whisper-base', 'google-cloud-speech').
    device : str
        Execution environment ('cpu', 'cuda', or 'cloud').
    is_final : bool
        Whether this hypothesis is finalized (True) or interim/partial (False).
    provider : str
        Provider identifier: 'whisper' or 'google'.
    """

    transcript: str
    detected_language: str = "en"
    language_probability: Optional[float] = None
    processing_time_ms: float = 0.0
    no_speech_probability: Optional[float] = None
    segments: List[Dict[str, Any]] = field(default_factory=list)
    model_name: str = "base"
    device: str = "cpu"
    is_final: bool = True
    provider: str = "whisper"

    def summary(self) -> str:
        lang_info = f"lang={self.detected_language or 'none'}"
        if self.language_probability is not None:
            lang_info += f" ({self.language_probability:.1%})"
        no_speech_info = ""
        if self.no_speech_probability is not None:
            no_speech_info = f" | no_speech_prob={self.no_speech_probability:.2f}"
        preview = self.transcript if len(self.transcript) <= 60 else self.transcript[:57] + "..."
        return f"[ASR] provider={self.provider} | '{preview}' | {lang_info}{no_speech_info} | time={self.processing_time_ms:.1f}ms"



class BaseASR(ABC):
    """
    Abstract base class for VoiceShield speech-to-text providers.
    Provides batch and streaming transcription interfaces.
    """

    provider_name: str = "base"

    @abstractmethod
    def transcribe(
        self,
        audio: np.ndarray,
        **kwargs: Any,
    ) -> ASRResult:
        """
        Synchronous batch transcription of an audio waveform.

        Parameters
        ----------
        audio : np.ndarray
            1D float32 array sampled at 16 kHz.
        **kwargs : Any
            Provider-specific arguments.

        Returns
        -------
        ASRResult
        """
        ...

    def start_stream(self, session_id: str) -> None:
        """
        Initialize an isolated streaming recognition session.
        Default implementation is a no-op for offline providers.
        """
        pass

    def send_audio(
        self,
        session_id: str,
        audio_chunk: np.ndarray,
        is_speech: bool = True,
    ) -> ASRResult:
        """
        Feed an audio frame to an active streaming session.
        Default implementation delegates to `transcribe()`.

        Parameters
        ----------
        session_id : str
            Unique identifier for the streaming session.
        audio_chunk : np.ndarray
            1D float32 array sampled at 16 kHz.
        is_speech : bool
            VAD indicator for the chunk.

        Returns
        -------
        ASRResult
        """
        return self.transcribe(audio_chunk)

    def end_stream(self, session_id: str) -> ASRResult:
        """
        Finalize and clean up a streaming recognition session.
        Default implementation returns an empty final result.
        """
        return ASRResult(
            transcript="",
            is_final=True,
            provider=self.provider_name,
        )

    def reset_stream(self, session_id: str) -> None:
        """
        Reset an active streaming session without destroying resources.
        """
        self.end_stream(session_id)
        self.start_stream(session_id)
