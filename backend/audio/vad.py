"""
backend/audio/vad.py
====================
Silero Voice Activity Detection (VAD) module.

Responsibility
--------------
Accept the standardised 16 kHz mono float32 waveform produced by
backend/audio/preprocessing.py and determine:

    1. Whether speech is present at all  (speech_detected: bool)
    2. An overall speech probability     (speech_probability: float  0–1)
    3. Per-segment speech boundaries     (speech_segments: list[SpeechSegment])

The module uses the **silero-vad** pretrained model (v5/v6, MIT licence).
No training or fine-tuning is performed.

Install
-------
    pip install silero-vad      # installs torch as a dependency

Public API
----------
    VADResult                   — frozen dataclass returned by all detectors
    SpeechSegment               — (start_sample, end_sample, start_sec, end_sec)
    SileroVAD                   — class: .load() → .detect(waveform)
    detect_speech(waveform)     — module-level convenience function

Design decisions
----------------
* We use the `silero-vad` pip package (v5+) which exposes
  `load_silero_vad()` and `get_speech_timestamps()` as first-class functions.
* The model is loaded once and cached inside the `SileroVAD` instance.
* Waveform is validated before being fed to the model (must already be 16 kHz
  mono float32 — exactly what preprocessing.py guarantees).
* We expose *both* a class-based interface (for use in PipelineRunner) and a
  stateless convenience function (for quick one-off calls and unit tests).
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from backend.utils.logger import get_logger

log = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SAMPLE_RATE: int = 16_000          # Silero VAD requires 8000 or 16000 Hz
DEFAULT_THRESHOLD: float = 0.5     # speech / silence boundary (0–1)
DEFAULT_MIN_SPEECH_MS: int = 250   # discard segments shorter than this
DEFAULT_MIN_SILENCE_MS: int = 100  # merge gaps shorter than this
DEFAULT_PAD_ONSET_MS: int = 30     # pad start of each segment
DEFAULT_PAD_OFFSET_MS: int = 30    # pad end of each segment


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class SpeechSegment:
    """
    A single detected speech segment.

    Attributes:
        start_sample: First sample index (inclusive) in the source waveform.
        end_sample:   Last sample index  (exclusive) in the source waveform.
        start_sec:    Start time in seconds.
        end_sec:      End time in seconds.
    """
    start_sample: int
    end_sample:   int
    start_sec:    float
    end_sec:      float

    @property
    def duration_sec(self) -> float:
        return self.end_sec - self.start_sec

    def extract(self, waveform: np.ndarray) -> np.ndarray:
        """Return the slice of *waveform* that corresponds to this segment."""
        return waveform[self.start_sample : self.end_sample]


@dataclass
class VADResult:
    """
    Complete output of the VAD stage.

    Attributes:
        speech_detected:    True if at least one speech segment was found.
        speech_probability: Mean confidence across all VAD windows (0–1).
                            For pure silence this will be close to 0.
        speech_segments:    List of detected SpeechSegment objects (may be empty).
        speech_ratio:       Fraction of the total audio duration classified as speech.
        total_speech_sec:   Sum of all segment durations in seconds.
        total_duration_sec: Total duration of the input waveform in seconds.
        threshold_used:     The VAD threshold that was applied.
        inference_time_ms:  Wall-clock time for model inference in milliseconds.
    """
    speech_detected:    bool
    speech_probability: float
    speech_segments:    list[SpeechSegment] = field(default_factory=list)
    speech_ratio:       float = 0.0
    total_speech_sec:   float = 0.0
    total_duration_sec: float = 0.0
    threshold_used:     float = DEFAULT_THRESHOLD
    inference_time_ms:  float = 0.0

    # ------------------------------------------------------------------
    # Convenience helpers
    # ------------------------------------------------------------------

    def extract_speech_waveform(
        self, waveform: np.ndarray, gap_samples: int = 0
    ) -> np.ndarray:
        """
        Concatenate all speech segments from *waveform* into a single array.

        Args:
            waveform:    The source waveform (same one that was analysed).
            gap_samples: Optional silence padding between segments (samples).

        Returns:
            Concatenated float32 array, or an empty array if no speech found.
        """
        if not self.speech_segments:
            return np.array([], dtype=np.float32)

        chunks: list[np.ndarray] = []
        pad = np.zeros(gap_samples, dtype=np.float32) if gap_samples > 0 else None

        for seg in self.speech_segments:
            chunks.append(seg.extract(waveform))
            if pad is not None:
                chunks.append(pad)

        return np.concatenate(chunks[:-1] if pad is not None else chunks).astype(
            np.float32
        )

    def summary(self) -> str:
        """Return a one-line human-readable summary."""
        return (
            f"speech_detected={self.speech_detected}  "
            f"probability={self.speech_probability:.3f}  "
            f"segments={len(self.speech_segments)}  "
            f"speech_ratio={self.speech_ratio:.2%}  "
            f"speech_sec={self.total_speech_sec:.2f}s / "
            f"{self.total_duration_sec:.2f}s total"
        )


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

class VADInputError(ValueError):
    """Raised when the waveform does not meet VAD input requirements."""


def _validate_input(waveform: np.ndarray) -> None:
    """
    Ensure the waveform is acceptable for Silero VAD.

    Raises:
        VADInputError: on any violation.
    """
    if not isinstance(waveform, np.ndarray):
        raise VADInputError(
            f"waveform must be a numpy ndarray, got {type(waveform).__name__}."
        )
    if waveform.ndim != 1:
        raise VADInputError(
            f"waveform must be 1-D (mono), got shape {waveform.shape}. "
            "Run preprocessing.preprocess_audio() first."
        )
    if waveform.dtype != np.float32:
        raise VADInputError(
            f"waveform must be float32, got {waveform.dtype}. "
            "Run preprocessing.preprocess_audio() first."
        )
    if waveform.size == 0:
        raise VADInputError("waveform is empty (0 samples).")
    if not np.isfinite(waveform).all():
        raise VADInputError("waveform contains NaN or Inf values.")


# ---------------------------------------------------------------------------
# SileroVAD class
# ---------------------------------------------------------------------------

class SileroVAD:
    """
    Wrapper around the pretrained Silero VAD model.

    Lifecycle
    ---------
        vad = SileroVAD.load()           # downloads model on first call (~2 MB)
        result = vad.detect(waveform)    # VADResult

    The model is loaded once and reused for all subsequent calls.
    Thread safety: the model is stateless — concurrent .detect() calls are safe
    as long as torch is compiled without the GIL (PyTorch ≥ 2.0 with free-threaded
    Python 3.13+) or calls are serialised externally.
    """

    def __init__(self, model, get_timestamps_fn) -> None:
        """Internal — use SileroVAD.load() instead."""
        self._model            = model
        self._get_timestamps   = get_timestamps_fn

    # ------------------------------------------------------------------
    # Factory
    # ------------------------------------------------------------------

    @classmethod
    def load(cls) -> "SileroVAD":
        """
        Load (or reuse cached) Silero VAD pretrained model.

        Uses the `silero-vad` pip package (≥ 5.0).  On the first call the
        model weights (~2 MB) are downloaded and cached in `~/.cache/torch/`.
        Subsequent calls are instantaneous.

        Returns:
            Ready-to-use SileroVAD instance.

        Raises:
            ImportError:   if `silero-vad` is not installed.
            RuntimeError:  if model loading fails.
        """
        try:
            from silero_vad import load_silero_vad, get_speech_timestamps
        except ImportError as exc:
            raise ImportError(
                "silero-vad is not installed. "
                "Run: pip install silero-vad"
            ) from exc

        import warnings
        # Suppress torch.jit.load FutureWarning on Python 3.14+
        warnings.filterwarnings(
            "ignore",
            message=".*torch.jit.load.*not supported.*",
            category=FutureWarning,
        )

        log.info("SileroVAD.load: loading pretrained Silero VAD model …")
        t0 = time.perf_counter()

        try:
            model = load_silero_vad()
        except Exception as exc:
            raise RuntimeError(
                f"Failed to load Silero VAD model: {exc}"
            ) from exc

        elapsed = (time.perf_counter() - t0) * 1000
        log.info("SileroVAD.load: model ready in %.0f ms", elapsed)

        return cls(model=model, get_timestamps_fn=get_speech_timestamps)

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------

    def detect(
        self,
        waveform: np.ndarray,
        *,
        threshold: float       = DEFAULT_THRESHOLD,
        min_speech_ms: int     = DEFAULT_MIN_SPEECH_MS,
        min_silence_ms: int    = DEFAULT_MIN_SILENCE_MS,
        pad_onset_ms: int      = DEFAULT_PAD_ONSET_MS,
        pad_offset_ms: int     = DEFAULT_PAD_OFFSET_MS,
    ) -> VADResult:
        """
        Run Silero VAD on a standardised waveform.

        Args:
            waveform:       1-D float32 mono array at 16 000 Hz.
                            Must come from preprocessing.preprocess_audio().
            threshold:      Speech/silence threshold (0–1).  Higher → stricter.
            min_speech_ms:  Minimum speech segment duration (ms).
            min_silence_ms: Minimum silence gap to split segments (ms).
            pad_onset_ms:   Padding added before each segment onset (ms).
            pad_offset_ms:  Padding added after each segment offset (ms).

        Returns:
            Populated VADResult dataclass.

        Raises:
            VADInputError: if waveform is not 1-D float32 mono.
            RuntimeError:  if model inference fails.
        """
        import torch  # import here — optional top-level dep

        _validate_input(waveform)

        total_duration = waveform.size / SAMPLE_RATE
        log.debug(
            "SileroVAD.detect: analysing %.2f s  threshold=%.2f",
            total_duration,
            threshold,
        )

        # Convert to torch tensor (model expects float32 1-D tensor)
        audio_tensor = torch.from_numpy(waveform)

        t0 = time.perf_counter()

        # -----------------------------------------------------------------
        # get_speech_timestamps returns a list of dicts:
        #   [{"start": <sample_idx>, "end": <sample_idx>}, …]
        # -----------------------------------------------------------------
        try:
            self._model.reset_states()   # clear GRU state between calls
            timestamps = self._get_timestamps(
                audio_tensor,
                self._model,
                sampling_rate=SAMPLE_RATE,
                threshold=threshold,
                min_speech_duration_ms=min_speech_ms,
                min_silence_duration_ms=min_silence_ms,
                speech_pad_ms=min(pad_onset_ms, pad_offset_ms),
            )
        except Exception as exc:
            raise RuntimeError(
                f"Silero VAD inference failed: {exc}"
            ) from exc

        inference_ms = (time.perf_counter() - t0) * 1000
        log.debug("SileroVAD.detect: inference done in %.1f ms", inference_ms)

        # -----------------------------------------------------------------
        # Compute per-window probabilities for the overall speech_probability
        # We run the model window-by-window and average.
        # Silero processes 512-sample (32 ms) chunks at 16 kHz.
        # -----------------------------------------------------------------
        speech_probability = self._mean_speech_probability(audio_tensor)

        # -----------------------------------------------------------------
        # Build SpeechSegment objects from the raw timestamps
        # -----------------------------------------------------------------
        segments: list[SpeechSegment] = []
        total_speech_sec = 0.0

        for ts in timestamps:
            start_s = int(ts["start"])
            end_s   = int(ts["end"])
            # Clamp to valid range
            start_s = max(0, start_s)
            end_s   = min(waveform.size, end_s)
            if end_s <= start_s:
                continue
            seg = SpeechSegment(
                start_sample = start_s,
                end_sample   = end_s,
                start_sec    = start_s / SAMPLE_RATE,
                end_sec      = end_s   / SAMPLE_RATE,
            )
            segments.append(seg)
            total_speech_sec += seg.duration_sec

        speech_detected = len(segments) > 0
        speech_ratio    = total_speech_sec / total_duration if total_duration > 0 else 0.0

        result = VADResult(
            speech_detected    = speech_detected,
            speech_probability = speech_probability,
            speech_segments    = segments,
            speech_ratio       = speech_ratio,
            total_speech_sec   = total_speech_sec,
            total_duration_sec = total_duration,
            threshold_used     = threshold,
            inference_time_ms  = inference_ms,
        )

        log.info("SileroVAD.detect: %s", result.summary())
        return result

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _mean_speech_probability(self, audio_tensor) -> float:
        """
        Compute a single mean speech probability across all 512-sample windows.

        Silero VAD processes audio in non-overlapping 512-sample chunks.
        We run the model manually on each chunk and average the output
        probabilities to get a scalar summary for the whole clip.

        Returns:
            float in [0, 1]  — 0 = all silence, 1 = all speech.
        """
        import torch

        chunk_size = 512   # samples per window at 16 kHz (32 ms)
        probs: list[float] = []

        self._model.reset_states()

        # Pad to a multiple of chunk_size
        n = audio_tensor.shape[0]
        remainder = n % chunk_size
        if remainder != 0:
            pad_len = chunk_size - remainder
            audio_tensor = torch.nn.functional.pad(audio_tensor, (0, pad_len))

        for i in range(0, audio_tensor.shape[0], chunk_size):
            chunk = audio_tensor[i : i + chunk_size]
            with torch.no_grad():
                out = self._model(chunk, SAMPLE_RATE)
                # Output is shape (1,1) — flatten to scalar via float()
                prob = float(out)
            probs.append(prob)

        self._model.reset_states()
        return float(np.mean(probs)) if probs else 0.0


# ---------------------------------------------------------------------------
# Module-level convenience function
# ---------------------------------------------------------------------------

_global_vad: Optional[SileroVAD] = None


def detect_speech(
    waveform: np.ndarray,
    *,
    threshold: float    = DEFAULT_THRESHOLD,
    min_speech_ms: int  = DEFAULT_MIN_SPEECH_MS,
    min_silence_ms: int = DEFAULT_MIN_SILENCE_MS,
) -> VADResult:
    """
    Convenience wrapper: load VAD model (cached) and detect speech.

    On the first call the model is downloaded and cached.  Subsequent calls
    reuse the same model instance (module-level singleton).

    Args:
        waveform:       1-D float32 mono array at 16 000 Hz.
        threshold:      Speech/silence threshold (0–1).
        min_speech_ms:  Minimum speech segment duration (ms).
        min_silence_ms: Minimum silence gap between segments (ms).

    Returns:
        VADResult
    """
    global _global_vad
    if _global_vad is None:
        _global_vad = SileroVAD.load()
    return _global_vad.detect(
        waveform,
        threshold=threshold,
        min_speech_ms=min_speech_ms,
        min_silence_ms=min_silence_ms,
    )
