"""
models/transcriber.py
----------------------
Responsibility: Transcribe speech audio to text using faster-whisper
                (CTranslate2-based Whisper, CPU-optimised).

Pipeline stage: speaker verification → faster-whisper → (transcript, language)

Pretrained model: openai/whisper-base or whisper-small (CPU-friendly)

NOT IMPLEMENTED YET — skeleton only.
"""

from __future__ import annotations

import numpy as np


class Transcriber:
    """
    Wrapper around faster-whisper's WhisperModel for CPU-optimised ASR.

    Usage (future):
        transcriber = Transcriber.load(model_size="base")
        result      = transcriber.transcribe(waveform)
    """

    def __init__(self) -> None:
        # TODO: store faster_whisper.WhisperModel instance here
        self._model = None

    @classmethod
    def load(
        cls,
        model_size: str = "base",
        device: str = "cpu",
        compute_type: str = "int8",
    ) -> "Transcriber":
        """
        Load a faster-whisper model.

        Args:
            model_size:   Whisper model size: "tiny", "base", "small", "medium".
            device:       "cpu" or "cuda".
            compute_type: Quantization type — "int8" is fastest on CPU.

        Returns:
            Initialized Transcriber instance.

        TODO: Instantiate faster_whisper.WhisperModel with the given args.
        """
        raise NotImplementedError("Transcriber.load() is not yet implemented.")

    def transcribe(
        self,
        waveform: np.ndarray,
        sample_rate: int = 16000,
        language: str | None = None,
    ) -> dict:
        """
        Transcribe a waveform to text.

        Args:
            waveform:    Mono float32 numpy array at `sample_rate` Hz.
            sample_rate: Sample rate; must be 16000 for Whisper.
            language:    BCP-47 language code (e.g. "en").
                         If None, Whisper auto-detects.

        Returns:
            dict with keys:
              - "text"      (str):   Full transcript string.
              - "language"  (str):   Detected or specified language code.
              - "segments"  (list):  List of {"start", "end", "text"} dicts.

        TODO: Call model.transcribe(), collect segments, and return dict.
        """
        raise NotImplementedError("Transcriber.transcribe() is not yet implemented.")
